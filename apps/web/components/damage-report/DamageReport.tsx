'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { DamageAssessmentSchema, FrameFindingSchema, type DamageAssessment, type FrameFinding } from '@hack/contracts/assessment';
import { DAMAGE_LEVEL_RANK, type Component, type DamageLevel } from '@hack/contracts/common';
import { confidenceLabel, frameHeadline, primaryFinding, LIFE_SAFETY_LABEL } from '@hack/contracts/display';
import { HazardList } from '@/components/safety';
import { useMediaUrl, type MediaUrlResolver } from './useMediaUrl';
import {
  AVENUE_STATUS_LABEL,
  HAZARD_LABEL,
  HIRING_TIP,
  REPAIR_GUIDE,
  floodNote,
  recoveryAvenues,
  repairTier,
  type AvenueStatus,
} from './repairGuide';

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
  /** Show the hazard list inside the report. Pages that already show hazards above it pass false. */
  showHazards?: boolean;
  className?: string;
}

// Same scale as the map legend (Figma): stored FEMA levels, friendlier words.
const LEVEL_LABEL: Record<DamageLevel, string> = {
  none: 'No visible damage', affected: 'Minor damage', minor: 'Moderate damage', major: 'Severe damage', destroyed: 'Destroyed',
};
const LEVEL_SWATCH: Record<DamageLevel, string> = {
  none: 'bg-emerald-500', affected: 'bg-yellow-400', minor: 'bg-orange-500', major: 'bg-red-600', destroyed: 'bg-red-950',
};
const COMPONENT_LABEL: Record<string, string> = {
  roof: 'Roof', exterior_walls: 'Siding & walls', windows_doors: 'Windows & doors', foundation: 'Foundation',
  interior: 'Inside the home', utilities: 'Electrical, plumbing & HVAC', contents: 'Belongings', vehicle: 'Vehicle', yard_debris: 'Yard & debris',
};
const UNUSABLE_TEXT: Record<string, string> = {
  dark: 'too dark', blurry: 'too blurry', not_a_structure: 'doesn’t show the home', parse_error: 'couldn’t be read', other: 'unclear',
};
const AVENUE_STYLE: Record<AvenueStatus, string> = {
  open: 'bg-emerald-50 text-emerald-800',
  check: 'bg-amber-50 text-amber-900',
  later: 'bg-zinc-100 text-zinc-600',
};

/** Estimates read better in whole dollars: "$27,682", not "$27,681.50". */
function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function LevelTag({ level }: { level: DamageLevel }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-zinc-800">
      <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_SWATCH[level]}`} aria-hidden />
      {LEVEL_LABEL[level]}
    </span>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-t border-zinc-200 py-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-zinc-950">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

interface Sighting {
  evidence: string;
  confidence: number;
  row: FrameRowLike;
  box?: FrameFinding['components'][number]['box'];
}

interface DamagedArea {
  component: Component;
  level: DamageLevel;
  cents: number | null;
  sightings: Sighting[];
  photoCount: number;
}

function Thumb({ row, box, resolve, alt }: { row: FrameRowLike; box?: Sighting['box']; resolve?: MediaUrlResolver; alt: string }) {
  const { url } = useMediaUrl(row.thumbKey, resolve);
  if (!url) return null;
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-zinc-100 sm:w-36 sm:shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- blob/presigned URLs, not optimizable */}
      <img src={url} alt={alt} className="h-full w-full object-cover" />
      {box && (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded border-2 border-amber-400"
          style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
        />
      )}
    </div>
  );
}

function AreaCard({ area, hazard, resolve, open }: { area: DamagedArea; hazard: DamageAssessment['hazard']; resolve?: MediaUrlResolver; open: boolean }) {
  const tier = repairTier(area.level);
  const advice = tier ? REPAIR_GUIDE[area.component]?.[tier] : undefined;
  const flood = floodNote(area.component, hazard);
  const label = COMPONENT_LABEL[area.component] ?? area.component;
  const first = area.sightings[0];
  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        {first && <Thumb row={first.row} box={first.box} resolve={resolve} alt={`${label}: ${first.evidence}`} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h4 className="text-[15px] font-semibold text-zinc-950">{label}</h4>
            {area.cents != null && area.cents > 0 && (
              <span className="text-[13px] tabular-nums text-zinc-500">about {dollars(area.cents)} to repair</span>
            )}
          </div>
          <div className="mt-1">
            <LevelTag level={area.level} />
          </div>
          {area.sightings.length > 0 ? (
            <div className="mt-3">
              <p className="text-[12px] font-medium text-zinc-500">What we saw</p>
              <ul className="mt-1 space-y-0.5 text-[14px] leading-snug text-zinc-800">
                {area.sightings.slice(0, 2).map((s, i) => (
                  <li key={i}>{s.evidence}</li>
                ))}
              </ul>
              <p className="mt-1 text-[12px] text-zinc-400">
                Seen in {area.photoCount} photo{area.photoCount === 1 ? '' : 's'}
              </p>
            </div>
          ) : null}
        </div>
      </div>
      {advice && (
        <details className="group mt-4 border-t border-zinc-100 pt-3" open={open}>
          <summary className="cursor-pointer list-none text-[13px] font-semibold text-blue-700 marker:hidden">
            <span className="group-open:hidden">Show how to fix it</span>
            <span className="hidden group-open:inline">How to fix it</span>
          </summary>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-[14px] leading-snug sm:grid-cols-3">
            <div>
              <dt className="text-[12px] font-medium text-zinc-500">Right now</dt>
              <dd className="mt-0.5 text-zinc-800">{advice.now}</dd>
            </div>
            <div>
              <dt className="text-[12px] font-medium text-zinc-500">The repair</dt>
              <dd className="mt-0.5 text-zinc-800">{advice.fix}</dd>
            </div>
            <div>
              <dt className="text-[12px] font-medium text-zinc-500">Who to call</dt>
              <dd className="mt-0.5 text-zinc-800">{advice.who}</dd>
            </div>
          </dl>
          {flood && <p className="mt-3 text-[13px] text-amber-900">{flood}</p>}
        </details>
      )}
    </li>
  );
}

function PhotoCard({ row, finding, resolve }: { row: FrameRowLike; finding: FrameFinding | null; resolve?: MediaUrlResolver }) {
  const { url, loading } = useMediaUrl(row.thumbKey, resolve);
  const damaged = finding?.components.filter((c) => c.level !== 'none') ?? [];
  const primary = finding?.usable ? primaryFinding(finding) : null;
  const n = Number(row.frameIndex) + 1;
  return (
    <figure className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="relative aspect-[4/3] bg-zinc-100">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob/presigned URLs, not optimizable
          <img src={url} alt={finding?.caption ?? `Photo ${n}`} className={`h-full w-full object-cover ${finding && !finding.usable ? 'opacity-50' : ''}`} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400">{loading ? 'Loading…' : 'Photo unavailable'}</div>
        )}
        {url && primary?.box && (
          <span
            aria-hidden
            className={`pointer-events-none absolute rounded-md border-2 ${primary.kind === 'lifeSafety' ? 'border-red-500' : 'border-amber-400'}`}
            style={{ left: `${primary.box.x * 100}%`, top: `${primary.box.y * 100}%`, width: `${primary.box.w * 100}%`, height: `${primary.box.h * 100}%` }}
          />
        )}
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">Photo {n}</span>
      </div>
      <figcaption className="space-y-1.5 p-3">
        {finding && !finding.usable ? (
          <p className="text-[13px] text-zinc-500">
            We couldn’t use this one: it’s {UNUSABLE_TEXT[finding.unusableReason ?? 'other'] ?? 'unclear'}.
          </p>
        ) : (
          <>
            {finding && <p className="text-[14px] font-medium text-zinc-900">{frameHeadline(finding)}</p>}
            <p className="text-[13px] text-zinc-600">{finding?.caption ?? 'No notes for this photo.'}</p>
            {damaged.length > 0 && (
              <p className="text-[12px] text-zinc-500">
                {damaged.map((c) => `${COMPONENT_LABEL[c.component] ?? c.component}: ${LEVEL_LABEL[c.level].toLowerCase()}`).join(' · ')}
              </p>
            )}
            {finding && finding.lifeSafety.length > 0 && (
              <p className="text-[12px] font-medium text-red-700">
                Hazard: {finding.lifeSafety.map((s) => LIFE_SAFETY_LABEL[s.flag]).join(', ')}
              </p>
            )}
          </>
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

export function DamageReportView({ reportId, assessment, frames = [], resolveMediaUrl, showHazards = true, className = '' }: DamageReportViewProps) {
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

  const areas = useMemo<DamagedArea[]>(() => {
    if (!parsed || parsed === 'invalid') return [];
    const costBy = new Map<string, number>();
    for (const li of parsed.cost.lineItems) costBy.set(li.component, (costBy.get(li.component) ?? 0) + li.likelyCents);
    return (Object.entries(parsed.componentLevels) as [Component, DamageLevel][])
      .filter(([, level]) => level !== 'none')
      .map(([component, level]) => {
        const all: Sighting[] = [];
        const photos = new Set<string>();
        for (const { row, finding } of frameRows) {
          if (!finding?.usable) continue;
          for (const c of finding.components) {
            if (c.component !== component || c.level === 'none') continue;
            photos.add(String(row.frameIndex));
            all.push({ evidence: c.evidence.trim(), confidence: c.confidence, row, box: c.box });
          }
        }
        all.sort((a, b) => b.confidence - a.confidence);
        const seen = new Set<string>();
        const sightings = all.filter((s) => {
          const k = s.evidence.toLowerCase();
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        return { component, level, cents: costBy.get(component) ?? null, sightings, photoCount: photos.size };
      })
      .sort((a, b) => DAMAGE_LEVEL_RANK[b.level] - DAMAGE_LEVEL_RANK[a.level] || (b.cents ?? 0) - (a.cents ?? 0));
  }, [parsed, frameRows]);

  const resolve = resolveMediaUrl;

  if (parsed === null) {
    return (
      <div className={`w-full py-10 text-sm text-zinc-500 ${className}`}>
        Your report is still being prepared. This page updates on its own.
      </div>
    );
  }
  if (parsed === 'invalid') {
    return (
      <div className={`w-full rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 ${className}`}>
        We couldn’t display this report. Please try again later.
      </div>
    );
  }

  const a = parsed;
  const lowConfidence = a.confidence < 0.5;
  const avenues = recoveryAvenues({
    tenure: a.cost.inputs.tenure,
    hazard: a.hazard,
    declarations: a.declarations,
    countyName: a.location?.countyName,
  });

  return (
    <article className={`w-full text-zinc-900 ${className}`} data-report-id={reportId}>
      <header className="pb-6">
        <p className="text-[12px] font-medium text-zinc-500">What happened to your home</p>
        <p className="mt-1 flex items-center gap-2.5 text-3xl font-semibold tracking-tight">
          <span className={`h-3.5 w-3.5 rounded-full ${LEVEL_SWATCH[a.overallLevel]}`} aria-hidden />
          {LEVEL_LABEL[a.overallLevel]}
        </p>
        <p className="mt-1 text-[13px] text-zinc-500">
          {HAZARD_LABEL[a.hazard]} · based on {a.usableFrameCount} of {a.totalFrameCount} photo{a.totalFrameCount === 1 ? '' : 's'} ·{' '}
          {confidenceLabel(a.confidence).toLowerCase()}
        </p>
        <p className="mt-4 max-w-prose whitespace-pre-line text-[15px] leading-relaxed text-zinc-800">{a.summary}</p>
        {lowConfidence && (
          <p className="mt-3 max-w-prose text-[13px] text-zinc-600">
            Some photos were unclear, so treat this as a rough first look. Clear photos of each room and each side of the house will
            sharpen it.
          </p>
        )}
      </header>

      {(a.recommendedActions.length > 0 || (showHazards && a.lifeSafety.length > 0) || a.activeAlerts.length > 0) && (
        <Section title="Do these first">
          {showHazards && a.lifeSafety.length > 0 && (
            <div className="mb-4">
              <HazardList flags={a.lifeSafety} />
            </div>
          )}
          {a.activeAlerts.length > 0 && (
            <ul className="mb-4 space-y-1">
              {a.activeAlerts.map((al, i) => (
                <li key={i} className="text-[14px] text-amber-900">
                  Weather alert: {al.event}
                  {al.headline ? `. ${al.headline}` : ''}
                </li>
              ))}
            </ul>
          )}
          <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-snug text-zinc-800">
            {a.recommendedActions.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ol>
        </Section>
      )}

      <Section
        title="What was damaged"
        aside={areas.length > 0 ? <span className="text-[13px] text-zinc-500">{areas.length} area{areas.length === 1 ? '' : 's'}, most serious first</span> : undefined}
      >
        {areas.length === 0 ? (
          <p className="text-[15px] text-zinc-700">We didn’t see damage to the home in these photos.</p>
        ) : (
          <>
            <ul className="space-y-3">
              {areas.map((area, i) => (
                <AreaCard key={area.component} area={area} hazard={a.hazard} resolve={resolve} open={i < 3} />
              ))}
            </ul>
            <p className="mt-4 text-[13px] text-zinc-500">{HIRING_TIP}</p>
          </>
        )}
      </Section>

      {a.cost.likelyCents > 0 && (
        <Section title="Estimated repair cost">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-semibold tabular-nums">about {dollars(a.cost.likelyCents)}</span>
            <span className="text-[14px] tabular-nums text-zinc-500">
              likely between {dollars(a.cost.lowCents)} and {dollars(a.cost.highCents)}
            </span>
          </div>
          {a.cost.inputs.assumed ? (
            <p className="mt-2 text-[13px] text-zinc-600">
              Based on a typical {a.cost.inputs.homeSqft.toLocaleString('en-US')} sq ft home. Your real size will change this.
            </p>
          ) : (
            <p className="mt-2 text-[13px] text-zinc-600">
              Based on your {a.cost.inputs.homeSqft.toLocaleString('en-US')} sq ft, {a.cost.inputs.stories}-story home.
            </p>
          )}
          {a.cost.inputs.tenure === 'rent' && (
            <p className="mt-1 text-[13px] text-zinc-600">As a renter, you’d usually only pay for your belongings; the building is your landlord’s.</p>
          )}
          {a.cost.lineItems.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[13px] font-medium text-zinc-600">How we estimated this</summary>
              <table className="mt-2 w-full text-[13px]">
                <tbody>
                  {a.cost.lineItems.map((li, i) => (
                    <tr key={i} className="border-b border-zinc-100 align-top">
                      <td className="py-2 pr-4">
                        <p className="text-zinc-900">
                          {COMPONENT_LABEL[li.component] ?? li.component}{' '}
                          <span className="text-zinc-500">· {LEVEL_LABEL[li.level].toLowerCase()}</span>
                        </p>
                        <p className="text-[12px] text-zinc-500">{li.basis}</p>
                      </td>
                      <td className="py-2 text-right tabular-nums">{dollars(li.likelyCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          <p className="mt-3 text-[12px] text-zinc-500">{a.cost.disclaimer}</p>
        </Section>
      )}

      <Section title="Ways to pay for repairs">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {avenues.map((av) => (
            <li key={av.id} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-[15px] font-semibold text-zinc-950">{av.title}</h4>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${AVENUE_STYLE[av.status]}`}>
                  {AVENUE_STATUS_LABEL[av.status]}
                </span>
              </div>
              <p className="mt-1.5 text-[14px] leading-snug text-zinc-700">{av.body}</p>
              {av.link && (
                <a href={av.link.href} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[13px] font-semibold text-blue-700 underline">
                  {av.link.label}
                </a>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {a.claimNotice && (
        <Section
          title="Start your insurance claim"
          aside={
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
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
                className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
                onClick={() => printText('Claim notice', a.claimNotice!)}
              >
                Print
              </button>
            </div>
          }
        >
          <p className="mb-3 text-[14px] text-zinc-600">
            We drafted a first notice you can send your insurer. Fill in the blanks and check every detail before sending.
          </p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-4 font-mono text-[13px] leading-relaxed text-zinc-800">
            {a.claimNotice}
          </pre>
        </Section>
      )}

      {frameRows.length > 0 && (
        <Section title="Photos we reviewed">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {frameRows.map(({ row, finding }) => (
              <PhotoCard key={String(row.frameIndex)} row={row} finding={finding} resolve={resolve} />
            ))}
          </div>
        </Section>
      )}

      <footer className="border-t border-zinc-200 pt-4 text-[12px] text-zinc-500">
        <p>This report is an AI estimate from photos, not a home inspection or an insurance decision.</p>
        <details className="mt-2 text-zinc-400">
          <summary className="cursor-pointer">Technical details</summary>
          <p className="mt-1 font-mono text-[11px]">
            Vision {a.visionModelId} · agent {a.modelId} · {a.promptVersion} · {a.cost.costModelVersion}
          </p>
        </details>
      </footer>
    </article>
  );
}

export default DamageReportView;
