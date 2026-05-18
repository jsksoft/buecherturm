import { GoogleGenAI } from '@google/genai';
import { sanitizeForLLM } from '@buecherturm/shared';
import type { EmbeddingOptions, LLMMessage, LLMOptions, LLMProvider, LLMResponse } from './provider';

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';

  private client: GoogleGenAI;
  private defaultModel: string;
  private defaultEmbeddingModel: string;

  constructor(
    apiKey: string,
    defaultModel = 'gemini-2.0-flash-lite',
    defaultEmbeddingModel = 'text-embedding-004',
  ) {
    this.client = new GoogleGenAI({ apiKey });
    this.defaultModel = defaultModel;
    this.defaultEmbeddingModel = defaultEmbeddingModel;
  }

  async complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;

    // Sanitize all content before leaving the application boundary (CLAUDE.md rule #4)
    const sanitized = messages.map((m) => ({ ...m, content: sanitizeForLLM(m.content) }));

    const system = options?.systemPrompt ?? sanitized.find((m) => m.role === 'system')?.content;
    // Gemini expects alternating user/model turns; map 'assistant' → 'model'
    const contents = sanitized
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

    const response = await this.client.models.generateContent({
      model,
      contents,
      config: {
        maxOutputTokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.7,
        ...(system ? { systemInstruction: system } : {}),
      },
    });

    const text = response.text;
    if (!text) throw new Error('Unexpected empty response from Gemini');

    return {
      content: text,
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
      model,
    };
  }

  async embed(texts: string[], options?: EmbeddingOptions): Promise<number[][]> {
    const model = options?.model ?? this.defaultEmbeddingModel;
    const response = await this.client.models.embedContent({
      model,
      contents: texts,
      ...(options?.dimensions ? { config: { outputDimensionality: options.dimensions } } : {}),
    });

    const embeddings = response.embeddings ?? [];
    return embeddings.map((e) => e.values ?? []);
  }
}
