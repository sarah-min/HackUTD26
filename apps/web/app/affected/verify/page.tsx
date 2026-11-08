'use client';
// /affected/verify — demo-grade ID check (T2.9).
// 1. generate verificationSecret → start_verification(address, docKind, sha256(secret))
// 2. wait for our own `verification` row (matched by secret hash) → its id + property id
// 3. POST /api/uploads/presign {kind:'idv'} → PUT the photo → submit_verification(id, objectKey)
// 4. watch the row: verified → property page; failed → reason + "Try another document".
// The ID image is deleted by the worker right after extraction (CONTRACTS §3.3); nothing is kept here.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { NormalizedAddress } from '@hack/contracts/property';
import {
  R,
  generateSecret,
  idToString,
  saveVerificationSecret,
  sha256Hex,
  useReducer,
  useStdb,
  useVerificationBySecretHash,
} from '@/lib/stdb';
import { DOC_KINDS, FAIL_REASON_TEXT, formatAddress, loadSelectedAddress, type DocKind } from '@/components/affected/helpers';
import { AppHeader } from '@/components/chrome/AppHeader';

const MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PENDING_KEY = 'affected:pendingVerificationHash';

type Phase = 'choose' | 'starting' | 'uploading' | 'submitted';

function readPending(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}
function writePending(v: string | null) {
  try {
    if (v) sessionStorage.setItem(PENDING_KEY, v);
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

export default function AffectedVerifyPage() {
  const router = useRouter();
  const { isActive } = useStdb();
  const startVerification = useReducer(R.startVerification);
  const submitVerification = useReducer(R.submitVerification);

  const [address, setAddress] = useState<NormalizedAddress | null | undefined>(undefined);
  const [docKind, setDocKind] = useState<DocKind>('drivers_license');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('choose');
  const [error, setError] = useState<string | null>(null);
  const [secretHash, setSecretHash] = useState<string | null>(null);
  const [uploadsReady, setUploadsReady] = useState<boolean | null>(null);
  const secretRef = useRef<string | null>(null);
  const uploadStarted = useRef(false);

  const row = useVerificationBySecretHash(secretHash);

  useEffect(() => {
    setAddress(loadSelectedAddress());
    const pending = readPending();
    if (pending) {
      setSecretHash(pending);
      setPhase('submitted');
    }
  }, []);

  // P4 owns /api/uploads/presign — probe so the demo fails clearly instead of mid-upload.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/uploads/presign', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (!cancelled) setUploadsReady(res.status !== 404);
      } catch {
        if (!cancelled) setUploadsReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Step 3: once our row exists, upload the photo and submit it.
  useEffect(() => {
    if (phase !== 'starting' || !row || !file || !secretRef.current || uploadStarted.current) return;
    uploadStarted.current = true;
    setPhase('uploading');
    (async () => {
      try {
        const presign = await fetch('/api/uploads/presign', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: 'idv',
            verificationId: idToString(row.id),
            verificationSecret: secretRef.current,
            contentType: file.type,
            sizeBytes: file.size,
          }),
        });
        if (!presign.ok) throw new Error('Could not start the upload.');
        const { putUrl, objectKey } = (await presign.json()) as { putUrl: string; objectKey: string };
        const put = await fetch(putUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
        if (!put.ok) throw new Error('The upload failed.');
        await submitVerification({ verificationId: row.id, objectKey });
        writePending(secretHash);
        setPhase('submitted');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.');
        setPhase('choose');
        uploadStarted.current = false;
      }
    })();
  }, [phase, row, file, secretHash, submitVerification]);

  // Step 4: react to the decision.
  useEffect(() => {
    if (!row) return;
    if (row.state === 'verified') {
      writePending(null);
      router.replace(`/affected/property/${idToString(row.propertyId)}`);
    }
  }, [row, router]);

  async function begin() {
    setError(null);
    if (!address || !file) return;
    if (uploadsReady === false) {
      setError('ID photo upload is not available in this build yet. You can still view area conditions without verifying.');
      return;
    }
    if (!IMAGE_TYPES.includes(file.type)) return setError('Use a JPEG, PNG or WebP photo.');
    if (file.size > MAX_BYTES) return setError('That photo is over 15 MB. Retake it at a lower resolution.');
    const secret = generateSecret();
    const hash = await sha256Hex(secret);
    secretRef.current = secret;
    saveVerificationSecret(hash, secret);
    uploadStarted.current = false;
    setSecretHash(hash);
    setPhase('starting');
    try {
      await startVerification({ addressJson: JSON.stringify(address), docKind, secretHash: hash });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(msg.includes('rate_limited') ? FAIL_REASON_TEXT.rate_limited! : "Couldn't start verification. Try again.");
      setPhase('choose');
      setSecretHash(null);
    }
  }

  function tryAgain() {
    writePending(null);
    setSecretHash(null);
    setFile(null);
    setError(null);
    setPhase('choose');
  }

  if (address === undefined) {
    return (
      <main className="mx-auto max-w-md px-4 py-6 text-sm text-gray-600">Loading your address…</main>
    );
  }
  if (address === null) {
    return (
      <main className="mx-auto max-w-md space-y-3 px-4 py-6">
        <p>First, tell us your home address.</p>
        <Link href="/affected/start" className="inline-block rounded-lg bg-black px-4 py-3 font-medium text-white">
          Enter address
        </Link>
      </main>
    );
  }

  const failed = row?.state === 'failed';
  const busy = phase === 'starting' || phase === 'uploading' || (phase === 'submitted' && !failed);
  const canUpload = uploadsReady !== false;

  return (
    <div className="min-h-screen bg-[#eef1f5]">
      <AppHeader dense />
    <main className="mx-auto max-w-md space-y-5 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Verify it's your home</h1>
        <p className="text-sm text-gray-600">{formatAddress(address)}</p>
      </header>

      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        Demo identity check — not production-grade verification. We read only your name and address from the photo, and
        the image is deleted right after the check.
      </p>

      {uploadsReady === false ? (
        <section role="status" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">ID photo upload is not available in this build yet.</p>
          <p>You can still browse area conditions without verifying. Full verification unlocks when upload support lands.</p>
          <Link href="/affected/start" className="inline-block font-medium underline">
            Back to address
          </Link>
        </section>
      ) : null}

      {busy ? (
        <section aria-live="polite" className="space-y-2 rounded-lg border p-4">
          <p className="font-medium">
            {phase === 'starting' && 'Starting…'}
            {phase === 'uploading' && 'Uploading your photo…'}
            {phase === 'submitted' && (row?.state === 'processing' ? 'Reading your document…' : 'Waiting for the check…')}
          </p>
          <p className="text-sm text-gray-600">This usually takes under a minute. You can keep this page open.</p>
          {phase === 'submitted' && row?.state === 'pending' && (
            <button type="button" onClick={tryAgain} className="text-sm underline">
              Upload didn't finish? Start again
            </button>
          )}
        </section>
      ) : failed ? (
        <section role="alert" className="space-y-3 rounded-lg border border-red-300 p-4">
          <p className="font-medium text-red-800">We couldn't verify this document.</p>
          <p className="text-sm">{FAIL_REASON_TEXT[row?.failReason ?? ''] ?? 'Please try again.'}</p>
          <button type="button" onClick={tryAgain} className="rounded-lg bg-black px-4 py-3 font-medium text-white">
            Try another document
          </button>
          {row && (
            <Link href={`/affected/property/${idToString(row.propertyId)}`} className="block text-sm underline">
              See what's happening in your area (no home details)
            </Link>
          )}
        </section>
      ) : canUpload ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void begin();
          }}
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Document type</legend>
            {DOC_KINDS.map((d) => (
              <label key={d.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <input type="radio" name="docKind" value={d.id} checked={docKind === d.id} onChange={() => setDocKind(d.id)} />
                <span>{d.label}</span>
              </label>
            ))}
          </fieldset>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Photo of the document</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            <span className="block text-xs text-gray-500">Flat, in good light, with all four corners visible.</span>
          </label>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!file || !isActive || uploadsReady === null}
            className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {!isActive ? 'Connecting…' : uploadsReady === null ? 'Checking upload…' : 'Verify'}
          </button>
        </form>
      ) : null}
    </main>
    </div>
  );
}
