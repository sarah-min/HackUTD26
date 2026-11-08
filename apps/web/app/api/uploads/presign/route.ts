// POST /api/uploads/presign — kind media | idv (CONTRACTS.md §8). Owner: Part 4.
import { NextResponse, type NextRequest } from 'next/server';
import { createStorageFromEnv } from '@hack/storage';
import { UPLOADABLE_REPORT_STATUSES, hashesEqual } from '../limits';
import { objectKeyFor, parsePresignBody, sha256HexSync } from './parse';
import { lookupReportUploadAuth, lookupVerificationAuth } from '../../_lib/webAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = parsePresignBody(raw);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    if (parsed.kind === 'media') {
      const row = await lookupReportUploadAuth(parsed.reportId);
      if (!row || !UPLOADABLE_REPORT_STATUSES.has(row.status)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
      }
      const hash = sha256HexSync(parsed.reporterSecret);
      if (!hashesEqual(hash, row.reporterSecretHash)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
      }
    } else {
      const row = await lookupVerificationAuth(parsed.verificationId);
      if (!row || row.state !== 'pending') {
        return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
      }
      const hash = sha256HexSync(parsed.verificationSecret);
      if (!hashesEqual(hash, row.secretHash)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
      }
    }

    const objectKey = objectKeyFor(parsed);
    const storage = createStorageFromEnv();
    const { url, expiresAt } = await storage.presignPut(objectKey, parsed.contentType, parsed.sizeBytes);
    return NextResponse.json({ putUrl: url, objectKey, expiresAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'presign_failed';
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
