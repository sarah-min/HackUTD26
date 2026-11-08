'use client';
// /affected/signin: get back into your reports on a new device with your recovery code.
// Every wrong code gets the same answer, so nothing here says whether a code or account exists.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount, useAccountStatus, useSignInWithCode } from '@/lib/stdb';
import { AppShell } from '@/components/chrome/AppShell';
import { CodeEntryForm } from '../_account/CodeEntryForm';
import { VerifiedProperties } from '../_account/VerifiedProperties';
import { ACCOUNTS_OFF_TEXT } from '../_account/copy';
import { amberNotice, card, h1, hint, kicker, subtitle } from '../_account/ui';

export default function AffectedSigninPage() {
  const { enabled, ready } = useAccountStatus();
  const { account, ready: accountReady } = useAccount();
  const signIn = useSignInWithCode();
  const [justSignedIn, setJustSignedIn] = useState(false);
  // Only open a property automatically after a sign-in made on this page, not on a plain visit.
  const [startedSignedOut, setStartedSignedOut] = useState<boolean | null>(null);
  useEffect(() => {
    if (ready && accountReady && startedSignedOut === null) setStartedSignedOut(!account);
  }, [ready, accountReady, account, startedSignedOut]);

  const signedIn = account !== null || justSignedIn;

  return (
    <AppShell>
      <header>
        <p className={kicker}>Affected</p>
        <h1 className={h1}>Sign in on this device</h1>
        {signedIn || !enabled ? null : (
          <p className={subtitle}>
            Enter the recovery code you saved when you created your account.
          </p>
        )}
      </header>

      {!ready || !accountReady ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : signedIn ? (
        <>
          <p role="status" className="text-[12px] text-slate-500">
            Signed in on this device.{' '}
            <Link href="/affected/account" className="font-bold text-blue-700 underline">
              Manage your account
            </Link>
          </p>
          <VerifiedProperties autoOpen={startedSignedOut === true} />
        </>
      ) : !enabled ? (
        <p role="status" className={amberNotice}>
          {ACCOUNTS_OFF_TEXT}
        </p>
      ) : (
        <>
          <section className={card}>
            <CodeEntryForm
              idPrefix="signin"
              submitLabel="Sign in"
              busyLabel="Signing in…"
              focusOnMount
              onSubmit={signIn}
              onSuccess={() => setJustSignedIn(true)}
              help="Any spacing or capitals work. Paste it if you copied it."
            />
            <p className={hint}>Lost your code? You will need to verify your home again.</p>
          </section>
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
