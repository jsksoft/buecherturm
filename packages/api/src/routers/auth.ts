import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, users } from '@buecherturm/database';
import { encrypt } from '@buecherturm/shared';
import { publicProcedure, protectedProcedure, router } from '../trpc';

const registerInput = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(1).max(100).optional(),
});

const loginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRouter = router({
  register: publicProcedure
    .input(registerInput)
    .mutation(async ({ ctx, input }) => {
      const secret = process.env['ENCRYPTION_SECRET'];
      if (!secret) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Server misconfigured' });
      }

      const { data, error } = await ctx.supabaseAdmin.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
      });

      if (error || !data.user) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error?.message ?? 'Registration failed',
        });
      }

      // Encrypt email before storing — GDPR mandatory (CLAUDE.md rule #1)
      const emailEncrypted = await encrypt(input.email, secret);

      // The handle_new_user trigger creates the users row on Supabase signup.
      // We update it with the encrypted email (and optional display name).
      const db = getDb();
      await db
        .update(users)
        .set({
          emailEncrypted,
          ...(input.displayName ? { displayName: input.displayName } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, data.user.id));

      // Sign in immediately so the client receives a usable session.
      const { data: signIn, error: signInErr } = await ctx.supabaseAdmin.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });

      if (signInErr || !signIn.session) {
        // User created — client should call login separately.
        return { userId: data.user.id, session: null };
      }

      return {
        userId: data.user.id,
        session: {
          accessToken: signIn.session.access_token,
          refreshToken: signIn.session.refresh_token,
          expiresAt: signIn.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        },
      };
    }),

  login: publicProcedure
    .input(loginInput)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabaseAdmin.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });

      if (error || !data.session) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      return {
        userId: data.user.id,
        session: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        },
      };
    }),

  me: protectedProcedure.query(({ ctx }) => {
    return { id: ctx.user.id };
  }),
});
