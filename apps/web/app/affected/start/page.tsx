'use client';
// /affected/start — "I've been affected": enter the home address and pick the normalized match
// (T2.7). The property is matched or created later by `start_verification` (CONTRACTS §5.2);
// this page only carries the chosen NormalizedAddress to /affected/verify.
// `?address=` prefill comes from the reporter's self-report path.
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { NormalizedAddress } from '@hack/contracts/property';
import { formatAddress, saveSelectedAddress } from '@/components/affected/helpers';
import { AppShell } from '@/components/chrome/AppShell';
import { P } from '@/lib/stdb';
import { useProcedure } from 'spacetimedb/react';

type Phase = { k: 'idle' } | { k: 'loading' } | { k: 'results'; list: NormalizedAddress[] } | { k: 'error'; msg: string };

type GeocodeQuery = { q: string } | { lat: number; lng: number };
type GeocodeResult = { ok: boolean; error: string; addressesJson: string };

/** Address lookup runs in the SpacetimeDB module (geocode_address / geocode_point procedures). */
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
    if (r.error === 'geocoder_unavailable') throw new Error("The address lookup isn't responding. Try again in a moment.");
    throw new Error('Enter a full street address.');
  }
  throw new Error('Too many lookups right now. Try again in a moment.');
}

function StartInner() {
  const router = useRouter();
  const params = useSearchParams();
  const prefill = params.get('address') ?? '';
  const [query, setQuery] = useState(prefill);
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const autoRan = useRef(false);
  const forward = useProcedure(P.geocodeAddress);
  const reverse = useProcedure(P.geocodePoint);

  async function run(query: GeocodeQuery) {
    setPhase({ k: 'loading' });
    try {
      setPhase({ k: 'results', list: await geocode(query, forward, reverse) });
    } catch (e) {
      setPhase({ k: 'error', msg: e instanceof Error ? e.message : 'Lookup failed.' });
    }
  }

  useEffect(() => {
    if (prefill && !autoRan.current) {
      autoRan.current = true;
      void run({ q: prefill });
    }
  }, [prefill]);

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setPhase({ k: 'error', msg: "This device can't share its location. Type the address instead." });
      return;
    }
    setPhase({ k: 'loading' });
    navigator.geolocation.getCurrentPosition(
      (pos) => void run({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setPhase({ k: 'error', msg: 'Location permission was denied. Type the address instead.' }),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function choose(a: NormalizedAddress) {
    saveSelectedAddress(a);
    router.push('/affected/verify');
  }

  return (
    <AppShell>
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Affected</p>
        <h1 className="mt-0.5 text-lg font-bold tracking-[-0.02em] text-slate-950">
          I&apos;ve been affected
        </h1>
        <p className="mt-1 text-[12px] text-slate-500">
          Enter your home address. After you verify your ID, you&apos;ll see any damage reports
          filed for your home and what&apos;s happening around it.
        </p>
      </header>

      <form
        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim().length >= 5) void run({ q: query.trim() });
        }}
      >
        <label className="block text-[12px] font-semibold text-slate-700" htmlFor="address">
          Home address
        </label>
        <input
          id="address"
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-blue-500"
          placeholder="1234 Main St, Houston, TX 77002"
          autoComplete="street-address"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 rounded-xl bg-blue-700 px-4 py-3 text-[13px] font-bold text-white disabled:opacity-50"
            disabled={phase.k === 'loading'}
          >
            Find address
          </button>
          <button
            type="button"
            onClick={useMyLocation}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] font-semibold text-slate-700"
          >
            Use my location
          </button>
        </div>
      </form>

      {phase.k === 'loading' && <p className="text-[13px] text-slate-600">Looking up the address…</p>}
      {phase.k === 'error' && (
        <p role="alert" className="text-[13px] font-semibold text-red-700">
          {phase.msg}
        </p>
      )}
      {phase.k === 'results' &&
        (phase.list.length === 0 ? (
          <p className="text-[13px] text-slate-700">
            No match found. Check the street number and ZIP code and try again.
          </p>
        ) : (
          <section className="space-y-2">
            <h2 className="text-[12px] font-semibold text-slate-700">Is this your home?</h2>
            <ul className="space-y-2">
              {phase.list.map((a) => (
                <li key={a.normalized}>
                  <button
                    type="button"
                    onClick={() => choose(a)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-[13px] text-slate-800 hover:border-blue-300 hover:bg-blue-50"
                  >
                    {formatAddress(a)}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </AppShell>
  );
}

export default function AffectedStartPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <p className="text-sm text-slate-600">Loading…</p>
        </AppShell>
      }
    >
      <StartInner />
    </Suspense>
  );
}
