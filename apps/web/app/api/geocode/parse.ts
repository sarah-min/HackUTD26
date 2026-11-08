// Pure request/response mapping for /api/geocode (CONTRACTS.md §8). No I/O here, so it's unit-tested
// against recorded sample responses in __fixtures__/.
import { normalizeParts } from '@hack/address';
import type { NormalizedAddress } from '@hack/contracts/property';

export const CENSUS_BASE = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
export const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/reverse';

export function censusUrl(q: string, benchmark: string): string {
  const u = new URL(CENSUS_BASE);
  u.searchParams.set('address', q);
  u.searchParams.set('benchmark', benchmark);
  u.searchParams.set('format', 'json');
  return u.toString();
}

export function nominatimReverseUrl(lat: number, lng: number): string {
  const u = new URL(NOMINATIM_BASE);
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('lat', lat.toFixed(6));
  u.searchParams.set('lon', lng.toFixed(6));
  u.searchParams.set('addressdetails', '1');
  u.searchParams.set('zoom', '18'); // building-level
  return u.toString();
}

/** `?q=` must be a plausible one-line US address; `?lat&lng` must be valid coordinates. */
export type GeocodeQuery = { kind: 'forward'; q: string } | { kind: 'reverse'; lat: number; lng: number };

export function parseQuery(params: URLSearchParams): GeocodeQuery | { error: string } {
  const q = params.get('q');
  if (q !== null) {
    const trimmed = q.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 5 || trimmed.length > 200) return { error: 'q must be 5–200 characters' };
    return { kind: 'forward', q: trimmed };
  }
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  if (params.has('lat') && params.has('lng') && Number.isFinite(lat) && Number.isFinite(lng)) {
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { error: 'lat/lng out of range' };
    return { kind: 'reverse', lat, lng };
  }
  return { error: 'pass ?q=<address> or ?lat=&lng=' };
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
