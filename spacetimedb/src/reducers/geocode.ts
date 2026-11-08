// Address lookup as procedures (replaces GET /api/geocode). Forward: US Census Geocoder; reverse: Nominatim.
// Both return NormalizedAddress[] as JSON (CONTRACTS.md §8). Results are cached 10 minutes; Nominatim requests are
// spaced >= 1.1 s apart across all callers (a caller arriving too soon gets error 'busy' and retries).
import { t } from 'spacetimedb/server';
import { TimeDuration } from 'spacetimedb';
import { spacetimedb } from '../schema';
import {
  censusUrl,
  nominatimReverseUrl,
  parseCensus,
  parseGeocodeQuery,
  parseNominatimReverse,
  type GeocodeQuery,
  type NormalizedAddress,
} from '../../../packages/address/src/geocode';

const CACHE_MICROS = 10n * 60n * 1_000_000n;
const NOMINATIM_GAP_MICROS = 1_100_000n;
const UPSTREAM_TIMEOUT_MS = 8000;
const CENSUS_BENCHMARK = 'Public_AR_Current';
// Nominatim requires an identifying User-Agent; a generic app name, never a personal email.
const USER_AGENT = 'aftermath-hackathon-demo';
const MAX_CACHE_ROWS = 2000;

const GeocodeResult = t.object('GeocodeResult', { ok: t.bool(), error: t.string(), addresses_json: t.string() });

function run(ctx: any, query: GeocodeQuery | { error: string }) {
  if ('error' in query) return { ok: false, error: query.error, addresses_json: '[]' };
  const key = query.kind === 'forward' ? `f:${query.q.toUpperCase()}` : `r:${query.lat.toFixed(5)},${query.lng.toFixed(5)}`;

  // 1. cache hit, or (reverse) claim the Nominatim slot
  const gate = ctx.withTx((tx: any) => {
    const now = tx.timestamp.microsSinceUnixEpoch as bigint;
    const hit = tx.db.geocode_cache.key.find(key);
    if (hit && now - hit.at.microsSinceUnixEpoch < CACHE_MICROS) return { cached: hit.result_json as string };
    if (query.kind === 'reverse') {
      const th = tx.db.geocode_throttle.id.find(0);
      if (th && now - th.last_nominatim_at.microsSinceUnixEpoch < NOMINATIM_GAP_MICROS) return { busy: true };
      if (th) tx.db.geocode_throttle.id.update({ id: 0, last_nominatim_at: tx.timestamp });
      else tx.db.geocode_throttle.insert({ id: 0, last_nominatim_at: tx.timestamp });
    }
    return {};
  });
  if (gate.cached !== undefined) return { ok: true, error: '', addresses_json: gate.cached };
  if (gate.busy) return { ok: false, error: 'busy', addresses_json: '[]' };

  // 2. upstream call (outside any transaction)
  let result: NormalizedAddress[];
  try {
    const url = query.kind === 'forward' ? censusUrl(query.q, CENSUS_BENCHMARK) : nominatimReverseUrl(query.lat, query.lng);
    const res = ctx.http.fetch(url, {
      headers: query.kind === 'reverse' ? { 'User-Agent': USER_AGENT, Accept: 'application/json' } : { Accept: 'application/json' },
      timeout: TimeDuration.fromMillis(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: 'geocoder_unavailable', addresses_json: '[]' };
    const json = res.json();
    result = query.kind === 'forward' ? parseCensus(json) : parseNominatimReverse(json);
  } catch {
    return { ok: false, error: 'geocoder_unavailable', addresses_json: '[]' };
  }

  // 3. cache
  const out = JSON.stringify(result);
  ctx.withTx((tx: any) => {
    if (tx.db.geocode_cache.count() >= MAX_CACHE_ROWS) {
      const cutoff = (tx.timestamp.microsSinceUnixEpoch as bigint) - CACHE_MICROS;
      for (const r of [...tx.db.geocode_cache.iter()]) if (r.at.microsSinceUnixEpoch < cutoff) tx.db.geocode_cache.key.delete(r.key);
    }
    tx.db.geocode_cache.key.delete(key);
    tx.db.geocode_cache.insert({ key, result_json: out, at: tx.timestamp });
  });
  return { ok: true, error: '', addresses_json: out };
}

/** Forward lookup: a one-line US address → NormalizedAddress[] (JSON). */
export const geocode_address = spacetimedb.procedure({ q: t.string() }, GeocodeResult, (ctx, { q }) =>
  run(ctx, parseGeocodeQuery({ q })),
);

/** Reverse lookup: device coordinates → 0 or 1 NormalizedAddress (JSON). */
export const geocode_point = spacetimedb.procedure({ lat: t.f64(), lng: t.f64() }, GeocodeResult, (ctx, { lat, lng }) =>
  run(ctx, parseGeocodeQuery({ lat, lng })),
);

