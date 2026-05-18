import { router, publicProcedure } from './trpc';
import { authRouter } from './routers/auth';
import { booksRouter } from './routers/books';

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  auth: authRouter,
  books: booksRouter,
});

export type AppRouter = typeof appRouter;
