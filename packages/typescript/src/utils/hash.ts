import { createHash } from 'node:crypto';

export function hashUserId(id: string | number | null | undefined): string {
  if (id === null || id === undefined || id === '') return '';
  return createHash('sha256').update(String(id)).digest('hex');
}
