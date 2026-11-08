// The ONE place that talks to Brevo (https://api.brevo.com). Everything else calls sendEmailViaBrevo and records the
// EmailResult; failure is never fatal to the caller (the challenge is marked 'failed' so the UI can offer a resend).
//
// API shape used (best knowledge of Brevo's transactional email API, v3; VERIFIED ONLY BY THE LIVE TEST, never run
// against the real service from here, see docs/BACKEND_RUNBOOK.md section 13):
//   POST https://api.brevo.com/v3/smtp/email
//   headers: api-key: <key>, content-type: application/json, accept: application/json
//   body:    { sender:{name,email}, to:[{email}], subject, textContent, htmlContent }
//   201 -> { messageId }. Errors are JSON { code, message } with 400/401/403/429/...
// Only the HTTP status and Brevo's short `code` string are ever kept as the error (`brevo:401:unauthorized`): never the
// body, the message, the key or the recipient. No tracking, no links, no attachments.
import { TimeDuration } from 'spacetimedb';

export const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
export const BREVO_SENDER_NAME = 'Project Aftermath';
export const BREVO_SUBJECT = 'Your Aftermath verification code';
const TIMEOUT_MS = 8000;

export type BrevoConfig = { apiKey: string; senderEmail: string };
export type EmailResult = { ok: true } | { ok: false; error: string };

// reason: the host's SyncResponse type is not re-exported from the module entry; only these members are used.
type HttpLike = {
  fetch(url: string, init?: any): { ok: boolean; status: number; json(): unknown; text(): string };
};

export function emailText(code: string): string {
  return [
    `Your Aftermath verification code is: ${code}`,
    '',
    'This code expires in 10 minutes.',
    'If you did not request this, ignore this email.',
    '',
    'Demo identity check, not production-grade verification.',
  ].join('\n');
}

export function emailHtml(code: string): string {
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px">' +
    '<p>Your Aftermath verification code is:</p>' +
    `<p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p>` +
    '<p>This code expires in 10 minutes.</p>' +
    '<p>If you did not request this, ignore this email.</p>' +
    '<p style="color:#666;font-size:12px">Demo identity check, not production-grade verification.</p>' +
    '</div>'
  );
}

/**
 * Sends the verification `code` to `to` (already normalized). Never throws. `idemKey` is accepted for the adapter
 * signature (the caller passes `<challengeId>-1`) but Brevo documents no idempotency header on this endpoint, so it is
 * not sent.
 */
export function sendEmailViaBrevo(http: HttpLike, cfg: BrevoConfig, to: string, code: string, _idemKey?: string): EmailResult {
  let res;
  try {
    res = http.fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': cfg.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: BREVO_SENDER_NAME, email: cfg.senderEmail },
        to: [{ email: to }],
        subject: BREVO_SUBJECT,
        textContent: emailText(code),
        htmlContent: emailHtml(code),
      }),
      timeout: TimeDuration.fromMillis(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: 'brevo:network' };
  }
  if (res.ok) return { ok: true };
  let brevoCode = '';
  try {
    const parsed = res.json();
    const c = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).code : undefined;
    if (typeof c === 'string' && /^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(c)) brevoCode = c;
  } catch {
    // non-JSON body: keep the status only
  }
  return { ok: false, error: `brevo:${res.status}${brevoCode ? ':' + brevoCode : ''}` };
}
