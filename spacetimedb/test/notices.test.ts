import { describe, it, expect } from 'vitest';
import { setup, mod } from './helpers';
import * as core from '../src/tables/core';

const DEF_CTX: any = { moduleDef: { explicitNames: { entries: [] } }, registerTypesRecursively: () => ({ ref: 0 }) };
const access = (t: unknown, name: string) => (t as any).tableDef(DEF_CTX, name).tableAccess.tag as string;

const T0_MS = Date.parse('2026-11-07T18:00:00Z');
const notices = (over: Record<string, unknown>[] = []) =>
  JSON.stringify([
    { kind: 'nws_alert', title: 'Flash Flood Warning', severity: 'Severe', headline: 'Flash flooding ongoing', effectiveAt: T0_MS, expiresAt: T0_MS + 3600_000, sourceUrl: 'https://api.weather.gov/alerts/x' },
    { kind: 'fema_declaration', title: 'Severe Storms and Flooding', declarationString: 'DR-4999-TX', ihProgramDeclared: true, effectiveAt: T0_MS - 86400_000, sourceUrl: 'https://www.fema.gov/disaster/4999' },
    ...over,
  ]);

function withProperty() {
  const s = setup();
  const alice = s.user('alice');
  const rid = s.createReport(alice);
  const pid = s.h.db.report.id.find(rid)!.property_id;
  return { s, alice, pid };
}

describe('area notices', () => {
  it('record_area_notices is service-only and validates input', () => {
    const { s, alice, pid } = withProperty();
    expect(() => s.call(alice, mod.record_area_notices as any, { property_id: pid, county_fips: '48113', notices_json: notices() })).toThrow(/unauthorized/);
    expect(() => s.call(s.worker, mod.record_area_notices as any, { property_id: pid, county_fips: 'Dallas', notices_json: notices() })).toThrow(/county_fips/);
    expect(() => s.call(s.worker, mod.record_area_notices as any, { property_id: pid, county_fips: '48113', notices_json: '{' })).toThrow(/JSON/);
    expect(() => s.call(s.worker, mod.record_area_notices as any, { property_id: pid, county_fips: '48113', notices_json: JSON.stringify([{ kind: 'rumor', title: 'x', effectiveAt: T0_MS }]) })).toThrow(/notice kind/);
    const many = JSON.stringify(Array.from({ length: 21 }, () => ({ kind: 'nws_alert', title: 't', effectiveAt: T0_MS })));
    expect(() => s.call(s.worker, mod.record_area_notices as any, { property_id: pid, county_fips: '48113', notices_json: many })).toThrow(/max 20/);
    expect(() => s.call(s.worker, mod.record_area_notices as any, { property_id: 999n, county_fips: '48113', notices_json: '[]' })).toThrow(/property not found/);
  });

  it('sets county_fips on the property and replaces notices per county', () => {
    const { s, pid } = withProperty();
    s.call(s.worker, mod.record_area_notices as any, { property_id: pid, county_fips: '48113', notices_json: notices() });
    expect(s.h.db.property.id.find(pid)!.county_fips).toBe('48113');
    expect(s.h.db.property_private.property_id.find(pid)!.county_fips).toBe('48113');
    expect([...s.h.db.area_notice.county_fips.filter('48113')]).toHaveLength(2);

    // Other counties are untouched; same county is replaced, not appended.
    s.call(s.worker, mod.record_area_notices as any, { property_id: pid, county_fips: '48085', notices_json: notices() });
    s.call(s.worker, mod.record_area_notices as any, {
      property_id: pid,
      county_fips: '48113',
      notices_json: JSON.stringify([{ kind: 'fema_declaration', title: 'Only one', declarationString: 'DR-4999-TX', effectiveAt: T0_MS }]),
    });
    const dallas = [...s.h.db.area_notice.county_fips.filter('48113')];
    expect(dallas.map(n => n.title)).toEqual(['Only one']);
    expect([...s.h.db.area_notice.county_fips.filter('48085')]).toHaveLength(2);
    // county_fips is set only when empty.
    expect(s.h.db.property.id.find(pid)!.county_fips).toBe('48113');
  });

  it('caps string lengths', () => {
    const { s, pid } = withProperty();
    s.call(s.worker, mod.record_area_notices as any, {
      property_id: pid,
      county_fips: '48113',
      notices_json: JSON.stringify([{ kind: 'nws_alert', title: 'x'.repeat(500), headline: 'y'.repeat(1000), effectiveAt: T0_MS }]),
    });
    const [n] = [...s.h.db.area_notice.iter()];
    expect(n.title.length).toBe(200);
    expect(n.headline!.length).toBe(400);
  });

  it('refresh_area_cells purges expired NWS alerts but keeps declarations', () => {
    const { s, pid } = withProperty();
    s.call(s.worker, mod.record_area_notices as any, { property_id: pid, county_fips: '48113', notices_json: notices() });
    s.advanceMs(2 * 3600_000);
    const arg = { scheduled_id: 1n, scheduled_at: { tag: 'Interval', value: 0n } };
    s.call(s.internal, mod.refresh_area_cells as any, { arg });
    const left = [...s.h.db.area_notice.iter()];
    expect(left.map(n => n.kind)).toEqual(['fema_declaration']);
  });

  it('area_notice and property are public; private tables stay private', () => {
    expect(access(core.area_notice, 'area_notice')).toBe('Public');
    expect(access(core.property, 'property')).toBe('Public');
    for (const [name, tbl] of Object.entries({ property_private: core.property_private, report_private: core.report_private, frame: core.frame, assessment: core.assessment, media_asset: core.media_asset })) {
      expect(access(tbl, name)).toBe('Private');
    }
  });

  it('an unverified identity still cannot read private data after notices are recorded', () => {
    const { s, pid } = withProperty();
    s.call(s.worker, mod.record_area_notices as any, { property_id: pid, county_fips: '48113', notices_json: notices() });
    const stranger = s.user('stranger');
    expect(s.view(stranger, mod.my_property_privates as any)).toHaveLength(0);
    expect(s.view(stranger, mod.my_report_privates as any)).toHaveLength(0);
    expect(s.view(stranger, mod.my_assessments as any)).toHaveLength(0);
  });
});
