import type { LLMProvider } from './provider';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';

export type ProviderName = 'anthropic' | 'openai' | 'gemini';

export interface ProviderEnvConfig {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
}

// Module-level cache: provider instance keyed by name to avoid rebuilding on every call
let cachedName: ProviderName | null = null;
let cachedInstance: LLMProvider | null = null;

export function buildProvider(name: ProviderName, config: ProviderEnvConfig): LLMProvider {
  switch (name) {
    case 'anthropic':
      if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
      return new AnthropicProvider(config.anthropicApiKey);
    case 'openai':
      if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY is not configured');
      return new OpenAIProvider(config.openaiApiKey);
    case 'gemini':
      if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY is not configured');
      return new GeminiProvider(config.geminiApiKey);
    default: {
      // TypeScript exhaustiveness guard
      const _: never = name;
      throw new Error(`Unknown LLM provider: ${_}`);
    }
  }
}

function envConfig(): ProviderEnvConfig {
  const config: ProviderEnvConfig = {};
  const a = process.env['ANTHROPIC_API_KEY'];
  const o = process.env['OPENAI_API_KEY'];
  const g = process.env['GEMINI_API_KEY'];
  if (a) config.anthropicApiKey = a;
  if (o) config.openaiApiKey = o;
  if (g) config.geminiApiKey = g;
  return config;
}

/**
 * Returns a provider instance for the given name.
 * Caches the instance for the lifetime of the Node process; call with a new name to hot-swap.
 */
export function getProvider(activeName?: string): LLMProvider {
  const name = ((activeName ?? process.env['ACTIVE_LLM_PROVIDER'] ?? 'anthropic') as ProviderName);
  if (cachedInstance && cachedName === name) return cachedInstance;

  cachedInstance = buildProvider(name, envConfig());
  cachedName = name;
  return cachedInstance;
}

/**
 * Always returns the OpenAI provider for embeddings.
 * Anthropic and Gemini APIs are used for completions; embeddings are unified via OpenAI
 * text-embedding-3-small (1536 dims) so vectors stay comparable across provider switches.
 */
export function getEmbeddingProvider(): LLMProvider {
  const key = process.env['OPENAI_API_KEY'];
  if (!key) throw new Error('OPENAI_API_KEY is required for embeddings');
  return new OpenAIProvider(key);
}

export function invalidateProviderCache(): void {
  cachedName = null;
  cachedInstance = null;
}
