import type { z } from 'zod';

/** Pulls the first complete JSON object out of model text (strips <think> blocks and code fences). */
export function extractJsonObject(text: string): unknown {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  const start = cleaned.indexOf('{');
  if (start < 0) throw new Error('no JSON object in model output');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new Error('unterminated JSON object in model output');
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseModelJson<T>(
  text: string,
  schema: z.ZodType<T>,
  prepare: (raw: unknown) => unknown = (r) => r,
): ParseResult<T> {
  let raw: unknown;
  try {
    raw = extractJsonObject(text);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const parsed = schema.safeParse(prepare(raw));
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  return { ok: false, error: issues };
}

/** Light, lossless-in-meaning cleanup before validation: trims strings to schema limits and clamps confidences. */
export function clampString(v: unknown, max: number): unknown {
  return typeof v === 'string' ? v.trim().slice(0, max) : v;
}
export function clampUnit(v: unknown): unknown {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : v;
}
