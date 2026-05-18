import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── users ─────────────────────────────────────────────────────────────────────
// Mirrors auth.users (Supabase). Populated by the `handle_new_user` trigger.
// email_encrypted: AES-256-GCM ciphertext written by the app-layer (GDPR rule #1).
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  emailEncrypted: text('email_encrypted'),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  isAdmin: boolean('is_admin').default(false).notNull(),
  // Nullable — set to now()+30d when user requests account deletion (GDPR Art. 17)
  deletionScheduledAt: timestamp('deletion_scheduled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── books ─────────────────────────────────────────────────────────────────────
// Shared catalog. Written only via import_jobs or admin; read by all auth users.
export const books = pgTable(
  'books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    isbn: text('isbn').unique(),
    title: text('title').notNull(),
    authors: text('authors').array().notNull().default(sql`ARRAY[]::text[]`),
    publisher: text('publisher'),
    publishedYear: integer('published_year'),
    coverUrl: text('cover_url'),
    description: text('description'),
    pageCount: integer('page_count'),
    language: text('language').default('de'),
    genres: text('genres').array().notNull().default(sql`ARRAY[]::text[]`),
    // jsonb array of AI-generated string tags for faceted search
    aiTags: jsonb('ai_tags').default(sql`'[]'::jsonb`),
    // 1536-dim vector (text-embedding-3-small). ivfflat index created manually.
    // After deploy run: CREATE INDEX CONCURRENTLY idx_books_embedding
    //   ON books USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_books_isbn').on(table.isbn),
    index('idx_books_ai_tags').using('gin', table.aiTags),
  ],
);

// ── user_books ────────────────────────────────────────────────────────────────
// Core tracking table. Each row = one book in a user's library.
export const userBooks = pgTable(
  'user_books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    // rating: 1–5 stars, nullable (unrated is valid)
    rating: integer('rating'),
    // Private note stored AES-256-GCM encrypted (GDPR rule #1)
    privateNoteEncrypted: text('private_note_encrypted'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('user_books_user_book_unique').on(table.userId, table.bookId),
    check(
      'user_books_status_check',
      sql`${table.status} IN ('reading', 'read', 'want_to_read', 'abandoned')`,
    ),
    check(
      'user_books_rating_check',
      sql`${table.rating} IS NULL OR ${table.rating} BETWEEN 1 AND 5`,
    ),
    index('idx_user_books_user_id').on(table.userId),
    index('idx_user_books_status').on(table.userId, table.status),
  ],
);

// ── user_reading_profiles ─────────────────────────────────────────────────────
// AI recommendation profile, one-to-one with users.
export const userReadingProfiles = pgTable('user_reading_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  preferredGenres: text('preferred_genres').array().notNull().default(sql`ARRAY[]::text[]`),
  preferredLanguages: text('preferred_languages').array().notNull().default(sql`ARRAY[]::text[]`),
  readingGoalPerYear: integer('reading_goal_per_year'),
  // Aggregated taste vector derived from rated books
  profileEmbedding: vector('profile_embedding', { dimensions: 1536 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── bookclubs ─────────────────────────────────────────────────────────────────
export const bookclubs = pgTable('bookclubs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  isPrivate: boolean('is_private').default(true).notNull(),
  inviteCode: text('invite_code').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── bookclub_members ──────────────────────────────────────────────────────────
export const bookclubMembers = pgTable(
  'bookclub_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookclubId: uuid('bookclub_id')
      .notNull()
      .references(() => bookclubs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('bookclub_members_unique').on(table.bookclubId, table.userId),
    check('bookclub_members_role_check', sql`${table.role} IN ('admin', 'member')`),
    index('idx_bookclub_members_user_id').on(table.userId),
  ],
);

// ── ai_usage_log ──────────────────────────────────────────────────────────────
// Append-only. Written by service role only; users can read their own rows.
export const aiUsageLog = pgTable(
  'ai_usage_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    feature: text('feature').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    latencyMs: integer('latency_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_ai_usage_user_id').on(table.userId),
    index('idx_ai_usage_created_at').on(table.createdAt),
  ],
);

// ── import_jobs ───────────────────────────────────────────────────────────────
export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    status: text('status').notNull().default('pending'),
    totalBooks: integer('total_books').default(0),
    processedBooks: integer('processed_books').default(0),
    errorLog: jsonb('error_log').default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'import_jobs_status_check',
      sql`${table.status} IN ('pending', 'processing', 'completed', 'failed')`,
    ),
    index('idx_import_jobs_user_id').on(table.userId),
  ],
);

// ── admin_config ──────────────────────────────────────────────────────────────
// Runtime-switchable LLM/embedding config. Writable only by admins.
export const adminConfig = pgTable('admin_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
