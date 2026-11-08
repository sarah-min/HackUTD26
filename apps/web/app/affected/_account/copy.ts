// Plain-language copy for the email account flow (CONTRACTS section 5.3 error codes).
// Never reveals whether an email address has an account.

export type AccountPurpose = 'enroll' | 'signin' | 'stepup';

export const CODE_LENGTH = 6;
/** Server code lifetime is 10 minutes; used only until the live challenge row arrives. */
export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 30 * 1000;
export const DEMO_IDENTITY_LABEL = 'Demo identity check, not production-grade verification.';
export const DEMO_CODE_LABEL = 'Demo mode: code shown on screen. Not real email.';
export const ACCOUNTS_OFF_TEXT = 'Accounts are not enabled yet.';
export const NETWORK_ERROR_TEXT =
  "We couldn't reach the server. Check your connection and try again.";

const GENERIC = 'Something went wrong. Please try again.';

const REQUEST_ERRORS: Record<string, string> = {
  email_not_configured: ACCOUNTS_OFF_TEXT,
  invalid_purpose: GENERIC,
  invalid_email: 'Enter a valid email address.',
  locked: 'Too many wrong codes for this email. Wait 15 minutes and try again.',
  not_verified_owner: 'Only a verified resident can secure an account. Verify your home first.',
  already_signed_in: 'This device is already signed in.',
  email_already_registered:
    'That email already has an account. Try signing in on this device instead.',
  not_signed_in: 'Sign in on this device first.',
  email_mismatch: "That email doesn't match the one on your account.",
  cooldown: 'Please wait a moment before asking for another code.',
  rate_limited_email: 'Too many codes were requested for that email. Try again in an hour.',
  rate_limited_identity: 'Too many codes were requested from this device. Try again in an hour.',
  daily_cap: "We can't send more codes right now. Please try again tomorrow.",
};

export function requestErrorText(code: string): string {
  return REQUEST_ERRORS[code] ?? GENERIC;
}

export function verifyErrorText(code: string, purpose: AccountPurpose): string {
  switch (code) {
    case 'invalid_code':
      // Same wording for every purpose so a sign-in attempt never hints at whether the email exists.
      return purpose === 'signin'
        ? "That code didn't work. Check the code and the email address you entered."
        : "That code didn't work. Check it and try again.";
    case 'expired':
      return 'That code expired. Request a new one.';
    case 'not_found':
      return 'That code is no longer active. Request a new one.';
    case 'locked':
      return 'Too many wrong codes. Wait 15 minutes, then start again.';
    default:
      return REQUEST_ERRORS[code] ?? GENERIC;
  }
}

/** Mirrors the server display: first character + *** + @domain; a one-character name shows ***@domain. */
export function maskEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return '***';
  const local = e.slice(0, at);
  const domain = e.slice(at);
  return `${local.length > 1 ? local.slice(0, 1) : ''}***${domain}`;
}

/** 9:05 style countdown; never negative. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
