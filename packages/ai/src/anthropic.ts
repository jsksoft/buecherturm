import Anthropic from '@anthropic-ai/sdk';
import { sanitizeForLLM } from '@buecherturm/shared';
import type { EmbeddingOptions, LLMMessage, LLMOptions, LLMProvider, LLMResponse } from './provider';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';

  private client: Anthropic;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = 'claude-sonnet-4-6') {
    this.client = new Anthropic({ apiKey });
    this.defaultModel = defaultModel;
  }

  async complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;

    // Sanitize all content before leaving the application boundary (CLAUDE.md rule #4)
    const sanitized = messages.map((m) => ({ ...m, content: sanitizeForLLM(m.content) }));
    const system =
      options?.systemPrompt ?? sanitized.find((m) => m.role === 'system')?.content;
    const apiMessages = sanitized
      .filter((m): m is LLMMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const response = await this.client.messages.create({
      model,
      max_tokens: options?.maxTokens ?? 1024,
      ...(system !== undefined ? { system } : {}),
      messages: apiMessages,
    });

    const first = response.content[0];
    if (!first || first.type !== 'text') {
      throw new Error('Unexpected response format from Anthropic');
    }

    return {
      content: first.text,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
      model: response.model,
    };
  }

  // Embeddings are delegated to OpenAI text-embedding-3-small (Anthropic has no embedding API)
  async embed(_texts: string[], _options?: EmbeddingOptions): Promise<number[][]> {
    throw new Error('AnthropicProvider does not support embeddings. Use OpenAI text-embedding-3-small.');
  }
}
