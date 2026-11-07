import { describe, expect, it } from 'vitest';
import { FrameFindingSchema } from '@hack/contracts';
import { analyzeFrame, createMemoryCache } from '../src';
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
});
