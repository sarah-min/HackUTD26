// Plain-language copy for the recovery-code account flow (CONTRACTS section 5.3 error codes).
// Every wrong code gets the same message; nothing here says how close a guess was.
import type { AccountCodeResult } from '@/lib/stdb';

export const DEMO_IDENTITY_LABEL = 'Demo identity check, not production-grade verification.';
export const ACCOUNTS_OFF_TEXT = 'Accounts are not enabled yet.';
export const NETWORK_ERROR_TEXT =
  "We couldn't reach the server. Check your connection and try again.";
export const GENERIC_ERROR_TEXT = 'Something went wrong. Please try again.';

export const LOSS_WARNING =
  'We cannot show this again or recover it for you. Anyone with this code can open your reports. If you lose it, you will need to verify your home again.';

export const DOWNLOAD_NAME = 'aftermath-recovery-code.txt';

/** Contents of the downloaded file: the code and one line of instructions. */
export function downloadText(code: string): string {
  return `${code}\n\nAftermath recovery code. Enter it on the sign-in page to open your reports on a new device. Keep it private.\n`;
}

/** True for the two refusals that carry a wait time. */
export function isLockout(error: string): boolean {
  return error === 'locked' || error === 'rate_limited';
}

/** "14 minutes", "1 minute", or "40 seconds" for the last minute. Never negative. */
export function waitText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s >= 60) {
    const m = Math.ceil(s / 60);
    return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
  }
  return `${s} ${s === 1 ? 'second' : 'seconds'}`;
}

/** Message for a refused (not ok, not a lockout) procedure result. */
export function failureText(r: Pick<AccountCodeResult, 'error' | 'attemptsLeft'>): string {
  switch (r.error) {
    case 'invalid_code':
      // One message for every wrong code. Only the number of tries left is shown.
      return r.attemptsLeft > 0
        ? `That code did not work. ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left.`
        : 'That code did not work.';
    case 'accounts_disabled':
      return ACCOUNTS_OFF_TEXT;
    case 'already_signed_in':
      return 'This device is already signed in to an account. Sign out first.';
    case 'not_signed_in':
      return 'Sign in on this device first.';
    case 'not_verified_owner':
      return 'Only a verified resident can create an account. Verify your home first.';
    case 'code_taken':
    case 'invalid_new_code':
    case 'code_unchanged':
      return 'That new code could not be used. We made a fresh one. Save it and try again.';
    default:
      return GENERIC_ERROR_TEXT;
  }
}

/** Errors after which the generated code was refused and should be replaced with a new one. */
export function needsFreshCode(error: string): boolean {
  return error === 'code_taken' || error === 'invalid_new_code' || error === 'code_unchanged';
}
