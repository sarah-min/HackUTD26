import { describe, expect, it } from 'vitest';
import { buildAreaNotices, type JobContext } from '../src';

const ctxWith = (entries: [string, unknown][]) => ({ job: { id: '1' }, scratch: new Map(entries) }) as unknown as JobContext;
const location = ['location', { found: true, location: { stateCode: 'TX', countyName: 'Dallas County', countyFips: '48113' } }] as [string, unknown];
const decl = ['declarations', { queried: { stateCode: 'TX', countyFips: '48113' }, declarations: [{
  femaDeclarationString: 'DR-4999-TX', declarationType: 'DR', incidentType: 'Flood', title: 'Severe Storms and Flooding',
  declarationDate: '2026-11-01T00:00:00.000Z', ihProgramDeclared: true, sourceUrl: 'https://www.fema.gov/disaster/4999' }] }] as [string, unknown];
const now = Date.parse('2026-11-07T20:00:00Z');

describe('buildAreaNotices', () => {
  it('maps FEMA + live NWS alerts to the record_area_notices shape and drops expired alerts', () => {
    const r = buildAreaNotices(ctxWith([location, decl, ['alerts', { checked: true, alerts: [] }], ['alertNotices', [
      { kind: 'nws_alert', title: 'Flash Flood Warning', severity: 'Severe', effectiveAt: now - 3600_000, expiresAt: now + 3600_000 },
      { kind: 'nws_alert', title: 'Old Advisory', effectiveAt: now - 9e6, expiresAt: now - 1 },
    ]]]), now);
    expect(r).toEqual({ countyFips: '48113', notices: [
      { kind: 'fema_declaration', title: 'Severe Storms and Flooding', declarationString: 'DR-4999-TX', ihProgramDeclared: true,
        sourceUrl: 'https://www.fema.gov/disaster/4999', effectiveAt: Date.parse('2026-11-01T00:00:00.000Z') },
      { kind: 'nws_alert', title: 'Flash Flood Warning', severity: 'Severe', effectiveAt: now - 3600_000, expiresAt: now + 3600_000 },
    ] });
  });
  it('sends nothing when a source was not checked (replace semantics would erase the other kind)', () => {
    expect(buildAreaNotices(ctxWith([location, decl]), now)).toEqual({ skip: 'weather alerts not checked' });
    expect(buildAreaNotices(ctxWith([location, ['alerts', { checked: true, alerts: [] }]]), now)).toEqual({ skip: 'FEMA declarations not checked' });
    expect(buildAreaNotices(ctxWith([decl]), now)).toEqual({ skip: 'county unknown' });
  });
});
