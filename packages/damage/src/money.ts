/** round(a × b × c / d), half away from zero, exact for any safe-integer inputs. */
export function mulDivRound(a: number, b: number, c: number, d: number): number {
  for (const v of [a, b, c, d]) {
    if (!Number.isSafeInteger(v)) throw new Error(`mulDivRound expects safe integers, got ${v}`);
  }
  if (d === 0) throw new Error('mulDivRound: division by zero');
  const n = BigInt(a) * BigInt(b) * BigInt(c);
  const den = BigInt(d);
  const neg = n < 0n !== den < 0n;
  const an = n < 0n ? -n : n;
  const ad = den < 0n ? -den : den;
  const q = (an * 2n + ad) / (ad * 2n);
  const out = Number(neg ? -q : q);
  if (!Number.isSafeInteger(out)) throw new Error('mulDivRound: result exceeds safe integer range');
  return out;
}

/** "$1,234" style label for cost bases (whole dollars). */
export function dollars(cents: number): string {
  const whole = Math.round(cents / 100);
  return `$${whole.toLocaleString('en-US')}`;
}

/** Basis points → "15%" (keeps decimals only when needed). */
export function pct(bps: number): string {
  const v = bps / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(2)}%`;
}
