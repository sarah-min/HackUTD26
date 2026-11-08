import { describe, expect, it } from 'vitest';
import { formatAddress, mergeAreaNotices, parseFlagsCsv, parseLevel, readAreaNotices, toAreaCell, worstLevel } from './helpers';

const ts = (ms: number) => ({ toMillis: () => BigInt(ms) });

describe('affected helpers', () => {
  it('parses flag CSV, dropping unknowns and duplicates', () => {
    expect(parseFlagsCsv('gas_leak_suspected, road_blocked,bogus,road_blocked')).toEqual([
      'gas_leak_suspected',
      'road_blocked',
    ]);
    expect(parseFlagsCsv('')).toEqual([]);
    expect(parseFlagsCsv(null)).toEqual([]);
  });

  it('maps area rows and never exposes flag types for cells with < 3 reports', () => {
    const base = {
      cellId: '13455:-40000',
      worstLevel: 'major',
      hazardReportCount72H: 2,
      severeHazardCount72H: 1,
      hazardFlagsCsv: 'gas_leak_suspected,downed_power_line',
      lastReportAt: ts(1000),
    };
    expect(toAreaCell({ ...base, reportCount72H: 2 }).hazardFlags).toEqual([]);
    const three = toAreaCell({ ...base, reportCount72H: 3 });
    expect(three.hazardFlags).toEqual(['gas_leak_suspected', 'downed_power_line']);
    expect(three).toMatchObject({ worstLevel: 'major', lastReportAt: 1000, severeHazardCount72h: 1 });
    expect(toAreaCell({ ...base, reportCount72H: 5, worstLevel: 'garbage' }).worstLevel).toBe('none');
  });

  it('computes the worst level', () => {
    expect(worstLevel(['minor', 'destroyed', 'affected'])).toBe('destroyed');
    expect(worstLevel([])).toBe('none');
    expect(parseLevel('major')).toBe('major');
  });

  it('reads area notices from assessment JSON without throwing', () => {
    const json = JSON.stringify({
      declarations: [{ femaDeclarationString: 'DR-4999-TX', title: 'SEVERE STORMS', incidentType: 'Severe Storm' }, { nope: 1 }],
      activeAlerts: [{ event: 'Flood Warning', severity: 'Severe', headline: 'Flood Warning until 6 PM' }],
    });
    const n = readAreaNotices(json);
    expect(n.declarations).toHaveLength(1);
    expect(n.alerts[0]!.event).toBe('Flood Warning');
    expect(readAreaNotices('not json')).toEqual({ declarations: [], alerts: [] });
    expect(readAreaNotices(undefined)).toEqual({ declarations: [], alerts: [] });
  });

  it('formats an address', () => {
    expect(formatAddress({ line1: '1100 CONGRESS AVE', city: 'AUSTIN', state: 'TX', zip: '78701' })).toBe(
      '1100 CONGRESS AVE, AUSTIN, TX 78701',
    );
  });

  it('merges public area notices with assessment notices, declarations first, deduped', () => {
    const fromAssessment = readAreaNotices(
      JSON.stringify({
        declarations: [{ femaDeclarationString: 'DR-4999-TX', title: 'Severe Storms' }],
        activeAlerts: [{ event: 'Flood Warning', severity: 'Severe', headline: 'Until 6 PM' }],
      }),
    );
    const table = [
      { kind: 'nws_alert', title: 'Wind Advisory', severity: 'Moderate', headline: 'Gusts to 45 mph', sourceUrl: 'https://api.weather.gov/a' },
      { kind: 'fema_declaration', title: 'Severe Storms', declarationString: 'DR-4999-TX' },
      { kind: 'fema_declaration', title: 'Hurricane Zed', declarationString: 'EM-3600-TX' },
    ];
    const merged = mergeAreaNotices(fromAssessment, table);
    expect(merged.map((n) => n.kind)).toEqual(['fema_declaration', 'fema_declaration', 'nws_alert', 'nws_alert']);
    expect(merged.filter((n) => n.text.includes('DR-4999-TX'))).toHaveLength(1);
    expect(merged[3]!.text).toBe('Wind Advisory (Moderate): Gusts to 45 mph');
    // Unverified visitors: no assessment, table notices only.
    expect(mergeAreaNotices({ declarations: [], alerts: [] }, table)).toHaveLength(3);
  });
});
