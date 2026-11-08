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
import { AppHeader } from '@/components/chrome/AppHeader';
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
import { useMediaUrlState } from '@/components/affected/media';
import { useVerificationCredentials } from '@/components/affected/useVerificationCredentials';

function ReportThumb({ reportId, propertyId }: { reportId: bigint; propertyId: bigint }) {
  const { frames } = useVerifiedReportData(reportId);
  const creds = useVerificationCredentials(propertyId);
  const media = useMediaUrlState(frames[0]?.thumbKey ?? null, creds);
  if (media.status === 'ready' && media.url) {
    // eslint-disable-next-line @next/next/no-img-element -- object URL from an authorized fetch
    return <img src={media.url} alt="" className="h-16 w-16 flex-none rounded object-cover" />;
  }
  return (
    <div
      className="grid h-16 w-16 flex-none place-items-center rounded bg-gray-200 px-1 text-center text-[9px] leading-tight text-gray-500"
      aria-hidden={media.status === 'loading'}
    >
      {media.status === 'loading'
        ? '…'
        : frames[0]
          ? 'Photo unavailable'
          : 'No photo'}
    </div>
  );
}

function ReportItem({ r }: { r: ReportRow }) {
  const flags = parseFlagsCsv(r.lifeSafetyCsv);
  return (
    <li>
      <Link
        href={`/affected/report/${idToString(r.id)}`}
        className="flex items-center gap-3 rounded-lg border p-3 hover:bg-gray-50"
      >
        <ReportThumb reportId={r.id} propertyId={r.propertyId} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{DAMAGE_LEVEL_TEXT[parseLevel(r.overallLevel)]}</p>
          <p className="text-sm text-gray-600">
            {r.hazard.replace(/_/g, ' ')} · {new Date(timestampToMs(r.createdAt)).toLocaleString()}
          </p>
          <p className="text-xs text-gray-500">
            {STATUS_TEXT[r.status] ?? r.status}
            {flags.length > 0 && <span className="ml-2 font-medium text-red-700">⚠ {flags.length} hazard(s)</span>}
            {r.source !== 'live' && <span className="ml-2 rounded bg-gray-200 px-1">{r.source}</span>}
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

  // Own pin: exact geocode when verified; otherwise only the address this device entered.
  const entered = useMemo(() => loadSelectedAddress(), []);
  const ownPin = useMemo(() => {
    if (verified && propertyPrivate?.lat != null && propertyPrivate.lng != null)
      return { lat: propertyPrivate.lat, lng: propertyPrivate.lng };
    if (entered?.lat != null && entered.lng != null) return { lat: entered.lat, lng: entered.lng };
    return null;
  }, [verified, propertyPrivate, entered]);
  const center = ownPin ?? (property ? cellCenter(property.cellId) : null);

  // Banner: public area notices for the county (everyone) merged with the newest assessed
  // report's alerts/declarations (verified only, listed first).
  const newestAssessed = reports.find((r) => r.status === 'assessed');
  const { assessment } = useVerifiedReportData(newestAssessed?.id ?? null);
  const { notices: publicNotices } = useAreaNotices(propertyId);
  const notices = useMemo(
    () => mergeAreaNotices(readAreaNotices(assessment?.json), publicNotices),
    [assessment?.json, publicNotices],
  );
  const anyHazard = reports.some((r) => r.selfDanger || parseFlagsCsv(r.lifeSafetyCsv).length > 0);

  if (propertyId === null) return <main className="px-4 py-6">That link isn't valid.</main>;
  if (!propReady || !verReady) return <main className="px-4 py-6 text-gray-600">Loading…</main>;
  if (!property) return <main className="px-4 py-6">We couldn't find that property.</main>;

  const addressLine = verified && propertyPrivate ? formatAddress(propertyPrivate) : entered ? formatAddress(entered) : null;

  return (
    <div className="min-h-screen bg-[#eef1f5]">
      <AppHeader dense />
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Your home</h1>
        {addressLine && <p className="text-sm text-gray-600">{addressLine}</p>}
      </header>

      {verified && anyHazard && <Banner911 reason="Footage of your home shows a possible life-safety hazard." />}

      {notices.length > 0 && (
        <section aria-label="Area notices" className="space-y-1 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
          {notices.map((n) => (
            <p key={n.key}>
              {n.text}
              {n.url && (
                <a href={n.url} target="_blank" rel="noreferrer" className="ml-1 underline">
                  Source
                </a>
              )}
            </p>
          ))}
        </section>
      )}

      {!verified && (
        <section className="space-y-2 rounded-lg border p-4">
          <p className="font-medium">Verify your ID to see reports for your home.</p>
          <p className="text-sm text-gray-600">Until then you can see what's happening in your area.</p>
          <Link href="/affected/verify" className="inline-block rounded-lg bg-black px-4 py-2 font-medium text-white">
            Verify
          </Link>
        </section>
      )}

      {verified && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Reports for your home</h2>
            {newestAssessed ? (
              <span
                className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500"
                title="Recovery Navigator ships with Part 4"
              >
                Recovery coming soon
              </span>
            ) : null}
          </div>
          {reports.length === 0 ? (
            <div className="space-y-2 rounded-lg border p-4">
              <p>No reports for your address yet.</p>
              <Link
                href={`/report/new?self=1&address=${encodeURIComponent(addressLine ?? '')}`}
                className="inline-block rounded-lg bg-black px-4 py-2 font-medium text-white"
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
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent reports in your area</h2>
          <div role="group" aria-label="Map shading" className="flex overflow-hidden rounded-lg border text-sm">
            {(['damage', 'hazards'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 ${mode === m ? 'bg-black text-white' : ''}`}
              >
                {m === 'damage' ? 'Damage' : 'Hazards'}
              </button>
            ))}
          </div>
        </div>
        {center && <CellMap center={center} ownPin={ownPin} cells={cells} mode={mode} />}
        <p className="text-xs text-gray-500">
          Last 72 hours, about 1 km around your home. Reports are grouped into ~250 m squares so no individual home is shown.
        </p>
      </section>
    </main>
    </div>
  );
}
