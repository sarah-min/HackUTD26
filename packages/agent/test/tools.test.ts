import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildOpenFemaUrl, getWeatherAlertsTool, lookupDisasterDeclarationsTool, mapFemaRows, reverseGeocodeTool } from '../src';
import { fakeCtx, scriptedAgentNim } from './helpers';

// Recorded response shapes (trimmed) from the public APIs.
const FCC = { results: [{ county_fips: '48113', county_name: 'Dallas County', state_code: 'TX', state_fips: '48' }] };
const FEMA = {
  DisasterDeclarationsSummaries: [
    { femaDeclarationString: 'DR-4999-TX', disasterNumber: 4999, declarationType: 'DR', incidentType: 'Severe Storm', declarationTitle: 'SEVERE STORMS AND FLOODING', declarationDate: '2026-06-01T00:00:00.000Z', ihProgramDeclared: true, fipsCountyCode: '113' },
    { femaDeclarationString: 'DR-4999-TX', disasterNumber: 4999, declarationType: 'DR', incidentType: 'Severe Storm', declarationTitle: 'dup', declarationDate: '2026-06-01T00:00:00.000Z', ihProgramDeclared: true, fipsCountyCode: '000' },
  ],
};
const NWS = { features: [{ properties: { event: 'Flood Warning', severity: 'Severe', headline: 'Flood Warning issued' } }] };

function stubFetch() {
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    urls.push(url);
    const headers = new Headers(init?.headers);
    if (url.includes('geo.fcc.gov')) return new Response(JSON.stringify(FCC));
    if (url.includes('fema.gov')) return new Response(JSON.stringify(FEMA));
    if (url.includes('api.weather.gov')) {
      expect(headers.get('user-agent')).toMatch(/ProjectAftermath/);
      return new Response(JSON.stringify(NWS));
    }
    return new Response('not found', { status: 404 });
  });
  return urls;
}
afterEach(() => vi.unstubAllGlobals());

const stdb = {
  getReportPrivate: async () => ({ reportId: '7', isSelfReport: false, addressLine1: 'x', lat: 32.7767, lng: -96.797, notes: null }),
  getReport: async () => null,
};

describe('external tools (recorded responses)', () => {
  it('reverse_geocode → state + county FIPS', async () => {
    stubFetch();
    const { ctx } = fakeCtx(scriptedAgentNim([]), stdb as never);
    expect(await reverseGeocodeTool.run({}, ctx)).toEqual({ found: true, location: { stateCode: 'TX', countyName: 'Dallas County', countyFips: '48113' } });
  });
  it('lookup_disaster_declarations dedupes and links to FEMA', async () => {
    const urls = stubFetch();
    const { ctx } = fakeCtx(scriptedAgentNim([]), stdb as never);
    const out = await lookupDisasterDeclarationsTool.run({}, ctx);
    expect(out.declarations).toHaveLength(1);
    expect(out.declarations[0]).toMatchObject({ femaDeclarationString: 'DR-4999-TX', ihProgramDeclared: true, sourceUrl: 'https://www.fema.gov/disaster/4999' });
    expect(decodeURIComponent(urls.find((u) => u.includes('fema'))!)).toContain("fipsCountyCode eq '113'");
  });
  it('get_weather_alerts maps NWS features', async () => {
    stubFetch();
    const { ctx } = fakeCtx(scriptedAgentNim([]), stdb as never);
    expect((await getWeatherAlertsTool.run({}, ctx)).alerts).toEqual([{ event: 'Flood Warning', severity: 'Severe', headline: 'Flood Warning issued' }]);
  });
  it('OpenFEMA filter is sanitized', () => {
    const url = decodeURIComponent(buildOpenFemaUrl("TX' or 1 eq 1", '48113', new Date('2026-11-07')));
    expect(url).toContain("state eq 'TXOREQ'");
    expect(mapFemaRows([{ femaDeclarationString: 'EM-1-TX', ihProgramDeclared: 0 }])[0]!.ihProgramDeclared).toBe(false);
  });
});
