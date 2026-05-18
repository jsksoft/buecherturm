import { TRPCError } from '@trpc/server';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, adminConfig, aiUsageLog } from '@buecherturm/database';
import { invalidateProviderCache } from '@buecherturm/ai';
import { adminProcedure, router } from '../trpc';

const PROVIDER_OPTIONS = ['anthropic', 'openai', 'gemini'] as const;
type ProviderOption = (typeof PROVIDER_OPTIONS)[number];

// Keys stored in admin_config that this router manages
const CONFIG_KEYS = {
  ACTIVE_LLM_PROVIDER: 'active_llm_provider',
  ACTIVE_EMBEDDING_MODEL: 'active_embedding_model',
} as const;

export const adminRouter = router({
  // Returns all admin_config rows for dashboard display
  getConfig: adminProcedure.query(async () => {
    const db = getDb();
    const rows = await db.select().from(adminConfig).orderBy(adminConfig.key);
    return rows;
  }),

  // Hot-swaps the active LLM provider in DB — takes effect immediately on next request
  setActiveProvider: adminProcedure
    .input(z.object({ provider: z.enum(PROVIDER_OPTIONS) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .insert(adminConfig)
        .values({
          key: CONFIG_KEYS.ACTIVE_LLM_PROVIDER,
          value: input.provider,
          description: 'Active LLM provider for completions (anthropic | openai | gemini)',
        })
        .onConflictDoUpdate({
          target: adminConfig.key,
          set: { value: input.provider, updatedAt: new Date() },
        });

      // Clear the module-level cache so the next request picks up the new provider
      invalidateProviderCache();

      return { provider: input.provider as ProviderOption };
    }),

  // Returns the currently stored active provider (falls back to 'anthropic')
  getActiveProvider: adminProcedure.query(async () => {
    const db = getDb();
    const row = await db.query.adminConfig.findFirst({
      where: eq(adminConfig.key, CONFIG_KEYS.ACTIVE_LLM_PROVIDER),
    });
    return { provider: (row?.value ?? 'anthropic') as ProviderOption };
  }),

  // Aggregated token usage per provider, last 30 days
  getUsageStats: adminProcedure.query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        provider: aiUsageLog.provider,
        model: aiUsageLog.model,
        feature: aiUsageLog.feature,
        totalRequests: sql<number>`count(*)::int`,
        totalInputTokens: sql<number>`sum(${aiUsageLog.inputTokens})::int`,
        totalOutputTokens: sql<number>`sum(${aiUsageLog.outputTokens})::int`,
        avgLatencyMs: sql<number>`round(avg(${aiUsageLog.latencyMs}))::int`,
      })
      .from(aiUsageLog)
      .where(sql`${aiUsageLog.createdAt} > now() - interval '30 days'`)
      .groupBy(aiUsageLog.provider, aiUsageLog.model, aiUsageLog.feature)
      .orderBy(desc(sql`count(*)`))
      .limit(50);

    return rows;
  }),

  // Raw last-N log entries for audit trail
  getUsageLog: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(aiUsageLog)
        .orderBy(desc(aiUsageLog.createdAt))
        .limit(input.limit);
      return rows;
    }),

  // Upsert any arbitrary config key (for future extensibility)
  setConfig: adminProcedure
    .input(
      z.object({
        key: z.string().min(1).max(100),
        value: z.string().max(1000),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .insert(adminConfig)
        .values({ key: input.key, value: input.value, description: input.description })
        .onConflictDoUpdate({
          target: adminConfig.key,
          set: { value: input.value, updatedAt: new Date(), ...(input.description ? { description: input.description } : {}) },
        });
      return { key: input.key };
    }),

  // Delete a config entry (e.g., revert to default)
  deleteConfig: adminProcedure
    .input(z.object({ key: z.string().min(1) }))
    .mutation(async ({ input }) => {
      if (Object.values(CONFIG_KEYS).includes(input.key as (typeof CONFIG_KEYS)[keyof typeof CONFIG_KEYS])) {
        // Allow deletion of managed keys — the app falls back to defaults when absent
      }
      const db = getDb();
      const result = await db.delete(adminConfig).where(eq(adminConfig.key, input.key));
      if (!result) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Config key "${input.key}" not found.` });
      }
      return { deleted: input.key };
    }),
});
