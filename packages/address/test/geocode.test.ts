import { describe, expect, it } from 'vitest';
import censusMatch from './__fixtures__/census-match.json';
import censusNoMatch from './__fixtures__/census-nomatch.json';
import nominatimHouse from './__fixtures__/nominatim-house.json';
import nominatimRoadOnly from './__fixtures__/nominatim-road-only.json';
import nominatimError from './__fixtures__/nominatim-error.json';
// Real responses captured 2026-11-07 from the live APIs (Texas State Capitol, a public building).
import censusLive from './__fixtures__/census-live-capitol.json';
import nominatimLive from './__fixtures__/nominatim-live-capitol.json';
import { censusUrl, nominatimReverseUrl, parseCensus, parseNominatimReverse, parseGeocodeQuery } from '../src/geocode';

describe('parseCensus', () => {
  it('maps a match to a normalized address with coordinates', () => {
    const [a, ...rest] = parseCensus(censusMatch);
    expect(rest).toHaveLength(0);
    expect(a).toEqual({
      line1: '1100 CONGRESS AVE',
      city: 'AUSTIN',
      state: 'TX',
      zip: '78701',
      lat: 30.27468,
      lng: -97.74042,
      normalized: '1100 CONGRESS AVE | AUSTIN | TX | 78701',
      source: 'census',
    });
  });
  it('returns [] for no matches or junk', () => {
    expect(parseCensus(censusNoMatch)).toEqual([]);
    expect(parseCensus(null)).toEqual([]);
    expect(parseCensus({ result: { addressMatches: [{ matchedAddress: 'BAD' }] } })).toEqual([]);
  });
});

describe('parseNominatimReverse', () => {
  it('maps a building with a house number, abbreviating the street and trimming ZIP+4', () => {
    const [a] = parseNominatimReverse(nominatimHouse);
    expect(a).toMatchObject({
      line1: '1100 CONGRESS AVE',
      city: 'AUSTIN',
      state: 'TX',
      zip: '78701',
      source: 'nominatim',
    });
    expect(a!.lat).toBeCloseTo(30.2746652, 6);
    expect(a!.lng).toBeCloseTo(-97.7403505, 6);
  });
  it('agrees with Census on the matching key for the same place', () => {
    expect(parseNominatimReverse(nominatimHouse)[0]!.normalized).toBe(parseCensus(censusMatch)[0]!.normalized);
  });
  it('returns [] without a house number, on error, or outside the US', () => {
    expect(parseNominatimReverse(nominatimRoadOnly)).toEqual([]);
    expect(parseNominatimReverse(nominatimError)).toEqual([]);
    expect(
      parseNominatimReverse({ ...nominatimHouse, address: { ...nominatimHouse.address, country_code: 'mx' } }),
    ).toEqual([]);
  });
  it('falls back to the state name when the ISO code is missing', () => {
    const { ['ISO3166-2-lvl4']: _iso, ...addr } = nominatimHouse.address;
    expect(parseNominatimReverse({ ...nominatimHouse, address: addr })[0]!.state).toBe('TX');
  });
});

describe('parseGeocodeQuery and URLs', () => {
  it('accepts q or lat/lng and rejects bad input', () => {
    expect(parseGeocodeQuery({ q: '  1100  Congress Ave, Austin TX ' })).toEqual({ kind: 'forward', q: '1100 Congress Ave, Austin TX' });
    expect(parseGeocodeQuery({ lat: 30.27, lng: -97.74 })).toEqual({ kind: 'reverse', lat: 30.27, lng: -97.74 });
    expect(parseGeocodeQuery({ q: 'ab' })).toHaveProperty('error');
    expect(parseGeocodeQuery({ lat: 91, lng: 0 })).toHaveProperty('error');
    expect(parseGeocodeQuery({ lat: NaN, lng: 0 })).toHaveProperty('error');
    expect(parseGeocodeQuery({})).toHaveProperty('error');
  });
  it('builds upstream URLs', () => {
    const c = new URL(censusUrl('1100 Congress Ave', 'Public_AR_Current'));
    expect(c.hostname).toBe('geocoding.geo.census.gov');
    expect(c.searchParams.get('format')).toBe('json');
    expect(c.searchParams.get('address')).toBe('1100 Congress Ave');
    const n = new URL(nominatimReverseUrl(30.1, -97.2));
    expect(n.searchParams.get('format')).toBe('jsonv2');
    expect(n.searchParams.get('lon')).toBe('-97.200000');
  });
});

describe('live-captured responses (VERIFIED 2026-11-07)', () => {
  it('parses a real Census onelineaddress match', () => {
    const [a] = parseCensus(censusLive);
    expect(a).toMatchObject({ line1: '1100 CONGRESS AVE', city: 'AUSTIN', state: 'TX', zip: '78701', source: 'census' });
    expect(a!.lat).toBeCloseTo(30.2764, 3);
    expect(a!.lng).toBeCloseTo(-97.7398, 3);
  });

  it('parses a real Nominatim jsonv2 reverse result', () => {
    const [a] = parseNominatimReverse(nominatimLive);
    expect(a).toMatchObject({ line1: '112 E 11TH ST', city: 'AUSTIN', state: 'TX', zip: '78701', source: 'nominatim' });
  });
});
