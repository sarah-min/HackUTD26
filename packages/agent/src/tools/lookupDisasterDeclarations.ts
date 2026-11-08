import { z } from 'zod';
import { DisasterDeclarationSchema, type DisasterDeclaration } from '@hack/contracts/assessment';
import { scratchOf } from '../context';
import { fetchJson } from '../http';
import { defineTool } from './types';
import { resolveLocation } from './reverseGeocode';

const OPENFEMA = 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries';
const LOOKBACK_DAYS = 365;

interface FemaRow {
  femaDeclarationString?: string;
  disasterNumber?: number;
  declarationType?: string;
  incidentType?: string;
  declarationTitle?: string;
  declarationDate?: string;
  ihProgramDeclared?: boolean | number | string;
  fipsCountyCode?: string;
}

const Output = z.object({
  queried: z.object({ stateCode: z.string(), countyFips: z.string() }).nullable(),
  declarations: z.array(DisasterDeclarationSchema),
});

export function buildOpenFemaUrl(stateCode: string, countyFips: string, now: Date): string {
  const county = countyFips.slice(-3);
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const filter =
    `state eq '${stateCode.replace(/[^A-Z]/gi, '').toUpperCase()}' and ` +
    `(fipsCountyCode eq '${county.replace(/\D/g, '')}' or fipsCountyCode eq '000') and ` +
    `declarationDate ge '${since}T00:00:00.000Z'`;
  const q = (k: string, v: string) => `${k}=${encodeURIComponent(v)}`;
  return `${OPENFEMA}?${[q('$filter', filter), q('$orderby', 'declarationDate desc'), q('$top', '25')].join('&')}`;
}

export function mapFemaRows(rows: FemaRow[]): DisasterDeclaration[] {
  const seen = new Set<string>();
  const out: DisasterDeclaration[] = [];
  for (const r of rows) {
    if (!r.femaDeclarationString || seen.has(r.femaDeclarationString)) continue;
    seen.add(r.femaDeclarationString);
    const ih = r.ihProgramDeclared;
    const parsed = DisasterDeclarationSchema.safeParse({
      femaDeclarationString: r.femaDeclarationString,
      declarationType: r.declarationType ?? '',
      incidentType: r.incidentType ?? '',
      title: r.declarationTitle ?? '',
      declarationDate: r.declarationDate ?? '',
      ihProgramDeclared: ih === true || ih === 1 || ih === '1' || ih === 'true',
      sourceUrl: r.disasterNumber ? `https://www.fema.gov/disaster/${r.disasterNumber}` : 'https://www.fema.gov/disaster/declarations',
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out.slice(0, 5);
}

export const lookupDisasterDeclarationsTool = defineTool({
  name: 'lookup_disaster_declarations',
  description:
    "Recent FEMA disaster declarations (last 12 months) for the report's state and county, from OpenFEMA. Shows whether Individual Assistance (IHP) was declared.",
  input: z.object({}),
  output: Output,
  visibility: 'affected',
  async run(_input, ctx) {
    const scratch = scratchOf(ctx);
    if (scratch.has('declarations')) return scratch.get('declarations') as z.infer<typeof Output>;
    const { location } = await resolveLocation(ctx);
    let out: z.infer<typeof Output> = { queried: null, declarations: [] };
    if (location) {
      const json = await fetchJson<{ DisasterDeclarationsSummaries?: FemaRow[] }>(
        buildOpenFemaUrl(location.stateCode, location.countyFips, new Date()),
        { signal: ctx.signal },
      );
      out = {
        queried: { stateCode: location.stateCode, countyFips: location.countyFips },
        declarations: mapFemaRows(json.DisasterDeclarationsSummaries ?? []),
      };
    }
    scratch.set('declarations', out);
    return out;
  },
  summarize: (o) =>
    o.queried
      ? o.declarations.length
        ? `${o.declarations.length} declaration(s): ${o.declarations.map((d) => d.femaDeclarationString).join(', ')}`.slice(0, 400)
        : 'No FEMA declarations in the last 12 months'
      : 'Skipped: location unknown',
});
