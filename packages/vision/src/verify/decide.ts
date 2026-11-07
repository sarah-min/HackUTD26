import { matchAddresses, normalizeAddress } from '@hack/address';
import {
  VerificationResultSchema,
  type IdDocumentFields,
  type NormalizedAddress,
  type VerificationResult,
} from '@hack/contracts';
import { parseAddressText } from './parseAddressText';

const ID_KINDS = new Set(['drivers_license', 'state_id']);

/** YYYY-MM-DD (or a parseable date) → UTC day number; null when unparseable. */
function dayNumber(value: string): number | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  const t = iso ? Date.UTC(+iso[1]!, +iso[2]! - 1, +iso[3]!) : Date.parse(value);
  return Number.isFinite(t) ? Math.floor(t / 86_400_000) : null;
}

/**
 * Deterministic decision rule (CONTRACTS §3.3), in order:
 * not an ID → unreadable (confidence < 0.5) → expired (IDs only) → address_mismatch → ok.
 * `fields === null` means the model output never validated → unreadable.
 */
export function decideVerification(
  fields: IdDocumentFields | null,
  propertyAddress: NormalizedAddress,
  today: Date = new Date(),
): VerificationResult {
  if (!fields) return { ok: false, failReason: 'unreadable' };
  if (!fields.isLikelyId) return { ok: false, failReason: 'not_an_id' };
  if (fields.confidence < 0.5) return { ok: false, failReason: 'unreadable' };
  if (ID_KINDS.has(fields.docKind) && fields.expiration) {
    const exp = dayNumber(fields.expiration);
    const now = Math.floor(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) / 86_400_000);
    if (exp !== null && exp < now) return { ok: false, failReason: 'expired' };
  }
  const parts = parseAddressText(fields.addressText);
  if (!parts) return { ok: false, failReason: 'address_mismatch' };
  const docAddress = normalizeAddress(parts);
  if (!matchAddresses(docAddress, propertyAddress)) return { ok: false, failReason: 'address_mismatch' };
  const nameOnDoc = fields.fullName.trim();
  return VerificationResultSchema.parse({
    ok: true,
    nameOnDoc: nameOnDoc ? nameOnDoc.slice(0, 120) : undefined,
    matchedNormalized: propertyAddress.normalized,
  });
}
