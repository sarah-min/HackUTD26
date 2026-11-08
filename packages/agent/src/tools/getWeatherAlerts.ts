import { z } from 'zod';
import { WeatherAlertSchema } from '@hack/contracts/assessment';
import { scratchOf } from '../context';
import { fetchJson } from '../http';
import { defineTool } from './types';
import { loadCoordinates } from './shared';
import type { AreaNoticeInput } from '../areaNotices';

const Output = z.object({ checked: z.boolean(), alerts: z.array(WeatherAlertSchema) });

interface NwsAlerts {
  features?: {
    id?: string;
    properties?: {
      event?: string; severity?: string; headline?: string | null;
      sent?: string; effective?: string; onset?: string | null; expires?: string | null; ends?: string | null;
    };
  }[];
}

const time = (...values: (string | null | undefined)[]): number | undefined => {
  for (const v of values) {
    const t = v ? Date.parse(v) : NaN;
    if (Number.isFinite(t)) return t;
  }
  return undefined;
};

function nwsNotice(f: NonNullable<NwsAlerts['features']>[number]): AreaNoticeInput {
  const p = f.properties ?? {};
  return {
    kind: 'nws_alert',
    title: (p.event ?? 'Weather alert').slice(0, 200),
    severity: p.severity ? p.severity.slice(0, 40) : undefined,
    headline: p.headline ? p.headline.slice(0, 400) : undefined,
    sourceUrl: f.id && /^https:\/\//.test(f.id) ? f.id.slice(0, 500) : undefined,
    effectiveAt: time(p.effective, p.onset, p.sent) ?? Date.now(),
    expiresAt: time(p.ends, p.expires),
  };
}

export const getWeatherAlertsTool = defineTool({
  name: 'get_weather_alerts',
  description: "Active National Weather Service alerts at the report's location.",
  input: z.object({}),
  output: Output,
  visibility: 'affected',
  async run(_input, ctx) {
    const scratch = scratchOf(ctx);
    if (scratch.has('alerts')) return scratch.get('alerts') as z.infer<typeof Output>;
    const coords = await loadCoordinates(ctx);
    let out: z.infer<typeof Output> = { checked: false, alerts: [] };
    if (coords) {
      const json = await fetchJson<NwsAlerts>(
        `https://api.weather.gov/alerts/active?point=${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`,
        { signal: ctx.signal, headers: { Accept: 'application/geo+json' } },
      );
      // Full detail for record_area_notices (public county notices); the assessment keeps the short form.
      scratch.set('alertNotices', (json.features ?? []).slice(0, 10).map((f) => nwsNotice(f)));
      out = {
        checked: true,
        alerts: (json.features ?? []).slice(0, 5).map((f) => ({
          event: f.properties?.event ?? 'Alert',
          severity: f.properties?.severity ?? 'Unknown',
          headline: (f.properties?.headline ?? '').slice(0, 300),
        })),
      };
    }
    scratch.set('alerts', out);
    return out;
  },
  summarize: (o) =>
    !o.checked ? 'Skipped: location unknown' : o.alerts.length ? `Active: ${o.alerts.map((a) => a.event).join(', ')}`.slice(0, 400) : 'No active alerts',
});
