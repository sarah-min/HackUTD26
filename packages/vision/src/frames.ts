import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

// ARCHITECTURE §6.1: scene-change frames, filled to 1 per 4 s if too few, capped at 8 (evenly spread),
// 768 px long edge, JPEG ≈ q80. Photos skip scene detection; cap 8.

export const MAX_FRAMES = 8;
export const MAX_VIDEO_SECONDS = 120;
export const LONG_EDGE = 768;
const SCENE_THRESHOLD = 0.3;
const FILL_EVERY_SEC = 4;
const JPEG_QSCALE = '3'; // ffmpeg mjpeg qscale ≈ quality 80

export const FFMPEG_PATH: string = (ffmpegStatic as unknown as string | null) ?? 'ffmpeg';

export interface ExtractedFrame {
  frameIndex: number;
  tSec: number;
  path: string;
  jpeg: Buffer;
}

export interface MediaInput {
  path: string;
  kind: 'video' | 'image';
}

export class FrameExtractionError extends Error {}

function run(args: string[], timeoutMs = 120_000): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr });
    });
  });
}

const scaleFilter = `scale='if(gte(iw,ih),min(${LONG_EDGE},iw),-2)':'if(gte(iw,ih),-2,min(${LONG_EDGE},ih))'`;

export async function probeDurationSec(file: string): Promise<number> {
  const { stderr } = await run(['-hide_banner', '-i', file], 30_000);
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!m) throw new FrameExtractionError('could not read the video duration');
  return +m[1]! * 3600 + +m[2]! * 60 + +m[3]!;
}

export async function detectSceneTimes(file: string): Promise<number[]> {
  const { stderr } = await run([
    '-hide_banner', '-i', file, '-an', '-vf', `select='gt(scene,${SCENE_THRESHOLD})',showinfo`, '-f', 'null', '-',
  ]);
  const times: number[] = [];
  for (const m of stderr.matchAll(/pts_time:\s*([0-9.]+)/g)) times.push(Number(m[1]));
  return times.filter((t) => Number.isFinite(t));
}

/** Pure selection: scene times + fill points, deduped (≥ 1 s apart), capped at `max`, evenly spread. */
export function chooseFrameTimes(durationSec: number, sceneTimes: number[], max = MAX_FRAMES): number[] {
  const end = Math.max(0, durationSec - 0.25);
  let candidates = [...sceneTimes].filter((t) => t >= 0 && t <= end);
  if (candidates.length < max) {
    for (let t = 0.5; t <= end; t += FILL_EVERY_SEC) candidates.push(t);
    if (candidates.length === 0) candidates.push(Math.min(0.5, end));
  }
  candidates = candidates.sort((a, b) => a - b);
  const deduped: number[] = [];
  for (const t of candidates) if (!deduped.length || t - deduped[deduped.length - 1]! >= 1) deduped.push(t);
  if (deduped.length <= max) return deduped.map((t) => Math.round(t * 100) / 100);
  const picked: number[] = [];
  for (let i = 0; i < max; i++) picked.push(deduped[Math.round((i * (deduped.length - 1)) / (max - 1))]!);
  return [...new Set(picked)].map((t) => Math.round(t * 100) / 100);
}

async function grab(input: string, out: string, tSec?: number): Promise<Buffer> {
  const args = ['-hide_banner', '-y'];
  if (tSec !== undefined) args.push('-ss', tSec.toFixed(2));
  args.push('-i', input, '-frames:v', '1', '-vf', scaleFilter, '-q:v', JPEG_QSCALE, out);
  const { code, stderr } = await run(args, 60_000);
  if (code !== 0) throw new FrameExtractionError(`ffmpeg failed (${code}): ${stderr.slice(-300)}`);
  return readFile(out);
}

/** Video: ≤ 8 frames. Photos: each resized, ≤ 8, tSec = 0. Throws FrameExtractionError on bad media. */
export async function extractFrames(media: MediaInput[], outDir: string): Promise<ExtractedFrame[]> {
  await mkdir(outDir, { recursive: true });
  const video = media.find((m) => m.kind === 'video');
  const frames: ExtractedFrame[] = [];
  if (video) {
    const duration = await probeDurationSec(video.path);
    if (duration > MAX_VIDEO_SECONDS + 0.5) {
      throw new FrameExtractionError(`video is ${Math.round(duration)} s; the limit is ${MAX_VIDEO_SECONDS} s`);
    }
    const times = chooseFrameTimes(duration, await detectSceneTimes(video.path));
    for (const [i, t] of times.entries()) {
      const out = path.join(outDir, `${i}.jpg`);
      frames.push({ frameIndex: i, tSec: t, path: out, jpeg: await grab(video.path, out, t) });
    }
  } else {
    const images = media.filter((m) => m.kind === 'image').slice(0, MAX_FRAMES);
    for (const [i, img] of images.entries()) {
      const out = path.join(outDir, `${i}.jpg`);
      frames.push({ frameIndex: i, tSec: 0, path: out, jpeg: await grab(img.path, out) });
    }
  }
  if (!frames.length) throw new FrameExtractionError('no frames could be extracted');
  return frames;
}
