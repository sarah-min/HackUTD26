// Part 2 — CONTRACTS.md §2.2. What the reporter (anyone at the scene) submits.
// Household, insurance and finances come from the affected person (AffectedIntake, finance.ts).
import { z } from 'zod';
import { HazardSchema } from './common';
import { NormalizedAddressSchema } from './property';

export const CreateReportInputSchema = z.object({
  hazard: HazardSchema,
  address: NormalizedAddressSchema, // confirmed/edited by the reporter
  deviceLat: z.number().min(-90).max(90).optional(), // raw GPS at capture time, if granted
  deviceLng: z.number().min(-180).max(180).optional(),
  selfDanger: z.boolean(), // "Is anyone in danger right now?" → 911 banner
  notes: z.string().max(500).optional(), // e.g. "elderly man on porch", "water still rising"
  isSelfReport: z.boolean(), // "Is this your property?" → redirect to /affected/start after submit
  reporterSecretHash: z.string().length(64), // sha256 hex of reporterSecret
});
export type CreateReportInput = z.infer<typeof CreateReportInputSchema>;
