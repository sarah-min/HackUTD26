'use client';
// Email + 6-digit code flow shared by enroll, sign-in and step-up (CONTRACTS section 5.3).
// Request and verify never throw for expected failures; they return { ok, error, ... }.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  timestampToMs,
  useAuthStatus,
  useDemoCode,
  useEmailChallenge,
  useRequestEmailCode,
  useStdb,
  useVerifyEmailCode,
} from '@/lib/stdb';
import {
  CODE_LENGTH,
  CODE_TTL_MS,
  DEMO_CODE_LABEL,
  DEMO_IDENTITY_LABEL,
  NETWORK_ERROR_TEXT,
  RESEND_COOLDOWN_MS,
  formatCountdown,
  maskEmail,
  requestErrorText,
  verifyErrorText,
  type AccountPurpose,
} from './copy';
import {
  amberNotice,
  blueNotice,
  btnPrimary,
  btnSecondary,
  card,
  errorText,
  hint,
  input,
  label,
  linkText,
} from './ui';

type Phase = 'email' | 'code' | 'done';

export function EmailCodeFlow({
  purpose,
  sendLabel = 'Send code',
  emailHelp,
  doneNode,
  onVerified,
  bare = false,
}: {
  purpose: AccountPurpose;
  sendLabel?: string;
  /** Short line under the email field. */
  emailHelp?: string;
  /** Rendered in place of the form once the code is accepted. */
  doneNode?: ReactNode;
  onVerified?: (maskedEmail: string) => void;
  /** Skip the white card wrapper (the parent already provides one). */
  bare?: boolean;
}) {
  const { isActive } = useStdb();
  const { mode } = useAuthStatus();
  const { challenge } = useEmailChallenge();
  const { demoCode } = useDemoCode();
  const requestCode = useRequestEmailCode();
  const verifyCode = useVerifyEmailCode();

  const [phase, setPhase] = useState<Phase>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<'request' | 'verify' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [fallbackExpiry, setFallbackExpiry] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // One-second clock, only while a code is pending.
  useEffect(() => {
    if (phase !== 'code') return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase === 'code') codeRef.current?.focus();
  }, [phase]);

  const live = challenge && challengeId !== null && challenge.id === challengeId ? challenge : null;
  const expiresAtMs = live ? timestampToMs(live.expiresAt) : fallbackExpiry;
  const remaining = expiresAtMs - now;
  const expired = phase === 'code' && remaining <= 0;
  const attemptsLeft = live ? live.attemptsLeft : (attempts ?? 5);
  const shownDemoCode =
    demoCode && challengeId !== null && demoCode.challengeId === challengeId ? demoCode.code : null;
  const sendFailed = mode === 'brevo' && live?.deliveryState === 'failed';
  const resendWait = Math.max(0, resendAt - now);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const typed = email.trim();
    if (!typed) {
      setError(requestErrorText('invalid_email'));
      emailRef.current?.focus();
      return;
    }
    setBusy('request');
    setError(null);
    try {
      const r = await requestCode(typed, purpose);
      if (!r.ok) {
        if (r.error === 'cooldown') setResendAt(Date.now() + Math.max(1, r.retryAfterS) * 1000);
        setError(requestErrorText(r.error));
        return;
      }
      setChallengeId(r.challengeId);
      setPhase('code');
      setCode('');
      setAttempts(null);
      setLocked(false);
      setFallbackExpiry(Date.now() + CODE_TTL_MS);
      setResendAt(Date.now() + RESEND_COOLDOWN_MS);
    } catch {
      setError(NETWORK_ERROR_TEXT);
    } finally {
      setBusy(null);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (challengeId === null) return;
    if (code.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code.`);
      codeRef.current?.focus();
      return;
    }
    setBusy('verify');
    setError(null);
    try {
      const r = await verifyCode(challengeId, code);
      if (r.ok) {
        const masked = maskEmail(email);
        setPhase('done');
        setEmail('');
        setCode('');
        onVerified?.(masked);
        return;
      }
      if (r.error === 'invalid_code') setAttempts(r.attemptsLeft);
      if (r.error === 'locked') setLocked(true);
      setError(verifyErrorText(r.error, purpose));
      setCode('');
      codeRef.current?.focus();
    } catch {
      setError(NETWORK_ERROR_TEXT);
    } finally {
      setBusy(null);
    }
  }

  function changeEmail() {
    setPhase('email');
    setCode('');
    setError(null);
    setLocked(false);
    window.setTimeout(() => emailRef.current?.focus(), 0);
  }

  const wrap = (children: ReactNode) =>
    bare ? <div className="space-y-3">{children}</div> : <div className={card}>{children}</div>;

  if (phase === 'done')
    return (
      <>{doneNode ?? <p className="text-[13px] font-bold text-slate-900">Code accepted.</p>}</>
    );

  const demoNotice =
    mode === 'demo' ? (
      <p className={amberNotice}>
        <strong>{DEMO_CODE_LABEL}</strong>
      </p>
    ) : null;

  if (phase === 'email') {
    return wrap(
      <form className="space-y-3" onSubmit={(e) => void send(e)} noValidate>
        {demoNotice}
        <div className="space-y-2">
          <label className={label} htmlFor={`email-${purpose}`}>
            Email address
          </label>
          <input
            id={`email-${purpose}`}
            ref={emailRef}
            className={input}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="you@example.com"
            value={email}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `err-${purpose}` : undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
          {emailHelp ? <p className={hint}>{emailHelp}</p> : null}
        </div>
        {error ? (
          <p id={`err-${purpose}`} role="alert" className={errorText}>
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className={btnPrimary}
          disabled={busy !== null || !isActive || mode === 'off'}
        >
          {!isActive ? 'Connecting…' : busy === 'request' ? 'Sending…' : sendLabel}
        </button>
        <p className={hint}>{DEMO_IDENTITY_LABEL}</p>
      </form>,
    );
  }

  return wrap(
    <form className="space-y-3" onSubmit={(e) => void verify(e)} noValidate>
      {mode === 'demo' ? (
        <div className={amberNotice} aria-live="polite">
          <p>
            <strong>{DEMO_CODE_LABEL}</strong>
          </p>
          <p
            className="mt-1 font-mono text-xl font-bold tracking-[0.3em] text-amber-950"
            aria-label="Your demo code"
          >
            {shownDemoCode ?? '······'}
          </p>
        </div>
      ) : (
        <p className={blueNotice}>
          We emailed a code to <strong>{maskEmail(email)}</strong>. It can take a minute to arrive.
        </p>
      )}
      {sendFailed ? (
        <p role="alert" className={errorText}>
          We couldn&apos;t send the email. Check the address and use Resend.
        </p>
      ) : null}

      <div className="space-y-2">
        <label className={label} htmlFor={`code-${purpose}`}>
          {CODE_LENGTH}-digit code
        </label>
        <input
          id={`code-${purpose}`}
          ref={codeRef}
          className={`${input} text-center font-mono text-lg tracking-[0.4em]`}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          placeholder="000000"
          value={code}
          disabled={locked}
          aria-invalid={error ? true : undefined}
          aria-describedby={`code-info-${purpose}${error ? ` err-${purpose}` : ''}`}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        />
        <p id={`code-info-${purpose}`} className={hint}>
          {expired
            ? 'This code has expired. Request a new one.'
            : `Expires in ${formatCountdown(remaining)}.${locked ? '' : ` ${attemptsLeft} ${attemptsLeft === 1 ? 'attempt' : 'attempts'} left.`}`}
        </p>
      </div>

      {error ? (
        <p id={`err-${purpose}`} role="alert" className={errorText}>
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className={btnPrimary}
        disabled={busy !== null || locked || expired || code.length !== CODE_LENGTH}
      >
        {busy === 'verify' ? 'Checking…' : 'Verify code'}
      </button>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className={btnSecondary}
          disabled={busy !== null || resendWait > 0 || locked || !isActive}
          onClick={() => void send()}
        >
          {busy === 'request'
            ? 'Sending…'
            : resendWait > 0
              ? `Resend in ${Math.ceil(resendWait / 1000)}s`
              : 'Resend code'}
        </button>
        <button type="button" className={linkText} onClick={changeEmail}>
          Use a different email
        </button>
      </div>
      <p className={hint}>{DEMO_IDENTITY_LABEL}</p>
    </form>,
  );
}
