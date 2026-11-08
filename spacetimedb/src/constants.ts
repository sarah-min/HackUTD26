// Enum values mirrored from packages/contracts (CONTRACTS.md §2.1, §3.3). The module
// stays free of zod, so these are plain arrays used for light validation.
import type { InferSchema, ReducerCtx, ReadonlyDbView } from 'spacetimedb/server';
import type { Spacetime } from './schema';

export type S = InferSchema<Spacetime>;
export type Ctx = ReducerCtx<S>;
export type Db = Ctx['db'];
export type RoDb = ReadonlyDbView<S>;

export const HAZARDS = ['flood', 'hurricane_wind', 'tornado', 'wildfire', 'earthquake', 'hail', 'other'] as const;
export const DAMAGE_LEVELS = ['none', 'affected', 'minor', 'major', 'destroyed'] as const;
export const DAMAGE_LEVEL_RANK: Record<string, number> = { none: 0, affected: 1, minor: 2, major: 3, destroyed: 4 };
export const LIFE_SAFETY_FLAGS = [
  'person_trapped',
  'injury_visible',
  'active_fire',
  'gas_leak_suspected',
  'structural_collapse',
  'downed_power_line',
  'standing_water_interior',
  'road_blocked',
] as const;
export const SEVERE_FLAGS = ['person_trapped', 'injury_visible', 'active_fire', 'gas_leak_suspected'] as const;
export const DOC_KINDS = ['drivers_license', 'state_id', 'utility_bill', 'insurance_declarations'] as const;
// Reasons the worker may pass to record_verification. 'needs_review' = ID tamper cues flagged: the verification is HELD
// (state 'failed') until an admin calls admin_resolve_verification.
export const FAIL_REASONS = ['address_mismatch', 'unreadable', 'not_an_id', 'expired', 'rate_limited', 'needs_review'] as const;
// Reasons the module itself writes (never accepted from the worker). 'duplicate_claim' = another identity already owns the
// property (held for admin review); 'review_rejected' = an admin rejected a held verification.
export const REASON_DUPLICATE_CLAIM = 'duplicate_claim';
export const REASON_NEEDS_REVIEW = 'needs_review';
export const REASON_REVIEW_REJECTED = 'review_rejected';
export const AGENT_STEP_KINDS = ['pipeline', 'vision', 'model', 'tool_call', 'tool_result', 'error'] as const;
export const STEP_VISIBILITY = ['reporter', 'affected'] as const;
export const JOB_KINDS = ['analyze', 'verify_identity', 'plan', 'coach'] as const;
export const NOTICE_KINDS = ['nws_alert', 'fema_declaration'] as const;
export const MAX_NOTICES_PER_COUNTY = 20;
// 'web' = the Next.js server (upload/media authorization only; cannot call worker reducers).
export const SERVICE_ROLES = ['admin', 'worker', 'web'] as const;

export const IDV_MAX_ATTEMPTS_PER_HOUR = 3;
export const MAX_JOB_ATTEMPTS = 2;
export const MAX_IMAGES_PER_ROUND = 8;
export const MAX_VIDEOS_PER_ROUND = 1;
export const AREA_WINDOW_MICROS = 72n * 3600n * 1_000_000n;
export const HOUR_MICROS = 3600n * 1_000_000n;
export const LEASE_TICK_MICROS = 30n * 1_000_000n;
export const AREA_TICK_MICROS = 5n * 60n * 1_000_000n;
export const MAX_LEASE_MS = 10 * 60 * 1000;
export const CELL_FLAGS_MIN_REPORTS = 3;

import { SenderError } from 'spacetimedb/server';

export function fail(msg: string): never {
  throw new SenderError(msg);
}

export function oneOf<T extends readonly string[]>(values: T, v: string, field: string): T[number] {
  if (!(values as readonly string[]).includes(v)) fail(`invalid ${field}: ${v}`);
  return v as T[number];
}

export function parseCsv(csv: string): string[] {
  return csv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}
