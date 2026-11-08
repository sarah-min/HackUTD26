'use client';
// /affected/start — "I've been affected": enter the home address and pick the normalized match
// (T2.7). The property is matched or created later by `start_verification` (CONTRACTS §5.2);
// this page only carries the chosen NormalizedAddress to /affected/verify.
// `?address=` prefill comes from the reporter's self-report path.
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { NormalizedAddress } from '@hack/contracts/property';
import { formatAddress, saveSelectedAddress } from '@/components/affected/helpers';

type Phase = { k: 'idle' } | { k: 'loading' } | { k: 'results'; list: NormalizedAddress[] } | { k: 'error'; msg: string };

async function geocode(qs: string): Promise<NormalizedAddress[]> {
  const res = await fetch(`/api/geocode?${qs}`);
  if (res.status === 429) throw new Error('Too many lookups. Wait a minute and try again.');
  if (!res.ok) throw new Error("The address lookup isn't responding. Try again in a moment.");
  return (await res.json()) as NormalizedAddress[];
}

function StartInner() {
  const router = useRouter();
  const params = useSearchParams();
  const prefill = params.get('address') ?? '';
  const [query, setQuery] = useState(prefill);
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const autoRan = useRef(false);

  async function run(qs: string) {
    setPhase({ k: 'loading' });
    try {
      setPhase({ k: 'results', list: await geocode(qs) });
    } catch (e) {
      setPhase({ k: 'error', msg: e instanceof Error ? e.message : 'Lookup failed.' });
    }
  }

  useEffect(() => {
    if (prefill && !autoRan.current) {
      autoRan.current = true;
      void run(new URLSearchParams({ q: prefill }).toString());
    }
  }, [prefill]);

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setPhase({ k: 'error', msg: "This device can't share its location. Type the address instead." });
      return;
    }
    setPhase({ k: 'loading' });
    navigator.geolocation.getCurrentPosition(
      (pos) => void run(new URLSearchParams({ lat: String(pos.coords.latitude), lng: String(pos.coords.longitude) }).toString()),
      () => setPhase({ k: 'error', msg: 'Location permission was denied. Type the address instead.' }),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function choose(a: NormalizedAddress) {
    saveSelectedAddress(a);
    router.push('/affected/verify');
  }

  return (
    <main className="mx-auto max-w-md space-y-5 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">I've been affected</h1>
        <p className="text-sm text-gray-600">
          Enter your home address. After you verify your ID, you'll see any damage reports filed for your home and what's
          happening around it.
        </p>
      </header>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim().length >= 5) void run(new URLSearchParams({ q: query.trim() }).toString());
        }}
      >
        <label className="block text-sm font-medium" htmlFor="address">
          Home address
        </label>
        <input
          id="address"
          className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base"
          placeholder="1234 Main St, Houston, TX 77002"
          autoComplete="street-address"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-2">
          <button type="submit" className="flex-1 rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50" disabled={phase.k === 'loading'}>
            Find address
          </button>
          <button type="button" onClick={useMyLocation} className="rounded-lg border border-gray-300 px-4 py-3 font-medium">
            Use my location
          </button>
        </div>
      </form>

      {phase.k === 'loading' && <p className="text-sm text-gray-600">Looking up the address…</p>}
      {phase.k === 'error' && (
        <p role="alert" className="text-sm text-red-700">
          {phase.msg}
        </p>
      )}
      {phase.k === 'results' &&
        (phase.list.length === 0 ? (
          <p className="text-sm text-gray-700">No match found. Check the street number and ZIP code and try again.</p>
        ) : (
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Is this your home?</h2>
            <ul className="space-y-2">
              {phase.list.map((a) => (
                <li key={a.normalized}>
                  <button
                    type="button"
                    onClick={() => choose(a)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-3 text-left hover:bg-gray-50"
                  >
                    {formatAddress(a)}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </main>
  );
}

export default function AffectedStartPage() {
  return (
    <Suspense fallback={null}>
      <StartInner />
    </Suspense>
  );
}
