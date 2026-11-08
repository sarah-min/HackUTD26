import { matchAddresses, normalizeParts } from '@hack/address';
import { type NormalizedAddress } from '@hack/contracts/property';
import { VerificationResultSchema, type IdDocumentFields, type VerificationResult } from '@hack/contracts/verification';
import { DEFAULT_SPECIMEN_NAMES, DOC_CONFIDENCE_MIN, checkName, dateInconsistency, dayOf, parseDay } from './docChecks';
import { parseAddressText } from './parseAddressText';
import { looksLikeInjection, sanitizeText } from './textSafety';

const ID_KINDS = new Set(['drivers_license', 'state_id']);

/** Risk cues that, when reported true by the model, send the document to review (never a hard failure). */
const HIGH_RISK_CUES = [
  'screenCaptureSuspected', 'photoOfPhoto', 'edgesCroppedOrMissing', 'fontOrTemplateInconsistent', 'textOverlayOrEditArtifacts', 'suspiciousText',
] as const;

/** Every cue a v2 reply must report. A reply that omits any of them (or docConfidence) cannot be trusted as v2. */
const REQUIRED_CUES = [
  'screenCaptureSuspected', 'photoOfPhoto', 'edgesCroppedOrMissing', 'fontOrTemplateInconsistent', 'textOverlayOrEditArtifacts', 'facePhotoPresent',
] as const;

export interface DecideOptions {
  /** Exact names accepted despite looking like placeholders (the documented specimen). Server config only. */
  specimenNames?: readonly string[];
}

const NEEDS_REVIEW: VerificationResult = { ok: false, failReason: 'needs_review' };

/**
 * Deterministic decision rule (CONTRACTS §3.3), in order:
 * not an ID → unreadable (confidence < 0.5) → injection/hidden text → needs_review → unparsable dates → unreadable
 * → expired (IDs only) → address_mismatch (printed address, printed state, issuing state) → name check
 * → date consistency (IDs only) → missing cues/docConfidence, risk cues or low docConfidence → needs_review → ok.
 * The verdict derives only from structured fields (enums, booleans, numbers, parsed dates) and the deterministic
 * address match; free text (name, address) is data that is checked, never read as instructions.
 * `fields === null` means the model output never validated → unreadable.
 */
export function decideVerification(
  fields: IdDocumentFields | null,
  propertyAddress: NormalizedAddress,
  today: Date = new Date(),
  opts: DecideOptions = {},
): VerificationResult {
  if (!fields) return { ok: false, failReason: 'unreadable' };
  if (!fields.isLikelyId) return { ok: false, failReason: 'not_an_id' };
  if (fields.confidence < 0.5) return { ok: false, failReason: 'unreadable' };

  const isIdKind = ID_KINDS.has(fields.docKind);
  const address = sanitizeText(fields.addressText);
  if (
    fields.riskCues?.suspiciousText ||
    sanitizeText(fields.fullName).hidden || address.hidden ||
    looksLikeInjection(fields.fullName) || looksLikeInjection(fields.addressText)
  ) {
    return NEEDS_REVIEW;
  }

  const now = dayOf(today);
  if (isIdKind) {
    for (const v of [fields.expiration, fields.issueDate, fields.dateOfBirth]) {
      if (v && parseDay(v) === null) return { ok: false, failReason: 'unreadable' };
    }
    const exp = fields.expiration ? parseDay(fields.expiration) : null;
    if (exp !== null && exp < now) return { ok: false, failReason: 'expired' };
  }

  const parts = parseAddressText(address.text);
  if (!parts) return { ok: false, failReason: 'address_mismatch' };
  const propertyState = propertyAddress.state.trim().toUpperCase();
  if (parts.state !== propertyState) return { ok: false, failReason: 'address_mismatch' };
  if (isIdKind && fields.issuingState && fields.issuingState.trim().toUpperCase() !== propertyState) {
    return { ok: false, failReason: 'address_mismatch' };
  }
  const docAddress = normalizeParts(parts); // { line1, city, state, zip, normalized }
  if (!matchAddresses(docAddress, propertyAddress)) return { ok: false, failReason: 'address_mismatch' };

  const name = checkName(fields.fullName, opts.specimenNames ?? DEFAULT_SPECIMEN_NAMES);
  if (!name.ok) return name.verdict === 'unreadable' ? { ok: false, failReason: 'unreadable' } : NEEDS_REVIEW;

  if (isIdKind) {
    if (!fields.expiration) return NEEDS_REVIEW; // a license/state ID always prints an expiry
    if (dateInconsistency(fields, now)) return NEEDS_REVIEW;
    if (fields.riskCues?.facePhotoPresent === false) return NEEDS_REVIEW;
  }
  const cues = fields.riskCues;
  // Cues and docConfidence are required: an omitted cue set (legacy v1-shaped reply, or an injection that suppresses
  // them) is not evidence of a clean document. Fixture/specimen callers must supply them explicitly.
  if (!cues || REQUIRED_CUES.some((c) => typeof cues[c] !== 'boolean') || fields.docConfidence === undefined) return NEEDS_REVIEW;
  if (HIGH_RISK_CUES.some((c) => cues[c] === true)) return NEEDS_REVIEW;
  if (fields.docConfidence !== undefined && fields.docConfidence < DOC_CONFIDENCE_MIN) return NEEDS_REVIEW;

  return VerificationResultSchema.parse({
    ok: true,
    nameOnDoc: name.name.slice(0, 120),
    matchedNormalized: propertyAddress.normalized,
  });
}
