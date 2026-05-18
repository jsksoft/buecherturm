import { router, publicProcedure } from './trpc';
import { authRouter } from './routers/auth';
import { adminRouter } from './routers/admin';
import { booksRouter } from './routers/books';
import { searchRouter } from './routers/search';
import { gdprRouter } from './routers/gdpr';

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  auth: authRouter,
  admin: adminRouter,
  books: booksRouter,
  search: searchRouter,
  gdpr: gdprRouter,
});

export type AppRouter = typeof appRouter;
