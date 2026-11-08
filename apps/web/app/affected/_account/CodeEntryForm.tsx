'use client';
// "Enter your recovery code" form shared by sign-in, step-up and the delete-account confirmation.
// Submit stays disabled until the input has the right shape (a malformed code never reaches the module,
// so it spends no attempt). The module always answers a wrong code the same way.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useStdb, type AccountCodeResult } from '@/lib/stdb';
import { isRecoveryCodeShape } from '@/lib/stdb/recoveryCode';
import { CodeField } from './CodeField';
import { FailureNotice, useFailure } from './Failure';
import { DEMO_IDENTITY_LABEL } from './copy';
import { btnPrimary, hint } from './ui';

export function CodeEntryForm({
  idPrefix,
  submitLabel,
  busyLabel = 'Checking…',
  onSubmit,
  onSuccess,
  focusOnMount = false,
  help,
  children,
  showDemoLabel = true,
}: {
  idPrefix: string;
  submitLabel: string;
  busyLabel?: string;
  onSubmit: (code: string) => Promise<AccountCodeResult>;
  /** Called after an accepted code. The typed code is already cleared from state. */
  onSuccess: () => void;
  focusOnMount?: boolean;
  help?: string;
  /** Extra controls under the button (links). */
  children?: ReactNode;
  showDemoLabel?: boolean;
}) {
  const { isActive } = useStdb();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const failure = useFailure();
  const ref = useRef<HTMLInputElement>(null);
  const errId = `${idPrefix}-err`;

  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);

  const valid = isRecoveryCodeShape(value);
  const hasError = failure.locked || failure.message !== null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy || failure.locked) return;
    setBusy(true);
    failure.clear();
    try {
      const r = await onSubmit(value);
      if (r.ok) {
        setValue('');
        onSuccess();
        return;
      }
      failure.fail(r);
      ref.current?.focus();
      ref.current?.select();
    } catch {
      failure.network();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)} noValidate>
      <CodeField
        id={`${idPrefix}-code`}
        value={value}
        onChange={setValue}
        inputRef={ref}
        help={help}
        disabled={failure.locked}
        invalid={hasError}
        describedBy={hasError ? errId : undefined}
      />
      <FailureNotice f={failure} id={errId} />
      <button
        type="submit"
        className={btnPrimary}
        disabled={!valid || busy || failure.locked || !isActive}
      >
        {!isActive ? 'Connecting…' : busy ? busyLabel : submitLabel}
      </button>
      {children}
      {showDemoLabel ? <p className={hint}>{DEMO_IDENTITY_LABEL}</p> : null}
    </form>
  );
}
