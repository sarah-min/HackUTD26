'use client';
// /affected/signin: get back into your reports on a new device with an email code.
// Unknown emails get a decoy challenge on the server, so nothing here says whether an email exists.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount, useAuthStatus } from '@/lib/stdb';
import { AppShell } from '@/components/chrome/AppShell';
import { EmailCodeFlow } from '../_account/EmailCodeFlow';
import { VerifiedProperties } from '../_account/VerifiedProperties';
import { ACCOUNTS_OFF_TEXT } from '../_account/copy';
import { amberNotice, h1, kicker, subtitle } from '../_account/ui';

export default function AffectedSigninPage() {
  const { mode, ready } = useAuthStatus();
  const { account, ready: accountReady } = useAccount();
  const [justSignedIn, setJustSignedIn] = useState(false);
  // Only open a property automatically after a sign-in made on this page, not on a plain visit.
  const [startedSignedOut, setStartedSignedOut] = useState<boolean | null>(null);
  useEffect(() => {
    if (ready && accountReady && startedSignedOut === null) setStartedSignedOut(!account);
  }, [ready, accountReady, account, startedSignedOut]);

  return (
    <AppShell>
      <header>
        <p className={kicker}>Affected</p>
        <h1 className={h1}>Sign in on this device</h1>
        {account || justSignedIn ? null : (
          <p className={subtitle}>
            Already verified your home? Enter your email and we send a 6-digit code. No password
            needed.
          </p>
        )}
      </header>

      {!ready || !accountReady ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : mode === 'off' ? (
        <p role="status" className={amberNotice}>
          {ACCOUNTS_OFF_TEXT}
        </p>
      ) : account || justSignedIn ? (
        <>
          <p role="status" className="text-[12px] text-slate-500">
            {account ? (
              <>
                Signed in as <strong>{account.emailMasked}</strong>.{' '}
                <Link href="/affected/account" className="font-bold text-blue-700 underline">
                  Manage your account
                </Link>
              </>
            ) : (
              'Signed in.'
            )}
          </p>
          <VerifiedProperties autoOpen={startedSignedOut === true} />
        </>
      ) : (
        <>
          <EmailCodeFlow
            purpose="signin"
            sendLabel="Send code"
            emailHelp="Use the email you added when you secured your account."
            doneNode={
              <p role="status" className="text-[13px] font-bold text-slate-900">
                Signed in.
              </p>
            }
            onVerified={() => setJustSignedIn(true)}
          />
          <p className="text-center text-[12px] text-slate-500">
            New here?{' '}
            <Link href="/affected/start" className="font-bold text-blue-700 underline">
              I&apos;ve been affected
            </Link>
          </p>
        </>
      )}
    </AppShell>
  );
}
