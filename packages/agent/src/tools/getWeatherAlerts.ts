import { z } from 'zod';
import { WeatherAlertSchema } from '@hack/contracts';
import { scratchOf } from '../context';
import { fetchJson } from '../http';
import { defineTool } from './types';
import { loadCoordinates } from './shared';

const Output = z.object({ checked: z.boolean(), alerts: z.array(WeatherAlertSchema) });

interface NwsAlerts {
  features?: { properties?: { event?: string; severity?: string; headline?: string | null } }[];
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
