'use client';
// One input for a recovery code. Accepts any grouping or case; a paste is cleaned (extra text around
// the code, such as the downloaded file's instruction line, is dropped). The value lives only in the
// parent's component state: no storage, no URL, no logging.
import type { ClipboardEvent, Ref } from 'react';
import { cleanPaste } from './cleanPaste';
import { hint, input, label } from './ui';

export function CodeField({
  id,
  text = 'Recovery code',
  value,
  onChange,
  disabled,
  describedBy,
  invalid,
  inputRef,
  help,
}: {
  id: string;
  text?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  describedBy?: string;
  invalid?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  help?: string;
}) {
  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;
    e.preventDefault();
    onChange(cleanPaste(pasted));
  }
  return (
    <div className="space-y-2">
      <label className={label} htmlFor={id}>
        {text}
      </label>
      <input
        id={id}
        ref={inputRef}
        className={`${input} font-mono tracking-wider`}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
        maxLength={48}
        value={value}
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={
          [help ? `${id}-help` : null, describedBy].filter(Boolean).join(' ') || undefined
        }
        onChange={(e) => onChange(e.target.value)}
        onPaste={onPaste}
      />
      {help ? (
        <p id={`${id}-help`} className={hint}>
          {help}
        </p>
      ) : null}
    </div>
  );
}
