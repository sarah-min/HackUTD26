'use client';
// /affected/account: account dates, devices, replace recovery code, sign out, delete account.
// Deleting an account keeps verifications and reports (CONTRACTS section 5.3).
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  idToString,
  timestampToMs,
  useAccount,
  useAccountStatus,
  useDeleteAccount,
  useDevices,
  useMyVerifications,
  useRemoveDevice,
  useReplaceRecoveryCode,
  useSetDeviceLabel,
  useSignOutDevice,
  useStdb,
  useStepUpWithCode,
  type DeviceRow,
} from '@/lib/stdb';
import { generateRecoveryCode, isRecoveryCodeShape } from '@/lib/stdb/recoveryCode';
import { AppShell } from '@/components/chrome/AppShell';
import { CodeEntryForm } from '../_account/CodeEntryForm';
import { CodeField } from '../_account/CodeField';
import { FailureNotice, useFailure } from '../_account/Failure';
import { RecoveryCodeBox } from '../_account/RecoveryCodeBox';
import {
  ACCOUNTS_OFF_TEXT,
  DEMO_IDENTITY_LABEL,
  failureText,
  needsFreshCode,
} from '../_account/copy';
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes('stepup_required')
          ? 'This needs a recent code check. Sign out, sign in again with your recovery code, then try again.'
          : FAIL_TEXT,
      );
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

/** Rotate the recovery code: current code in, a fresh generated code out. The old code stops working at once. */
function ReplaceCodeSection() {
  const { isActive } = useStdb();
  const replace = useReplaceRecoveryCode();
  const [open, setOpen] = useState(false);
  const [oldCode, setOldCode] = useState('');
  const [newCode, setNewCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const failure = useFailure();
  const oldRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (open) oldRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  function begin() {
    setDone(false);
    setOldCode('');
    setSaved(false);
    failure.clear();
    setNewCode(generateRecoveryCode());
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setOldCode('');
    setNewCode(null);
    setSaved(false);
    failure.clear();
  }

  const ready = isRecoveryCodeShape(oldCode) && newCode !== null && saved;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy || failure.locked || newCode === null) return;
    setBusy(true);
    failure.clear();
    try {
      const r = await replace(oldCode, newCode);
      if (r.ok) {
        setOldCode('');
        setNewCode(null);
        setSaved(false);
        setOpen(false);
        setDone(true);
        return;
      }
      if (needsFreshCode(r.error)) {
        setNewCode(generateRecoveryCode());
        setSaved(false);
        failure.text(failureText(r));
      } else {
        failure.fail(r);
        oldRef.current?.focus();
      }
    } catch {
      failure.network();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="replace-title" className={card}>
      <h2 id="replace-title" className="text-[13px] font-bold text-slate-900">
        Replace recovery code
      </h2>
      {done ? (
        <p
          ref={doneRef}
          tabIndex={-1}
          role="status"
          className="text-[12px] font-semibold text-slate-900 outline-none"
        >
          Recovery code replaced. Your old code no longer works. Your other devices stay signed in.
        </p>
      ) : null}
      {open && newCode ? (
        <form className="space-y-3" onSubmit={(e) => void submit(e)} noValidate>
          <CodeField
            id="replace-old"
            text="Current recovery code"
            value={oldCode}
            onChange={setOldCode}
            inputRef={oldRef}
            disabled={failure.locked}
            invalid={failure.locked || failure.message !== null}
            describedBy={failure.locked || failure.message !== null ? 'replace-err' : undefined}
          />
          <div className="space-y-2">
            <p className="text-[12px] font-semibold text-slate-700">Your new recovery code</p>
            <RecoveryCodeBox
              code={newCode}
              saved={saved}
              onSavedChange={setSaved}
              idPrefix="replace"
              checkboxText="I saved my new recovery code"
            />
          </div>
          <FailureNotice f={failure} id="replace-err" />
          <div className="flex gap-2">
            <button
              type="submit"
              className={btnPrimary}
              disabled={!ready || busy || failure.locked || !isActive}
            >
              {busy ? 'Replacing…' : 'Replace recovery code'}
            </button>
            <button type="button" className={btnSecondary} disabled={busy} onClick={close}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="text-[12px] text-slate-500">
            Make a new recovery code if you lost track of the old one or think someone saw it. The
            old code stops working right away. Your other devices stay signed in.
          </p>
          <button type="button" className={btnSecondary} onClick={begin}>
            Replace recovery code
          </button>
        </>
      )}
    </section>
  );
}

export default function AffectedAccountPage() {
  const router = useRouter();
  const { enabled, ready: statusReady } = useAccountStatus();
  const { account, ready: accountReady } = useAccount();
  const { devices } = useDevices();
  const [verifs] = useMyVerifications();
  const signOut = useSignOutDevice();
  const deleteAccount = useDeleteAccount();
  const stepUp = useStepUpWithCode();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [needStepup, setNeedStepup] = useState(false);
  const [busy, setBusy] = useState<'out' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const homeId = useMemo(() => verifs.find((v) => v.state === 'verified')?.propertyId, [verifs]);

  async function leave(kind: 'out' | 'delete') {
    setBusy(kind);
    setError(null);
    try {
      await (kind === 'out' ? signOut() : deleteAccount());
      router.replace('/affected/start');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (kind === 'delete' && msg.includes('stepup_required')) setNeedStepup(true);
      else setError(FAIL_TEXT);
      setBusy(null);
    }
  }

  if (!statusReady || !accountReady) {
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
            Created {new Date(timestampToMs(account.createdAt)).toLocaleDateString()}. Last sign-in{' '}
            {new Date(timestampToMs(account.lastLoginAt)).toLocaleString()}.
          </p>
        ) : null}
      </header>

      {!account && !enabled ? (
        <p role="status" className={amberNotice}>
          {ACCOUNTS_OFF_TEXT}
        </p>
      ) : !account ? (
        <section className={card}>
          <p className="text-[13px] font-bold text-slate-900">No account on this device.</p>
          <p className="text-[12px] text-slate-500">
            Sign in with your recovery code if you already made an account, or verify your home to
            get started.
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

          <ReplaceCodeSection />

          <section aria-labelledby="signout-title" className={card}>
            <h2 id="signout-title" className="text-[13px] font-bold text-slate-900">
              Sign out
            </h2>
            <p className="text-[12px] text-slate-500">
              This device will no longer be linked to your account. You can sign in again with your
              recovery code.
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
            {needStepup ? (
              <div className="space-y-2">
                <p className="text-[12px] text-slate-700">
                  Enter your recovery code to confirm it is you. Then your account is deleted.
                </p>
                <CodeEntryForm
                  idPrefix="delete-stepup"
                  submitLabel="Confirm and delete"
                  busyLabel="Checking…"
                  focusOnMount
                  showDemoLabel={false}
                  onSubmit={stepUp}
                  onSuccess={() => {
                    setNeedStepup(false);
                    void leave('delete');
                  }}
                >
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => {
                      setNeedStepup(false);
                      setConfirmDelete(false);
                    }}
                  >
                    Cancel
                  </button>
                </CodeEntryForm>
              </div>
            ) : confirmDelete ? (
              <div className="space-y-2">
                <p className="text-[12px] text-slate-700">
                  This deletes your account and unlinks every device. Your reports and your home
                  verification stay. You can create a new account later.
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
                  Removes your recovery code and all linked devices. Your reports and home
                  verification stay.
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
        </>
      )}
      <p className={hint}>{DEMO_IDENTITY_LABEL}</p>
    </AppShell>
  );
}
