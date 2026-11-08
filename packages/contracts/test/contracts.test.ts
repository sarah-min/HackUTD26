import { describe, expect, it } from 'vitest';
import { normalizeAddress, parseCellId } from '@hack/address';
import {
  DAMAGE_LEVEL_RANK,
  DamageLevelSchema,
  LifeSafetyFlagSchema,
  SERIOUS_FLAGS,
  SEVERE_FLAGS,
  SourceSchema,
} from '../src/common';
import { AREA_CELL_MIN_REPORTS_FOR_FLAGS, AreaCellSchema, NormalizedAddressSchema } from '../src/property';
import { CreateReportInputSchema } from '../src/report';
import areaCells from '../../../fixtures/property/area-cells.json';
import addrCensus from '../../../fixtures/property/normalized-address-census.json';
import addrManual from '../../../fixtures/property/normalized-address-manual.json';
import report from '../../../fixtures/report/create-report-input.json';
import selfReport from '../../../fixtures/report/create-report-input-self-report.json';

const fixtures = [areaCells, addrCensus, addrManual, report, selfReport];

describe('fixtures', () => {
  it('every P2 fixture is labeled source="fixture"', () => {
    for (const f of fixtures) expect(SourceSchema.parse(f.source)).toBe('fixture');
  });

  it('NormalizedAddress fixtures validate and their key matches @hack/address', () => {
    for (const f of [addrCensus, addrManual]) {
      const a = NormalizedAddressSchema.parse(f.data);
      expect(normalizeAddress(a)).toBe(a.normalized);
    }
  });

  it('CreateReportInput fixtures validate', () => {
    for (const f of [report, selfReport]) {
      const r = CreateReportInputSchema.parse(f.data);
      expect(normalizeAddress(r.address)).toBe(r.address.normalized);
    }
  });

  it('AreaCell fixtures validate and obey the ≥3-report privacy rule', () => {
    for (const c of areaCells.data) {
      const cell = AreaCellSchema.parse(c);
      expect(() => parseCellId(cell.cellId)).not.toThrow();
      if (cell.reportCount72h < AREA_CELL_MIN_REPORTS_FOR_FLAGS) expect(cell.hazardFlags).toEqual([]);
      expect(cell.hazardReportCount72h).toBeLessThanOrEqual(cell.reportCount72h);
      expect(cell.severeHazardCount72h).toBeLessThanOrEqual(cell.hazardReportCount72h);
    }
  });
});

describe('common enums', () => {
  it('DAMAGE_LEVEL_RANK covers every level in order', () => {
    expect(Object.keys(DAMAGE_LEVEL_RANK)).toEqual(DamageLevelSchema.options);
    expect(DamageLevelSchema.options.map((l) => DAMAGE_LEVEL_RANK[l])).toEqual([0, 1, 2, 3, 4]);
  });

  it('severe/serious flag lists are disjoint subsets of LifeSafetyFlag', () => {
    const all = new Set(LifeSafetyFlagSchema.options);
    for (const f of [...SEVERE_FLAGS, ...SERIOUS_FLAGS]) expect(all.has(f)).toBe(true);
    expect(SEVERE_FLAGS.some((f) => (SERIOUS_FLAGS as readonly string[]).includes(f))).toBe(false);
  });
});

describe('schema rules', () => {
  const good = report.data;

  it('NormalizedAddress requires ZIP5 and a 2-letter state', () => {
    expect(NormalizedAddressSchema.safeParse({ ...good.address, zip: '75080-1234' }).success).toBe(false);
    expect(NormalizedAddressSchema.safeParse({ ...good.address, state: 'Texas' }).success).toBe(false);
    expect(NormalizedAddressSchema.safeParse({ ...good.address, source: 'google' }).success).toBe(false);
  });

  it('CreateReportInput enforces secret hash length, notes length and coordinate ranges', () => {
    expect(CreateReportInputSchema.safeParse({ ...good, reporterSecretHash: 'abc' }).success).toBe(false);
    expect(CreateReportInputSchema.safeParse({ ...good, notes: 'x'.repeat(501) }).success).toBe(false);
    expect(CreateReportInputSchema.safeParse({ ...good, deviceLat: 91 }).success).toBe(false);
    expect(CreateReportInputSchema.safeParse({ ...good, hazard: 'meteor' }).success).toBe(false);
  });

  it('AreaCell rejects negative counts and unknown flags', () => {
    const c = areaCells.data[1]!;
    expect(AreaCellSchema.safeParse({ ...c, reportCount72h: -1 }).success).toBe(false);
    expect(AreaCellSchema.safeParse({ ...c, hazardFlags: ['alien'] }).success).toBe(false);
  });
});
