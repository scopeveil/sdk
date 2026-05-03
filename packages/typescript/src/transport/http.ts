import type { LLMEvent } from '../types/event.js';
import { sanitizeEvent } from '../utils/sanitize.js';

export interface HttpTransportOptions {
  apiKey: string;
  endpoint: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export class HttpTransport {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: HttpTransportOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async send(events: LLMEvent[]): Promise<void> {
    if (events.length === 0) return;
    const sanitized = events.map((e) => sanitizeEvent(e as unknown as Record<string, unknown>));

    const controller = new AbortController();
    const timeout = this.options.timeoutMs ?? 5_000;
    const timeoutHandle = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await this.fetchFn(`${this.options.endpoint}/v1/ingest/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({ events: sanitized }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`ingest_http_${res.status}`);
      }
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
