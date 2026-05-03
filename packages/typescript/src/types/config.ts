export interface MonitorConfig {
  apiKey: string;
  endpoint?: string;
  /** Max events buffered before forced flush. Default 50. */
  batchSize?: number;
  /** Max ms a buffered event waits before flush. Default 2000. */
  flushIntervalMs?: number;
  /** Default environment tag attached to events when not provided. */
  environment?: 'production' | 'staging' | 'development';
  /** Override fetch implementation (mostly for tests). */
  fetchFn?: typeof fetch;
  /** Disable transport (useful for tests / dry runs). */
  disabled?: boolean;
  /** Called when an event is dropped after retries. */
  onDrop?: (events: unknown[], reason: string) => void;
}
