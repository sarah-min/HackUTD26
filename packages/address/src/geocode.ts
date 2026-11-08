// Pure request/response mapping for address lookup (CONTRACTS.md §8). No I/O here; the SpacetimeDB module's
// geocode procedures (spacetimedb/src/reducers/geocode.ts) do the HTTP calls. Unit-tested against recorded
// responses in packages/address/test/__fixtures__/. Moved from apps/web/app/api/geocode/parse.ts.
// No URL/URLSearchParams: the module runtime may not provide them.
import { normalizeParts } from './index';

/** Same shape as NormalizedAddress in @hack/contracts/property (kept local so the module bundle stays dependency-free). */
export interface NormalizedAddress {
  line1: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  normalized: string;
  source: 'census' | 'nominatim' | 'manual';
}

const qs = (params: Record<string, string>) =>
  Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

export const CENSUS_BASE = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
export const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/reverse';

export function censusUrl(q: string, benchmark: string): string {
  return `${CENSUS_BASE}?${qs({ address: q, benchmark, format: 'json' })}`;
}

export function nominatimReverseUrl(lat: number, lng: number): string {
  // zoom 18 = building-level
  return `${NOMINATIM_BASE}?${qs({ format: 'jsonv2', lat: lat.toFixed(6), lon: lng.toFixed(6), addressdetails: '1', zoom: '18' })}`;
}

/** A forward query must be a plausible one-line US address; a reverse query must be valid coordinates. */
export type GeocodeQuery = { kind: 'forward'; q: string } | { kind: 'reverse'; lat: number; lng: number };

export function parseGeocodeQuery(input: { q?: string | null; lat?: number | null; lng?: number | null }): GeocodeQuery | { error: string } {
  if (typeof input.q === 'string') {
    const trimmed = input.q.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 5 || trimmed.length > 200) return { error: 'q must be 5–200 characters' };
    return { kind: 'forward', q: trimmed };
  }
  const { lat, lng } = input;
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { error: 'lat/lng out of range' };
    return { kind: 'reverse', lat, lng };
  }
  return { error: 'pass an address or coordinates' };
}

function build(
  parts: { line1: string; city: string; state: string; zip: string },
  lat: number | null,
  lng: number | null,
  source: NormalizedAddress['source'],
): NormalizedAddress | null {
  const n = normalizeParts(parts);
  if (!n.line1 || !n.city || n.state.length !== 2 || n.zip.length !== 5) return null;
  return { line1: n.line1, city: n.city, state: n.state, zip: n.zip, lat, lng, normalized: n.normalized, source };
}

// ---- US Census Geocoder (forward) -------------------------------------------------------------

interface CensusMatch {
  matchedAddress?: string; // "1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500"
  coordinates?: { x?: number; y?: number }; // x = lng, y = lat
}

/** Maps a Census `onelineaddress` JSON response to NormalizedAddress[] (empty when there's no match). */
export function parseCensus(json: unknown): NormalizedAddress[] {
  const matches = (json as { result?: { addressMatches?: CensusMatch[] } })?.result?.addressMatches;
  if (!Array.isArray(matches)) return [];
  const out: NormalizedAddress[] = [];
  for (const m of matches) {
    const parts = (m.matchedAddress ?? '').split(',').map((s) => s.trim());
    if (parts.length < 4) continue;
    const zip = parts[parts.length - 1]!;
    const state = parts[parts.length - 2]!;
    const city = parts[parts.length - 3]!;
    const line1 = parts.slice(0, parts.length - 3).join(' ');
    const lat = typeof m.coordinates?.y === 'number' ? m.coordinates.y : null;
    const lng = typeof m.coordinates?.x === 'number' ? m.coordinates.x : null;
    const a = build({ line1, city, state, zip }, lat, lng, 'census');
    if (a) out.push(a);
  }
  return dedupe(out);
}

// ---- Nominatim (reverse) ------------------------------------------------------------------------

interface NominatimReverse {
  lat?: string;
  lon?: string;
  error?: string;
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    suburb?: string;
    county?: string;
    state?: string;
    'ISO3166-2-lvl4'?: string; // "US-TX"
    postcode?: string;
    country_code?: string;
  };
}

const US_STATES: Record<string, string> = {
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA', COLORADO: 'CO',
  CONNECTICUT: 'CT', DELAWARE: 'DE', 'DISTRICT OF COLUMBIA': 'DC', FLORIDA: 'FL', GEORGIA: 'GA',
  HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS', KENTUCKY: 'KY',
  LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN',
  MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND',
  OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT',
  VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV', WISCONSIN: 'WI', WYOMING: 'WY',
  'PUERTO RICO': 'PR',
};

/** Maps a Nominatim reverse JSON response to 0 or 1 NormalizedAddress. US addresses with a house number only. */
export function parseNominatimReverse(json: unknown): NormalizedAddress[] {
  const r = json as NominatimReverse;
  const a = r?.address;
  if (!a || r.error || a.country_code !== 'us' || !a.house_number || !a.road) return [];
  const iso = a['ISO3166-2-lvl4'];
  const state = iso?.startsWith('US-') ? iso.slice(3) : US_STATES[(a.state ?? '').toUpperCase()] ?? '';
  const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? '';
  const lat = r.lat !== undefined ? Number(r.lat) : NaN;
  const lng = r.lon !== undefined ? Number(r.lon) : NaN;
  const built = build(
    { line1: `${a.house_number} ${a.road}`, city, state, zip: a.postcode ?? '' },
    Number.isFinite(lat) ? lat : null,
    Number.isFinite(lng) ? lng : null,
    'nominatim',
  );
  return built ? [built] : [];
}

function dedupe(list: NormalizedAddress[]): NormalizedAddress[] {
  const seen = new Set<string>();
  return list.filter((a) => (seen.has(a.normalized) ? false : (seen.add(a.normalized), true)));
}
