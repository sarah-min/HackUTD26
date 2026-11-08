'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Hazard } from '@hack/contracts/common';
import type { NormalizedAddress } from '@hack/contracts/property';
import { CreateReportInputSchema } from '@hack/contracts/report';
import { AppHeader } from '@/components/chrome/AppHeader';
import { Banner911 } from '@/components/safety';
import {
  P,
  R,
  generateSecret,
  idToString,
  saveReporterSecret,
  sha256Hex,
  useMyReports,
  useReducer,
  useStdb,
} from '@/lib/stdb';
import { useProcedure } from 'spacetimedb/react';
import { HAZARD_OPTIONS } from './hazardOptions';

type Phase = 'form' | 'creating' | 'error';
type GeocodeQuery = { q: string } | { lat: number; lng: number };
type GeocodeResult = { ok: boolean; error: string; addressesJson: string };

const CREATE_TIMEOUT_MS = 15_000;

/** Address lookup in the SpacetimeDB module (geocode_address / geocode_point). */
async function geocode(
  query: GeocodeQuery,
  forward: (a: { q: string }) => Promise<GeocodeResult>,
  reverse: (a: { lat: number; lng: number }) => Promise<GeocodeResult>,
): Promise<NormalizedAddress[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = 'q' in query ? await forward(query) : await reverse(query);
    if (r.ok) return JSON.parse(r.addressesJson) as NormalizedAddress[];
    if (r.error === 'busy') {
      await new Promise((res) => setTimeout(res, 1200));
      continue;
    }
    if (r.error === 'geocoder_unavailable') {
      throw new Error("The address lookup isn't responding. Try again in a moment.");
    }
    throw new Error('Enter a full street address.');
  }
  throw new Error('Too many lookups right now. Try again in a moment.');
}

function formatAddress(a: NormalizedAddress): string {
  return `${a.line1}, ${a.city}, ${a.state} ${a.zip}`;
}

/** Live createReport capture. Media attach/submit can use SpacetimeDB blobs next. */
export function ReportCapture() {
  const router = useRouter();
  const params = useSearchParams();
  const { isActive, error: connError } = useStdb();
  const createReport = useReducer(R.createReport);
  const forward = useProcedure(P.geocodeAddress);
  const reverse = useProcedure(P.geocodePoint);
  const { rows: myReports, ready: reportsReady } = useMyReports();

  const [hazard, setHazard] = useState<Hazard>('flood');
  const [selfDanger, setSelfDanger] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSelfReport, setIsSelfReport] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [address, setAddress] = useState<NormalizedAddress | null>(null);
  const [suggestions, setSuggestions] = useState<NormalizedAddress[]>([]);
  const [deviceLat, setDeviceLat] = useState<number | undefined>();
  const [deviceLng, setDeviceLng] = useState<number | undefined>();
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);

  const pendingSecret = useRef<string | null>(null);
  const knownIds = useRef<Set<string> | null>(null);
  const gpsTried = useRef(false);
  const prefillTried = useRef(false);

  // Film-it-yourself / self-report deep link: ?self=1&address=
  useEffect(() => {
    if (prefillTried.current) return;
    prefillTried.current = true;
    if (params.get('self') === '1') setIsSelfReport(true);
    const prefill = params.get('address')?.trim();
    if (!prefill || prefill.length < 5) return;
    setAddressQuery(prefill);
    setGeoBusy(true);
    void (async () => {
      try {
        const list = await geocode({ q: prefill }, forward, reverse);
        setSuggestions(list);
        if (list[0]) {
          setAddress(list[0]);
          setAddressQuery(formatAddress(list[0]));
        } else {
          setGeoError('No match for that address. Edit and look up again.');
        }
      } catch (e) {
        setGeoError(e instanceof Error ? e.message : 'Lookup failed.');
      } finally {
        setGeoBusy(false);
      }
    })();
  }, [params, forward, reverse]);

  useEffect(() => {
    if (gpsTried.current) return;
    if (params.get('address')) {
      gpsTried.current = true;
      return;
    }
    gpsTried.current = true;
    if (!('geolocation' in navigator)) return;
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setDeviceLat(lat);
        setDeviceLng(lng);
        void (async () => {
          try {
            const list = await geocode({ lat, lng }, forward, reverse);
            setSuggestions(list);
            if (list[0]) {
              setAddress(list[0]);
              setAddressQuery(formatAddress(list[0]));
            }
          } catch (e) {
            setGeoError(e instanceof Error ? e.message : 'Location lookup failed.');
          } finally {
            setGeoBusy(false);
          }
        })();
      },
      () => {
        setGeoBusy(false);
        setGeoError('Location permission denied. Type an address instead.');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [params, forward, reverse]);

  // After createReport, the new draft appears in myReports — save secret and open status.
  useEffect(() => {
    if (phase !== 'creating' || !pendingSecret.current || !knownIds.current || !reportsReady) return;
    const fresh = myReports.find((r) => !knownIds.current!.has(idToString(r.report.id)));
    if (!fresh) return;
    const id = idToString(fresh.report.id);
    saveReporterSecret(id, pendingSecret.current);
    const self = isSelfReport;
    const addr = address ? formatAddress(address) : '';
    pendingSecret.current = null;
    knownIds.current = null;
    if (self && addr) {
      router.replace(`/report/${id}?self=1&address=${encodeURIComponent(addr)}`);
    } else {
      router.replace(`/report/${id}`);
    }
  }, [phase, myReports, reportsReady, router, isSelfReport, address]);

  // Timeout if the new row never appears.
  useEffect(() => {
    if (phase !== 'creating') return;
    const t = window.setTimeout(() => {
      pendingSecret.current = null;
      knownIds.current = null;
      setPhase('error');
      setError(
        'The draft may have been created, but we could not confirm it in time. Check My submissions, or try again.',
      );
    }, CREATE_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  async function searchAddress() {
    setGeoError(null);
    if (addressQuery.trim().length < 5) {
      setGeoError('Enter at least 5 characters.');
      return;
    }
    setGeoBusy(true);
    try {
      const list = await geocode({ q: addressQuery.trim() }, forward, reverse);
      setSuggestions(list);
      if (list.length === 0) setGeoError('No matches. Try a fuller street address.');
    } catch (e) {
      setGeoError(e instanceof Error ? e.message : 'Lookup failed.');
    } finally {
      setGeoBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isActive) {
      setError('Still connecting to Aftermath… try again in a second.');
      return;
    }
    if (!address) {
      setError('Confirm an address before submitting.');
      return;
    }

    const secret = generateSecret();
    const reporterSecretHash = await sha256Hex(secret);
    const parsed = CreateReportInputSchema.safeParse({
      hazard,
      address,
      deviceLat,
      deviceLng,
      selfDanger,
      notes: notes.trim() ? notes.trim() : undefined,
      isSelfReport,
      reporterSecretHash,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid report input.');
      return;
    }

    knownIds.current = new Set(myReports.map((r) => idToString(r.report.id)));
    pendingSecret.current = secret;
    setPhase('creating');
    try {
      await createReport({ inputJson: JSON.stringify(parsed.data) });
    } catch (err) {
      pendingSecret.current = null;
      knownIds.current = null;
      setPhase('error');
      setError(err instanceof Error ? err.message : 'Could not create the report.');
    }
  }

  return (
    <div className="min-h-screen bg-slate-200 text-slate-900">
      <div className="mx-auto min-h-screen max-w-[480px] bg-[#f5f7fa] shadow-[0_0_45px_rgba(15,23,42,0.12)]">
        <AppHeader dense />

        <main className="space-y-3 px-3.5 py-3.5 pb-8">
          {selfDanger ? <Banner911 reason="You flagged that someone may be in danger on scene." /> : null}

          <form
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_4px_18px_rgba(15,23,42,0.05)]"
            onSubmit={onSubmit}
          >
            <div className="mb-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">
                New field report
              </p>
              <h1 className="mt-0.5 text-lg font-bold tracking-[-0.02em] text-slate-950">
                Capture what you see
              </h1>
            </div>

            <fieldset>
              <legend className="mb-2 text-[12px] font-semibold text-slate-700">Hazard type</legend>
              <div className="flex flex-wrap gap-1.5">
                {HAZARD_OPTIONS.map((item) => (
                  <button
                    className={`rounded-full px-3 py-2 text-[12px] font-semibold transition ${
                      hazard === item.value
                        ? 'bg-[#0f172a] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    key={item.value}
                    onClick={() => setHazard(item.value)}
                    type="button"
                    aria-pressed={hazard === item.value}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-4">
              <label className="mb-2 block text-[12px] font-semibold text-slate-700" htmlFor="addr">
                Location
              </label>
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-blue-500"
                  id="addr"
                  value={addressQuery}
                  onChange={(ev) => {
                    setAddressQuery(ev.target.value);
                    setAddress(null);
                  }}
                  placeholder="Street, city, state"
                />
                <button
                  className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50"
                  disabled={geoBusy}
                  onClick={() => void searchAddress()}
                  type="button"
                >
                  {geoBusy ? '…' : 'Lookup'}
                </button>
              </div>
              {geoError ? <p className="mt-1 text-[11px] text-amber-800">{geoError}</p> : null}
              {suggestions.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {suggestions.map((s) => {
                    const label = formatAddress(s);
                    const selected = address?.normalized === s.normalized;
                    return (
                      <li key={`${s.normalized}-${s.source}`}>
                        <button
                          className={`w-full rounded-xl border px-3 py-2 text-left text-[12px] ${
                            selected
                              ? 'border-blue-600 bg-blue-50 font-semibold text-blue-900'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300'
                          }`}
                          onClick={() => {
                            setAddress(s);
                            setAddressQuery(label);
                          }}
                          type="button"
                        >
                          {label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {address ? (
                <p className="mt-2 text-[11px] font-semibold text-emerald-700">Address confirmed</p>
              ) : null}
            </div>

            <label className="mt-4 flex cursor-pointer items-center gap-3">
              <button
                aria-checked={selfDanger}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                  selfDanger ? 'bg-red-600' : 'bg-slate-300'
                }`}
                onClick={() => setSelfDanger((v) => !v)}
                role="switch"
                type="button"
              >
                <span
                  className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform ${
                    selfDanger ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-[13px] font-medium text-slate-700">
                Is anyone in danger right now?
              </span>
            </label>

            <div className="mt-4">
              <label className="mb-2 block text-[12px] font-semibold text-slate-700" htmlFor="notes">
                Danger notes <span className="font-normal text-slate-400">Optional</span>
              </label>
              <input
                className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-[13px] outline-none focus:border-blue-500"
                id="notes"
                maxLength={500}
                onChange={(ev) => setNotes(ev.target.value)}
                placeholder='e.g. "water rising", "elderly on porch"'
                value={notes}
              />
            </div>

            <label className="mt-4 flex cursor-pointer items-center gap-3">
              <button
                aria-checked={isSelfReport}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                  isSelfReport ? 'bg-blue-700' : 'bg-slate-300'
                }`}
                onClick={() => setIsSelfReport((v) => !v)}
                role="switch"
                type="button"
              >
                <span
                  className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform ${
                    isSelfReport ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-[13px] font-medium text-slate-700">Is this your property?</span>
            </label>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
              Saves a <strong>draft</strong> now. Attach photo/video and submit in a follow-up step —
              you can still file the location and hazard details today.
            </div>

            {(error || connError) && (
              <div className="mt-3 space-y-2">
                <p className="text-[12px] font-semibold text-red-700">
                  {error ?? connError?.message}
                </p>
                {phase === 'error' ? (
                  <Link className="text-[12px] font-bold text-blue-700 underline" href="/reporter">
                    Open My submissions
                  </Link>
                ) : null}
              </div>
            )}

            <button
              className="mt-4 w-full rounded-xl bg-blue-700 px-4 py-3.5 text-[14px] font-bold text-white disabled:opacity-60"
              disabled={phase === 'creating' || !address}
              type="submit"
            >
              {phase === 'creating' ? 'Creating draft…' : 'Create draft report'}
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}
