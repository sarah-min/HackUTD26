import { type NormalizedAddress } from '@hack/contracts/property';
import { IdDocumentFieldsSchema, type IdDocumentFields, type VerificationResult } from '@hack/contracts/verification';
import { decideVerification, extractIdDocument, sniffImageMime } from '@hack/vision';
import { loadFixture } from '../fixtures';
import type { JobHandler } from './types';

// ARCHITECTURE §6.5. Demo identity check — not production-grade verification.
// The idv/ object is deleted in `finally` on every path. Only the key is ever logged, never the fields.

const DELETE_ATTEMPTS = 3;

const FIXTURE_CUES = {
  docConfidence: 0.9,
  riskCues: {
    screenCaptureSuspected: false, photoOfPhoto: false, edgesCroppedOrMissing: false,
    fontOrTemplateInconsistent: false, textOverlayOrEditArtifacts: false, facePhotoPresent: true,
  },
};

// Optional server-side config: extra exact names accepted despite looking like placeholders (published specimens).
// Comma-separated, e.g. IDV_SPECIMEN_NAMES="SAMPLE SPECIMEN,IMA CARDHOLDER". Never user input.
function specimenNamesFromEnv(): string[] | undefined {
  const raw = process.env.IDV_SPECIMEN_NAMES;
  if (!raw) return undefined;
  return ['SAMPLE SPECIMEN', ...raw.split(',').map((s) => s.trim()).filter(Boolean)];
}

export const verifyIdentityHandler: JobHandler = async (ctx) => {
  const verificationId = ctx.job.verificationId;
  if (!verificationId) throw new Error('verify_identity job without verification_id');
  const verification = await ctx.stdb.getVerification(verificationId);
  if (!verification) throw new Error(`verification ${verificationId} not found`);

  const key = verification.objectKey;
  const ownKey = !!key && key.startsWith(`idv/${verificationId}/`);
  let result: VerificationResult = { ok: false, failReason: 'unreadable' };

  try {
    if (!ownKey) {
      ctx.log.warn('verification has no idv object for this id', { verificationId });
    } else {
      const property = await ctx.stdb.getPropertyPrivate(verification.propertyId);
      if (!property) throw new Error('property not found');
      const propertyAddress: NormalizedAddress = {
        line1: property.line1, city: property.city, state: property.state, zip: property.zip,
        lat: property.lat, lng: property.lng, normalized: property.normalized, source: 'manual',
      };
      const image = await ctx.storage.getObject(key);
      const mime = sniffImageMime(image);
      let fields: IdDocumentFields | null = null;
      if (mime) {
        // The hand-written specimen fixture predates the v2 cues; supply them explicitly (all benign) so the
        // demo path goes through the same required-cues rule as real replies. Fixture output only, never live.
        fields = ctx.nim.useFixtures
          ? IdDocumentFieldsSchema.parse({ ...(await loadFixture<object>('verification/id-fields-specimen.json')), ...FIXTURE_CUES })
          : await extractIdDocument({ nim: ctx.nim, image, mime, signal: ctx.signal });
      }
      result = decideVerification(fields, propertyAddress, new Date(), { specimenNames: specimenNamesFromEnv() });
    }
  } catch (e) {
    // The message can't contain document fields: extraction returns typed data, never throws it.
    ctx.log.error('verification failed', { verificationId, error: (e as Error).message.slice(0, 200) });
    result = { ok: false, failReason: 'unreadable' };
  } finally {
    if (ownKey) {
      for (let attempt = 1; attempt <= DELETE_ATTEMPTS; attempt++) {
        try {
          await ctx.storage.deleteObject(key!);
          ctx.log.info('idv object deleted', { objectKey: key });
          break;
        } catch (e) {
          ctx.log.error('idv delete failed; bucket lifecycle rule is the backstop', {
            objectKey: key, attempt, error: (e as Error).message.slice(0, 120),
          });
          if (attempt < DELETE_ATTEMPTS) await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }
  }

  const record = (failReason: string | undefined) =>
    ctx.stdb.recordVerification({
      verificationId,
      ok: result.ok,
      failReason,
      nameOnDoc: result.ok ? result.nameOnDoc : undefined,
    });
  try {
    await record(result.ok ? undefined : result.failReason);
  } catch (e) {
    // `needs_review` is newer than the module's fail_reason allowlist: until the module accepts it, record the
    // same not-verified outcome as `unreadable` rather than losing the decision (the job would retry forever).
    if (result.ok || result.failReason !== 'needs_review') throw e;
    ctx.log.warn('record_verification rejected needs_review; recording unreadable', {
      verificationId, error: (e as Error).message.slice(0, 120),
    });
    result = { ok: false, failReason: 'unreadable' };
    await record('unreadable');
  }
  ctx.log.info('verification decided', { verificationId, ok: result.ok, failReason: result.failReason ?? null });
};
