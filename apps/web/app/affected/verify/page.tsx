'use client';
// /affected/verify — demo-grade ID check (T2.9).
// 1. generate verificationSecret → start_verification(address, docKind, sha256(secret))
// 2. wait for our own `verification` row (matched by secret hash) → its id + property id
// 3. upload the photo into SpacetimeDB storage (begin_upload + upload_chunk) → submit_verification(id, objectKey)
// 4. watch the row: verified → property page; failed → reason + "Try another document".
// The ID image is deleted right after extraction (worker + record_verification; CONTRACTS §3.3); it can never be read back.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { NormalizedAddress } from '@hack/contracts/property';
import {
  R,
  generateSecret,
  idToString,
  idvKeyFor,
  saveVerificationSecret,
  sha256Hex,
  useReducer,
  useStdb,
  useUploadFile,
  useVerificationBySecretHash,
} from '@/lib/stdb';
import { DOC_KINDS, FAIL_REASON_TEXT, formatAddress, loadSelectedAddress, type DocKind } from '@/components/affected/helpers';
import { AppShell } from '@/components/chrome/AppShell';
import { DevPreviewButton } from '@/components/damage-report/DevPreviewButton';

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
  const uploadFile = useUploadFile();

  const [address, setAddress] = useState<NormalizedAddress | null | undefined>(undefined);
  const [docKind, setDocKind] = useState<DocKind>('drivers_license');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('choose');
  const [error, setError] = useState<string | null>(null);
  const [secretHash, setSecretHash] = useState<string | null>(null);
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

  // Step 3: once our row exists, upload the photo and submit it.
  useEffect(() => {
    if (phase !== 'starting' || !row || !file || !secretRef.current || uploadStarted.current) return;
    uploadStarted.current = true;
    setPhase('uploading');
    (async () => {
      try {
        const objectKey = idvKeyFor(idToString(row.id), file.type);
        try {
          await uploadFile(objectKey, file);
        } catch {
          throw new Error('The upload failed.');
        }
        await submitVerification({ verificationId: row.id, objectKey });
        writePending(secretHash);
        setPhase('submitted');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.');
        setPhase('choose');
        uploadStarted.current = false;
      }
    })();
  }, [phase, row, file, secretHash, submitVerification, uploadFile]);

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
      <AppShell>
        <p className="text-sm text-slate-600">Loading your address…</p>
      </AppShell>
    );
  }
  if (address === null) {
    return (
      <AppShell>
        <p className="text-[13px] text-slate-700">First, tell us your home address.</p>
        <Link
          href="/affected/start"
          className="block rounded-xl bg-blue-700 px-4 py-3 text-center text-[13px] font-bold text-white"
        >
          Enter address
        </Link>
        <DevPreviewButton />
      </AppShell>
    );
  }

  const failed = row?.state === 'failed';
  const busy = phase === 'starting' || phase === 'uploading' || (phase === 'submitted' && !failed);

  return (
    <AppShell>
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Affected</p>
        <h1 className="mt-0.5 text-lg font-bold tracking-[-0.02em] text-slate-950">
          Verify it&apos;s your home
        </h1>
        <p className="mt-1 text-[12px] text-slate-500">{formatAddress(address)}</p>
      </header>

      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900">
        Demo identity check — not production-grade verification. We read only your name and address
        from the photo, and the image is deleted right after the check.
      </p>

      {busy ? (
        <section
          aria-live="polite"
          className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4"
        >
          <p className="text-[13px] font-bold text-slate-900">
            {phase === 'starting' && 'Starting…'}
            {phase === 'uploading' && 'Uploading your photo…'}
            {phase === 'submitted' &&
              (row?.state === 'processing' ? 'Reading your document…' : 'Waiting for the check…')}
          </p>
          <p className="text-[12px] text-slate-500">
            This usually takes under a minute. You can keep this page open.
          </p>
          {phase === 'submitted' && row?.state === 'pending' && (
            <button
              type="button"
              onClick={tryAgain}
              className="text-[12px] font-bold text-blue-700 underline"
            >
              Upload didn&apos;t finish? Start again
            </button>
          )}
        </section>
      ) : failed ? (
        <section role="alert" className="space-y-3 rounded-2xl border border-red-200 bg-white p-4">
          <p className="text-[13px] font-bold text-red-800">We couldn&apos;t verify this document.</p>
          <p className="text-[12px] text-slate-700">
            {FAIL_REASON_TEXT[row?.failReason ?? ''] ?? 'Please try again.'}
          </p>
          <button
            type="button"
            onClick={tryAgain}
            className="w-full rounded-xl bg-blue-700 px-4 py-3 text-[13px] font-bold text-white"
          >
            Try another document
          </button>
          {row && (
            <Link
              href={`/affected/property/${idToString(row.propertyId)}`}
              className="block text-center text-[12px] font-bold text-blue-700 underline"
            >
              See what&apos;s happening in your area (no home details)
            </Link>
          )}
        </section>
      ) : (
        <form
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void begin();
          }}
        >
          <fieldset className="space-y-2">
            <legend className="text-[12px] font-semibold text-slate-700">Document type</legend>
            {DOC_KINDS.map((d) => (
              <label
                key={d.id}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[13px]"
              >
                <input
                  type="radio"
                  name="docKind"
                  value={d.id}
                  checked={docKind === d.id}
                  onChange={() => setDocKind(d.id)}
                />
                <span>{d.label}</span>
              </label>
            ))}
          </fieldset>

          <label className="block space-y-2">
            <span className="text-[12px] font-semibold text-slate-700">Photo of the document</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-[13px] text-slate-700"
            />
            <span className="block text-[11px] text-slate-500">
              Flat, in good light, with all four corners visible.
            </span>
          </label>

          {error && (
            <p role="alert" className="text-[12px] font-semibold text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!file || !isActive}
            className="w-full rounded-xl bg-blue-700 px-4 py-3 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {isActive ? 'Verify' : 'Connecting…'}
          </button>
        </form>
      )}

      <DevPreviewButton />
    </AppShell>
  );
}
