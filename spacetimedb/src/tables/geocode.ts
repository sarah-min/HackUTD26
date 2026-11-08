// Address-lookup cache and the Nominatim throttle (geocoding runs as module procedures; no web server).
import { table, t } from 'spacetimedb/server';

export const geocode_cache = table(
  { name: 'geocode_cache' },
  {
    key: t.string().primaryKey(), // 'f:<QUERY>' or 'r:<lat>,<lng>'
    result_json: t.string(),
    at: t.timestamp(),
  }
);

/** One row (id 0): when the last Nominatim request started (their policy: max 1 request/second). */
export const geocode_throttle = table(
  { name: 'geocode_throttle' },
  {
    id: t.u8().primaryKey(),
    last_nominatim_at: t.timestamp(),
  }
);
