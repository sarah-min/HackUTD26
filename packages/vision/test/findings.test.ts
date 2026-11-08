import { describe, expect, it } from 'vitest';
import { FrameFindingSchema } from '@hack/contracts/assessment';
import { addMentionedDangers, analyzeFrame, applyDamageRules, createMemoryCache, normalizeBox, type ModelFrame } from '../src';
import { scriptedNim } from './fakeNim';

const noWater = { present: false, inside: false, level: 'not_visible', referenceObject: 'none' } as const;
const frame = (p: Partial<ModelFrame>): ModelFrame => ({
  usable: true, scene: 'home_exterior', caption: 'x', headline: 'x', observations: [], water: { ...noWater }, lifeSafety: [], ...p,
});
const good = JSON.stringify(frame({
  caption: 'Roof with a large hole.', headline: 'Roof open to the sky',
  observations: [{ cue: 'roof_structure_missing', evidence: 'x'.repeat(260), confidence: 1.3 }],
}));
const img = Buffer.from([0xff, 0xd8, 0xff, 0x00, 1, 2, 3]);
const levelOf = (f: ReturnType<typeof applyDamageRules>, c: string) => f.components.find((x) => x.component === c)?.level;

describe('analyzeFrame', () => {
  it('validates, clamps, applies the rules and injects frameIndex/tSec', async () => {
    const { nim } = scriptedNim([good]);
    const r = await analyzeFrame({ nim, image: img, frameIndex: 3, tSec: 12.5 });
    expect(FrameFindingSchema.parse(r.finding)).toBeTruthy();
    expect(r.finding.frameIndex).toBe(3);
    expect(r.finding.components[0]).toMatchObject({ component: 'roof', level: 'major', confidence: 1 });
    expect(r.finding.components[0]!.evidence).toHaveLength(200);
    expect(r.finding.rulesVersion).toBe('damage-rules-v1');
  });

  it('retries once with the validation error, then succeeds', async () => {
    const seen: any[] = [];
    const { nim } = scriptedNim(['{"usable": "maybe"}', good], seen);
    const r = await analyzeFrame({ nim, image: img, frameIndex: 0, tSec: 0 });
    expect(r.attempts).toBe(2);
    expect(JSON.stringify(seen[1].messages.at(-1))).toContain('failed validation');
  });

  it('marks the frame unusable/parse_error after two failures', async () => {
    const { nim } = scriptedNim(['not json', 'still not json']);
    const r = await analyzeFrame({ nim, image: img, frameIndex: 1, tSec: 4 });
    expect(r.finding.unusableReason).toBe('parse_error');
  });

  it('a re-run with the same frame makes no new VL call (SHA-256 cache)', async () => {
    const cache = createMemoryCache();
    const { nim, calls } = scriptedNim([good]);
    await analyzeFrame({ nim, image: img, frameIndex: 0, tSec: 0, cache });
    const again = await analyzeFrame({ nim, image: img, frameIndex: 5, tSec: 9, cache });
    expect(calls()).toBe(1);
    expect(again.finding.frameIndex).toBe(5);
  });

  it('asks for guided JSON with bounded sampling and sends the image as a data URL', async () => {
    const seen: any[] = [];
    const { nim } = scriptedNim([good], seen);
    await analyzeFrame({ nim, image: img, frameIndex: 0, tSec: 0 });
    expect(seen[0].response_format.json_schema.schema.properties.observations.maxItems).toBe(8);
    expect(seen[0].repetition_penalty).toBeGreaterThan(1);
    expect(seen[0].messages[1].content[1].image_url.url.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('falls back to plain JSON once when the server rejects guided decoding', async () => {
    const seen: any[] = [];
    const { nim } = scriptedNim([{ status: 400, body: 'response_format not supported' }, good, good], seen);
    await analyzeFrame({ nim, image: img, frameIndex: 0, tSec: 0 });
    await analyzeFrame({ nim, image: Buffer.from([9, 9, 9]), frameIndex: 1, tSec: 1 });
    expect(seen[1].response_format).toBeUndefined();
    expect(seen[2].response_format).toBeUndefined();
  });

  it('retries a reply cut off at the length limit', async () => {
    const seen: any[] = [];
    const { nim } = scriptedNim([{ content: '{"usable": true, "observations": [', finishReason: 'length' }, good], seen);
    const r = await analyzeFrame({ nim, image: img, frameIndex: 0, tSec: 0 });
    expect(r.attempts).toBe(2);
    expect(JSON.stringify(seen[1].messages.at(-1))).toContain('cut off');
  });

  it('collapses a looping reply: each cue and flag once', async () => {
    const looping = JSON.stringify(frame({
      observations: Array.from({ length: 12 }, (_, i) => ({ cue: 'cladding_damaged', evidence: 'siding torn', confidence: 0.5 + i / 100 })),
      lifeSafety: Array.from({ length: 6 }, () => ({ flag: 'downed_power_line', evidence: 'wire', confidence: 0.9 })),
    }));
    const { nim } = scriptedNim([looping]);
    const r = await analyzeFrame({ nim, image: img, frameIndex: 0, tSec: 0 });
    expect(r.finding.observations).toHaveLength(1);
    expect(r.finding.observations![0]!.confidence).toBe(0.61);
    expect(r.finding.lifeSafety).toHaveLength(1);
  });

  it('adds a flag the model described but did not set (the hurricane street photo)', async () => {
    const street = JSON.stringify(frame({
      scene: 'street_or_area', headline: 'Downed power lines and debris on street',
      caption: 'A residential street littered with fallen utility poles and wires after a storm.',
    }));
    const { nim } = scriptedNim([street]);
    const r = await analyzeFrame({ nim, image: img, frameIndex: 0, tSec: 0 });
    expect(r.finding.lifeSafety.map((s) => s.flag)).toContain('downed_power_line');
    expect(r.finding.components).toHaveLength(0);
  });

  it('does not add a flag for a negated mention', () => {
    const f = FrameFindingSchema.parse({ frameIndex: 0, tSec: 0, usable: true, components: [], lifeSafety: [], waterDepth: 'none', caption: 'House with no downed power lines visible.' });
    expect(addMentionedDangers(f).lifeSafety).toHaveLength(0);
  });

  it('normalizes highlight boxes', () => {
    expect(normalizeBox([25, 25, 50, 50])).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(normalizeBox({ x: 120, y: 40, w: 300, h: 200 })).toBeUndefined();
  });
});

describe('damage rules across disaster types', () => {
  it('flood photo: water inside with no reference is minor, depth unknown, flagged, no foundation', () => {
    const f = applyDamageRules(frame({
      scene: 'home_interior', hazardObserved: 'flood',
      water: { present: true, inside: true, level: 'above_outlets', referenceObject: 'none' },
      observations: [{ cue: 'mud_or_sediment_inside', evidence: 'mud on the floor', confidence: 0.8 }],
    }), 0, 0);
    expect(levelOf(f, 'interior')).toBe('minor');
    expect(levelOf(f, 'foundation')).toBeUndefined();
    expect(f.waterDepth).toBe('unknown');
    expect(f.water!.level).toBe('not_visible');
    expect(f.lifeSafety.map((s) => s.flag)).toContain('standing_water_interior');
    expect(f.hazardObserved).toBe('flood');
  });

  it('flood: water above outlets with a visible outlet is major', () => {
    const f = applyDamageRules(frame({ scene: 'home_interior', water: { present: true, inside: true, level: 'above_outlets', referenceObject: 'electrical_outlet' } }), 0, 0);
    expect(levelOf(f, 'interior')).toBe('major');
    expect(f.waterDepth).toBe('knee');
  });

  it('wildfire: burned-out house is destroyed; wildfire label needs burn evidence', () => {
    const burned = applyDamageRules(frame({ hazardObserved: 'wildfire', observations: [{ cue: 'structure_burned_out', evidence: 'only chimney left', confidence: 0.9 }] }), 0, 0);
    expect(levelOf(burned, 'exterior_walls')).toBe('destroyed');
    expect(burned.hazardObserved).toBe('wildfire');
    const guess = applyDamageRules(frame({ hazardObserved: 'wildfire', observations: [{ cue: 'cladding_damaged', evidence: 'torn siding', confidence: 0.8 }] }), 0, 0);
    expect(guess.hazardObserved).toBeUndefined();
  });

  it('earthquake: a leaning house is major with a structural flag', () => {
    const f = applyDamageRules(frame({ observations: [{ cue: 'structure_leaning', evidence: 'house tilted', confidence: 0.8 }] }), 0, 0);
    expect(levelOf(f, 'foundation')).toBe('major');
    expect(f.lifeSafety.map((s) => s.flag)).toContain('structural_collapse');
  });

  it('hail: dented roof surface is affected only', () => {
    const f = applyDamageRules(frame({ observations: [{ cue: 'roof_surface_minor', evidence: 'dents on shingles', confidence: 0.7 }] }), 0, 0);
    expect(levelOf(f, 'roof')).toBe('affected');
  });

  it('tornado: collapsed structure is destroyed', () => {
    const f = applyDamageRules(frame({ observations: [{ cue: 'structure_collapsed', evidence: 'house flattened', confidence: 0.9 }] }), 0, 0);
    expect(levelOf(f, 'roof')).toBe('destroyed');
  });

  it('street scenes raise dangers but never set property damage (the hurricane street photo, live v4 output)', () => {
    const f = applyDamageRules(frame({ scene: 'street_or_area', observations: [
      { cue: 'debris_on_lot', evidence: 'Utility poles and wires scattered across the street', confidence: 0.95 },
      { cue: 'structure_collapsed', evidence: 'Buildings partially collapsed', confidence: 0.85 },
      { cue: 'vehicle_damaged', evidence: 'Cars with visible damage', confidence: 0.75 },
      { cue: 'no_visible_damage', evidence: 'Some areas undamaged', confidence: 0.65 },
    ] }), 0, 0);
    expect(f.components).toHaveLength(0);
    expect(f.lifeSafety.map((s) => s.flag)).toContain('structural_collapse');
    expect(f.observations!.map((o) => o.cue)).not.toContain('no_visible_damage');
  });

  it('aerial shots count with lower confidence', () => {
    const f = applyDamageRules(frame({ scene: 'aerial', observations: [{ cue: 'roof_structure_missing', evidence: 'roof open', confidence: 0.8 }] }), 0, 0);
    expect(f.components[0]!.confidence).toBeCloseTo(0.64);
  });

  it('flood photo, live v4 output: minor interior, depth unknown, standing-water flag', () => {
    const f = applyDamageRules(frame({ scene: 'home_interior', hazardObserved: 'flood',
      observations: [
        { cue: 'mud_or_sediment_inside', evidence: 'Muddy water covering the floor', confidence: 0.95 },
        { cue: 'interior_finishes_damaged', evidence: 'Water soaked into lower walls and baseboards', confidence: 0.85 },
      ],
      water: { present: true, inside: true, level: 'not_visible', referenceObject: 'none' } }), 0, 0);
    expect(levelOf(f, 'interior')).toBe('minor');
    expect(f.waterDepth).toBe('unknown');
    expect(f.lifeSafety.map((s) => s.flag)).toEqual(['standing_water_interior']);
  });

  it('a hazard label with no evidence at all is dropped', () => {
    const f = applyDamageRules(frame({ hazardObserved: 'hurricane_wind', observations: [{ cue: 'no_visible_damage', evidence: 'intact house', confidence: 0.9 }] }), 0, 0);
    expect(f.hazardObserved).toBeUndefined();
    expect(f.components).toHaveLength(0);
  });
});
