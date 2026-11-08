// Core report/property tables (CONTRACTS.md §5.1). Only `property`, `report` and
// `area_cell_summary` are public; everything else is private and exposed to clients
// solely through the sender-scoped views in ../views.ts.
import { table, t } from 'spacetimedb/server';

export const property = table(
  { name: 'property', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    cell_id: t.string().index('btree'),
    created_at: t.timestamp(),
    // Additive: county FIPS (coarse, not PII), set by the service via record_area_notices.
    county_fips: t.string().optional(),
  }
);

export const property_private = table(
  { name: 'property_private' },
  {
    property_id: t.u64().primaryKey(),
    normalized: t.string().unique(),
    line1: t.string(),
    city: t.string(),
    state: t.string(),
    zip: t.string(),
    lat: t.f64().optional(),
    lng: t.f64().optional(),
    county_fips: t.string().optional(),
  }
);

export const report = table(
  { name: 'report', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    reporter: t.identity().index('btree'),
    property_id: t.u64().index('btree'),
    cell_id: t.string().index('btree'),
    created_at: t.timestamp(),
    updated_at: t.timestamp(),
    status: t.string(), // ReportStatus
    hazard: t.string(), // Hazard
    self_danger: t.bool(),
    life_safety_csv: t.string(),
    overall_level: t.string(), // DamageLevel, default 'none'
    usable_frames: t.u8(),
    total_frames: t.u8(),
    status_reason: t.string().optional(),
    claimed: t.bool(),
    source: t.string(), // Source
  }
);

export const report_private = table(
  { name: 'report_private' },
  {
    report_id: t.u64().primaryKey(),
    reporter_secret_hash: t.string(),
    is_self_report: t.bool(),
    address_line1: t.string(),
    lat: t.f64().optional(),
    lng: t.f64().optional(),
    notes: t.string().optional(),
    // Additive (not in CONTRACTS v1): number of times the report was submitted.
    // Media rows carry the round they were attached in so a re-shoot gets a fresh
    // "max 8 images or 1 video" budget.
    submit_count: t.u8(),
  }
);

export const media_asset = table(
  { name: 'media_asset' },
  {
    id: t.u64().primaryKey().autoInc(),
    report_id: t.u64().index('btree'),
    kind: t.string(), // 'video' | 'image'
    object_key: t.string(),
    content_type: t.string(),
    size_bytes: t.u64(),
    sha256: t.string(),
    uploaded_at: t.timestamp(),
    round: t.u8(), // additive: report_private.submit_count at attach time
  }
);

export const frame = table(
  { name: 'frame' },
  {
    id: t.u64().primaryKey().autoInc(),
    report_id: t.u64().index('btree'),
    frame_index: t.u8(),
    t_sec: t.f32(),
    thumb_key: t.string(),
    finding_json: t.string(),
  }
);

export const assessment = table(
  { name: 'assessment' },
  {
    report_id: t.u64().primaryKey(),
    property_id: t.u64().index('btree'),
    json: t.string(),
    created_at: t.timestamp(),
  }
);

export const agent_step = table(
  { name: 'agent_step' },
  {
    id: t.u64().primaryKey().autoInc(),
    report_id: t.u64().index('btree'),
    seq: t.u16(),
    kind: t.string(),
    name: t.string(),
    summary: t.string(),
    visibility: t.string(), // 'reporter' | 'affected'
    duration_ms: t.u32().optional(),
    at: t.timestamp(),
  }
);

// Public NWS alerts / FEMA declarations per county, so unverified visitors also see
// area notices. Replaced wholesale per county by record_area_notices (service only).
export const area_notice = table(
  { name: 'area_notice', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    county_fips: t.string().index('btree'),
    kind: t.string(), // 'nws_alert' | 'fema_declaration'
    title: t.string(),
    severity: t.string().optional(),
    headline: t.string().optional(),
    declaration_string: t.string().optional(),
    ih_program_declared: t.bool().optional(),
    source_url: t.string().optional(),
    effective_at: t.timestamp(),
    expires_at: t.timestamp().optional(),
    updated_at: t.timestamp(),
  }
);

export const area_cell_summary = table(
  { name: 'area_cell_summary', public: true },
  {
    cell_id: t.string().primaryKey(),
    report_count_72h: t.u32(),
    worst_level: t.string(),
    hazard_report_count_72h: t.u32(),
    severe_hazard_count_72h: t.u32(),
    hazard_flags_csv: t.string(), // empty unless report_count_72h >= 3
    last_report_at: t.timestamp(),
  }
);
