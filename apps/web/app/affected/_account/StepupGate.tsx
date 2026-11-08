'use client';
// Wraps full-report content. When the module requires step-up and this device has none,
// shows the email + code prompt instead of the content. Otherwise renders children untouched.
import Link from 'next/link';
import { useAuthStatus, useMyVerifications, useStepup } from '@/lib/stdb';
import { EmailCodeFlow } from './EmailCodeFlow';
import { btnPrimary, card } from './ui';

export function StepupGate({ children }: { children: React.ReactNode }) {
  const { mode, ready: authReady } = useAuthStatus();
  const step = useStepup();
  const [verifs, verifsReady] = useMyVerifications();

  if (!authReady || !step.ready || !verifsReady) {
    return <p className="text-sm text-slate-600">Loading…</p>;
  }
  if (mode === 'off' || !step.required || step.active) return <>{children}</>;

  const hasVerified = verifs.some((v) => v.state === 'verified');

  if (!step.linked && !hasVerified) {
    return (
      <section className={card}>
        <h2 className="text-[15px] font-bold text-slate-950">Sign in to see this</h2>
        <p className="text-[12px] text-slate-500">
          Full reports are only shown to the verified resident. Sign in on this device or verify
          your home.
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

  const stepup = step.linked;
  return (
    <section aria-labelledby="stepup-title" className={card}>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Account</p>
        <h2 id="stepup-title" className="mt-0.5 text-[15px] font-bold text-slate-950">
          {stepup ? "Confirm it's you" : 'Secure your account to continue'}
        </h2>
      </div>
      <p className="text-[12px] text-slate-500">
        {stepup
          ? 'To protect your privacy, confirm your email before the full report opens. Enter the email on your account and we send a 6-digit code. It stays unlocked for 15 minutes.'
          : 'To protect your privacy, the full report needs a confirmed email. Add yours now. We send a 6-digit code, no password needed.'}
      </p>
      <EmailCodeFlow
        bare
        purpose={stepup ? 'stepup' : 'enroll'}
        sendLabel="Send code"
        doneNode={
          <p role="status" className="text-[13px] font-bold text-slate-900">
            Confirmed. Opening your report…
          </p>
        }
      />
    </section>
  );
}
