import type { Timestamp } from 'spacetimedb';

/** SpacetimeDB u64 ids are bigint in the SDK and decimal strings in contracts/JSON/URLs. */
export function idToString(id: bigint): string {
  return id.toString(10);
}

/** Parses a decimal id from a URL or JSON. Returns null for anything that isn't a valid u64. */
export function idFromString(s: string | null | undefined): bigint | null {
  if (!s || !/^\d{1,20}$/.test(s)) return null;
  const n = BigInt(s);
  return n <= 0xffff_ffff_ffff_ffffn ? n : null;
}

/** SpacetimeDB Timestamp → epoch milliseconds (contracts use `...At: number`). */
export function timestampToMs(ts: Timestamp): number {
  return Number(ts.toMillis());
}
