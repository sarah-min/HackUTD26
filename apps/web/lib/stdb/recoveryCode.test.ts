import { describe, expect, it } from 'vitest';
import {
  RECOVERY_ALPHABET,
  formatRecoveryCode,
  generateRecoveryCode,
  isRecoveryCodeShape,
  normalizeRecoveryCode,
} from './recoveryCode';

describe('recovery code helper', () => {
  it('generates XXXX-XXXX-XXXX-XXXX-XXXX from the Crockford alphabet, always module-valid', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = generateRecoveryCode();
      expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
      expect(isRecoveryCodeShape(c)).toBe(true);
      expect(normalizeRecoveryCode(c)).toBe(c.replace(/-/g, ''));
      seen.add(c);
    }
    expect(seen.size).toBe(200);
  });

  it('rejection sampling: bytes >= 224 are discarded, every other byte maps by % 32 (no modulo bias)', () => {
    // feed: 255 (rejected), 224 (rejected), then 0..19 in order, then filler
    const feed = [255, 224, ...Array.from({ length: 20 }, (_, i) => i), ...new Array(100).fill(255)];
    let pos = 0;
    const rng = (b: Uint8Array) => {
      for (let i = 0; i < b.length; i++) b[i] = feed[pos++ % feed.length]!;
    };
    expect(generateRecoveryCode(rng)).toBe('0123-4567-89AB-CDEF-GHJK');
  });

  it('re-draws a code that is too repetitive for the module (223 % 32 = 31 = Z, the largest accepted byte)', () => {
    let calls = 0;
    const rng = (b: Uint8Array) => {
      calls++;
      for (let i = 0; i < b.length; i++) b[i] = calls <= 2 ? 223 : i % 224; // first 20 chars are all Z, then varied
    };
    const c = generateRecoveryCode(rng);
    expect(c).not.toContain('ZZZZ-ZZZZ');
    expect(isRecoveryCodeShape(c)).toBe(true);
    expect(calls).toBeGreaterThan(2);
  });

  it('is uniform over the alphabet (loose chi-square over 20000 characters)', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 1000; i++) for (const ch of generateRecoveryCode().replace(/-/g, '')) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    const expected = 20000 / 32;
    let chi = 0;
    for (const ch of RECOVERY_ALPHABET) chi += ((counts.get(ch) ?? 0) - expected) ** 2 / expected;
    expect(counts.size).toBe(32);
    expect(chi).toBeLessThan(80); // df = 31; p ~ 1e-5 at 80
  });

  it('normalizes like the module: uppercase, strip spaces/dashes, O->0, I/L->1', () => {
    expect(normalizeRecoveryCode(' abcd-efgh jkmn-pqrs-tvwx ')).toBe('ABCDEFGHJKMNPQRSTVWX');
    expect(normalizeRecoveryCode('oOiIlL')).toBe('001111');
    expect(normalizeRecoveryCode('a–b\tc\nd')).toBe('ABCD');
    expect(normalizeRecoveryCode(undefined as unknown as string)).toBe('');
  });

  it('shape needs exactly 20 alphabet chars and at least 8 distinct', () => {
    expect(isRecoveryCodeShape('ABCDEFGH23456789JKMN')).toBe(true);
    expect(isRecoveryCodeShape('abcd-efgh-2345-6789-jkmn')).toBe(true);
    expect(isRecoveryCodeShape('A'.repeat(20))).toBe(false);
    expect(isRecoveryCodeShape('ABCDEFG' + 'A'.repeat(13))).toBe(false);
    expect(isRecoveryCodeShape('ABCDEFGH' + 'A'.repeat(12))).toBe(true);
    expect(isRecoveryCodeShape('ABCDEFGH23456789JKMU')).toBe(false);
    expect(isRecoveryCodeShape('ABCDEFGH23456789JK')).toBe(false);
    expect(isRecoveryCodeShape('')).toBe(false);
  });

  it('formats partial input for display', () => {
    expect(formatRecoveryCode('7k2mqh9d')).toBe('7K2M-QH9D');
    expect(formatRecoveryCode('7k2m-qh9dx4pw0ntbc8vrZZZZ')).toBe('7K2M-QH9D-X4PW-0NTB-C8VR');
    expect(formatRecoveryCode('')).toBe('');
  });

  it('fails loudly when no secure random source exists', () => {
    const real = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(() => generateRecoveryCode()).toThrow(/getRandomValues/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true });
    }
  });
});
