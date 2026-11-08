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
]);
export type VerificationFailReason = z.infer<typeof VerificationFailReasonSchema>;

export const IdDocumentFieldsSchema = z.object({
  docKind: DocKindSchema,
  fullName: z.string().max(120),
  addressText: z.string().max(200), // as printed; normalized by code, never stored
  expiration: z.string().optional(), // ISO date if printed (IDs)
  isLikelyId: z.boolean(),
  confidence: z.number().min(0).max(1),
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
