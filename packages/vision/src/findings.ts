import { z } from 'zod';
import {
  FrameFindingSchema,
  FrameObservationSchema,
  FrameWaterSchema,
  SceneSchema,
  type FrameFinding,
} from '@hack/contracts/assessment';
import { HazardSchema, LifeSafetyFlagSchema, type Hazard } from '@hack/contracts/common';
import { NimHttpError, type ChatMessage, type NimClient } from '@hack/agent';
import { findingCacheKey, sha256Hex, type FindingCache } from './cache';
import { toDataUrl, type ImageMime } from './image';
import { clampString, clampUnit, parseModelJson } from './json';
import {
  DAMAGE_FRAME_JSON_SCHEMA,
  DAMAGE_FRAME_PROMPT_VERSION,
  DAMAGE_FRAME_SYSTEM_PROMPT,
  MAX_FLAGS_PER_FRAME,
  MAX_OBSERVATIONS_PER_FRAME,
  damageFrameUserText,
} from './prompts/damage-frame';
import { applyDamageRules, type ModelFrame } from './rules';

/** What the model returns (v4). Code turns it into a FrameFinding with applyDamageRules. */
export const ModelFrameSchema: z.ZodType<ModelFrame> = z.object({
  usable: z.boolean(),
  unusableReason: z.enum(['dark', 'blurry', 'not_a_structure', 'other']).optional(),
  scene: SceneSchema.catch('other'),
  headline: z.string().max(80).optional(),
  caption: z.string().max(240),
  observations: z.array(FrameObservationSchema).max(MAX_OBSERVATIONS_PER_FRAME),
  water: FrameWaterSchema.catch({ present: false, inside: false, level: 'not_visible', referenceObject: 'none' }),
  lifeSafety: z
    .array(z.object({ flag: LifeSafetyFlagSchema, evidence: z.string().max(200), confidence: z.number().min(0).max(1), box: FrameFindingSchema.shape.lifeSafety.element.shape.box }))
    .max(MAX_FLAGS_PER_FRAME),
  hazardObserved: HazardSchema.optional(),
}) as z.ZodType<ModelFrame>;

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
// A full v4 reply is ~200-350 tokens; 600 leaves room without letting a runaway reply take long.
export const FRAME_REQUEST = { temperature: 0, max_tokens: 600, repetition_penalty: 1.05 } as const;

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

function prepare(raw: unknown): unknown {
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
  // Each cue / flag once, keeping the most confident entry. Repeats are a sign of a looping reply.
  const dedupe = (v: unknown, key: string, max: number) => {
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
      const conf = (e: Record<string, unknown>) => (typeof e.confidence === 'number' ? e.confidence : 0);
      if (!prev || conf(o) > conf(prev)) best.set(o[key], o);
    }
    return [...best.values(), ...passthrough].slice(0, max);
  };
  const out: Record<string, unknown> = {
    ...r,
    observations: dedupe(r.observations, 'cue', MAX_OBSERVATIONS_PER_FRAME), // missing stays missing: validation asks again
    lifeSafety: dedupe(r.lifeSafety ?? [], 'flag', MAX_FLAGS_PER_FRAME),
    caption: clampString(r.caption ?? '', 240),
  };
  if (typeof r.headline === 'string' && r.headline.trim()) out.headline = clampString(r.headline, 80);
  else delete out.headline;
  const water = rec(r.water);
  if (water) out.water = { ...water, ...(typeof water.evidence === 'string' ? { evidence: clampString(water.evidence, 200) } : {}) };
  if (out.usable === true) delete out.unusableReason;
  if (out.hazardObserved === null) delete out.hazardObserved;
  return out;
}

/**
 * Safety consistency: when the model's own words name a danger it did not flag, add the flag (confidence 0.6).
 * Safety errs toward showing (CONTRACTS §3.1); a negated mention ("no downed lines") never adds one.
 */
const DANGER_WORDS: { flag: FrameFinding['lifeSafety'][number]['flag']; re: RegExp }[] = [
  { flag: 'downed_power_line', re: /\b(downed|fallen|falling|leaning|snapped|toppled|collapsed|broken|hanging|sagging|dangling|low)\b[^.;]{0,40}\b(power|utility|electric(al)?)?\s*(lines?|wires?|poles?|cables?)\b/i },
  { flag: 'active_fire', re: /\b(flames?|on fire|burning|active fire)\b/i },
  { flag: 'road_blocked', re: /\b(road|street|lane)s?\b[^.;]{0,30}\b(blocked|impassable|obstructed)\b|\bblock(s|ing|ed)? the (road|street)\b/i },
];
const NEGATION = /\b(no|not|without|none|free of)\b[^.;]{0,25}$/i;

export function addMentionedDangers(f: FrameFinding): FrameFinding {
  const sentences = [f.headline ?? '', f.caption, ...f.components.map((c) => c.evidence)].join('. ');
  const have = new Set(f.lifeSafety.map((s) => s.flag));
  const added: FrameFinding['lifeSafety'] = [];
  for (const { flag, re } of DANGER_WORDS) {
    if (have.has(flag)) continue;
    const m = re.exec(sentences);
    if (!m) continue;
    if (NEGATION.test(sentences.slice(Math.max(0, m.index - 40), m.index))) continue;
    added.push({ flag, evidence: clampString(`Mentioned by the model: "${m[0]}"`, 200) as string, confidence: 0.6 });
  }
  if (!added.length) return f;
  return { ...f, lifeSafety: [...f.lifeSafety, ...added] };
}

export function unusableFinding(frameIndex: number, tSec: number, reason: FrameFinding['unusableReason'], caption: string): FrameFinding {
  return FrameFindingSchema.parse({
    frameIndex, tSec, usable: false, unusableReason: reason, components: [], lifeSafety: [], waterDepth: 'unknown',
    caption: caption.slice(0, 240),
  });
}

/** One VL call per frame: guided JSON evidence, Zod-validated, severity from code rules; one retry; then unusable/parse_error. */
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
        : parseModelJson(text, ModelFrameSchema, prepare);
    if (parsed.ok) {
      const finding = addMentionedDangers(FrameFindingSchema.parse(applyDamageRules(parsed.value, frameIndex, tSec)));
      if (cache) {
        const { frameIndex: _f, tSec: _t, ...rest } = finding;
        await cache.set(key, rest);
      }
      return { finding, attempts, cached: false };
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
