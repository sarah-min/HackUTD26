// Property matching (CONTRACTS.md §2.3): exact normalized match → else any property in
// the same or a neighboring cell within 30 m of the geocode point → else create.
import {
  normalizeParts,
  cellId,
  neighborCells,
  haversineM,
  PROPERTY_MATCH_RADIUS_M,
} from '../../packages/address/src/index';
import { fail, type Ctx } from './constants';

/** Shape of NormalizedAddress (CONTRACTS §2.3) as it arrives in reducer JSON. */
export interface AddressInput {
  line1: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  normalized?: string;
  source?: string;
}

export const NO_CELL = '';

export function parseAddress(raw: unknown): AddressInput {
  if (!raw || typeof raw !== 'object') fail('invalid address');
  const a = raw as Record<string, unknown>;
  const str = (k: string, max: number) => {
    const v = a[k];
    if (typeof v !== 'string' || v.trim() === '' || v.length > max) fail(`invalid address.${k}`);
    return v;
  };
  const num = (k: string, min: number, max: number): number | null => {
    const v = a[k];
    if (v === null || v === undefined) return null;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(`invalid address.${k}`);
    return v;
  };
  const lat = num('lat', -90, 90);
  const lng = num('lng', -180, 180);
  if ((lat === null) !== (lng === null)) fail('invalid address: lat and lng must both be set or both null');
  return {
    line1: str('line1', 120),
    city: str('city', 60),
    state: str('state', 2),
    zip: str('zip', 10),
    lat,
    lng,
  };
}

/** Returns the matched or newly created property id. */
export function upsertProperty(ctx: Ctx, addr: AddressInput): bigint {
  // Re-normalize server-side; never trust the client's `normalized` string.
  const n = normalizeParts(addr);
  const exact = ctx.db.property_private.normalized.find(n.normalized);
  if (exact) return exact.property_id;

  if (addr.lat !== null && addr.lng !== null) {
    const home = cellId(addr.lat, addr.lng);
    for (const c of neighborCells(home, 1)) {
      for (const p of ctx.db.property.cell_id.filter(c)) {
        const priv = ctx.db.property_private.property_id.find(p.id);
        if (!priv || priv.lat === undefined || priv.lng === undefined) continue;
        if (haversineM(addr.lat, addr.lng, priv.lat, priv.lng) <= PROPERTY_MATCH_RADIUS_M) return p.id;
      }
    }
  }

  const cell = addr.lat !== null && addr.lng !== null ? cellId(addr.lat, addr.lng) : NO_CELL;
  const created = ctx.db.property.insert({ id: 0n, cell_id: cell, created_at: ctx.timestamp, county_fips: undefined });
  ctx.db.property_private.insert({
    property_id: created.id,
    normalized: n.normalized,
    line1: n.line1,
    city: n.city,
    state: n.state,
    zip: n.zip,
    lat: addr.lat ?? undefined,
    lng: addr.lng ?? undefined,
    county_fips: undefined,
  });
  return created.id;
}
