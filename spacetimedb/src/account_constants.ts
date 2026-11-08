// Timings and limits for recovery-code accounts (CONTRACTS.md §5.3).
import { HOUR_MICROS } from './constants';

export const MIN = 60n * 1_000_000n;
export const STEPUP_TTL_MICROS = 15n * MIN;
/** Failed sign-in / step-up / replace attempts per identity inside this rolling window before `locked`. */
export const MAX_CODE_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MICROS = 15n * MIN;
// No global failure cap: identities are free to mint, so one would let ~60 anonymous identities lock everyone out.
export const ATTEMPT_KEEP_MICROS = 24n * HOUR_MICROS;
export const ACCOUNT_TICK_MICROS = 60n * 1_000_000n;
