import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import {
  getDb,
  users,
  userBooks,
  books,
  userReadingProfiles,
  bookclubs,
  bookclubMembers,
  aiUsageLog,
} from '@buecherturm/database';
import { decrypt } from '@buecherturm/shared';
import { protectedProcedure, router } from '../trpc';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const gdprRouter = router({
  // GDPR Art. 20 — Right to Data Portability.
  // Returns all user data as structured JSON (decrypted). Client triggers a file download.
  exportData: protectedProcedure.mutation(async ({ ctx }) => {
    const secret = process.env['ENCRYPTION_SECRET'];
    if (!secret) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Server misconfigured' });
    }

    const db = getDb();

    const user = await db.query.users.findFirst({
      where: eq(users.id, ctx.user.id),
    });
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const email = user.emailEncrypted ? await decrypt(user.emailEncrypted, secret) : null;

    // Reading library with book metadata
    const library = await db
      .select({ ub: userBooks, b: books })
      .from(userBooks)
      .innerJoin(books, eq(userBooks.bookId, books.id))
      .where(eq(userBooks.userId, ctx.user.id));

    const libraryDecrypted = await Promise.all(
      library.map(async ({ ub, b }) => ({
        book: {
          isbn: b.isbn,
          title: b.title,
          authors: b.authors,
          publisher: b.publisher,
          publishedYear: b.publishedYear,
        },
        status: ub.status,
        rating: ub.rating,
        privateNote: ub.privateNoteEncrypted
          ? await decrypt(ub.privateNoteEncrypted, secret)
          : null,
        startedAt: ub.startedAt?.toISOString() ?? null,
        finishedAt: ub.finishedAt?.toISOString() ?? null,
        addedAt: ub.createdAt.toISOString(),
      })),
    );

    // Reading preferences profile
    const profile = await db.query.userReadingProfiles.findFirst({
      where: eq(userReadingProfiles.userId, ctx.user.id),
      columns: {
        preferredGenres: true,
        preferredLanguages: true,
        readingGoalPerYear: true,
        updatedAt: true,
      },
    });

    // Bookclub memberships
    const clubMemberships = await db
      .select({ bc: bookclubs, role: bookclubMembers.role, joinedAt: bookclubMembers.joinedAt })
      .from(bookclubMembers)
      .innerJoin(bookclubs, eq(bookclubMembers.bookclubId, bookclubs.id))
      .where(eq(bookclubMembers.userId, ctx.user.id));

    // AI usage log (own entries only, most recent 500)
    const aiUsage = await db
      .select({
        provider: aiUsageLog.provider,
        model: aiUsageLog.model,
        feature: aiUsageLog.feature,
        inputTokens: aiUsageLog.inputTokens,
        outputTokens: aiUsageLog.outputTokens,
        date: aiUsageLog.createdAt,
      })
      .from(aiUsageLog)
      .where(and(eq(aiUsageLog.userId, ctx.user.id)))
      .orderBy(desc(aiUsageLog.createdAt))
      .limit(500);

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: ctx.user.id,
        email,
        displayName: user.displayName,
        createdAt: user.createdAt.toISOString(),
      },
      readingPreferences: profile
        ? {
            preferredGenres: profile.preferredGenres,
            preferredLanguages: profile.preferredLanguages,
            readingGoalPerYear: profile.readingGoalPerYear,
            updatedAt: profile.updatedAt.toISOString(),
          }
        : null,
      library: libraryDecrypted,
      bookclubs: clubMemberships.map(({ bc, role, joinedAt }) => ({
        name: bc.name,
        isPrivate: bc.isPrivate,
        role,
        joinedAt: joinedAt.toISOString(),
      })),
      aiUsage: aiUsage.map((row) => ({ ...row, date: row.date.toISOString() })),
    };
  }),

  // GDPR Art. 17 — Right to Erasure.
  // Anonymises PII immediately and schedules hard deletion of the auth account in 30 days.
  // The 30-day grace period lets users cancel via the settings page.
  requestDeletion: protectedProcedure.mutation(async ({ ctx }) => {
    const db = getDb();

    const existing = await db.query.users.findFirst({
      where: eq(users.id, ctx.user.id),
      columns: { deletionScheduledAt: true },
    });

    if (existing?.deletionScheduledAt) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Account deletion already scheduled.',
      });
    }

    const scheduledFor = new Date(Date.now() + THIRTY_DAYS_MS);

    await db
      .update(users)
      .set({
        // Erase PII immediately — satisfies GDPR Art. 17 for stored personal data
        emailEncrypted: null,
        displayName: null,
        avatarUrl: null,
        deletionScheduledAt: scheduledFor,
        updatedAt: new Date(),
      })
      .where(eq(users.id, ctx.user.id));

    return { scheduledFor: scheduledFor.toISOString() };
  }),

  // Cancels a pending deletion within the 30-day grace period.
  cancelDeletion: protectedProcedure.mutation(async ({ ctx }) => {
    const db = getDb();

    const user = await db.query.users.findFirst({
      where: eq(users.id, ctx.user.id),
      columns: { deletionScheduledAt: true },
    });

    if (!user?.deletionScheduledAt) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No pending deletion found.' });
    }

    if (user.deletionScheduledAt < new Date()) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Grace period has expired — deletion cannot be cancelled.',
      });
    }

    await db
      .update(users)
      .set({ deletionScheduledAt: null, updatedAt: new Date() })
      .where(eq(users.id, ctx.user.id));

    return { cancelled: true };
  }),

  // Returns the current deletion status for the settings UI.
  getDeletionStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();

    const user = await db.query.users.findFirst({
      where: eq(users.id, ctx.user.id),
      columns: { deletionScheduledAt: true },
    });

    return {
      isPending: !!user?.deletionScheduledAt,
      scheduledFor: user?.deletionScheduledAt?.toISOString() ?? null,
    };
  }),
});
