'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { DamageAssessmentSchema, FrameFindingSchema, type DamageAssessment, type FrameFinding } from '@hack/contracts/assessment';
import { type DamageLevel } from '@hack/contracts/common';
import { HazardList } from '@/components/safety';
import { formatCents } from '@/lib/format';
import { useMediaUrl, type MediaUrlResolver } from './useMediaUrl';

export interface FrameRowLike {
  frameIndex: number | bigint;
  tSec: number;
  thumbKey: string;
  findingJson: string;
}

/** Presentational report: takes the assessment and frame rows directly. */
export interface DamageReportViewProps {
  reportId: string;
  /** assessment row JSON (string) or a parsed DamageAssessment; null while processing. */
  assessment: DamageAssessment | string | null | undefined;
  /** frame rows for this report. */
  frames?: readonly FrameRowLike[];
  /** Verified affected person's credentials for /api/media, or a custom resolver. */
  resolveMediaUrl?: MediaUrlResolver;
  className?: string;
}

const LEVEL_LABEL: Record<DamageLevel, string> = {
  none: 'No damage seen', affected: 'Affected', minor: 'Minor', major: 'Major', destroyed: 'Destroyed',
};
const LEVEL_SWATCH: Record<DamageLevel, string> = {
  none: 'bg-zinc-300', affected: 'bg-yellow-400', minor: 'bg-orange-500', major: 'bg-red-600', destroyed: 'bg-zinc-950 dark:bg-zinc-100',
};
const COMPONENT_LABEL: Record<string, string> = {
  roof: 'Roof', exterior_walls: 'Exterior walls', windows_doors: 'Windows & doors', foundation: 'Foundation',
  interior: 'Interior', utilities: 'Utilities', contents: 'Belongings', vehicle: 'Vehicle', yard_debris: 'Yard & debris',
};

function LevelTag({ level }: { level: DamageLevel }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-zinc-800 dark:text-zinc-200">
      <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_SWATCH[level]}`} aria-hidden />
      {LEVEL_LABEL[level]}
    </span>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-t border-zinc-200 py-6 dark:border-zinc-800">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function FrameCard({ row, finding, resolve }: { row: FrameRowLike; finding: FrameFinding | null; resolve?: MediaUrlResolver }) {
  const { url, loading } = useMediaUrl(row.thumbKey, resolve);
  const damaged = finding?.components.filter((c) => c.level !== 'none') ?? [];
  return (
    <figure className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="relative aspect-[4/3] bg-zinc-100 dark:bg-zinc-900">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob/presigned URLs, not optimizable
          <img src={url} alt={finding?.caption ?? `Frame ${Number(row.frameIndex) + 1}`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400">{loading ? 'Loading…' : 'Image unavailable'}</div>
        )}
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[11px] text-white">
          {Number(row.frameIndex) + 1}
          {row.tSec ? ` · ${row.tSec.toFixed(1)}s` : ''}
        </span>
        {finding && !finding.usable && (
          <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">Unusable</span>
        )}
      </div>
      <figcaption className="space-y-2 p-3">
        <p className="text-sm text-zinc-800 dark:text-zinc-200">{finding?.caption ?? 'No finding for this frame.'}</p>
        {damaged.length > 0 && (
          <ul className="space-y-1">
            {damaged.map((c, i) => (
              <li key={i} className="text-xs text-zinc-600 dark:text-zinc-400">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {COMPONENT_LABEL[c.component] ?? c.component}: {LEVEL_LABEL[c.level].toLowerCase()}
                </span>{' '}
                — {c.evidence} <span className="tabular-nums text-zinc-400">({Math.round(c.confidence * 100)}%)</span>
              </li>
            ))}
          </ul>
        )}
        {finding && finding.lifeSafety.length > 0 && (
          <p className="text-xs font-medium text-red-700 dark:text-red-400">
            ⚠ {finding.lifeSafety.map((s) => s.flag.replace(/_/g, ' ')).join(', ')}
          </p>
        )}
      </figcaption>
    </figure>
  );
}

function printText(title: string, text: string) {
  const w = window.open('', '_blank', 'noopener,width=720,height=900');
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  w.document.write(
    `<!doctype html><title>${esc(title)}</title><pre style="font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap;margin:40px">${esc(text)}</pre>`,
  );
  w.document.close();
  w.focus();
  w.print();
}

export function DamageReportView({ reportId, assessment, frames = [], resolveMediaUrl, className = '' }: DamageReportViewProps) {
  const [copied, setCopied] = useState(false);
  const parsed = useMemo(() => {
    if (!assessment) return null;
    try {
      const raw = typeof assessment === 'string' ? JSON.parse(assessment) : assessment;
      const r = DamageAssessmentSchema.safeParse(raw);
      return r.success ? r.data : 'invalid';
    } catch {
      return 'invalid';
    }
  }, [assessment]);
  const frameRows = useMemo(
    () =>
      [...frames]
        .sort((a, b) => Number(a.frameIndex) - Number(b.frameIndex))
        .map((row) => {
          let finding: FrameFinding | null = null;
          try {
            const r = FrameFindingSchema.safeParse(JSON.parse(row.findingJson));
            finding = r.success ? r.data : null;
          } catch {
            finding = null;
          }
          return { row, finding };
        }),
    [frames],
  );
  const resolve = resolveMediaUrl;

  if (parsed === null) {
    return (
      <div className={`w-full py-10 text-sm text-zinc-500 dark:text-zinc-400 ${className}`}>
        The assessment for this report is still being prepared.
      </div>
    );
  }
  if (parsed === 'invalid') {
    return (
      <div className={`w-full rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 ${className}`}>
        This assessment could not be displayed (it does not match the expected format).
      </div>
    );
  }

  const a = parsed;
  const damaged = Object.entries(a.componentLevels).filter(([, l]) => l !== 'none') as [string, DamageLevel][];
  const lowConfidence = a.confidence < 0.5;

  return (
    <article className={`w-full text-zinc-900 dark:text-zinc-100 ${className}`} data-report-id={reportId}>
      <header className="pb-6">
        <div className="flex flex-wrap items-center gap-2">
          {a.source !== 'live' && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-900 dark:text-amber-100">
              {a.source} data
            </span>
          )}
          {lowConfidence && (
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">Low confidence</span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Overall damage</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{LEVEL_LABEL[a.overallLevel]}</p>
          </div>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            {a.usableFrameCount} of {a.totalFrameCount} frames usable · confidence {Math.round(a.confidence * 100)}% · {a.hazard.replace(/_/g, ' ')}
          </div>
        </div>
        <p className="mt-4 max-w-prose whitespace-pre-line text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200">{a.summary}</p>
      </header>

      {(a.lifeSafety.length > 0 || a.recommendedActions.length > 0) && (
        <Section title="Safety and next steps">
          {a.lifeSafety.length > 0 && (
            <div className="mb-4">
              <HazardList flags={a.lifeSafety} />
            </div>
          )}
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-zinc-800 dark:text-zinc-200">
            {a.recommendedActions.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ol>
        </Section>
      )}

      {damaged.length > 0 && (
        <Section title="Damage by area">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            {damaged.map(([c, l]) => (
              <div key={c} className="flex items-center justify-between gap-4 border-b border-zinc-100 py-1.5 dark:border-zinc-900">
                <dt className="text-sm text-zinc-600 dark:text-zinc-400">{COMPONENT_LABEL[c] ?? c}</dt>
                <dd>
                  <LevelTag level={l} />
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {frameRows.length > 0 && (
        <Section title="Frames">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {frameRows.map(({ row, finding }) => (
              <FrameCard key={String(row.frameIndex)} row={row} finding={finding} resolve={resolve} />
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Illustrative repair estimate"
        aside={a.cost.inputs.assumed ? <span className="text-xs text-zinc-500 dark:text-zinc-400">Assumed home size</span> : undefined}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-semibold tabular-nums">{formatCents(a.cost.likelyCents)}</span>
          <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
            range {formatCents(a.cost.lowCents)} – {formatCents(a.cost.highCents)}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {a.cost.inputs.homeSqft.toLocaleString('en-US')} sqft · {a.cost.inputs.stories} stor{a.cost.inputs.stories === 1 ? 'y' : 'ies'} ·{' '}
          {a.cost.inputs.tenure === 'rent' ? 'renter' : 'owner'}
          {a.cost.inputs.assumed ? ' (assumed)' : ''}
        </p>
        {a.cost.lineItems.length > 0 && (
          <table className="mt-4 w-full text-sm">
            <tbody>
              {a.cost.lineItems.map((li, i) => (
                <tr key={i} className="border-b border-zinc-100 align-top dark:border-zinc-900">
                  <td className="py-2 pr-4">
                    <p className="text-zinc-900 dark:text-zinc-100">
                      {COMPONENT_LABEL[li.component] ?? li.component} <span className="text-zinc-500">· {li.level}</span>
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{li.basis}</p>
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatCents(li.likelyCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {a.cost.notes?.map((n, i) => (
          <p key={i} className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {n}
          </p>
        ))}
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{a.cost.disclaimer}</p>
      </Section>

      {(a.declarations.length > 0 || a.activeAlerts.length > 0 || a.location) && (
        <Section title="Declarations and alerts" aside={a.location ? <span className="text-xs text-zinc-500">{a.location.countyName}, {a.location.stateCode}</span> : undefined}>
          {a.declarations.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No FEMA disaster declaration for this county in the last 12 months.</p>
          ) : (
            <ul className="space-y-2">
              {a.declarations.map((d) => (
                <li key={d.femaDeclarationString} className="text-sm">
                  <a href={d.sourceUrl} target="_blank" rel="noreferrer" className="font-medium underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:decoration-zinc-600">
                    {d.femaDeclarationString}
                  </a>{' '}
                  · {d.title} · {d.incidentType} · {d.declarationDate.slice(0, 10)}
                  {d.ihProgramDeclared && (
                    <span className="ml-2 text-emerald-700 dark:text-emerald-400">
                      Individual Assistance available —{' '}
                      <a href="https://www.disasterassistance.gov" target="_blank" rel="noreferrer" className="underline">
                        check eligibility
                      </a>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {a.activeAlerts.length > 0 && (
            <ul className="mt-3 space-y-1">
              {a.activeAlerts.map((al, i) => (
                <li key={i} className="text-sm text-amber-800 dark:text-amber-300">
                  {al.event} ({al.severity}){al.headline ? ` — ${al.headline}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {a.claimNotice && (
        <Section
          title="Draft claim notice"
          aside={
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(a.claimNotice!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                onClick={() => printText('Claim notice', a.claimNotice!)}
              >
                Print
              </button>
            </div>
          }
        >
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-4 font-mono text-[13px] leading-relaxed text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {a.claimNotice}
          </pre>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">AI-drafted. Review and correct it before sending to your insurer.</p>
        </Section>
      )}

      <footer className="border-t border-zinc-200 pt-4 text-[11px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
        AI damage and cost figures are estimates. Vision {a.visionModelId} · agent {a.modelId} · {a.promptVersion} · {a.cost.costModelVersion}
      </footer>
    </article>
  );
}

export default DamageReportView;
