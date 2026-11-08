// GET /api/media/[...key] — verified affected only; never serves idv/ (CONTRACTS.md §8). Owner: Part 4.
import { NextResponse, type NextRequest } from 'next/server';
import { createStorageFromEnv, isIdvKey } from '@hack/storage';
import { hashesEqual, sha256HexSync } from '../../uploads/limits';
import { lookupMediaIndex, lookupVerificationAuth } from '../../_lib/webAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  const objectKey = parts.map(decodeURIComponent).join('/');
  if (!objectKey || isIdvKey(objectKey)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const verificationId = req.headers.get('x-verification-id') ?? '';
  const verificationSecret = req.headers.get('x-verification-secret') ?? '';
  if (!verificationId || !verificationSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const auth = await lookupVerificationAuth(verificationId);
    if (!auth || auth.state !== 'verified') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }
    const hash = sha256HexSync(verificationSecret);
    if (!hashesEqual(hash, auth.secretHash)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }

    const media = await lookupMediaIndex(objectKey);
    if (!media || media.propertyId !== auth.propertyId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const storage = createStorageFromEnv();
    const url = await storage.presignGet(objectKey);
    return NextResponse.redirect(url, 302);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'media_failed';
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
