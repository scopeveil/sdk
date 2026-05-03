import type { LLMEvent } from '../types/event.js';

export interface QueueOptions {
  batchSize: number;
  flushIntervalMs: number;
  send: (events: LLMEvent[]) => Promise<void>;
  maxRetries?: number;
  onDrop?: (events: LLMEvent[], reason: string) => void;
}

export class EventQueue {
  private buffer: LLMEvent[] = [];

  private timer: ReturnType<typeof setInterval> | null = null;

  private inflight: Promise<void> | null = null;

  private closed = false;

  constructor(private readonly opts: QueueOptions) {
    this.timer = setInterval(() => {
      void this.flush();
    }, this.opts.flushIntervalMs);
    if (typeof (this.timer as { unref?: () => void }).unref === 'function') {
      (this.timer as { unref: () => void }).unref();
    }
  }

  push(event: LLMEvent): void {
    if (this.closed) return;
    this.buffer.push(event);
    if (this.buffer.length >= this.opts.batchSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.inflight) {
      await this.inflight;
    }
    if (this.buffer.length === 0) return;
    const events = this.buffer;
    this.buffer = [];

    const attempts = this.opts.maxRetries ?? 3;
    this.inflight = (async () => {
      let lastError: unknown;
      for (let i = 1; i <= attempts; i++) {
        try {
          await this.opts.send(events);
          return;
        } catch (err) {
          lastError = err;
          if (i < attempts) {
            await new Promise((r) => setTimeout(r, 250 * 2 ** (i - 1)));
          }
        }
      }
      this.opts.onDrop?.(events, (lastError as Error)?.message ?? 'unknown');
    })().finally(() => {
      this.inflight = null;
    });

    await this.inflight;
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }
}
