import { z } from 'zod';
import { AssessmentLocationSchema } from '@hack/contracts/assessment';
import { scratchOf, type JobContext } from '../context';
import { fetchJson } from '../http';
import { defineTool } from './types';
import { loadCoordinates } from './shared';

const Output = z.object({ found: z.boolean(), location: AssessmentLocationSchema.nullable() });
type Output = z.infer<typeof Output>;

interface FccArea {
  results?: { county_fips?: string; county_name?: string; state_code?: string }[];
}

/** FCC Area API: lat/lng → state, county name and 5-digit county FIPS. Cached per job. */
export async function resolveLocation(ctx: JobContext): Promise<Output> {
  const scratch = scratchOf(ctx);
  if (scratch.has('location')) return scratch.get('location') as Output;
  const coords = await loadCoordinates(ctx);
  let out: Output = { found: false, location: null };
  if (coords) {
    const url = `https://geo.fcc.gov/api/census/area?lat=${coords.lat}&lon=${coords.lng}&censusYear=2020&format=json`;
    const json = await fetchJson<FccArea>(url, { signal: ctx.signal });
    const r = json.results?.[0];
    if (r?.county_fips && r.state_code) {
      out = {
        found: true,
        location: { stateCode: r.state_code, countyName: r.county_name ?? '', countyFips: r.county_fips },
      };
    }
  }
  scratch.set('location', out);
  return out;
}

export const reverseGeocodeTool = defineTool({
  name: 'reverse_geocode',
  description: "Look up the state, county name and county FIPS code for the report's location (FCC Area API).",
  input: z.object({}),
  output: Output,
  visibility: 'affected',
  run: (_input, ctx) => resolveLocation(ctx),
  summarize: (o) => (o.location ? `${o.location.countyName}, ${o.location.stateCode} (FIPS ${o.location.countyFips})` : 'Location unavailable'),
});
