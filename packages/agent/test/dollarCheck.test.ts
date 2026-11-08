import { describe, expect, it } from 'vitest';
import { collectAllowedCents, findDollarAmounts, stripUnsupportedSentences, unsupportedAmounts } from '../src';

describe('dollar post-check', () => {
  const allowed = collectAllowedCents([{ lowCents: 2_478_000, likelyCents: 3_540_000, highCents: 4_956_000 }]);
  it('finds $ amounts in common formats', () => {
    expect(findDollarAmounts('about $35,400 or $35.4k, USD 12 and 40 dollars').map((a) => a.cents)).toEqual([3_540_000, 3_540_000, 1_200, 4_000]);
  });
  it('accepts tool figures, including rounded forms', () => {
    expect(unsupportedAmounts(['Likely $35,400 (range $24,780 to $49,560), roughly $35k'], allowed)).toEqual([]);
  });
  it('rejects invented figures and over-rounding', () => {
    expect(unsupportedAmounts(['FEMA may give you $10,000.'], allowed)).toEqual(['$10,000']);
    expect(unsupportedAmounts(['About $40,000.'], allowed)).toEqual(['$40,000']);
  });
  it('strips only the offending sentence', () => {
    expect(stripUnsupportedSentences('Damage is major. FEMA may pay $10,000. Estimate $35,400.', allowed)).toBe('Damage is major. Estimate $35,400.');
  });
});
