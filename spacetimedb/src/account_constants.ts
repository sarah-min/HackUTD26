// Timings and limits for email accounts (CONTRACTS.md §5.3).
import { HOUR_MICROS } from './constants';

export const MIN = 60n * 1_000_000n;
export const CODE_TTL_MICROS = 10n * MIN;
export const RESEND_COOLDOWN_MICROS = 30n * 1_000_000n;
export const EMAIL_LOCK_MICROS = 15n * MIN;
export const STEPUP_TTL_MICROS = 15n * MIN;
export const EMAIL_PURGE_MICROS = 15n * MIN;
export const CHALLENGE_KEEP_MICROS = 24n * HOUR_MICROS;
export const SENDS_PER_EMAIL_PER_HOUR = 3;
export const SENDS_PER_IDENTITY_PER_HOUR = 5;
export const MAX_CODE_ATTEMPTS = 5;
export const DEFAULT_DAILY_SEND_CAP = 200;
export const PURPOSES = ['enroll', 'signin', 'stepup'] as const;
export type Purpose = (typeof PURPOSES)[number];

export const ACCOUNT_TICK_MICROS = 60n * 1_000_000n;
