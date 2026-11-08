// Address lookup procedures: upstream mapping, caching and the Nominatim throttle (HTTP mocked).
import { describe, expect, it } from 'vitest';
import { setup, mod } from './helpers';
import censusMatch from '../../packages/address/test/__fixtures__/census-match.json';
import nominatimHouse from '../../packages/address/test/__fixtures__/nominatim-house.json';

function call(s: ReturnType<typeof setup>, proc: any, args: any, body: unknown, seen: string[] = [], status = 200) {
  const ctx = s.h
    .procedureContextBuilder(s.user('anon'))
    .http((_t, req) => {
      seen.push(req.uri);
      return { code: status, headers: { entries: [] }, version: { tag: 'Http11' }, body: JSON.stringify(body) } as any;
    })
    .build();
  return proc(ctx, args);
}

describe('geocode procedures', () => {
  it('forward lookup maps Census results and caches them', () => {
    const s = setup();
    const seen: string[] = [];
    const r = call(s, mod.geocode_address, { q: '1100 Congress Ave, Austin TX' }, censusMatch, seen);
    expect(r.ok).toBe(true);
    expect(JSON.parse(r.addresses_json)[0]).toMatchObject({ line1: '1100 CONGRESS AVE', zip: '78701', source: 'census' });
    expect(seen[0]).toContain('geocoding.geo.census.gov');
    const again = call(s, mod.geocode_address, { q: '1100 congress ave, austin tx' }, null, seen);
    expect(again.addresses_json).toBe(r.addresses_json);
    expect(seen).toHaveLength(1);
  });

  it('reverse lookup uses Nominatim and spaces requests 1.1 s apart', () => {
    const s = setup();
    const a = call(s, mod.geocode_point, { lat: 30.27466, lng: -97.74035 }, nominatimHouse);
    expect(JSON.parse(a.addresses_json)[0]).toMatchObject({ line1: '1100 CONGRESS AVE', source: 'nominatim' });
    expect(call(s, mod.geocode_point, { lat: 30.1, lng: -97.1 }, nominatimHouse).error).toBe('busy');
    s.advanceMs(1200);
    expect(call(s, mod.geocode_point, { lat: 30.1, lng: -97.1 }, nominatimHouse).ok).toBe(true);
  });

  it('rejects bad input and reports upstream failures', () => {
    const s = setup();
    expect(call(s, mod.geocode_address, { q: 'ab' }, null).ok).toBe(false);
    expect(call(s, mod.geocode_point, { lat: 91, lng: 0 }, null).ok).toBe(false);
    expect(call(s, mod.geocode_address, { q: '1 Main St, Dallas TX' }, {}, [], 503).error).toBe('geocoder_unavailable');
  });
});
