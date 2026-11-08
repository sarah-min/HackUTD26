// Part 2 — CONTRACTS.md §2.3. Normalized addresses and aggregated area cells.
// The matching/normalization rules live in @hack/address.
import { z } from 'zod';
import { DamageLevelSchema, LifeSafetyFlagSchema } from './common';

export const NormalizedAddressSchema = z.object({
  line1: z.string().max(120), // "1234 N MAIN ST APT 2"
  city: z.string().max(60),
  state: z.string().length(2), // USPS state code
  zip: z.string().regex(/^\d{5}$/), // ZIP5 only
  lat: z.number().nullable(), // geocode point; null only for source='manual' without coords
  lng: z.number().nullable(),
  normalized: z.string(), // canonical matching key (@hack/address normalizeAddress)
  source: z.enum(['census', 'nominatim', 'manual']),
});
export type NormalizedAddress = z.infer<typeof NormalizedAddressSchema>;

export const AreaCellSchema = z.object({
  cellId: z.string(), // "<row>:<col>", see @hack/address cellId()
  reportCount72h: z.number().int().nonnegative(),
  worstLevel: DamageLevelSchema,
  hazardReportCount72h: z.number().int().nonnegative(), // reports in the cell with ≥1 life-safety flag
  severeHazardCount72h: z.number().int().nonnegative(), // reports with ≥1 SEVERE_FLAGS flag
  hazardFlags: z.array(LifeSafetyFlagSchema), // distinct flags in the window; EMPTY unless reportCount72h ≥ 3 (privacy)
  lastReportAt: z.number().int(),
});
export type AreaCell = z.infer<typeof AreaCellSchema>;

/** Minimum reports in a cell before hazard types may be shown (privacy rule, CONTRACTS §2.3). */
export const AREA_CELL_MIN_REPORTS_FOR_FLAGS = 3;
