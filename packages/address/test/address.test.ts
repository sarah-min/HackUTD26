import { describe, expect, it } from 'vitest';
import {
  CELL_DEG,
  addressesMatch,
  cellBounds,
  cellCenter,
  cellId,
  haversineM,
  matchAddresses,
  neighborCells,
  normalizeAddress,
  normalizeLine1,
  normalizeParts,
  normalizeZip,
  parseLine1,
  similarity,
  streetSimilarity,
  withinMeters,
} from '../src/index.ts';

describe('normalizeLine1', () => {
  it('maps USPS street suffixes', () => {
    expect(normalizeLine1('123 Main Street')).toBe('123 MAIN ST');
    expect(normalizeLine1('5 Oak Avenue')).toBe('5 OAK AVE');
    expect(normalizeLine1('9 Elm Road')).toBe('9 ELM RD');
    expect(normalizeLine1('1 Lake Drive')).toBe('1 LAKE DR');
    expect(normalizeLine1('2 Pine Lane')).toBe('2 PINE LN');
    expect(normalizeLine1('3 Sunset Boulevard')).toBe('3 SUNSET BLVD');
    expect(normalizeLine1('4 King Court')).toBe('4 KING CT');
    expect(normalizeLine1('6 Ring Circle')).toBe('6 RING CIR');
    expect(normalizeLine1('7 Rose Place')).toBe('7 ROSE PL');
    expect(normalizeLine1('8 Hill Terrace')).toBe('8 HILL TER');
    expect(normalizeLine1('10 Lone Star Parkway')).toBe('10 LONE STAR PKWY');
    expect(normalizeLine1('11 State Highway 78')).toBe('11 STATE HWY 78');
    expect(normalizeLine1('12 Creek Trail')).toBe('12 CREEK TRL');
    expect(normalizeLine1('13 Milky Way')).toBe('13 MILKY WAY');
  });

  it('maps directionals', () => {
    expect(normalizeLine1('100 North Main Street')).toBe('100 N MAIN ST');
    expect(normalizeLine1('100 Southwest Freeway')).toBe('100 SW FREEWAY');
    expect(normalizeLine1('7 East West Street')).toBe('7 E W ST');
  });

  it('maps unit designators and #', () => {
    expect(normalizeLine1('12 Main St Apartment 4')).toBe('12 MAIN ST APT 4');
    expect(normalizeLine1('12 Main St Suite 200')).toBe('12 MAIN ST STE 200');
    expect(normalizeLine1('12 Main St Building B')).toBe('12 MAIN ST BLDG B');
    expect(normalizeLine1('12 Main St Floor 3')).toBe('12 MAIN ST FL 3');
    expect(normalizeLine1('12 Main St #4')).toBe('12 MAIN ST APT 4');
    expect(normalizeLine1('12 Main St Apt #4')).toBe('12 MAIN ST APT 4');
    expect(normalizeLine1('12 Main St Unit #4')).toBe('12 MAIN ST UNIT 4');
  });

  it('handles case, punctuation and whitespace', () => {
    expect(normalizeLine1('  123   main   st.  ')).toBe('123 MAIN ST');
    expect(normalizeLine1("123 O'Connor St.")).toBe('123 O CONNOR ST');
    expect(normalizeLine1('123 Main St., Apt. 4')).toBe('123 MAIN ST APT 4');
  });
});

describe('normalizeAddress / normalizeParts', () => {
  it('builds the canonical key', () => {
    expect(
      normalizeAddress({ line1: '1234 north main street', city: 'Richardson', state: 'tx', zip: '75080-1234' }),
    ).toBe('1234 N MAIN ST | RICHARDSON | TX | 75080');
  });

  it('is idempotent', () => {
    const p = normalizeParts({ line1: '5 Oak Avenue #2', city: 'Fort Worth', state: 'TX', zip: '76102' });
    expect(normalizeParts(p).normalized).toBe(p.normalized);
  });

  it('ZIP+4 → ZIP5', () => {
    expect(normalizeZip('75080-1234')).toBe('75080');
    expect(normalizeZip('750801234')).toBe('75080');
    expect(normalizeZip('7508')).toBe('');
  });

  it('city punctuation', () => {
    expect(normalizeParts({ line1: '1 A St', city: 'St. Louis', state: 'MO', zip: '63101' }).city).toBe('ST LOUIS');
  });
});

describe('parseLine1', () => {
  it('splits house number, street and unit', () => {
    expect(parseLine1('1234 N Main St Apt 2')).toEqual({ houseNumber: '1234', streetName: 'N MAIN ST', unit: 'APT 2' });
    expect(parseLine1('12B Oak Ave')).toEqual({ houseNumber: '12B', streetName: 'OAK AVE' });
    expect(parseLine1('Rural Route 5')).toEqual({ houseNumber: null, streetName: 'RURAL ROUTE 5' });
  });
});

describe('similarity', () => {
  it('matches the contract formula', () => {
    expect(similarity('MAIN ST', 'MAIN ST')).toBe(1);
    expect(similarity('', '')).toBe(1);
    expect(similarity('ABCD', 'ABCE')).toBeCloseTo(0.75);
    expect(streetSimilarity).toBe(similarity);
  });
});

describe('matchAddresses', () => {
  const base = { line1: '1234 N MAIN ST', zip: '75080', normalized: '1234 N MAIN ST | RICHARDSON | TX | 75080' };

  it('exact normalized match', () => {
    expect(matchAddresses(base, { ...base })).toBe(true);
    expect(addressesMatch).toBe(matchAddresses);
  });

  it('fuzzy match: same zip + house number + similar street (≥ 0.85)', () => {
    // one typo in a long street name: 1 - 1/14 ≈ 0.93
    expect(matchAddresses({ line1: '1234 N Greenville Ave', zip: '75080' }, { line1: '1234 N Grenville Ave', zip: '75080' })).toBe(true);
    // suffix spelled out vs abbreviated normalizes to the same street
    expect(matchAddresses({ line1: '1234 North Main Street', zip: '75080' }, base)).toBe(true);
  });

  it('rejects below the threshold', () => {
    // "N MAIN ST" vs "N MAPLE ST": similarity 0.7
    expect(matchAddresses({ line1: '1234 N Maple St', zip: '75080' }, base)).toBe(false);
  });

  it('rejects different zip or house number', () => {
    expect(matchAddresses({ line1: '1234 N Main St', zip: '75081' }, base)).toBe(false);
    expect(matchAddresses({ line1: '1235 N Main St', zip: '75080' }, base)).toBe(false);
    expect(matchAddresses({ line1: 'N Main St', zip: '75080' }, { line1: 'N Main St', zip: '75080' })).toBe(false);
  });

  it('units: both present and different → false; one missing → can match', () => {
    expect(matchAddresses({ line1: '12 Main St Apt 1', zip: '75080' }, { line1: '12 Main St Apt 2', zip: '75080' })).toBe(false);
    expect(matchAddresses({ line1: '12 Main St Apt 1', zip: '75080' }, { line1: '12 Main St #1', zip: '75080' })).toBe(true);
    expect(matchAddresses({ line1: '12 Main St Apt 1', zip: '75080' }, { line1: '12 Main St', zip: '75080' })).toBe(true);
  });
});

describe('haversineM / withinMeters', () => {
  it('computes known distances', () => {
    expect(haversineM(32.9857, -96.7502, 32.9857, -96.7502)).toBe(0);
    // 0.001° latitude ≈ 111.2 m
    expect(haversineM(32.0, -96.0, 32.001, -96.0)).toBeCloseTo(111.2, 0);
  });

  it('30 m property match radius', () => {
    // ~0.00025° lat ≈ 27.8 m → inside; 0.0003° ≈ 33.4 m → outside
    expect(withinMeters(32.98, -96.75, 32.98025, -96.75)).toBe(true);
    expect(withinMeters(32.98, -96.75, 32.9803, -96.75)).toBe(false);
  });
});

describe('cells', () => {
  it('is stable: same point → same id, and the center maps back to its own cell', () => {
    const id = cellId(32.9857, -96.7502);
    expect(cellId(32.9857, -96.7502)).toBe(id);
    const c = cellCenter(id);
    expect(cellId(c.lat, c.lng)).toBe(id);
  });

  it('cell edges: inclusive south/west, exclusive north/east', () => {
    const id = cellId(32.9857, -96.7502);
    const [[s, w], [n, e]] = cellBounds(id);
    expect(cellId(s + 1e-9, w + 1e-9)).toBe(id);
    expect(cellId(n + 1e-9, (w + e) / 2)).not.toBe(id);
    expect(cellId((s + n) / 2, e + 1e-9)).not.toBe(id);
  });

  it('cells are ~250 m on a side', () => {
    const [[s, w], [n, e]] = cellBounds(cellId(32.9857, -96.7502));
    expect(n - s).toBeCloseTo(CELL_DEG);
    expect(haversineM(s, w, n, w)).toBeGreaterThan(240);
    expect(haversineM(s, w, n, w)).toBeLessThan(260);
    expect(haversineM(s, w, s, e)).toBeGreaterThan(240);
    expect(haversineM(s, w, s, e)).toBeLessThan(260);
  });

  it('works on negative coordinates', () => {
    const id = cellId(-33.86, 151.21);
    const c = cellCenter(id);
    expect(cellId(c.lat, c.lng)).toBe(id);
  });

  it('neighborCells returns (2r+1)² unique ids including itself', () => {
    const id = cellId(32.9857, -96.7502);
    const n = neighborCells(id, 4);
    expect(n).toHaveLength(81);
    expect(new Set(n).size).toBe(81);
    expect(n).toContain(id);
    expect(neighborCells(id, 1)).toHaveLength(9);
  });

  it('rejects invalid ids', () => {
    expect(() => cellBounds('nope')).toThrow();
  });
});
