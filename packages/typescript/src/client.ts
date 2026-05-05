import type { MonitorConfig } from './types/config.js';
import type { LLMEvent } from './types/event.js';
import { DEFAULT_ENDPOINT } from './generated/defaults.js';
import { HttpTransport } from './transport/http.js';
import { EventQueue } from './transport/queue.js';
import { sanitizeEvent } from './utils/sanitize.js';
import { wrapOpenAI } from './interceptors/openai.js';
import { wrapAnthropic } from './interceptors/anthropic.js';

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
}
