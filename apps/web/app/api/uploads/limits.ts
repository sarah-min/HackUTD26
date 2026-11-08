import { timingSafeEqual } from 'node:crypto';

export function hashesEqual(aHex: string, bHex: string): boolean {
  if (aHex.length !== bHex.length) return false;
  try {
    return timingSafeEqual(Buffer.from(aHex, 'utf8'), Buffer.from(bHex, 'utf8'));
  } catch {
    return false;
  }
}

export const UPLOADABLE_REPORT_STATUSES = new Set(['draft', 'needs_more_footage', 'failed']);
