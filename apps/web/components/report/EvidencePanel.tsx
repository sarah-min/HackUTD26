'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useReporterEvidence, validateEvidence } from './useReporterEvidence';

/** Re-attach evidence for draft / needs_more_footage / failed reports. */
export function EvidencePanel({
  reportId,
  onDone,
}: {
  reportId: bigint;
  onDone?: () => void;
}) {
  const { uploadAttachSubmit } = useReporterEvidence();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [frac, setFrac] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const list = [...(e.target.files ?? [])];
    setFiles(list);
    const v = validateEvidence(list);
    setError(v && list.length > 0 ? v : null);
  }

  async function submit() {
    setError(null);
    const v = validateEvidence(files);
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);
    try {
      await uploadAttachSubmit(reportId, files, (l, f) => {
        setLabel(l);
        setFrac(f);
      });
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Photos</p>
      <h2 className="mt-1 text-[15px] font-bold text-slate-950">Add photos or a video</h2>
      <p className="mt-1 text-[12px] text-slate-500">
        We need at least one to start the review. Add one video or up to 8 photos.
      </p>
      <input
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
        className="sr-only"
        disabled={busy}
        multiple
        onChange={onPick}
        ref={input}
        type="file"
      />
      <button
        className="mt-3 w-full rounded-xl border border-dashed border-blue-300 bg-blue-50/60 px-3 py-3 text-left text-[13px] font-semibold text-slate-800 disabled:opacity-60"
        disabled={busy}
        onClick={() => input.current?.click()}
        type="button"
      >
        {files.length === 0
          ? 'Choose photos or a video'
          : files.length === 1
            ? files[0]!.name
            : `${files.length} files selected`}
      </button>
      {busy ? (
        <div className="mt-3 text-[12px] text-blue-900">
          <p className="font-semibold">{label}</p>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-blue-100">
            <span
              className="block h-full rounded-full bg-blue-600"
              style={{ width: `${Math.round(frac * 100)}%` }}
            />
          </span>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-[12px] font-semibold text-red-700">{error}</p> : null}
      <button
        className="mt-3 w-full rounded-xl bg-blue-700 px-4 py-3 text-[13px] font-bold text-white disabled:opacity-60"
        disabled={busy || files.length === 0}
        onClick={() => void submit()}
        type="button"
      >
        {busy ? 'Uploading…' : 'Upload and start review'}
      </button>
    </section>
  );
}
