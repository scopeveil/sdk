export type LLMProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'mistral'
  | 'cohere'
  | 'ollama'
  | 'azure'
  | 'bedrock'
  // Providers OpenAI-compatible: usam o mesmo SDK `openai` apontando
  // pra base URL diferente. Shape de request/response idêntica, só
  // diferem em pricing e headers de auth.
  | 'groq'
  | 'xai'
  | 'perplexity'
  | 'deepseek'
  | 'together'
  | 'fireworks'
  | 'openrouter';

export interface LLMEvent {
  model: string;
  model_version?: string;
  provider: LLMProvider;
  input_tokens: number;
  output_tokens: number;
  cache_tokens?: number;
  latency_ms: number;
  ttft_ms?: number;
  feature_tag?: string;
  user_id_hash?: string;
  environment?: 'production' | 'staging' | 'development';
  timestamp: string;
  is_error?: boolean;
  error_code?: string;
  error_message?: string;
}
