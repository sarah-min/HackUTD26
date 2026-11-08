import { z } from 'zod';

// Part 3 contract (CONTRACTS.md §3.3). Demo identity check — not production-grade verification.

export const DocKindSchema = z.enum(['drivers_license', 'state_id', 'utility_bill', 'insurance_declarations']);
export type DocKind = z.infer<typeof DocKindSchema>;

export const VerificationFailReasonSchema = z.enum([
  'address_mismatch',
  'unreadable',
  'not_an_id',
  'expired',
  'rate_limited',
  'needs_review', // additive: tamper/replay cues or inconsistent data; not verified, not a hard failure
  'duplicate_claim', // module-only: another identity already verified this property; held for review
  'review_rejected', // module-only: an admin rejected a held verification
]);
export type VerificationFailReason = z.infer<typeof VerificationFailReasonSchema>;

// Additive (all optional): tamper/replay cues the VL model reports. Missing = not reported (older replies).
export const IdRiskCuesSchema = z.object({
  screenCaptureSuspected: z.boolean().optional(), // moire / pixel grid / glare / bezel
  photoOfPhoto: z.boolean().optional(),
  edgesCroppedOrMissing: z.boolean().optional(),
  fontOrTemplateInconsistent: z.boolean().optional(),
  textOverlayOrEditArtifacts: z.boolean().optional(),
  facePhotoPresent: z.boolean().optional(), // false on a license/state ID is a risk cue
  suspiciousText: z.boolean().optional(), // set by code when hidden/bidi/tag characters were stripped from text
});
export type IdRiskCues = z.infer<typeof IdRiskCuesSchema>;

export const IdDocumentFieldsSchema = z.object({
  docKind: DocKindSchema,
  fullName: z.string().max(120),
  addressText: z.string().max(200), // as printed; normalized by code, never stored
  expiration: z.string().optional(), // ISO date if printed (IDs)
  isLikelyId: z.boolean(),
  confidence: z.number().min(0).max(1),
  // Additive optional fields (transient: used by decideVerification, never stored or logged).
  issueDate: z.string().max(32).optional(),
  dateOfBirth: z.string().max(32).optional(),
  issuingState: z.string().length(2).optional(), // 2-letter code printed on a license/state ID
  docConfidence: z.number().min(0).max(1).optional(), // how authentic the document looks (not legibility)
  riskCues: IdRiskCuesSchema.optional(),
  modelId: z.string(),
  promptVersion: z.string(),
});
export type IdDocumentFields = z.infer<typeof IdDocumentFieldsSchema>;

export const VerificationResultSchema = z.object({
  ok: z.boolean(),
  failReason: VerificationFailReasonSchema.optional(),
  nameOnDoc: z.string().max(120).optional(), // the only extracted field persisted
  matchedNormalized: z.string().optional(),
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export const DEMO_IDV_LABEL = 'Demo identity check — not production-grade verification' as const;
