/**
 * Recovery codes for email-less accounts (CONTRACTS.md §5.3). The BROWSER generates the code; the module only ever sees it
 * inside create_account / sign_in_with_code / step_up_with_code / replace_recovery_code and stores sha256(pepper + code).
 *
 * 20 chars of Crockford base32 (no I, L, O, U) = 100 bits, shown as XXXX-XXXX-XXXX-XXXX-XXXX.
 * `normalizeRecoveryCode` / `isRecoveryCodeShape` MUST behave exactly like spacetimedb/src/recovery_code.ts
 * (spacetimedb/test/accounts.test.ts asserts equal output over a corpus). Pure TS: no DOM types, no imports.
 */

export const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_CODE_LENGTH = 20;
/** Weak-code policy (identical in spacetimedb/src/recovery_code.ts). Honest random codes essentially never trip it. */
export const RECOVERY_MIN_DISTINCT = 10;
/** Longest input the module will even normalize (a code is 20 chars + dashes/spaces); longer is a free invalid_code. */
export const RECOVERY_MAX_INPUT_LENGTH = 64;
/** A run of this many alphabet-consecutive characters (ascending OR descending, e.g. ABCDEF, 987654) is rejected. */
export const RECOVERY_MAX_SEQUENCE_RUN = 6;
/** Any repeating period up to this many chars across the whole code (ABCDEFGHABCDEFGHABCD) is rejected. */
export const RECOVERY_MAX_PERIOD = 8;
/** A run of this many identical characters is rejected. */
export const RECOVERY_MAX_REPEAT_RUN = 4;

/** Fills `bytes` with cryptographically secure random bytes (crypto.getRandomValues unless a test injects one). */
export type RandomBytes = (bytes: Uint8Array) => void;

function secureRandom(bytes: Uint8Array): void {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (!c || typeof c.getRandomValues !== 'function') throw new Error('crypto.getRandomValues is not available');
  c.getRandomValues(bytes);
}

/**
 * A fresh code like `7K2M-QH9D-X4PW-0NTB-C8VR`. Rejection sampling: only bytes < 224 (= 7 * 32) are used (byte % 32), so every
 * alphabet character is exactly equally likely (no modulo bias). Resamples until the code passes the module's weak-code policy
 * (isRecoveryCodeShape: 10+ distinct characters, no sequences, no repeating period, no run of 4 identical characters). Honest
 * random codes almost never fail it, so the loss of entropy is negligible.
 */
export function generateRecoveryCode(random: RandomBytes = secureRandom): string {
  for (;;) {
    let out = '';
    const buf = new Uint8Array(64);
    while (out.length < RECOVERY_CODE_LENGTH) {
      random(buf);
      for (let i = 0; i < buf.length && out.length < RECOVERY_CODE_LENGTH; i++) {
        const b = buf[i]!;
        if (b < 224) out += RECOVERY_ALPHABET[b % 32];
      }
    }
    if (isRecoveryCodeShape(out)) return out.match(/.{4}/g)!.join('-');
  }
}

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

/** Re-groups whatever the user typed as XXXX-XXXX-XXXX-XXXX-XXXX for display (input is normalized first; partial input is grouped as far as it goes). */
export function formatRecoveryCode(input: string): string {
  const n = normalizeRecoveryCode(input).slice(0, RECOVERY_CODE_LENGTH);
  return n.match(/.{1,4}/g)?.join('-') ?? '';
}
