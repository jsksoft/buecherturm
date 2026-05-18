import { router, publicProcedure } from './trpc';
import { authRouter } from './routers/auth';

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
