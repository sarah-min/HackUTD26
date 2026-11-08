// Email normalization and masking for passwordless accounts. Pure functions, no deps.
// The normalized address is hashed (email_hash = sha256(pepper + normalized)); only the hash and the masked display
// are ever stored on an account. Plus-addressing and dots are NOT stripped: a+x@gmail.com and a@gmail.com are different
// addresses to us (no provider-specific rules), so each is its own account key.

const LOCAL_CHARS = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/; // RFC 5322 "atext" plus dot, lowercase, ASCII only
const LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * trim, lowercase, then validate. Returns the normalized address or null. Rejects: longer than 254 chars, not exactly
 * one '@', local part not 1-64 chars or with characters outside RFC atext (so no spaces, quotes, control chars, commas,
 * angle brackets or non-ASCII), leading/trailing/double dots in the local part, a domain without a dot, empty labels,
 * labels starting/ending with '-' or longer than 63, a TLD shorter than 2 chars or all digits.
 */
export function normalizeEmail(input: string): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (s.length === 0 || s.length > 254) return null;
  const at = s.indexOf('@');
  if (at < 0 || at !== s.lastIndexOf('@')) return null;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (local.length < 1 || local.length > 64) return null;
  if (!LOCAL_CHARS.test(local)) return null;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  if (domain.length < 4 || domain.length > 253 || !domain.includes('.')) return null;
  const labels = domain.split('.');
  for (const l of labels) if (l.length < 1 || l.length > 63 || !LABEL.test(l)) return null;
  const tld = labels[labels.length - 1]!;
  if (tld.length < 2 || /^\d+$/.test(tld)) return null;
  return s;
}

/**
 * Display form that never reveals the whole local part: first char + '***' + '@' + domain (s***@gmail.com). A one-char
 * local part would be revealed entirely by its first char, so it shows '***@domain'.
 */
export function maskEmail(normalized: string): string {
  const at = normalized.lastIndexOf('@');
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  return `${local.length >= 2 ? local[0] : ''}***@${domain}`;
}
