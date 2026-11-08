// Part 2 — CONTRACTS.md §2.1. Shared enums used by every part.
import { z } from 'zod';

export const HazardSchema = z.enum(['flood', 'hurricane_wind', 'tornado', 'wildfire', 'earthquake', 'hail', 'other']);
export type Hazard = z.infer<typeof HazardSchema>;

/** FEMA PDA-style damage scale. */
export const DamageLevelSchema = z.enum(['none', 'affected', 'minor', 'major', 'destroyed']);
export type DamageLevel = z.infer<typeof DamageLevelSchema>;
export const DAMAGE_LEVEL_RANK = { none: 0, affected: 1, minor: 2, major: 3, destroyed: 4 } as const;

export const ComponentSchema = z.enum([
  'roof',
  'exterior_walls',
  'windows_doors',
  'foundation',
  'interior',
  'utilities',
  'contents',
  'vehicle',
  'yard_debris',
]);
export type Component = z.infer<typeof ComponentSchema>;

export const LifeSafetyFlagSchema = z.enum([
  'person_trapped', 'injury_visible', 'active_fire', 'gas_leak_suspected', // severe
  'structural_collapse', 'downed_power_line', 'standing_water_interior', // serious
  'road_blocked', // access
]);
export type LifeSafetyFlag = z.infer<typeof LifeSafetyFlagSchema>;
export const SEVERE_FLAGS = ['person_trapped', 'injury_visible', 'active_fire', 'gas_leak_suspected'] as const;
export const SERIOUS_FLAGS = ['structural_collapse', 'downed_power_line', 'standing_water_interior'] as const;

export const VulnerabilitySchema = z.enum([
  'elderly',
  'child_under_5',
  'disability',
  'medical_device',
  'no_transport',
  'pets',
  'limited_english',
]);
export type Vulnerability = z.infer<typeof VulnerabilitySchema>;

export const ReportStatusSchema = z.enum(['draft', 'queued', 'processing', 'assessed', 'needs_more_footage', 'failed']);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const VerificationStateSchema = z.enum(['pending', 'processing', 'verified', 'failed']);
export type VerificationState = z.infer<typeof VerificationStateSchema>;

export const SourceSchema = z.enum(['live', 'synthetic', 'fixture']);
export type Source = z.infer<typeof SourceSchema>;
