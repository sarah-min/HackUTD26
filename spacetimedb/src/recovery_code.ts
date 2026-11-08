// Recovery-code helpers (CONTRACTS.md §5.3). Pure; the module never generates or stores a code, only sha256(pepper + normalized).
// The protection is the 100-bit browser-generated code, NOT the pepper (see recoveryHash).
// The browser's copy of normalize/shape lives in apps/web/lib/stdb/recoveryCode.ts and MUST behave identically
// (test/accounts.test.ts asserts equal outputs over a corpus). Crockford base32 minus the letter U, 20 chars = 100 bits.
import { sha256Hex } from './sha256';

export const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_CODE_LENGTH = 20;
/** Weak-code policy (identical in apps/web/lib/stdb/recoveryCode.ts). Honest random codes essentially never trip it. */
export const RECOVERY_MIN_DISTINCT = 10;
/** Longest input the module will even normalize (a code is 20 chars + dashes/spaces); longer is a free invalid_code. */
export const RECOVERY_MAX_INPUT_LENGTH = 64;
/** A run of this many alphabet-consecutive characters (ascending OR descending, e.g. ABCDEF, 987654) is rejected. */
export const RECOVERY_MAX_SEQUENCE_RUN = 6;
/** Any repeating period up to this many chars across the whole code (ABCDEFGHABCDEFGHABCD) is rejected. */
export const RECOVERY_MAX_PERIOD = 8;
/** A run of this many identical characters is rejected. */
export const RECOVERY_MAX_REPEAT_RUN = 4;

/** Uppercase, strip whitespace and dashes, then Crockford folding: O -> 0, I and L -> 1. Does not validate. */
export function normalizeRecoveryCode(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .toUpperCase()
    .replace(/[\s‐-―-]+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/**
 * True when the input (<= 64 chars) NORMALIZES to exactly 20 alphabet chars that pass the weak-code policy: at least 10
 * distinct characters, no alphabet-consecutive run of 6+ (ascending or descending), no repeating period of 8 or less over all
 * 20 characters, and no run of 4+ identical characters.
 */
export function isRecoveryCodeShape(input: string): boolean {
  if (typeof input !== 'string' || input.length > RECOVERY_MAX_INPUT_LENGTH) return false;
  const n = normalizeRecoveryCode(input);
  if (n.length !== RECOVERY_CODE_LENGTH) return false;
  const idx: number[] = [];
  for (const ch of n) {
    const k = RECOVERY_ALPHABET.indexOf(ch);
    if (k < 0) return false;
    idx.push(k);
  }
  if (new Set(n).size < RECOVERY_MIN_DISTINCT) return false;
  let asc = 1;
  let desc = 1;
  let same = 1;
  for (let i = 1; i < idx.length; i++) {
    const d = idx[i]! - idx[i - 1]!;
    asc = d === 1 ? asc + 1 : 1;
    desc = d === -1 ? desc + 1 : 1;
    same = d === 0 ? same + 1 : 1;
    if (asc >= RECOVERY_MAX_SEQUENCE_RUN || desc >= RECOVERY_MAX_SEQUENCE_RUN || same >= RECOVERY_MAX_REPEAT_RUN) return false;
  }
  for (let p = 1; p <= RECOVERY_MAX_PERIOD; p++) {
    let periodic = true;
    for (let i = p; i < idx.length && periodic; i++) if (idx[i] !== idx[i - p]) periodic = false;
    if (periodic) return false;
  }
  return true;
}

/**
 * The only thing stored. A 100-bit secret needs no slow hash. The "pepper" is a per-database DOMAIN SEPARATOR, not a secret:
 * it is drawn from the host's timestamp-seeded RNG and lives in a private table, so security must not rely on it. Only the
 * 100-bit browser-generated code protects an account; the weak-code policy above keeps that code honest.
 */
export function recoveryHash(pepper: string, normalizedCode: string): string {
  return sha256Hex(`${pepper}${normalizedCode}`);
}

export function hex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}
