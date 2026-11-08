// @hack/address — pure address normalization, matching and geo-cell helpers (CONTRACTS.md §2.3).
// Zero runtime dependencies and no Node/DOM APIs, so it can be bundled into the SpacetimeDB module,
// the web app and the worker alike.

/** Cell size in degrees of latitude (~250 m). */
export const CELL_DEG = 0.00225;
/** Two geocode points within this distance are the same property (§2.3 property matching). */
export const PROPERTY_MATCH_RADIUS_M = 30;
/** Radius in cells for the affected area map (~1 km). */
export const AREA_RADIUS_CELLS = 4;
/** Street-name similarity threshold for the verification match rule. */
export const STREET_SIMILARITY_THRESHOLD = 0.85;

export interface AddressParts {
  line1: string;
  city: string;
  state: string;
  zip: string;
}

export interface NormalizedParts extends AddressParts {
  /** `${line1} | ${city} | ${state} | ${zip}` — the canonical matching key. */
  normalized: string;
}

/** Minimal shape `matchAddresses` needs; a `NormalizedAddress` satisfies it. */
export interface MatchableAddress {
  line1: string;
  zip: string;
  normalized?: string;
}

export interface ParsedLine1 {
  houseNumber: string | null;
  streetName: string;
  unit?: string;
}

const STREET_SUFFIXES: Record<string, string> = {
  STREET: 'ST',
  AVENUE: 'AVE',
  ROAD: 'RD',
  DRIVE: 'DR',
  LANE: 'LN',
  BOULEVARD: 'BLVD',
  COURT: 'CT',
  CIRCLE: 'CIR',
  PLACE: 'PL',
  TERRACE: 'TER',
  PARKWAY: 'PKWY',
  HIGHWAY: 'HWY',
  TRAIL: 'TRL',
  WAY: 'WAY',
};

const DIRECTIONALS: Record<string, string> = {
  NORTH: 'N',
  SOUTH: 'S',
  EAST: 'E',
  WEST: 'W',
  NORTHEAST: 'NE',
  NORTHWEST: 'NW',
  SOUTHEAST: 'SE',
  SOUTHWEST: 'SW',
};

const UNIT_DESIGNATORS: Record<string, string> = {
  APARTMENT: 'APT',
  SUITE: 'STE',
  UNIT: 'UNIT',
  BUILDING: 'BLDG',
  FLOOR: 'FL',
};

const UNIT_ABBREVS = new Set(Object.values(UNIT_DESIGNATORS));

function collapse(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/** Uppercase, strip punctuation (keeping '#'), collapse whitespace. */
function clean(s: string): string {
  return collapse(s.toUpperCase().replace(/[^A-Z0-9#\s]/g, ' '));
}

/** Normalize a street line: USPS suffixes, directionals, unit designators, '#' → APT. */
export function normalizeLine1(line1: string): string {
  const withHash = clean(line1).replace(/#/g, ' # ');
  const tokens = collapse(withHash).split(' ').filter(Boolean);
  const out: string[] = [];
  for (const raw of tokens) {
    let tok = raw;
    if (tok === '#') tok = 'APT';
    else tok = STREET_SUFFIXES[tok] ?? DIRECTIONALS[tok] ?? UNIT_DESIGNATORS[tok] ?? tok;
    // "APT # 2" / "UNIT # 2" → keep the first designator only
    if (raw === '#' && out.length > 0 && UNIT_ABBREVS.has(out[out.length - 1]!)) continue;
    out.push(tok);
  }
  return out.join(' ');
}

export function normalizeCity(city: string): string {
  return clean(city).replace(/#/g, '').trim();
}

export function normalizeState(state: string): string {
  return clean(state).replace(/[^A-Z]/g, '').slice(0, 2);
}

/** ZIP or ZIP+4 → ZIP5 (digits only). Returns '' if fewer than 5 digits. */
export function normalizeZip(zip: string): string {
  const digits = zip.replace(/\D/g, '');
  return digits.length >= 5 ? digits.slice(0, 5) : '';
}

export function normalizeParts(parts: AddressParts): NormalizedParts {
  const line1 = normalizeLine1(parts.line1);
  const city = normalizeCity(parts.city);
  const state = normalizeState(parts.state);
  const zip = normalizeZip(parts.zip);
  return { line1, city, state, zip, normalized: `${line1} | ${city} | ${state} | ${zip}` };
}

/** CONTRACTS §2.3: normalizeAddress(parts) → NormalizedAddress.normalized */
export function normalizeAddress(parts: AddressParts): string {
  return normalizeParts(parts).normalized;
}

/** Split a street line into house number, street name and optional unit. Input may be raw or normalized. */
export function parseLine1(line1: string): ParsedLine1 {
  const tokens = normalizeLine1(line1).split(' ').filter(Boolean);
  let i = 0;
  let houseNumber: string | null = null;
  if (tokens[0] && /^\d+[A-Z]?$/.test(tokens[0])) {
    houseNumber = tokens[0];
    i = 1;
  }
  const street: string[] = [];
  let unit: string | undefined;
  for (; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (UNIT_ABBREVS.has(tok)) {
      const rest = tokens.slice(i + 1).join(' ');
      unit = rest ? `${tok} ${rest}` : tok;
      break;
    }
    street.push(tok);
  }
  const parsed: ParsedLine1 = { houseNumber, streetName: street.join(' ') };
  if (unit !== undefined) parsed.unit = unit;
  return parsed;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/** similarity = 1 − levenshtein(x, y) / max(len(x), len(y)); two empty strings → 1. */
export function similarity(x: string, y: string): number {
  const max = Math.max(x.length, y.length);
  if (max === 0) return 1;
  return 1 - levenshtein(x, y) / max;
}

/** Alias used by the verification job (P3). */
export const streetSimilarity = similarity;

/**
 * CONTRACTS §2.3 match rule:
 *   a.normalized === b.normalized
 *   OR (same ZIP5 AND same house number AND street similarity ≥ 0.85)
 *   Units: if both have a unit and they differ → false.
 */
export function matchAddresses(a: MatchableAddress, b: MatchableAddress): boolean {
  const pa = parseLine1(a.line1);
  const pb = parseLine1(b.line1);
  if (pa.unit !== undefined && pb.unit !== undefined && pa.unit !== pb.unit) return false;
  if (a.normalized !== undefined && b.normalized !== undefined && a.normalized === b.normalized) return true;
  const za = normalizeZip(a.zip);
  const zb = normalizeZip(b.zip);
  if (!za || za !== zb) return false;
  if (pa.houseNumber === null || pa.houseNumber !== pb.houseNumber) return false;
  return similarity(pa.streetName, pb.streetName) >= STREET_SIMILARITY_THRESHOLD;
}

/** Alias used by the verification job (P3). */
export const addressesMatch = matchAddresses;

const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when two points are within `meters` of each other (default: the 30 m property match radius). */
export function withinMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  meters: number = PROPERTY_MATCH_RADIUS_M,
): boolean {
  return haversineM(lat1, lng1, lat2, lng2) <= meters;
}

function colWidthForRow(row: number): number {
  const rowCenterLat = (row + 0.5) * CELL_DEG;
  const c = Math.cos(toRad(rowCenterLat));
  return CELL_DEG / Math.max(c, 1e-6);
}

/** ≈250 m grid cell id "<row>:<col>". Column width depends only on the row, so ids are stable. */
export function cellId(lat: number, lng: number): string {
  const row = Math.floor(lat / CELL_DEG);
  const col = Math.floor(lng / colWidthForRow(row));
  return `${row}:${col}`;
}

export function parseCellId(id: string): { row: number; col: number } {
  const m = /^(-?\d+):(-?\d+)$/.exec(id);
  if (!m) throw new Error(`invalid cell id: ${id}`);
  return { row: Number(m[1]), col: Number(m[2]) };
}

/** [[south, west], [north, east]] for drawing a cell (Leaflet bounds order). */
export function cellBounds(id: string): [[number, number], [number, number]] {
  const { row, col } = parseCellId(id);
  const w = colWidthForRow(row);
  const south = row * CELL_DEG;
  const west = col * w;
  return [
    [south, west],
    [south + CELL_DEG, west + w],
  ];
}

export function cellCenter(id: string): { lat: number; lng: number } {
  const [[s, w], [n, e]] = cellBounds(id);
  return { lat: (s + n) / 2, lng: (w + e) / 2 };
}

/** All cells within `radiusCells` rows/cols of `id`, including itself ((2r+1)² ids). Radius 4 ≈ 1 km. */
export function neighborCells(id: string, radiusCells: number = AREA_RADIUS_CELLS): string[] {
  const { row } = parseCellId(id);
  const center = cellCenter(id);
  const out: string[] = [];
  for (let dr = -radiusCells; dr <= radiusCells; dr++) {
    const r = row + dr;
    const c = Math.floor(center.lng / colWidthForRow(r));
    for (let dc = -radiusCells; dc <= radiusCells; dc++) out.push(`${r}:${c + dc}`);
  }
  return out;
}
