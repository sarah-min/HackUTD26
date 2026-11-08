import { describe, expect, it } from 'vitest';
import { CostEstimateSchema } from '@hack/contracts/assessment';
import { estimateRepairCost, mulDivRound } from '../src';

describe('estimateRepairCost (cost-v1)', () => {
  it('uses assumed defaults and gives exact cents', () => {
    const est = estimateRepairCost({ componentLevels: { roof: 'major', interior: 'minor', contents: 'minor' } });
    // structure = 1800 × 15000 = 27,000,000
    // roof 27,000,000 × 15% × 50% = 2,025,000 ; interior 27,000,000 × 30% × 15% = 1,215,000 ; contents 300,000
    expect(est.likelyCents).toBe(3_540_000);
    expect(est.lowCents).toBe(2_478_000);
    expect(est.highCents).toBe(4_956_000);
    expect(est.inputs).toEqual({ homeSqft: 1800, stories: 1, tenure: 'own', assumed: true });
    expect(est.lineItems.map((l) => l.likelyCents)).toEqual([2_025_000, 1_215_000, 300_000]);
    expect(est.lineItems[0]!.basis).toBe('1,800 sqft × $150/sqft × 15% roof share × 50% (major)');
    expect(CostEstimateSchema.safeParse(est).success).toBe(true);
  });

  it('uses intake values without the assumed flag', () => {
    const est = estimateRepairCost({
      componentLevels: { windows_doors: 'affected', vehicle: 'major' },
      homeSqft: 2333,
      stories: 2,
      tenure: 'own',
    });
    // 2333 × 15000 = 34,995,000 × 7% × 5% = 122,482.5 → 122,483 (half up) ; vehicle 1,200,000
    expect(est.likelyCents).toBe(1_322_483);
    expect(est.lowCents).toBe(925_738); // 925,738.1
    expect(est.highCents).toBe(1_851_476); // 1,851,476.2
    expect(est.inputs.assumed).toBe(false);
  });

  it('excludes structure for renters but keeps contents and vehicle', () => {
    const est = estimateRepairCost({
      componentLevels: { roof: 'destroyed', contents: 'major', vehicle: 'affected' },
      homeSqft: 900,
      stories: 1,
      tenure: 'rent',
    });
    expect(est.likelyCents).toBe(1_550_000);
    expect(est.lineItems.find((l) => l.component === 'roof')!.likelyCents).toBe(0);
    expect(est.notes?.some((n) => n.includes('landlord'))).toBe(true);
  });

  it('is zero for no damage', () => {
    const est = estimateRepairCost({ componentLevels: {} });
    expect([est.lowCents, est.likelyCents, est.highCents]).toEqual([0, 0, 0]);
    expect(est.lineItems).toEqual([]);
  });

  it('handles every component destroyed', () => {
    const est = estimateRepairCost({
      componentLevels: {
        roof: 'destroyed', exterior_walls: 'destroyed', windows_doors: 'destroyed', foundation: 'destroyed',
        interior: 'destroyed', utilities: 'destroyed', yard_debris: 'destroyed', contents: 'destroyed', vehicle: 'destroyed',
      },
    });
    // structure shares sum to 92% (cost-v1), so structure = 24,840,000; the cap is a guard for future tables
    expect(est.likelyCents).toBe(24_840_000 + 4_000_000 + 2_500_000);
    expect(est.notes?.some((n) => n.includes('capped'))).toBe(false);
  });

  it('rejects invalid home size', () => {
    expect(() => estimateRepairCost({ componentLevels: {}, homeSqft: 0, stories: 1, tenure: 'own' })).toThrow();
  });

  it('mulDivRound is exact beyond 2^53 intermediates', () => {
    expect(mulDivRound(1_500_000_000, 1_500, 5_000, 100_000_000)).toBe(112_500_000);
    expect(mulDivRound(5, 1, 1, 2)).toBe(3);
  });
});
