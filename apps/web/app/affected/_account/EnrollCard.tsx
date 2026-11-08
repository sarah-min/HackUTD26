'use client';
// "Secure your account" card for a verified owner with no account yet. Skippable:
// step-up is off by default, so nothing is blocked if they skip.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount, useAuthStatus, useStepup } from '@/lib/stdb';
import { readLocal, writeLocal } from '@/lib/stdb/storage';
import { EmailCodeFlow } from './EmailCodeFlow';
import { card, linkText } from './ui';

const DISMISS_KEY = 'affected:enrollDismissed';

/** Render only where the visitor is a verified owner (the property page does). */
export function EnrollCard() {
  const { mode, ready: authReady } = useAuthStatus();
  const { account, ready: accountReady } = useAccount();
  const step = useStepup();
  const [dismissed, setDismissed] = useState(true);
  const [enrolledAs, setEnrolledAs] = useState<string | null>(null);
  const [latched, setLatched] = useState(false);

  useEffect(() => {
    setDismissed(readLocal(DISMISS_KEY) === '1');
  }, []);

  // The account row can arrive before the verify call returns; latch so the success state survives.
  // When step-up is required the gate already asks for the same email; avoid two prompts.
  const gateShown = step.required && !step.active;
  const eligible =
    authReady &&
    accountReady &&
    step.ready &&
    mode !== 'off' &&
    !account &&
    !dismissed &&
    !gateShown;
  useEffect(() => {
    if (eligible) setLatched(true);
  }, [eligible]);

  if (dismissed && !enrolledAs) return null;
  if (!eligible && !latched) return null;

  const done = (
    <div role="status" className="space-y-2">
      <p className="text-[13px] font-bold text-slate-900">Your account is secured.</p>
      <p className="text-[12px] text-slate-500">
        Signed in as <strong>{account?.emailMasked ?? enrolledAs}</strong>. Use this email to get
        back to your reports from another phone.
      </p>
      <Link href="/affected/account" className={linkText}>
        Manage your account
      </Link>
    </div>
  );

  return (
    <section aria-labelledby="enroll-title" className={card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Account</p>
          <h2 id="enroll-title" className="mt-0.5 text-[15px] font-bold text-slate-950">
            Secure your account
          </h2>
        </div>
        {!enrolledAs ? (
          <button
            type="button"
            className="shrink-0 text-[12px] font-semibold text-slate-500 underline"
            onClick={() => {
              writeLocal(DISMISS_KEY, '1');
              setDismissed(true);
            }}
          >
            Not now
          </button>
        ) : null}
      </div>
      {!enrolledAs ? (
        <p className="text-[12px] text-slate-500">
          Add your email to get back to your reports on a new phone. We send a 6-digit code, no
          password needed.
        </p>
      ) : null}
      <EmailCodeFlow
        bare
        purpose="enroll"
        sendLabel="Send code"
        doneNode={done}
        onVerified={setEnrolledAs}
      />
    </section>
  );
}
