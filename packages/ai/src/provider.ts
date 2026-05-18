export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

export interface LLMOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface EmbeddingOptions {
  model?: string;
  dimensions?: number;
}

export interface LLMProvider {
  readonly name: string;
  complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;
  embed(texts: string[], options?: EmbeddingOptions): Promise<number[][]>;
}
