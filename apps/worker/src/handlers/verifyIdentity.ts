import { IdDocumentFieldsSchema, type IdDocumentFields, type NormalizedAddress, type VerificationResult } from '@hack/contracts';
import { decideVerification, extractIdDocument, sniffImageMime } from '@hack/vision';
import { loadFixture } from '../fixtures';
import type { JobHandler } from './types';

// ARCHITECTURE §6.5. Demo identity check — not production-grade verification.
// The idv/ object is deleted in `finally` on every path. Only the key is ever logged, never the fields.

const DELETE_ATTEMPTS = 3;

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
        fields = ctx.nim.useFixtures
          ? IdDocumentFieldsSchema.parse(await loadFixture('verification/id-fields-specimen.json'))
          : await extractIdDocument({ nim: ctx.nim, image, mime, signal: ctx.signal });
      }
      result = decideVerification(fields, propertyAddress);
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

  await ctx.stdb.recordVerification({
    verificationId,
    ok: result.ok,
    failReason: result.ok ? undefined : result.failReason,
    nameOnDoc: result.ok ? result.nameOnDoc : undefined,
  });
  ctx.log.info('verification decided', { verificationId, ok: result.ok, failReason: result.failReason ?? null });
};
