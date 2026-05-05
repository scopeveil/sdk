import type { MonitorConfig } from './types/config.js';
import type { LLMEvent } from './types/event.js';
import { DEFAULT_ENDPOINT } from './generated/defaults.js';
import { HttpTransport } from './transport/http.js';
import { EventQueue } from './transport/queue.js';
import { sanitizeEvent } from './utils/sanitize.js';
import {
  wrapOpenAI,
  wrapAzureOpenAI,
  wrapOpenAICompatible,
  type OpenAICompatibleProvider,
} from './interceptors/openai.js';
import { wrapAnthropic } from './interceptors/anthropic.js';
import { wrapGoogle } from './interceptors/google.js';
import { wrapMistral } from './interceptors/mistral.js';
import { wrapCohere } from './interceptors/cohere.js';
import { wrapBedrock } from './interceptors/bedrock.js';
import { wrapOllama } from './interceptors/ollama.js';

export class ScopeVeil {
  private readonly queue: EventQueue;

  private readonly transport: HttpTransport;

  private readonly env: MonitorConfig['environment'];

  constructor(private readonly config: MonitorConfig) {
    if (!config.apiKey) {
      throw new Error('ScopeVeil: apiKey is required');
    }
    this.env = config.environment ?? 'production';
    const endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    this.transport = new HttpTransport({
      apiKey: config.apiKey,
      endpoint,
      fetchFn: config.fetchFn,
    });
    this.queue = new EventQueue({
      batchSize: config.batchSize ?? 50,
      flushIntervalMs: config.flushIntervalMs ?? 2000,
      send: (events) => this.transport.send(events),
      onDrop: config.onDrop,
    });
  }

  defaultEnvironment(): MonitorConfig['environment'] {
    return this.env;
  }

  track(event: LLMEvent): void {
    if (this.config.disabled) return;
    const sanitized = sanitizeEvent(event as unknown as Record<string, unknown>);
    this.queue.push(sanitized);
  }

  async flush(): Promise<void> {
    await this.queue.flush();
  }

  async close(): Promise<void> {
    await this.queue.close();
  }

  wrapOpenAI<T extends object>(client: T): T {
    return wrapOpenAI(client, this);
  }

  wrapAnthropic<T extends object>(client: T): T {
    return wrapAnthropic(client, this);
  }

  wrapGoogle<T extends object>(client: T): T {
    return wrapGoogle(client, this);
  }

  wrapMistral<T extends object>(client: T): T {
    return wrapMistral(client, this);
  }

  wrapCohere<T extends object>(client: T): T {
    return wrapCohere(client, this);
  }

  wrapBedrock<T extends object>(client: T): T {
    return wrapBedrock(client, this);
  }

  wrapOllama<T extends object>(client: T): T {
    return wrapOllama(client, this);
  }

  wrapAzureOpenAI<T extends object>(client: T): T {
    return wrapAzureOpenAI(client, this);
  }

  /**
   * Pra providers OpenAI-compatible (Groq, xAI, Perplexity, DeepSeek,
   * Together, Fireworks, OpenRouter, etc). Você passa o cliente OpenAI
   * configurado com a baseURL deles + o nome do provider — eventos
   * vão pro back-end com o provider correto pra cost tracking.
   */
  wrapOpenAICompatible<T extends object>(client: T, provider: OpenAICompatibleProvider): T {
    return wrapOpenAICompatible(client, this, provider);
  }
}
