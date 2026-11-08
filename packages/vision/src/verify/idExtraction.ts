import { z } from 'zod';
import { DocKindSchema, IdDocumentFieldsSchema, type IdDocumentFields } from '@hack/contracts/verification';
import { clampUnit, extractJsonObject } from '../json';
import { sanitizeText } from './textSafety';

/**
 * Strict schema for the raw model reply: unknown keys are rejected (a reply with an extra `verified: true`
 * is invalid, not "ignored"), strings are bounded, enumerated/boolean fields must be real enums/booleans.
 */
export const IdExtractionSchema = z.strictObject({
  docKind: DocKindSchema,
  fullName: z.string().max(120),
  addressText: z.string().max(200),
  expiration: z.string().max(32).optional(),
  issueDate: z.string().max(32).optional(),
  dateOfBirth: z.string().max(32).optional(),
  issuingState: z.string().regex(/^[A-Z]{2}$/).optional(),
  isLikelyId: z.boolean(),
  confidence: z.number().min(0).max(1),
  docConfidence: z.number().min(0).max(1).optional(),
  screenCaptureSuspected: z.boolean().optional(),
  photoOfPhoto: z.boolean().optional(),
  edgesCroppedOrMissing: z.boolean().optional(),
  fontOrTemplateInconsistent: z.boolean().optional(),
  textOverlayOrEditArtifacts: z.boolean().optional(),
  facePhotoPresent: z.boolean().optional(),
});
const KNOWN_KEYS = new Set(Object.keys(IdExtractionSchema.shape));
const OPTIONAL_TEXT = ['expiration', 'issueDate', 'dateOfBirth'] as const;
const CUE_KEYS = [
  'screenCaptureSuspected', 'photoOfPhoto', 'edgesCroppedOrMissing', 'fontOrTemplateInconsistent', 'textOverlayOrEditArtifacts', 'facePhotoPresent',
] as const;

export type IdExtractionResult = { ok: true; value: IdDocumentFields } | { ok: false; error: string };

/**
 * Model reply text → IdDocumentFields. Neutralizes control/hidden characters in the text fields (recording that
 * it happened as `riskCues.suspiciousText`). The error string never echoes model-provided text: it names only
 * known schema keys, so a retry message cannot become an injection channel.
 */
export function parseIdExtraction(text: string, modelId: string, promptVersion: string): IdExtractionResult {
  let raw: unknown;
  try {
    raw = extractJsonObject(text);
  } catch {
    return { ok: false, error: 'no single JSON object found' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'not a JSON object' };
  const r: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  let suspiciousText = false;
  const clean = (v: unknown): unknown => {
    if (typeof v !== 'string') return v;
    const s = sanitizeText(v);
    suspiciousText ||= s.hidden;
    return s.text;
  };
  for (const k of ['fullName', 'addressText', ...OPTIONAL_TEXT] as const) if (k in r) r[k] = clean(r[k]);
  for (const k of [...OPTIONAL_TEXT, 'issuingState', 'docConfidence', ...CUE_KEYS] as const) {
    if (r[k] === null || r[k] === '') delete r[k];
  }
  if (typeof r.issuingState === 'string') {
    const st = r.issuingState.toUpperCase();
    if (/^[A-Z]{2}$/.test(st)) r.issuingState = st;
    else delete r.issuingState; // unusable printed state: the printed address state is still checked
  }
  r.confidence = clampUnit(r.confidence);
  r.docConfidence = clampUnit(r.docConfidence);
  if (r.docConfidence === undefined) delete r.docConfidence;

  const parsed = IdExtractionSchema.safeParse(r);
  if (!parsed.success) {
    const known = new Set<string>();
    let unexpected = false;
    for (const i of parsed.error.issues) {
      const key = String(i.path[0] ?? '');
      if (i.code === 'unrecognized_keys' || !KNOWN_KEYS.has(key)) unexpected = true;
      else known.add(key);
    }
    return { ok: false, error: [...known].map((k) => `${k} invalid`).concat(unexpected ? ['unexpected keys'] : []).join('; ') || 'invalid' };
  }
  const v = parsed.data;
  const cues: Record<string, boolean> = {};
  for (const k of CUE_KEYS) if (v[k] !== undefined) cues[k] = v[k]!;
  if (suspiciousText) cues.suspiciousText = true;
  const out = IdDocumentFieldsSchema.safeParse({
    docKind: v.docKind,
    fullName: v.fullName,
    addressText: v.addressText,
    expiration: v.expiration,
    issueDate: v.issueDate,
    dateOfBirth: v.dateOfBirth,
    issuingState: v.issuingState,
    isLikelyId: v.isLikelyId,
    confidence: v.confidence,
    docConfidence: v.docConfidence,
    riskCues: Object.keys(cues).length ? cues : undefined,
    modelId,
    promptVersion,
  });
  return out.success ? { ok: true, value: out.data } : { ok: false, error: 'invalid' };
}
