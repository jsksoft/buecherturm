import OpenAI from 'openai';
import { sanitizeForLLM } from '@buecherturm/shared';
import type { EmbeddingOptions, LLMMessage, LLMOptions, LLMProvider, LLMResponse } from './provider';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';

  private client: OpenAI;
  private defaultModel: string;
  private defaultEmbeddingModel: string;

  constructor(
    apiKey: string,
    defaultModel = 'gpt-4o-mini',
    defaultEmbeddingModel = 'text-embedding-3-small',
  ) {
    this.client = new OpenAI({ apiKey });
    this.defaultModel = defaultModel;
    this.defaultEmbeddingModel = defaultEmbeddingModel;
  }

  async complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;

    // Sanitize all content before leaving the application boundary (CLAUDE.md rule #4)
    const sanitized = messages.map((m) => ({ ...m, content: sanitizeForLLM(m.content) }));

    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const system = options?.systemPrompt ?? sanitized.find((m) => m.role === 'system')?.content;
    if (system) chatMessages.push({ role: 'system', content: system });
    chatMessages.push(
      ...sanitized
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    );

    const response = await this.client.chat.completions.create({
      model,
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0.7,
      messages: chatMessages,
    });

    const choice = response.choices[0];
    if (!choice?.message?.content) {
      throw new Error('Unexpected response format from OpenAI');
    }

    return {
      content: choice.message.content,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      model: response.model,
    };
  }

  async embed(texts: string[], options?: EmbeddingOptions): Promise<number[][]> {
    const model = options?.model ?? this.defaultEmbeddingModel;
    const response = await this.client.embeddings.create({
      model,
      input: texts,
      ...(options?.dimensions ? { dimensions: options.dimensions } : {}),
    });
    // Preserve input order — API may reorder on batching
    return response.data.sort((a, b) => a.index - b.index).map((e) => e.embedding);
  }
}
