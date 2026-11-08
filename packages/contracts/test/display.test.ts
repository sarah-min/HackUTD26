import { describe, expect, it } from 'vitest';
import { FrameFindingSchema } from '../src/assessment';
import { DAMAGE_LEVEL_LABEL, confidenceLabel, frameHeadline, frameLabel, lifeSafetyChips, primaryFinding } from '../src/display';

const finding = FrameFindingSchema.parse({
  frameIndex: 1, tSec: 21, usable: true, waterDepth: 'none', caption: 'Front of a house.',
  components: [
    { component: 'yard_debris', level: 'minor', evidence: 'Branches in the yard', confidence: 0.9 },
    { component: 'roof', level: 'major', evidence: 'Missing shingles and exposed decking', confidence: 0.8, extent: 'partial', box: { x: 0.2, y: 0.1, w: 0.5, h: 0.3 } },
  ],
  lifeSafety: [],
});

describe('display labels', () => {
  it('maps the FEMA scale to the Figma legend', () => {
    expect(DAMAGE_LEVEL_LABEL.major).toBe('Severe');
    expect(DAMAGE_LEVEL_LABEL.affected).toBe('Minor');
  });
  it('labels confidence', () => {
    expect(confidenceLabel(0.93)).toBe('High confidence');
    expect(confidenceLabel(0.6)).toBe('Medium confidence');
    expect(confidenceLabel(0.2)).toBe('Low confidence');
  });
  it('turns life_safety_csv into reporter chips, severe first', () => {
    expect(lifeSafetyChips('structural_collapse,gas_leak_suspected,bogus')).toEqual(['Possible gas leak', 'Structural instability']);
  });
  it('leads a frame card with the worst component and its box', () => {
    const p = primaryFinding(finding)!;
    expect(p.label).toBe('Roof');
    expect(p.box).toEqual({ x: 0.2, y: 0.1, w: 0.5, h: 0.3 });
    expect(frameHeadline(finding)).toBe('Missing shingles and exposed decking');
    expect(frameLabel(1, 21)).toBe('Frame 02 · 00:21');
  });
  it('puts a visible danger ahead of damage', () => {
    const f = { ...finding, lifeSafety: [{ flag: 'downed_power_line' as const, evidence: 'Wire on the driveway', confidence: 0.8 }] };
    expect(primaryFinding(f)!.label).toBe('Downed power line');
  });
});
