// GET /api/geocode?q=<address>   → US Census Geocoder (forward), source='census'
// GET /api/geocode?lat=&lng=      → Nominatim reverse, source='nominatim'  (≤ 1 upstream req/s)
// Both return NormalizedAddress[] (CONTRACTS.md §8). Owner: Part 2.
import { NextResponse, type NextRequest } from 'next/server';
import type { NormalizedAddress } from '@hack/contracts/property';
import { censusUrl, nominatimReverseUrl, parseCensus, parseNominatimReverse, parseQuery } from './parse';
import { RateLimiter, Throttle, TtlCache } from './limits';

export const dynamic = 'force-dynamic';

const cache = new TtlCache<NormalizedAddress[]>(10 * 60_000);
const perIp = new RateLimiter(30, 60_000); // 30 requests / minute / IP
const nominatim = new Throttle(1100);
const UPSTREAM_TIMEOUT_MS = 8000;

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS), cache: 'no-store' });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.json();
}

export async function GET(req: NextRequest) {
  if (!perIp.allow(clientIp(req))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const query = parseQuery(req.nextUrl.searchParams);
  if ('error' in query) return NextResponse.json({ error: query.error }, { status: 400 });

  const key = query.kind === 'forward' ? `f:${query.q.toUpperCase()}` : `r:${query.lat.toFixed(5)},${query.lng.toFixed(5)}`;
  const cached = cache.get(key);
  if (cached) return NextResponse.json(cached);

  try {
    let result: NormalizedAddress[];
    if (query.kind === 'forward') {
      const benchmark = process.env.CENSUS_GEOCODER_BENCHMARK ?? 'Public_AR_Current';
      result = parseCensus(await fetchJson(censusUrl(query.q, benchmark)));
    } else {
      // Nominatim requires an identifying User-Agent; use a generic app name (never a personal email).
      const ua = process.env.NOMINATIM_USER_AGENT ?? 'aftermath-hackathon-demo';
      result = parseNominatimReverse(
        await nominatim.run(() => fetchJson(nominatimReverseUrl(query.lat, query.lng), { 'User-Agent': ua })),
      );
    }
    cache.set(key, result);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'geocoder_unavailable' }, { status: 502 });
  }
}
