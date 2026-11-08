import { FrameFindingSchema, type FrameFinding } from '@hack/contracts/assessment';
import { type Hazard } from '@hack/contracts/common';
import type { ChatMessage, NimClient } from '@hack/agent';
import { findingCacheKey, sha256Hex, type FindingCache } from './cache';
import { toDataUrl, type ImageMime } from './image';
import { clampString, clampUnit, parseModelJson } from './json';
import { DAMAGE_FRAME_PROMPT_VERSION, DAMAGE_FRAME_SYSTEM_PROMPT, damageFrameUserText } from './prompts/damage-frame';

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

function prepare(frameIndex: number, tSec: number) {
  return (raw: unknown): unknown => {
    if (!raw || typeof raw !== 'object') return raw;
    const r = raw as Record<string, unknown>;
    const fixList = (v: unknown) =>
      Array.isArray(v)
        ? v.map((item) =>
            item && typeof item === 'object'
              ? {
                  ...(item as Record<string, unknown>),
                  evidence: clampString((item as Record<string, unknown>).evidence ?? '', 200),
                  confidence: clampUnit((item as Record<string, unknown>).confidence),
                }
              : item,
          )
        : v;
    const out: Record<string, unknown> = {
      ...r,
      frameIndex,
      tSec,
      components: fixList(r.components ?? []),
      lifeSafety: fixList(r.lifeSafety ?? []),
      caption: clampString(r.caption ?? '', 240),
    };
    if (out.usable === true) delete out.unusableReason;
    if (out.hazardObserved === null) delete out.hazardObserved;
    return out;
  };
}

export function unusableFinding(frameIndex: number, tSec: number, reason: FrameFinding['unusableReason'], caption: string): FrameFinding {
  return FrameFindingSchema.parse({
    frameIndex, tSec, usable: false, unusableReason: reason, components: [], lifeSafety: [], waterDepth: 'unknown',
    caption: caption.slice(0, 240),
  });
}

/** One VL call per frame; Zod-validated; one retry with the validation error; then unusable/parse_error. */
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

  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await nim.chat({ model: modelId, messages, temperature: 0.1, max_tokens: 1200 }, { signal });
    const parsed = parseModelJson(res.content ?? '', FrameFindingSchema, prepare(frameIndex, tSec));
    if (parsed.ok) {
      if (cache) {
        const { frameIndex: _f, tSec: _t, ...rest } = parsed.value;
        await cache.set(key, rest);
      }
      return { finding: parsed.value, attempts: attempt, cached: false };
    }
    lastError = parsed.error;
    messages.push({ role: 'assistant', content: (res.content ?? '').slice(0, 4000) });
    messages.push({
      role: 'user',
      content: `That JSON failed validation: ${lastError}. Return the corrected JSON object only.`,
    });
  }
  return {
    finding: unusableFinding(frameIndex, tSec, 'parse_error', 'The model response for this frame could not be read.'),
    attempts: 2,
    cached: false,
    parseError: lastError,
  };
}
