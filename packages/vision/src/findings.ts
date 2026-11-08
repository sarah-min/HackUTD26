import { FrameFindingSchema, type FrameFinding } from '@hack/contracts/assessment';
import { DAMAGE_LEVEL_RANK, type Hazard } from '@hack/contracts/common';
import { NimHttpError, type ChatMessage, type NimClient } from '@hack/agent';
import { findingCacheKey, sha256Hex, type FindingCache } from './cache';
import { toDataUrl, type ImageMime } from './image';
import { clampString, clampUnit, parseModelJson } from './json';
import {
  DAMAGE_FRAME_JSON_SCHEMA,
  DAMAGE_FRAME_PROMPT_VERSION,
  DAMAGE_FRAME_SYSTEM_PROMPT,
  MAX_COMPONENTS_PER_FRAME,
  MAX_FLAGS_PER_FRAME,
  damageFrameUserText,
} from './prompts/damage-frame';

export interface AnalyzeFrameArgs {
  nim: NimClient;
  image: Buffer;
  mime?: ImageMime;
  frameIndex: number;
  tSec: number;
  hazard?: Hazard;
  cache?: FindingCache;
  signal?: AbortSignal;
}

export interface AnalyzeFrameResult {
  finding: FrameFinding;
  attempts: number; // model calls made (0 = cache hit)
  cached: boolean;
  parseError?: string;
}

/** Sampling for one frame. Guided JSON + a light repetition penalty keep the reply bounded (v1 could loop). */
export const FRAME_REQUEST = { temperature: 0, max_tokens: 900, repetition_penalty: 1.05 } as const;

// Servers that rejected guided decoding (HTTP 400); later frames skip response_format for them.
const noGuidedJson = new WeakSet<NimClient>();

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Accepts {x,y,w,h} or [x,y,w,h], as fractions or percentages; returns undefined for anything unusable. */
export function normalizeBox(v: unknown): { x: number; y: number; w: number; h: number } | undefined {
  const o = rec(v);
  let nums = Array.isArray(v) ? v : o ? [o.x, o.y, o.w ?? o.width, o.h ?? o.height] : null;
  if (!nums || nums.length !== 4 || !nums.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return undefined;
  if (nums.some((n) => (n as number) > 1)) {
    if (nums.every((n) => (n as number) <= 100)) nums = nums.map((n) => (n as number) / 100);
    else return undefined; // pixels: no image size to normalize against
  }
  let [x, y, w, h] = nums as number[];
  x = Math.min(x!, 1);
  y = Math.min(y!, 1);
  w = Math.min(w!, 1 - x);
  h = Math.min(h!, 1 - y);
  if (w < 0.02 || h < 0.02) return undefined;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { x: r(x), y: r(y), w: r(w), h: r(h) };
}

function prepare(frameIndex: number, tSec: number) {
  return (raw: unknown): unknown => {
    const r = rec(raw);
    if (!r) return raw;
    const item = (v: unknown) => {
      const o = rec(v);
      if (!o) return v;
      const out: Record<string, unknown> = { ...o, evidence: clampString(o.evidence ?? '', 200), confidence: clampUnit(o.confidence) };
      const box = normalizeBox(o.box);
      if (box) out.box = box;
      else delete out.box;
      if (out.extent === null || (out.extent !== undefined && !['localized', 'partial', 'widespread'].includes(out.extent as string)))
        delete out.extent;
      return out;
    };
    // Each component / flag once: keep the worst (then most confident) entry. Repeats are a sign of a looping reply.
    const dedupe = (v: unknown, key: string, rank: (o: Record<string, unknown>) => number, max: number) => {
      if (!Array.isArray(v)) return v;
      const best = new Map<unknown, Record<string, unknown>>();
      const passthrough: unknown[] = [];
      for (const x of v.map(item)) {
        const o = rec(x);
        if (!o || typeof o[key] !== 'string') {
          passthrough.push(x); // let validation report it
          continue;
        }
        const prev = best.get(o[key]);
        const score = (e: Record<string, unknown>) => rank(e) * 10 + (typeof e.confidence === 'number' ? e.confidence : 0);
        if (!prev || score(o) > score(prev)) best.set(o[key], o);
      }
      return [...best.values(), ...passthrough].slice(0, max);
    };
    const out: Record<string, unknown> = {
      ...r,
      frameIndex,
      tSec,
      components: dedupe(r.components ?? [], 'component', (o) => DAMAGE_LEVEL_RANK[o.level as keyof typeof DAMAGE_LEVEL_RANK] ?? 0, MAX_COMPONENTS_PER_FRAME),
      lifeSafety: dedupe(r.lifeSafety ?? [], 'flag', () => 0, MAX_FLAGS_PER_FRAME),
      caption: clampString(r.caption ?? '', 240),
    };
    if (typeof r.headline === 'string' && r.headline.trim()) out.headline = clampString(r.headline, 80);
    else delete out.headline;
    if (out.usable === true) delete out.unusableReason;
    if (out.usable === false) {
      out.components = [];
      // keep life-safety flags: a blurry frame can still show a fire
    }
    if (out.hazardObserved === null) delete out.hazardObserved;
    if (out.waterDepth === null) delete out.waterDepth;
    return out;
  };
}

export function unusableFinding(frameIndex: number, tSec: number, reason: FrameFinding['unusableReason'], caption: string): FrameFinding {
  return FrameFindingSchema.parse({
    frameIndex, tSec, usable: false, unusableReason: reason, components: [], lifeSafety: [], waterDepth: 'unknown',
    caption: caption.slice(0, 240),
  });
}

/** One VL call per frame; guided JSON; Zod-validated; one retry with the validation error; then unusable/parse_error. */
export async function analyzeFrame(args: AnalyzeFrameArgs): Promise<AnalyzeFrameResult> {
  const { nim, image, frameIndex, tSec, hazard, cache, signal } = args;
  const modelId = nim.models.vision;
  const key = cache
    ? findingCacheKey({ imageSha256: sha256Hex(image), modelId, promptVersion: DAMAGE_FRAME_PROMPT_VERSION, hazard })
    : '';
  if (cache) {
    const hit = await cache.get(key);
    const parsed = FrameFindingSchema.safeParse(hit && typeof hit === 'object' ? { ...hit, frameIndex, tSec } : hit);
    if (parsed.success) return { finding: parsed.data, attempts: 0, cached: true };
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: DAMAGE_FRAME_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: damageFrameUserText(hazard) },
        { type: 'image_url', image_url: { url: toDataUrl(image, args.mime ?? 'image/jpeg') } },
      ],
    },
  ];

  const call = async () => {
    const guided = !noGuidedJson.has(nim);
    const extraBody: Record<string, unknown> = { repetition_penalty: FRAME_REQUEST.repetition_penalty };
    if (guided)
      extraBody.response_format = { type: 'json_schema', json_schema: { name: 'frame_finding', schema: DAMAGE_FRAME_JSON_SCHEMA } };
    const req = { model: modelId, messages, temperature: FRAME_REQUEST.temperature, max_tokens: FRAME_REQUEST.max_tokens, extraBody };
    try {
      return await nim.chat(req, { signal });
    } catch (e) {
      if (guided && e instanceof NimHttpError && e.status === 400) {
        noGuidedJson.add(nim); // this server cannot do guided decoding; the prompt + validation still apply
        delete extraBody.response_format;
        return nim.chat(req, { signal });
      }
      throw e;
    }
  };

  let lastError = '';
  let attempts = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    attempts = attempt;
    const res = await call();
    const text = res.content ?? '';
    const parsed =
      res.finishReason === 'length'
        ? ({ ok: false, error: 'the reply was cut off at the length limit' } as const)
        : parseModelJson(text, FrameFindingSchema, prepare(frameIndex, tSec));
    if (parsed.ok) {
      if (cache) {
        const { frameIndex: _f, tSec: _t, ...rest } = parsed.value;
        await cache.set(key, rest);
      }
      return { finding: parsed.value, attempts, cached: false };
    }
    lastError = parsed.error;
    messages.push({ role: 'assistant', content: text.slice(0, 2000) });
    messages.push({
      role: 'user',
      content:
        res.finishReason === 'length'
          ? `Your reply was too long and was cut off. Return the JSON object again with each component and danger listed once and evidence under 160 characters.`
          : `That JSON failed validation: ${lastError}. Return the corrected JSON object only.`,
    });
  }
  return {
    finding: unusableFinding(frameIndex, tSec, 'parse_error', 'The model response for this frame could not be read.'),
    attempts,
    cached: false,
    parseError: lastError,
  };
}
