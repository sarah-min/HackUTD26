'use client';
// Shows a freshly generated recovery code once, with Copy and Download, the "we cannot recover it"
// warning and the required "I saved my recovery code" checkbox. The code is only ever component state:
// never storage, a URL or a log.
import { useEffect, useRef, useState } from 'react';
import { DOWNLOAD_NAME, LOSS_WARNING, downloadText } from './copy';
import { amberNotice, btnSecondary, hint } from './ui';

export function RecoveryCodeBox({
  code,
  saved,
  onSavedChange,
  idPrefix,
  checkboxText = 'I saved my recovery code',
}: {
  code: string;
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
  idPrefix: string;
  checkboxText?: string;
}) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function flash(v: 'yes' | 'no') {
    setCopied(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 2500);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      flash('yes');
    } catch {
      flash('no');
    }
  }

  function download() {
    const blob = new Blob([downloadText(code)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = DOWNLOAD_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const groups = code.split('-');
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4">
        <p className={`${hint} mb-1.5`} id={`${idPrefix}-code-label`}>
          Your recovery code
        </p>
        <p
          aria-labelledby={`${idPrefix}-code-label`}
          className="flex select-all flex-wrap font-mono text-base font-bold tracking-[0.06em] text-slate-950 sm:text-xl"
        >
          {groups.map((g, i) => (
            <span key={i} className="whitespace-nowrap">
              {g}
              {i < groups.length - 1 ? '-' : ''}
            </span>
          ))}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnSecondary} onClick={() => void copy()}>
          {copied === 'yes' ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className={btnSecondary} onClick={download}>
          Download .txt
        </button>
        <span role="status" className={hint}>
          {copied === 'no' ? 'Copy did not work. Select the code and copy it by hand.' : ''}
        </span>
      </div>
      <p className={amberNotice}>{LOSS_WARNING}</p>
      <label
        htmlFor={`${idPrefix}-saved`}
        className="flex items-center gap-2.5 text-[13px] font-semibold text-slate-800"
      >
        <input
          id={`${idPrefix}-saved`}
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-blue-700"
          checked={saved}
          onChange={(e) => onSavedChange(e.target.checked)}
        />
        {checkboxText}
      </label>
    </div>
  );
}
