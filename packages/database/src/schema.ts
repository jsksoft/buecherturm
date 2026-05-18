import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Scaffold placeholder — full 9-table schema added in Phase 3
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  // email stored AES-256-GCM encrypted (GDPR) — see packages/shared/src/crypto.ts
  emailEncrypted: text('email_encrypted').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
