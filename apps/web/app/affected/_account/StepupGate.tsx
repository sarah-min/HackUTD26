'use client';
// Wraps full-report content. When the module requires step-up and this device has none:
// a linked device is asked for its recovery code, a verified owner with no account is asked to
// create one, and anyone else is pointed to sign in. Otherwise renders children untouched.
import { useState } from 'react';
import Link from 'next/link';
import { useAccountStatus, useMyVerifications, useStepUpWithCode, useStepup } from '@/lib/stdb';
import { CodeEntryForm } from './CodeEntryForm';
import { EnrollFlow } from './EnrollFlow';
import { ACCOUNTS_OFF_TEXT } from './copy';
import { amberNotice, btnPrimary, card } from './ui';

export function StepupGate({ children }: { children: React.ReactNode }) {
  const { enabled, ready: statusReady } = useAccountStatus();
  const step = useStepup();
  const [verifs, verifsReady] = useMyVerifications();
  const stepUp = useStepUpWithCode();
  const [confirmed, setConfirmed] = useState(false);

  if (!statusReady || !step.ready || !verifsReady) {
    return <p className="text-sm text-slate-600">Loading…</p>;
  }
  if (!step.required || step.active) return <>{children}</>;

  const hasVerified = verifs.some((v) => v.state === 'verified');

  if (!step.linked && !hasVerified) {
    return (
      <section className={card}>
        <h2 className="text-[15px] font-bold text-slate-950">Sign in to see this</h2>
        <p className="text-[12px] text-slate-500">
          Full reports are only shown to the verified resident. Sign in on this device with your
          recovery code, or verify your home.
        </p>
        <Link href="/affected/signin" className={`block text-center ${btnPrimary}`}>
          Sign in on this device
        </Link>
        <Link
          href="/affected/start"
          className="block text-center text-[12px] font-bold text-blue-700 underline"
        >
          I&apos;ve been affected
        </Link>
      </section>
    );
  }

  if (step.linked) {
    return (
      <section aria-labelledby="stepup-title" className={card}>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Account</p>
          <h2 id="stepup-title" className="mt-0.5 text-[15px] font-bold text-slate-950">
            Confirm it&apos;s you
          </h2>
        </div>
        <p className="text-[12px] text-slate-500">
          To protect your privacy, enter your recovery code before the full report opens. It stays
          unlocked for 15 minutes.
        </p>
        {confirmed ? (
          <p role="status" className="text-[13px] font-bold text-slate-900">
            Confirmed. Opening your report…
          </p>
        ) : (
          <CodeEntryForm
            idPrefix="stepup"
            submitLabel="Confirm"
            onSubmit={stepUp}
            onSuccess={() => setConfirmed(true)}
          />
        )}
      </section>
    );
  }

  // Verified owner with no account.
  return (
    <section aria-labelledby="stepup-title" className={card}>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Account</p>
        <h2 id="stepup-title" className="mt-0.5 text-[15px] font-bold text-slate-950">
          Create an account to continue
        </h2>
      </div>
      {enabled ? (
        <>
          <p className="text-[12px] text-slate-500">
            To protect your privacy, the full report needs an account. Save the recovery code below,
            then create your account.
          </p>
          <EnrollFlow idPrefix="gate-enroll" />
        </>
      ) : (
        <p role="status" className={amberNotice}>
          {ACCOUNTS_OFF_TEXT}
        </p>
      )}
    </section>
  );
}
