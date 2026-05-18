import { getDb } from './client';
import { adminConfig } from './schema';

const DEFAULTS = [
  { key: 'llm_provider', value: 'anthropic', description: 'Active LLM provider' },
  { key: 'llm_model', value: 'claude-sonnet-4-6', description: 'Active LLM model' },
  { key: 'embedding_provider', value: 'openai', description: 'Embedding provider' },
  { key: 'embedding_model', value: 'text-embedding-3-small', description: 'Embedding model' },
];

async function seed() {
  const db = getDb();
  for (const row of DEFAULTS) {
    await db
      .insert(adminConfig)
      .values({ ...row, updatedAt: new Date() })
      .onConflictDoNothing({ target: adminConfig.key });
  }
  console.log('Seed complete: admin_config defaults inserted');
}

seed().catch(console.error);
