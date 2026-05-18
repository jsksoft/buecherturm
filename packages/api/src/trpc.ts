import { initTRPC, TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { getDb, users } from '@buecherturm/database';
import type { Context } from './context';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Fetches the user row to verify is_admin — one extra query per admin request, acceptable cost.
export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  const db = getDb();
  const row = await db.query.users.findFirst({
    where: eq(users.id, ctx.user.id),
    columns: { isAdmin: true },
  });
  if (!row?.isAdmin) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required.' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
