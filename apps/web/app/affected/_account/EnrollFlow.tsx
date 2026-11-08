'use client';
// Create-account flow for a verified owner (shared by the property-page card and the step-up gate).
// Step 1: the browser generates a recovery code and the person saves it. Step 2: "Create account".
// The code is held only in this component's state and is dropped as soon as the account exists.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useCreateAccount, useStdb } from '@/lib/stdb';
import { generateRecoveryCode } from '@/lib/stdb/recoveryCode';
import { FailureNotice, useFailure } from './Failure';
import { RecoveryCodeBox } from './RecoveryCodeBox';
import { DEMO_IDENTITY_LABEL, failureText, needsFreshCode } from './copy';
import { btnPrimary, hint, linkText } from './ui';

export function EnrollFlow({ idPrefix, onCreated }: { idPrefix: string; onCreated?: () => void }) {
  const { isActive } = useStdb();
  const createAccount = useCreateAccount();
  const [code, setCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const failure = useFailure();
  const doneRef = useRef<HTMLDivElement>(null);

  // Generated in the browser after mount (never during server render), so every visit gets its own code.
  useEffect(() => {
    setCode((c) => c ?? generateRecoveryCode());
  }, []);

  useEffect(() => {
    if (created) doneRef.current?.focus();
  }, [created]);

  async function create() {
    if (!code || !saved || busy || failure.locked) return;
    setBusy(true);
    failure.clear();
    try {
      const r = await createAccount(code);
      if (r.ok) {
        setCode(null);
        setCreated(true);
        onCreated?.();
        return;
      }
      if (needsFreshCode(r.error)) {
        setCode(generateRecoveryCode());
        setSaved(false);
        failure.text(failureText(r));
      } else {
        failure.fail(r);
      }
    } catch {
      failure.network();
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div ref={doneRef} tabIndex={-1} role="status" className="space-y-2 outline-none">
        <p className="text-[13px] font-bold text-slate-900">
          Account created. This device is signed in.
        </p>
        <p className="text-[12px] text-slate-500">
          Keep your recovery code safe. You will need it to open your reports on another phone.
        </p>
        <Link href="/affected/account" className={linkText}>
          Manage your account
        </Link>
      </div>
    );
  }

  if (!code) return <p className="text-[12px] text-slate-500">Creating your code…</p>;

  return (
    <div className="space-y-3">
      <RecoveryCodeBox code={code} saved={saved} onSavedChange={setSaved} idPrefix={idPrefix} />
      <FailureNotice f={failure} id={`${idPrefix}-err`} />
      <button
        type="button"
        className={btnPrimary}
        disabled={!saved || busy || failure.locked || !isActive}
        onClick={() => void create()}
      >
        {!isActive ? 'Connecting…' : busy ? 'Creating…' : 'Create account'}
      </button>
      {!saved ? <p className={hint}>Save your code, then tick the box to continue.</p> : null}
      <p className={hint}>{DEMO_IDENTITY_LABEL}</p>
    </div>
  );
}
