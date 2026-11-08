'use client';
// /affected/account: masked email, devices, sign out, delete account.
// Deleting an account keeps verifications and reports (CONTRACTS section 5.3).
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  idToString,
  timestampToMs,
  useAccount,
  useAuthStatus,
  useDeleteAccount,
  useDevices,
  useMyVerifications,
  useRemoveDevice,
  useSetDeviceLabel,
  useSignOutDevice,
  type DeviceRow,
} from '@/lib/stdb';
import { AppShell } from '@/components/chrome/AppShell';
import { ACCOUNTS_OFF_TEXT, DEMO_IDENTITY_LABEL } from '../_account/copy';
import {
  amberNotice,
  btnDanger,
  btnPrimary,
  btnSecondary,
  card,
  errorText,
  h1,
  hint,
  input,
  kicker,
  label,
  linkText,
  pillGreen,
  subtitle,
} from '../_account/ui';

const FAIL_TEXT = "That didn't work. Please try again.";

function DeviceItem({ d }: { d: DeviceRow }) {
  const rename = useSetDeviceLabel();
  const remove = useRemoveDevice();
  const [mode, setMode] = useState<'view' | 'rename' | 'confirm-remove'>('view');
  const [name, setName] = useState(d.label);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'rename') nameRef.current?.focus();
  }, [mode]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setMode('view');
    } catch {
      setError(FAIL_TEXT);
    } finally {
      setBusy(false);
    }
  }

  function saveName(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      setError('Use 1 to 40 characters.');
      return;
    }
    void run(() => rename(trimmed));
  }

  return (
    <li className="space-y-2 rounded-xl border border-slate-200 px-3 py-3">
      {mode === 'rename' ? (
        <form className="space-y-2" onSubmit={saveName}>
          <label className={label} htmlFor="device-label">
            Device name
          </label>
          <input
            id="device-label"
            className={input}
            value={name}
            maxLength={40}
            ref={nameRef}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="submit" className={btnPrimary} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={busy}
              onClick={() => setMode('view')}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-[13px] font-bold text-slate-900">{d.label}</p>
            {d.isCurrent ? <span className={pillGreen}>This device</span> : null}
          </div>
          <p className={hint}>Last seen {new Date(timestampToMs(d.lastSeenAt)).toLocaleString()}</p>
          {mode === 'confirm-remove' ? (
            <div className="space-y-2">
              <p className="text-[12px] text-slate-700">
                Remove this device? It will need to sign in again.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={btnDanger}
                  disabled={busy}
                  onClick={() => void run(() => remove(d.identityHex))}
                >
                  {busy ? 'Removing…' : 'Remove'}
                </button>
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={busy}
                  onClick={() => setMode('view')}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : d.isCurrent ? (
            <button
              type="button"
              className={linkText}
              onClick={() => {
                setName(d.label);
                setError(null);
                setMode('rename');
              }}
            >
              Rename
            </button>
          ) : (
            <button type="button" className={linkText} onClick={() => setMode('confirm-remove')}>
              Remove device
            </button>
          )}
        </>
      )}
      {error ? (
        <p role="alert" className={errorText}>
          {error}
        </p>
      ) : null}
    </li>
  );
}

export default function AffectedAccountPage() {
  const router = useRouter();
  const { mode, ready: authReady } = useAuthStatus();
  const { account, ready: accountReady } = useAccount();
  const { devices } = useDevices();
  const [verifs] = useMyVerifications();
  const signOut = useSignOutDevice();
  const deleteAccount = useDeleteAccount();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<'out' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const homeId = useMemo(() => verifs.find((v) => v.state === 'verified')?.propertyId, [verifs]);

  async function leave(kind: 'out' | 'delete') {
    setBusy(kind);
    setError(null);
    try {
      await (kind === 'out' ? signOut() : deleteAccount());
      router.replace('/affected/start');
    } catch {
      setError(FAIL_TEXT);
      setBusy(null);
    }
  }

  if (!authReady || !accountReady) {
    return (
      <AppShell>
        <p className="text-sm text-slate-600">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {homeId !== undefined ? (
        <Link
          href={`/affected/property/${idToString(homeId)}`}
          className="text-[12px] font-bold text-blue-700 underline"
        >
          ← Your home
        </Link>
      ) : null}
      <header>
        <p className={kicker}>Affected</p>
        <h1 className={h1}>Your account</h1>
        {account ? (
          <p className={subtitle}>
            Signed in with <strong>{account.emailMasked}</strong>
          </p>
        ) : null}
      </header>

      {mode === 'off' ? (
        <p role="status" className={amberNotice}>
          {ACCOUNTS_OFF_TEXT}
        </p>
      ) : !account ? (
        <section className={card}>
          <p className="text-[13px] font-bold text-slate-900">No account on this device.</p>
          <p className="text-[12px] text-slate-500">
            Sign in if you already added an email, or verify your home to get started.
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
      ) : (
        <>
          <section aria-labelledby="devices-title" className={card}>
            <h2 id="devices-title" className="text-[13px] font-bold text-slate-900">
              Your devices
            </h2>
            <ul className="space-y-2">
              {devices.map((d) => (
                <DeviceItem key={d.identityHex} d={d} />
              ))}
            </ul>
          </section>

          <section aria-labelledby="signout-title" className={card}>
            <h2 id="signout-title" className="text-[13px] font-bold text-slate-900">
              Sign out
            </h2>
            <p className="text-[12px] text-slate-500">
              This device will no longer be linked to your account. You can sign in again with your
              email.
            </p>
            <button
              type="button"
              className={btnSecondary}
              disabled={busy !== null}
              onClick={() => void leave('out')}
            >
              {busy === 'out' ? 'Signing out…' : 'Sign out of this device'}
            </button>
          </section>

          <section
            aria-labelledby="delete-title"
            className="space-y-3 rounded-2xl border border-red-200 bg-white p-4"
          >
            <h2 id="delete-title" className="text-[13px] font-bold text-red-800">
              Delete account
            </h2>
            {confirmDelete ? (
              <div className="space-y-2">
                <p className="text-[12px] text-slate-700">
                  This deletes your account and unlinks every device. Your reports and your home
                  verification stay. You can add an email again later.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={btnDanger}
                    disabled={busy !== null}
                    onClick={() => void leave('delete')}
                  >
                    {busy === 'delete' ? 'Deleting…' : 'Delete account'}
                  </button>
                  <button
                    type="button"
                    className={btnSecondary}
                    disabled={busy !== null}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-[12px] text-slate-500">
                  Removes your email and all linked devices. Your reports and home verification
                  stay.
                </p>
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete account
                </button>
              </>
            )}
          </section>

          {error ? (
            <p role="alert" className={errorText}>
              {error}
            </p>
          ) : null}
          <p className={hint}>{DEMO_IDENTITY_LABEL}</p>
        </>
      )}
    </AppShell>
  );
}
