import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, books, userBooks } from '@buecherturm/database';
import { encrypt, decrypt } from '@buecherturm/shared';
import { protectedProcedure, router } from '../trpc';

const READING_STATUSES = ['reading', 'read', 'want_to_read', 'abandoned'] as const;

export const booksRouter = router({
  byIsbn: protectedProcedure
    .input(z.object({ isbn: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();

      const book = await db.query.books.findFirst({
        where: eq(books.isbn, input.isbn),
      });

      if (!book) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Buch nicht im Katalog gefunden.' });
      }

      const userBook = await db.query.userBooks.findFirst({
        where: and(eq(userBooks.userId, ctx.user.id), eq(userBooks.bookId, book.id)),
      });

      let privateNote: string | null = null;
      if (userBook?.privateNoteEncrypted) {
        const secret = process.env['ENCRYPTION_SECRET'];
        if (secret) {
          privateNote = await decrypt(userBook.privateNoteEncrypted, secret);
        }
      }

      return {
        book,
        userBook: userBook
          ? {
              id: userBook.id,
              status: userBook.status as (typeof READING_STATUSES)[number],
              rating: userBook.rating,
              privateNote,
              startedAt: userBook.startedAt,
              finishedAt: userBook.finishedAt,
            }
          : null,
      };
    }),

  setStatus: protectedProcedure
    .input(z.object({ isbn: z.string(), status: z.enum(READING_STATUSES) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      const book = await db.query.books.findFirst({
        where: eq(books.isbn, input.isbn),
      });

      if (!book) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Buch nicht im Katalog gefunden.' });
      }

      const timestamps: Record<string, Date | null> = {};
      if (input.status === 'reading') timestamps.startedAt = new Date();
      if (input.status === 'read') timestamps.finishedAt = new Date();

      await db
        .insert(userBooks)
        .values({ userId: ctx.user.id, bookId: book.id, status: input.status })
        .onConflictDoUpdate({
          target: [userBooks.userId, userBooks.bookId],
          set: { status: input.status, updatedAt: new Date(), ...timestamps },
        });

      return { status: input.status };
    }),

  setRating: protectedProcedure
    .input(z.object({ isbn: z.string(), rating: z.number().int().min(1).max(5).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      const book = await db.query.books.findFirst({
        where: eq(books.isbn, input.isbn),
      });

      if (!book) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Buch nicht im Katalog gefunden.' });
      }

      await db
        .insert(userBooks)
        .values({ userId: ctx.user.id, bookId: book.id, status: 'read', rating: input.rating })
        .onConflictDoUpdate({
          target: [userBooks.userId, userBooks.bookId],
          set: { rating: input.rating, updatedAt: new Date() },
        });

      return { rating: input.rating };
    }),

  saveNote: protectedProcedure
    .input(z.object({ isbn: z.string(), note: z.string().max(10_000) }))
    .mutation(async ({ ctx, input }) => {
      const secret = process.env['ENCRYPTION_SECRET'];
      if (!secret) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Server nicht konfiguriert.' });
      }

      const db = getDb();

      const book = await db.query.books.findFirst({
        where: eq(books.isbn, input.isbn),
      });

      if (!book) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Buch nicht im Katalog gefunden.' });
      }

      const privateNoteEncrypted = input.note ? await encrypt(input.note, secret) : null;

      await db
        .insert(userBooks)
        .values({
          userId: ctx.user.id,
          bookId: book.id,
          status: 'want_to_read',
          privateNoteEncrypted,
        })
        .onConflictDoUpdate({
          target: [userBooks.userId, userBooks.bookId],
          set: { privateNoteEncrypted, updatedAt: new Date() },
        });

      return { saved: true };
    }),
});
