// Public area notices (NWS alerts + FEMA declarations) per county. Service-only writes.
// The P3 worker calls record_area_notices during `analyze`, after its reverse_geocode,
// lookup_disaster_declarations and get_weather_alerts tools (CONTRACTS §5.2).
import { t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { requireService } from '../auth';
import { tsFromMicros } from '../values';
import { MAX_NOTICES_PER_COUNTY, NOTICE_KINDS, fail, oneOf, type Ctx } from '../constants';

const cap = (v: unknown, n: number): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined;

function msToTs(ctx: Ctx, v: unknown, field: string) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) fail(`invalid ${field}`);
  return tsFromMicros(ctx, BigInt(Math.round(v)) * 1000n);
}

export const record_area_notices = spacetimedb.reducer(
  { property_id: t.u64(), county_fips: t.string(), notices_json: t.string() },
  (ctx, { property_id, county_fips, notices_json }) => {
    requireService(ctx.db, ctx.sender);
    const fips = county_fips.trim();
    if (!/^\d{5}$/.test(fips)) fail('invalid county_fips (expected 5 digits)');
    const prop = ctx.db.property.id.find(property_id);
    if (!prop) fail('property not found');

    let raw: unknown;
    try {
      raw = JSON.parse(notices_json);
    } catch {
      fail('notices_json is not valid JSON');
    }
    if (!Array.isArray(raw)) fail('notices_json must be an array');
    if (raw.length > MAX_NOTICES_PER_COUNTY) fail(`too many notices (max ${MAX_NOTICES_PER_COUNTY})`);

    const rows = raw.map((n: any, i: number) => {
      if (!n || typeof n !== 'object') fail(`notice ${i} is not an object`);
      const title = cap(n.title, 200);
      if (!title) fail(`notice ${i} needs a title`);
      return {
        id: 0n,
        county_fips: fips,
        kind: oneOf(NOTICE_KINDS, String(n.kind), 'notice kind'),
        title,
        severity: cap(n.severity, 40),
        headline: cap(n.headline, 400),
        declaration_string: cap(n.declarationString, 40),
        ih_program_declared: typeof n.ihProgramDeclared === 'boolean' ? n.ihProgramDeclared : undefined,
        source_url: cap(n.sourceUrl, 500),
        effective_at: msToTs(ctx, n.effectiveAt, `notice ${i} effectiveAt`),
        expires_at: n.expiresAt == null ? undefined : msToTs(ctx, n.expiresAt, `notice ${i} expiresAt`),
        updated_at: ctx.timestamp,
      };
    });

    if (!prop.county_fips) ctx.db.property.id.update({ ...prop, county_fips: fips });
    const priv = ctx.db.property_private.property_id.find(property_id);
    if (priv && !priv.county_fips) ctx.db.property_private.property_id.update({ ...priv, county_fips: fips });

    // Replace semantics: the latest fetch for a county is the truth.
    for (const old of [...ctx.db.area_notice.county_fips.filter(fips)]) ctx.db.area_notice.id.delete(old.id);
    for (const r of rows) ctx.db.area_notice.insert(r);
  }
);
