// "No dollar figure unless it came from a tool" (ARCHITECTURE §6.3).

const AMOUNT_RE =
  /(?:\$\s?|\bUSD\s?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(k|K|thousand|m|M|million)?\b|\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:dollars|USD)\b/g;

export interface FoundAmount {
  raw: string;
  cents: number;
}

export function findDollarAmounts(text: string): FoundAmount[] {
  const out: FoundAmount[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const whole = (m[1] ?? m[4] ?? '0').replace(/,/g, '');
    const frac = (m[2] ?? m[5] ?? '').padEnd(2, '0');
    let cents = Number(whole) * 100 + Number(frac || '0');
    const mult = m[3]?.toLowerCase();
    if (mult === 'k' || mult === 'thousand') cents *= 1_000;
    if (mult === 'm' || mult === 'million') cents *= 1_000_000;
    out.push({ raw: m[0].trim(), cents });
  }
  return out;
}

/** Every number under a key ending in `Cents` anywhere in the tool outputs, plus dollar strings they contain. */
export function collectAllowedCents(values: unknown[]): number[] {
  const allowed = new Set<number>();
  const walk = (v: unknown, key = '') => {
    if (typeof v === 'number' && /Cents$/.test(key) && Number.isFinite(v)) allowed.add(v);
    else if (typeof v === 'string') for (const a of findDollarAmounts(v)) allowed.add(a.cents);
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  values.forEach((v) => walk(v));
  return [...allowed];
}

/** Rounding precision implied by how the figure is written: $35,000 → $1,000; $35,400 → $100. */
function writtenPrecision(cents: number): number {
  let p = 100;
  while (p < 1e12 && cents % (p * 10) === 0 && cents !== 0) p *= 10;
  return p;
}

/**
 * Supported when it matches a tool value up to rounding: within max($1, 1%), or equal to the tool value rounded
 * to the figure's own precision when that precision is at most 5% of the value ($35k for $35,400, not $40k).
 */
export function isSupported(cents: number, allowed: readonly number[]): boolean {
  const p = writtenPrecision(cents);
  return allowed.some(
    (a) =>
      Math.abs(a - cents) <= Math.max(100, Math.round(a * 0.01)) ||
      (p <= a * 0.05 && Math.round(a / p) * p === cents),
  );
}

export function unsupportedAmounts(texts: readonly string[], allowed: readonly number[]): string[] {
  const bad: string[] = [];
  for (const t of texts) for (const a of findDollarAmounts(t)) if (!isSupported(a.cents, allowed)) bad.push(a.raw);
  return [...new Set(bad)];
}

/** Deterministic last resort: drop sentences that contain unsupported amounts. */
export function stripUnsupportedSentences(text: string, allowed: readonly number[]): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences
    .filter((s) => findDollarAmounts(s).every((a) => isSupported(a.cents, allowed)))
    .join(' ')
    .trim();
}
