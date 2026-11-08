import type { IdDocumentFields } from '@hack/contracts/verification';
import { hasMixedScripts, sanitizeText } from './textSafety';

// Deterministic cross-checks on structured fields. Model prose is never consulted for a verdict.

export const DOC_CONFIDENCE_MIN = 0.6;
const DAY = 86_400_000;

/**
 * Names printed on the documented demo specimen. This is the ONLY placeholder-looking name accepted; it must still
 * match the property address like any other document. Extend per deployment via `specimenNames` (server config).
 */
export const DEFAULT_SPECIMEN_NAMES: readonly string[] = ['SAMPLE SPECIMEN'];

const PLACEHOLDER_TOKENS = new Set([
  'SAMPLE', 'SPECIMEN', 'TEMPLATE', 'EXAMPLE', 'VOID', 'PLACEHOLDER', 'LOREM', 'IPSUM', 'UNKNOWN', 'FIRSTNAME', 'LASTNAME',
]);
const PLACEHOLDER_WHOLE = new Set([
  'NAME', 'FULL NAME', 'YOUR NAME', 'FIRST LAST', 'FIRST NAME LAST NAME', 'TEST', 'TEST USER', 'JOHN DOE', 'JANE DOE',
  'N A', 'NA', 'NONE', 'ANONYMOUS', 'XXX', 'XXXX',
]);
const NAME_CHARS = /^[\p{L}\p{M}][\p{L}\p{M}'’.,\- ]*$/u;
const MAX_NAME_LEN = 80;
const MAX_NAME_TOKENS = 6;

export type NameCheck = { ok: true; name: string } | { ok: false; verdict: 'unreadable' | 'needs_review' };

export function checkName(raw: string, specimenNames: readonly string[] = DEFAULT_SPECIMEN_NAMES): NameCheck {
  const name = sanitizeText(raw).text;
  const letters = (name.match(/\p{L}/gu) ?? []).length;
  if (!name || letters < 2) return { ok: false, verdict: 'unreadable' };
  const upper = name.toUpperCase();
  if (specimenNames.some((s) => s.trim().toUpperCase() === upper)) return { ok: true, name };
  if (name.length > MAX_NAME_LEN || name.split(' ').length > MAX_NAME_TOKENS) return { ok: false, verdict: 'needs_review' };
  if (!NAME_CHARS.test(name) || hasMixedScripts(name)) return { ok: false, verdict: 'needs_review' };
  const words = upper.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (PLACEHOLDER_WHOLE.has(words.join(' ')) || words.some((w) => PLACEHOLDER_TOKENS.has(w))) {
    return { ok: false, verdict: 'needs_review' };
  }
  return { ok: true, name };
}

/** YYYY-MM-DD, MM/DD/YYYY or MM-DD-YYYY, as a real calendar date → UTC day number; null otherwise. */
export function parseDay(value: string): number | null {
  const v = sanitizeText(value).text;
  let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (hit) [y, m, d] = [+hit[1]!, +hit[2]!, +hit[3]!];
  else if ((hit = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v))) [m, d, y] = [+hit[1]!, +hit[2]!, +hit[3]!];
  else return null;
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return Math.floor(t / DAY);
}

export function dayOf(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY);
}

const YEAR = 365.25;
/**
 * Consistency of issue / expiry / date of birth for license and state ID. Returns a reason string when inconsistent
 * (callers map it to needs_review), or null. Unparsable values are the caller's `unreadable`.
 */
export function dateInconsistency(fields: IdDocumentFields, today: number): string | null {
  const exp = fields.expiration ? parseDay(fields.expiration) : null;
  const iss = fields.issueDate ? parseDay(fields.issueDate) : null;
  const dob = fields.dateOfBirth ? parseDay(fields.dateOfBirth) : null;
  if (fields.dateOfBirth && dob === null) return 'dob_unparsable';
  if (fields.issueDate && iss === null) return 'issue_unparsable';
  if (dob !== null) {
    const age = (today - dob) / YEAR;
    if (age < 14 || age > 120) return 'dob_implausible';
  }
  if (iss !== null && iss > today + 1) return 'issue_in_future';
  if (iss !== null && dob !== null && iss <= dob) return 'issue_before_birth';
  if (exp !== null && iss !== null && exp <= iss) return 'expiry_before_issue';
  if (exp !== null && iss !== null && (exp - iss) / YEAR > 20) return 'validity_too_long';
  if (exp !== null && (exp - today) / YEAR > 20) return 'expiry_too_far';
  if (exp !== null && dob !== null && exp <= dob) return 'expiry_before_birth';
  return null;
}
