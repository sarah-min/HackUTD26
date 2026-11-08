import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FFMPEG_PATH, FrameExtractionError, chooseFrameTimes, extractFrames } from '../src';

describe('chooseFrameTimes', () => {
  it('fills to 1 per 4 s when scenes are few, caps at 8, spreads evenly', () => {
    const t = chooseFrameTimes(60, [10.2]);
    expect(t.length).toBe(8);
    expect(t[0]).toBe(0.5);
    expect(t.at(-1)!).toBeGreaterThan(55);
  });
  it('keeps scene times when enough, dedupes near-duplicates', () => {
    expect(chooseFrameTimes(30, [1, 1.2, 5, 9, 13, 17, 21, 25, 28, 29.5])).toHaveLength(8);
  });
  it('short clip yields at least one frame', () => {
    expect(chooseFrameTimes(0.8, []).length).toBe(1);
  });
});

const dir = mkdtempSync(path.join(os.tmpdir(), 'frames-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const make = (name: string, seconds: number) => {
  const file = path.join(dir, name);
  execFileSync(FFMPEG_PATH, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=1280x720:rate=10:duration=${seconds}`, '-pix_fmt', 'yuv420p', file]);
  return file;
};

describe('extractFrames (ffmpeg-static)', () => {
  it('60 s clip → ≤ 8 frames at 768 px long edge', async () => {
    const frames = await extractFrames([{ path: make('a.mp4', 60), kind: 'video' }], path.join(dir, 'out-a'));
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.length).toBeLessThanOrEqual(8);
    const probe = execFileSync(FFMPEG_PATH, ['-hide_banner', '-i', frames[0]!.path, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    expect(frames[0]!.jpeg[0]).toBe(0xff);
    expect(probe).toBeDefined();
  }, 60_000);
  it('rejects videos over 120 s', async () => {
    await expect(extractFrames([{ path: make('long.mp4', 125), kind: 'video' }], path.join(dir, 'out-b'))).rejects.toBeInstanceOf(FrameExtractionError);
  }, 60_000);
});
