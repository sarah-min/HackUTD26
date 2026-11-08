import { describe, expect, it } from 'vitest';
import { FrameFindingSchema } from '@hack/contracts/assessment';
import { addMentionedDangers, analyzeFrame, createMemoryCache, normalizeBox } from '../src';
import { scriptedNim } from './fakeNim';

const good = JSON.stringify({
  usable: true,
  components: [{ component: 'roof', level: 'major', evidence: 'x'.repeat(260), confidence: 1.3 }],
  lifeSafety: [],
  waterDepth: 'none',
  caption: 'Roof with a large hole.',
});
const img = Buffer.from([0xff, 0xd8, 0xff, 0x00, 1, 2, 3]);

describe('analyzeFrame', () => {
  it('validates, clamps and injects frameIndex/tSec', async () => {
    const { nim } = scriptedNim([good]);
    const r = await analyzeFrame({ nim, image: img, frameIndex: 3, tSec: 12.5 });
    expect(FrameFindingSchema.parse(r.finding)).toBeTruthy();
    expect(r.finding.frameIndex).toBe(3);
    expect(r.finding.components[0]!.evidence).toHaveLength(200);
    expect(r.finding.components[0]!.confidence).toBe(1);
    expect(r.attempts).toBe(1);
  });

  it('retries once with the validation error, then succeeds', async () => {
    const seen: any[] = [];
    const { nim } = scriptedNim(['{"usable": "maybe"}', good], seen);
    const r = await analyzeFrame({ nim, image: img, frameIndex: 0, tSec: 0 });
    expect(r.attempts).toBe(2);
    expect(r.finding.usable).toBe(true);
    expect(JSON.stringify(seen[1].messages.at(-1))).toContain('failed validation');
  });

  it('marks the frame unusable/parse_error after two failures', async () => {
    const { nim } = scriptedNim(['not json', 'still not json']);
    const r = await analyzeFrame({ nim, image: img, frameIndex: 1, tSec: 4 });
    expect(r.finding.usable).toBe(false);
    expect(r.finding.unusableReason).toBe('parse_error');
    expect(r.parseError).toBeTruthy();
  });

  it('a re-run with the same frame makes no new VL call (SHA-256 cache)', async () => {
    const cache = createMemoryCache();
    const { nim, calls } = scriptedNim([good]);
    await analyzeFrame({ nim, image: img, frameIndex: 0, tSec: 0, cache });
    const again = await analyzeFrame({ nim, image: img, frameIndex: 5, tSec: 9, cache });
    expect(calls()).toBe(1);
    expect(again.cached).toBe(true);
    expect(again.finding.frameIndex).toBe(5);
  });

  it('sends the image as a data URL image_url part', async () => {
    const seen: any[] = [];
    const { nim } = scriptedNim([good], seen);
    await analyzeFrame({ nim, image: img, frameIndex: 0, tSec: 0 });
    const part = seen[0].messages[1].content[1];
    expect(part.type).toBe('image_url');
    expect(part.image_url.url.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('asks for guided JSON with bounded sampling', async () => {
    const seen: any[] = [];
    const { nim } = scriptedNim([good], seen);
    await analyzeFrame({ nim, image: img, frameIndex: 0, tSec: 0 });
    expect(seen[0].response_format.type).toBe('json_schema');
    expect(seen[0].response_format.json_schema.schema.properties.components.maxItems).toBe(6);
    expect(seen[0].repetition_penalty).toBeGreaterThan(1);
    expect(seen[0].max_tokens).toBeLessThanOrEqual(900);
  });

  it('falls back to plain JSON once when the server rejects guided decoding', async () => {
    const seen: any[] = [];
    const { nim } = scriptedNim([{ status: 400, body: 'response_format not supported' }, good, good], seen);
    const r = await analyzeFrame({ nim, image: img, frameIndex: 0, tSec: 0 });
    expect(r.finding.usable).toBe(true);
    expect(seen[1].response_format).toBeUndefined();
    await analyzeFrame({ nim, image: Buffer.from([9, 9, 9]), frameIndex: 1, tSec: 1 });
    expect(seen[2].response_format).toBeUndefined(); // remembered for this client
  });

  it('retries a reply cut off at the length limit, asking for a shorter one', async () => {
    const seen: any[] = [];
    const { nim } = scriptedNim([{ content: '{"usable": true, "components": [', finishReason: 'length' }, good], seen);
    const r = await analyzeFrame({ nim, image: img, frameIndex: 0, tSec: 0 });
    expect(r.attempts).toBe(2);
    expect(r.finding.usable).toBe(true);
    expect(JSON.stringify(seen[1].messages.at(-1))).toContain('cut off');
  });

  it('collapses a looping reply: each component and flag once, worst level kept, lists capped', async () => {
    const looping = JSON.stringify({
      usable: true,
      headline: 'Pole down across the street with hanging wires and more words beyond the eighty character limit',
      caption: 'Street with a leaning utility pole.',
      components: [
        ...Array.from({ length: 10 }, () => ({ component: 'utilities', level: 'minor', extent: 'partial', evidence: 'Leaning pole', confidence: 0.7 })),
        { component: 'utilities', level: 'major', extent: 'widespread', evidence: 'Pole snapped', confidence: 0.6, box: [10, 20, 30, 40] },
        { component: 'yard_debris', level: 'minor', extent: 'sideways', evidence: 'Debris', confidence: 0.8 },
      ],
      lifeSafety: Array.from({ length: 6 }, () => ({ flag: 'downed_power_line', evidence: 'Wires on the road', confidence: 0.9 })),
      waterDepth: 'none',
    });
    const { nim } = scriptedNim([looping]);
    const r = await analyzeFrame({ nim, image: img, frameIndex: 2, tSec: 8 });
    expect(r.finding.components).toHaveLength(2);
    const util = r.finding.components.find((c) => c.component === 'utilities')!;
    expect(util.level).toBe('major');
    expect(util.box).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
    expect(r.finding.components.find((c) => c.component === 'yard_debris')!.extent).toBeUndefined();
    expect(r.finding.lifeSafety).toHaveLength(1);
    expect(r.finding.headline!.length).toBeLessThanOrEqual(80);
  });

  it('normalizes highlight boxes', () => {
    expect(normalizeBox({ x: 0.5, y: 0.5, w: 0.8, h: 0.2 })).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.2 });
    expect(normalizeBox([25, 25, 50, 50])).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(normalizeBox({ x: 120, y: 40, w: 300, h: 200 })).toBeUndefined(); // pixels
    expect(normalizeBox({ x: 0.1, y: 0.1, w: 0.001, h: 0.5 })).toBeUndefined();
    expect(normalizeBox('top left')).toBeUndefined();
  });

  it('still reads v1-style findings without the new fields', async () => {
    const { nim } = scriptedNim([good]);
    const r = await analyzeFrame({ nim, image: img, frameIndex: 0, tSec: 0 });
    expect(r.finding.headline).toBeUndefined();
    expect(r.finding.components[0]!.box).toBeUndefined();
  });

  it('adds a flag the model described but did not set (the hurricane street photo)', async () => {
    const street = JSON.stringify({
      usable: true, headline: 'Downed power lines and debris on street',
      caption: 'A residential street littered with fallen utility poles and wires after a storm.',
      components: [], lifeSafety: [], waterDepth: 'none',
    });
    const { nim } = scriptedNim([street]);
    const r = await analyzeFrame({ nim, image: img, frameIndex: 0, tSec: 0 });
    expect(r.finding.lifeSafety.map((s) => s.flag)).toContain('downed_power_line');
  });

  it('does not add a flag for a negated mention', () => {
    const f = FrameFindingSchema.parse({
      frameIndex: 0, tSec: 0, usable: true, components: [], lifeSafety: [], waterDepth: 'none',
      caption: 'House with no downed power lines visible.', headline: 'Minor siding damage',
    });
    expect(addMentionedDangers(f).lifeSafety).toHaveLength(0);
  });
});
