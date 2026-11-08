// Reporter-side reducers (CONTRACTS §5.2): create_report, attach_media, submit_report.
import { t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { isReporter, propertyHasVerified } from '../auth';
import { parseAddress, upsertProperty } from '../matching';
import { enqueueJob } from '../jobs';
import { HAZARDS, MAX_IMAGES_PER_ROUND, MAX_VIDEOS_PER_ROUND, fail, oneOf } from '../constants';

const HEX64 = /^[0-9a-f]{64}$/;

export const create_report = spacetimedb.reducer({ input_json: t.string() }, (ctx, { input_json }) => {
  let raw: unknown;
  try {
    raw = JSON.parse(input_json);
  } catch {
    fail('input_json is not valid JSON');
  }
  if (!raw || typeof raw !== 'object') fail('input_json must be an object');
  const input = raw as Record<string, unknown>;

  const hazard = oneOf(HAZARDS, String(input.hazard), 'hazard');
  const address = parseAddress(input.address);
  if (typeof input.selfDanger !== 'boolean') fail('selfDanger must be boolean');
  if (typeof input.isSelfReport !== 'boolean') fail('isSelfReport must be boolean');
  const secretHash = String(input.reporterSecretHash ?? '').toLowerCase();
  if (!HEX64.test(secretHash)) fail('reporterSecretHash must be 64 hex chars');
  let notes: string | undefined;
  if (input.notes !== undefined && input.notes !== null) {
    if (typeof input.notes !== 'string' || input.notes.length > 500) fail('notes must be a string ≤ 500 chars');
    notes = input.notes;
  }
  const devLat = typeof input.deviceLat === 'number' ? input.deviceLat : undefined;
  const devLng = typeof input.deviceLng === 'number' ? input.deviceLng : undefined;
  if (devLat !== undefined && (devLat < -90 || devLat > 90)) fail('invalid deviceLat');
  if (devLng !== undefined && (devLng < -180 || devLng > 180)) fail('invalid deviceLng');

  const propertyId = upsertProperty(ctx, address);
  const prop = ctx.db.property.id.find(propertyId)!;

  const r = ctx.db.report.insert({
    id: 0n,
    reporter: ctx.sender,
    property_id: propertyId,
    cell_id: prop.cell_id,
    created_at: ctx.timestamp,
    updated_at: ctx.timestamp,
    status: 'draft',
    hazard,
    self_danger: input.selfDanger,
    life_safety_csv: '',
    overall_level: 'none',
    usable_frames: 0,
    total_frames: 0,
    status_reason: undefined,
    claimed: propertyHasVerified(ctx.db, propertyId),
    source: 'live',
  });
  ctx.db.report_private.insert({
    report_id: r.id,
    reporter_secret_hash: secretHash,
    is_self_report: input.isSelfReport,
    address_line1: address.line1,
    lat: devLat ?? address.lat ?? undefined,
    lng: devLng ?? address.lng ?? undefined,
    notes,
    submit_count: 0,
  });
});

export const attach_media = spacetimedb.reducer(
  {
    report_id: t.u64(),
    kind: t.string(),
    object_key: t.string(),
    content_type: t.string(),
    size_bytes: t.u64(),
    sha256: t.string(),
  },
  (ctx, a) => {
    const r = ctx.db.report.id.find(a.report_id);
    if (!r) fail('report not found');
    if (!isReporter(ctx.db, ctx.sender, a.report_id)) fail('unauthorized: reporter only');
    if (r.status !== 'draft' && r.status !== 'needs_more_footage') fail(`cannot attach media in status ${r.status}`);
    const kind = oneOf(['video', 'image'] as const, a.kind, 'kind');
    if (!a.object_key.startsWith(`media/${a.report_id}/`)) fail('object_key must start with media/<reportId>/');
    if (!/^[0-9a-f]{64}$/.test(a.sha256.toLowerCase())) fail('sha256 must be 64 hex chars');
    const priv = ctx.db.report_private.report_id.find(a.report_id)!;
    const round = priv.submit_count;
    let images = 0;
    let videos = 0;
    for (const m of ctx.db.media_asset.report_id.filter(a.report_id)) {
      if (m.round !== round) continue;
      if (m.kind === 'video') videos++;
      else images++;
    }
    if (kind === 'video' && (videos >= MAX_VIDEOS_PER_ROUND || images > 0)) fail('max 1 video, and no mixing with photos');
    if (kind === 'image' && (videos > 0 || images >= MAX_IMAGES_PER_ROUND)) fail('max 8 photos, and no mixing with a video');
    ctx.db.media_asset.insert({
      id: 0n,
      report_id: a.report_id,
      kind,
      object_key: a.object_key,
      content_type: a.content_type,
      size_bytes: a.size_bytes,
      sha256: a.sha256.toLowerCase(),
      uploaded_at: ctx.timestamp,
      round,
    });
    ctx.db.report.id.update({ ...r, updated_at: ctx.timestamp });
  }
);

export const submit_report = spacetimedb.reducer({ report_id: t.u64() }, (ctx, { report_id }) => {
  const r = ctx.db.report.id.find(report_id);
  if (!r) fail('report not found');
  if (!isReporter(ctx.db, ctx.sender, report_id)) fail('unauthorized: reporter only');
  if (r.status !== 'draft' && r.status !== 'needs_more_footage' && r.status !== 'failed') {
    fail(`cannot submit in status ${r.status}`);
  }
  const priv = ctx.db.report_private.report_id.find(report_id)!;
  // A 'failed' retry reuses the last round's media; otherwise the current round needs media.
  let round = priv.submit_count;
  const hasRound = (n: number) => [...ctx.db.media_asset.report_id.filter(report_id)].some(m => m.round === n);
  if (!hasRound(round)) {
    if (r.status === 'failed' && round > 0 && hasRound(round - 1)) round = round - 1;
    else fail('attach at least one photo or video first');
  }
  ctx.db.report_private.report_id.update({ ...priv, submit_count: Math.min(round + 1, 255) });
  ctx.db.report.id.update({ ...r, status: 'queued', status_reason: undefined, updated_at: ctx.timestamp });
  enqueueJob(ctx, { kind: 'analyze', report_id, property_id: r.property_id, payload: { round } });
});
