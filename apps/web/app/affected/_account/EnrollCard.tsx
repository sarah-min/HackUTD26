'use client';
// "Create your recovery code" card for a verified owner with no account yet. Skippable:
// step-up is off by default, so nothing is blocked if they skip.
import { useEffect, useState } from 'react';
import { useAccount, useAccountStatus, useStepup } from '@/lib/stdb';
import { readLocal, writeLocal } from '@/lib/stdb/storage';
import { EnrollFlow } from './EnrollFlow';
import { card } from './ui';

const DISMISS_KEY = 'affected:enrollDismissed';

/** Render only where the visitor is a verified owner (the property page does). */
export function EnrollCard() {
  const { enabled, ready: statusReady } = useAccountStatus();
  const { account, ready: accountReady } = useAccount();
  const step = useStepup();
  const [dismissed, setDismissed] = useState(true);
  const [created, setCreated] = useState(false);
  const [latched, setLatched] = useState(false);

  useEffect(() => {
    setDismissed(readLocal(DISMISS_KEY) === '1');
  }, []);

  // The account row can arrive before the create call returns; latch so the done state survives.
  // When step-up is required the gate already shows the same prompt; avoid two of them.
  const gateShown = step.required && !step.active;
  const eligible =
    statusReady && accountReady && step.ready && enabled && !account && !dismissed && !gateShown;
  useEffect(() => {
    if (eligible) setLatched(true);
  }, [eligible]);

  if (dismissed && !created) return null;
  if (!eligible && !latched) return null;

  return (
    <section aria-labelledby="enroll-title" className={card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Account</p>
          <h2 id="enroll-title" className="mt-0.5 text-[15px] font-bold text-slate-950">
            Create your recovery code
          </h2>
        </div>
        {!created ? (
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
      {!created ? (
        <p className="text-[12px] text-slate-500">
          Save this code to get back to your reports on a new phone.
        </p>
      ) : null}
      <EnrollFlow idPrefix="enroll" onCreated={() => setCreated(true)} />
    </section>
  );
}
