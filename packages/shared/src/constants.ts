export const APP_NAME = 'Bücherturm';
export const APP_VERSION = '0.1.0';
export const DB_REGION = 'eu-central-1'; // Supabase Frankfurt

export const LLM_PROVIDERS = ['anthropic', 'openai', 'google'] as const;
export type LLMProviderName = (typeof LLM_PROVIDERS)[number];

export const DEFAULT_LLM_MODEL = 'claude-sonnet-4-6';
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
