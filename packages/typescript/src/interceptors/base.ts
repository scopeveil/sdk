import type { ScopeVeil } from '../client.js';

export interface Interceptor<T> {
  wrap(client: T): T;
}

export type InterceptorFactory<T> = (monitor: ScopeVeil) => Interceptor<T>;
