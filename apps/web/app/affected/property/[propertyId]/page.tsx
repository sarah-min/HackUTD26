'use client';
// /affected/property/[propertyId] (T2.11)
//  - verified for this property: report list, own exact pin, area map, alerts/declaration banner, "Film it yourself"
//  - unverified: area cells + public area notices (NWS alerts, FEMA declarations) + a link to verify
// Nobody sees other people's individual pins: the map shows aggregated ~250 m cells (CONTRACTS §2.3).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { neighborCells, cellCenter } from '@hack/address';
import {
  idFromString,
  idToString,
  useAreaCells,
  useAreaNotices,
  useProperty,
  useReportsForProperty,
  useVerifiedFor,
  useVerifiedPropertyPrivate,
  useVerifiedReportData,
  timestampToMs,
  type ReportRow,
} from '@/lib/stdb';
import { Banner911, CellMap } from '@/components/affected/external';
import { AppShell } from '@/components/chrome/AppShell';
import {
  DAMAGE_LEVEL_TEXT,
  STATUS_TEXT,
  formatAddress,
  loadSelectedAddress,
  mergeAreaNotices,
  parseFlagsCsv,
  parseLevel,
  readAreaNotices,
  toAreaCell,
} from '@/components/affected/helpers';
import { useMediaUrl } from '@/components/affected/media';

function ReportThumb({ reportId }: { reportId: bigint }) {
  const { frames } = useVerifiedReportData(reportId);
  const url = useMediaUrl(frames[0]?.thumbKey ?? null);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- object URL from SpacetimeDB storage
    return <img src={url} alt="" className="h-14 w-14 flex-none rounded-lg object-cover" />;
  }
  return (
    <div className="grid h-14 w-14 flex-none place-items-center rounded-lg bg-slate-200 px-1 text-center text-[9px] leading-tight text-slate-500">
      {frames[0] ? '…' : 'No photo'}
    </div>
  );
}

function ReportItem({ r }: { r: ReportRow }) {
  const flags = parseFlagsCsv(r.lifeSafetyCsv);
  return (
    <li>
      <Link
        href={`/affected/report/${idToString(r.id)}`}
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 hover:border-blue-300"
      >
        <ReportThumb reportId={r.id} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-slate-900">
            {DAMAGE_LEVEL_TEXT[parseLevel(r.overallLevel)]}
          </p>
          <p className="text-[11px] text-slate-500">
            {r.hazard.replace(/_/g, ' ')} · {new Date(timestampToMs(r.createdAt)).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500">
            {STATUS_TEXT[r.status] ?? r.status}
            {flags.length > 0 && (
              <span className="ml-2 font-semibold text-red-700">⚠ {flags.length} hazard(s)</span>
            )}
            {r.source !== 'live' && (
              <span className="ml-2 rounded bg-slate-100 px-1 text-[10px] font-bold uppercase text-slate-600">
                {r.source}
              </span>
            )}
          </p>
        </div>
      </Link>
    </li>
  );
}

export default function AffectedPropertyPage() {
  const params = useParams<{ propertyId: string }>();
  const propertyId = idFromString(params.propertyId);
  const { property, ready: propReady } = useProperty(propertyId);
  const { verified, ready: verReady } = useVerifiedFor(propertyId);
  const { propertyPrivate } = useVerifiedPropertyPrivate(verified ? propertyId : null);
  const { reports } = useReportsForProperty(verified ? propertyId : null);
  const [mode, setMode] = useState<'damage' | 'hazards'>('damage');

  const cellIds = useMemo(() => (property ? neighborCells(property.cellId) : []), [property]);
  const { cells: cellRows } = useAreaCells(cellIds);
  const cells = useMemo(() => cellRows.map(toAreaCell), [cellRows]);

  const entered = useMemo(() => loadSelectedAddress(), []);
  const ownPin = useMemo(() => {
    if (verified && propertyPrivate?.lat != null && propertyPrivate.lng != null)
      return { lat: propertyPrivate.lat, lng: propertyPrivate.lng };
    if (entered?.lat != null && entered.lng != null) return { lat: entered.lat, lng: entered.lng };
    return null;
  }, [verified, propertyPrivate, entered]);
  const center = ownPin ?? (property ? cellCenter(property.cellId) : null);

  const newestAssessed = reports.find((r) => r.status === 'assessed');
  const { assessment } = useVerifiedReportData(newestAssessed?.id ?? null);
  const { notices: publicNotices } = useAreaNotices(propertyId);
  const notices = useMemo(
    () => mergeAreaNotices(readAreaNotices(assessment?.json), publicNotices),
    [assessment?.json, publicNotices],
  );
  const anyHazard = reports.some((r) => r.selfDanger || parseFlagsCsv(r.lifeSafetyCsv).length > 0);

  if (propertyId === null) {
    return (
      <AppShell>
        <p className="text-[13px] text-slate-700">That link isn&apos;t valid.</p>
      </AppShell>
    );
  }
  if (!propReady || !verReady) {
    return (
      <AppShell>
        <p className="text-sm text-slate-600">Loading…</p>
      </AppShell>
    );
  }
  if (!property) {
    return (
      <AppShell>
        <p className="text-[13px] text-slate-700">We couldn&apos;t find that property.</p>
      </AppShell>
    );
  }

  const addressLine =
    verified && propertyPrivate
      ? formatAddress(propertyPrivate)
      : entered
        ? formatAddress(entered)
        : null;

  return (
    <AppShell>
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Affected</p>
        <h1 className="mt-0.5 text-lg font-bold tracking-[-0.02em] text-slate-950">Your home</h1>
        {addressLine ? <p className="mt-1 text-[12px] text-slate-500">{addressLine}</p> : null}
      </header>

      {verified && anyHazard ? (
        <Banner911 reason="Footage of your home shows a possible life-safety hazard." />
      ) : null}

      {notices.length > 0 ? (
        <section
          aria-label="Area notices"
          className="space-y-1 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-[12px] text-blue-900"
        >
          {notices.map((n) => (
            <p key={n.key}>
              {n.text}
              {n.url ? (
                <a href={n.url} target="_blank" rel="noreferrer" className="ml-1 font-semibold underline">
                  Source
                </a>
              ) : null}
            </p>
          ))}
        </section>
      ) : null}

      {!verified ? (
        <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[13px] font-bold text-slate-900">
            Verify your ID to see reports for your home.
          </p>
          <p className="text-[12px] text-slate-500">Until then you can see what&apos;s happening in your area.</p>
          <Link
            href="/affected/verify"
            className="block rounded-xl bg-blue-700 px-4 py-3 text-center text-[13px] font-bold text-white"
          >
            Verify
          </Link>
        </section>
      ) : null}

      {verified ? (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[13px] font-bold text-slate-900">Reports for your home</h2>
            {newestAssessed ? (
              <Link
                href={`/affected/property/${idToString(propertyId)}/recovery`}
                className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold text-blue-800"
              >
                Recovery Navigator
              </Link>
            ) : null}
          </div>
          {reports.length === 0 ? (
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[13px] text-slate-700">No reports for your address yet.</p>
              <Link
                href={`/report/new?self=1&address=${encodeURIComponent(addressLine ?? '')}`}
                className="block rounded-xl bg-blue-700 px-4 py-3 text-center text-[13px] font-bold text-white"
              >
                Film it yourself
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {reports.map((r) => (
                <ReportItem key={idToString(r.id)} r={r} />
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-bold text-slate-900">Recent reports in your area</h2>
          <div
            role="group"
            aria-label="Map shading"
            className="flex overflow-hidden rounded-lg border border-slate-200 text-[11px] font-semibold"
          >
            {(['damage', 'hazards'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`px-2.5 py-1 ${mode === m ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}
              >
                {m === 'damage' ? 'Damage' : 'Hazards'}
              </button>
            ))}
          </div>
        </div>
        {center ? <CellMap center={center} ownPin={ownPin} cells={cells} mode={mode} /> : null}
        <p className="text-[11px] text-slate-500">
          Last 72 hours, about 1 km around your home. Reports are grouped into ~250 m squares so no
          individual home is shown.
        </p>
      </section>
    </AppShell>
  );
}
