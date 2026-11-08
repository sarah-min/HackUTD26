import { describe, expect, it } from 'vitest';
import type { FrameFinding } from '@hack/contracts/assessment';
import { aggregateFindings, needsMoreFootage } from '../src';

const f = (p: Partial<FrameFinding> & { frameIndex: number }): FrameFinding => ({
  tSec: 0, usable: true, components: [], lifeSafety: [], waterDepth: 'unknown', caption: 'x', ...p,
});

describe('aggregateFindings', () => {
  it('takes the max level at confidence ≥ 0.5 from usable frames only', () => {
    const agg = aggregateFindings([
      f({ frameIndex: 0, components: [{ component: 'roof', level: 'minor', evidence: 'e', confidence: 0.9 }] }),
      f({ frameIndex: 1, components: [{ component: 'roof', level: 'destroyed', evidence: 'e', confidence: 0.4 }] }),
      f({ frameIndex: 2, usable: false, unusableReason: 'blurry',
        components: [{ component: 'interior', level: 'major', evidence: 'e', confidence: 0.9 }] }),
      f({ frameIndex: 3, components: [{ component: 'interior', level: 'major', evidence: 'e', confidence: 0.7 }],
        hazardObserved: 'flood' }),
    ]);
    expect(agg.componentLevels.roof).toBe('minor');
    expect(agg.componentLevels.interior).toBe('major');
    expect(agg.componentLevels.vehicle).toBe('none');
    expect(agg.overallLevel).toBe('major');
    expect(agg.usableFrameCount).toBe(3);
    expect(agg.totalFrameCount).toBe(4);
    expect(agg.confidence).toBe(0.667);
    expect(agg.hazardObserved).toBe('flood');
  });

  it('keeps life-safety flags from any frame, in contract order', () => {
    const agg = aggregateFindings([
      f({ frameIndex: 0, usable: false, unusableReason: 'dark',
        lifeSafety: [{ flag: 'downed_power_line', evidence: 'e', confidence: 0.8 }] }),
      f({ frameIndex: 1, lifeSafety: [{ flag: 'active_fire', evidence: 'e', confidence: 0.6 },
        { flag: 'road_blocked', evidence: 'e', confidence: 0.3 }] }),
    ]);
    expect(agg.lifeSafety).toEqual(['active_fire', 'downed_power_line']);
  });

  it('needsMoreFootage mirrors the record_assessment rule', () => {
    expect(needsMoreFootage(3, 8)).toBe(true);
    expect(needsMoreFootage(4, 8)).toBe(false);
    expect(needsMoreFootage(0, 0)).toBe(true);
  });
});
