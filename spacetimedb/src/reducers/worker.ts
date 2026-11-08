// Service-only reducers called by apps/worker (CONTRACTS §5.2).
import { t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { requireService } from '../auth';
import { recomputeCell } from '../cells';
import { failAttempt, leaseExpired } from '../jobs';
import { identityFromHex, tsFromMicros } from '../values';
import {
  AGENT_STEP_KINDS,
  DAMAGE_LEVELS,
  LIFE_SAFETY_FLAGS,
  MAX_LEASE_MS,
  STEP_VISIBILITY,
  fail,
  oneOf,
  parseCsv,
} from '../constants';

export const claim_job = spacetimedb.reducer({ job_id: t.u64(), lease_ms: t.u32() }, (ctx, { job_id, lease_ms }) => {
  requireService(ctx.db, ctx.sender);
  const j = ctx.db.job.id.find(job_id);
  if (!j) fail('job not found');
  if (!(j.state === 'queued' || leaseExpired(j, ctx.timestamp))) fail(`job not claimable (state ${j.state})`);
  const ms = Math.max(1000, Math.min(lease_ms, MAX_LEASE_MS));
  ctx.db.job.id.update({
    ...j,
    state: 'leased',
    lease_owner: ctx.sender,
    lease_expires_at: tsFromMicros(ctx, ctx.timestamp.microsSinceUnixEpoch + BigInt(ms) * 1000n),
  });
  if (j.kind === 'analyze' && j.report_id !== undefined) {
    const r = ctx.db.report.id.find(j.report_id);
    if (r && (r.status === 'queued' || r.status === 'processing')) {
      ctx.db.report.id.update({ ...r, status: 'processing', updated_at: ctx.timestamp });
    }
  } else if (j.kind === 'verify_identity' && j.verification_id !== undefined) {
    const v = ctx.db.verification.id.find(j.verification_id);
    if (v && v.state === 'pending') ctx.db.verification.id.update({ ...v, state: 'processing' });
  }
});

export const complete_job = spacetimedb.reducer(
  { job_id: t.u64(), ok: t.bool(), error: t.string().optional() },
  (ctx, { job_id, ok, error }) => {
    requireService(ctx.db, ctx.sender);
    const j = ctx.db.job.id.find(job_id);
    if (!j) fail('job not found');
    if (j.state !== 'leased') fail(`job not leased (state ${j.state})`);
    if (!j.lease_owner || !j.lease_owner.isEqual(ctx.sender)) fail('job leased by another worker');
    if (ok) {
      ctx.db.job.id.update({ ...j, state: 'done', lease_owner: undefined, lease_expires_at: undefined });
      return;
    }
    failAttempt(ctx, j, error ?? 'unknown error');
  }
);

export const record_frame = spacetimedb.reducer(
  { report_id: t.u64(), frame_index: t.u8(), t_sec: t.f32(), thumb_key: t.string(), finding_json: t.string() },
  (ctx, a) => {
    requireService(ctx.db, ctx.sender);
    if (!ctx.db.report.id.find(a.report_id)) fail('report not found');
    for (const f of ctx.db.frame.report_id.filter(a.report_id)) {
      if (f.frame_index === a.frame_index) {
        ctx.db.frame.id.update({ ...f, t_sec: a.t_sec, thumb_key: a.thumb_key, finding_json: a.finding_json });
        return;
      }
    }
    ctx.db.frame.insert({ id: 0n, ...a });
  }
);

export const record_agent_step = spacetimedb.reducer(
  {
    report_id: t.u64(),
    seq: t.u16(),
    kind: t.string(),
    name: t.string(),
    summary: t.string(),
    visibility: t.string(),
    duration_ms: t.u32().optional(),
  },
  (ctx, a) => {
    requireService(ctx.db, ctx.sender);
    if (!ctx.db.report.id.find(a.report_id)) fail('report not found');
    ctx.db.agent_step.insert({
      id: 0n,
      report_id: a.report_id,
      seq: a.seq,
      kind: oneOf(AGENT_STEP_KINDS, a.kind, 'kind'),
      name: a.name.slice(0, 80),
      summary: a.summary.slice(0, 400),
      visibility: oneOf(STEP_VISIBILITY, a.visibility, 'visibility'),
      duration_ms: a.duration_ms,
      at: ctx.timestamp,
    });
  }
);

export const record_assessment = spacetimedb.reducer(
  {
    report_id: t.u64(),
    json: t.string(),
    overall_level: t.string(),
    usable_frames: t.u8(),
    total_frames: t.u8(),
    life_safety_csv: t.string(),
  },
  (ctx, a) => {
    requireService(ctx.db, ctx.sender);
    const r = ctx.db.report.id.find(a.report_id);
    if (!r) fail('report not found');
    const level = oneOf(DAMAGE_LEVELS, a.overall_level, 'overall_level');
    const flags = parseCsv(a.life_safety_csv).map(f => oneOf(LIFE_SAFETY_FLAGS, f, 'life_safety flag'));
    if (a.usable_frames > a.total_frames) fail('usable_frames > total_frames');

    const existing = ctx.db.assessment.report_id.find(a.report_id);
    const row = { report_id: a.report_id, property_id: r.property_id, json: a.json, created_at: ctx.timestamp };
    if (existing) ctx.db.assessment.report_id.update(row);
    else ctx.db.assessment.insert(row);

    const needsMore = a.usable_frames * 2 < a.total_frames;
    ctx.db.report.id.update({
      ...r,
      status: needsMore ? 'needs_more_footage' : 'assessed',
      status_reason: needsMore ? 'More than half the frames were unusable' : undefined,
      overall_level: level,
      usable_frames: a.usable_frames,
      total_frames: a.total_frames,
      life_safety_csv: [...new Set(flags)].join(','),
      updated_at: ctx.timestamp,
    });
    recomputeCell(ctx, r.cell_id);
  }
);

export const record_recovery_plan = spacetimedb.reducer(
  { identity: t.string(), property_id: t.u64(), report_id: t.u64(), json: t.string() },
  (ctx, a) => {
    requireService(ctx.db, ctx.sender);
    const who = identityFromHex(ctx, a.identity);
    for (const p of ctx.db.recovery_plan.identity.filter(who)) {
      if (p.property_id === a.property_id && p.report_id === a.report_id) {
        ctx.db.recovery_plan.id.update({ ...p, json: a.json, created_at: ctx.timestamp });
        return;
      }
    }
    ctx.db.recovery_plan.insert({
      id: 0n,
      identity: who,
      property_id: a.property_id,
      report_id: a.report_id,
      json: a.json,
      created_at: ctx.timestamp,
    });
  }
);

export const record_coach_reply = spacetimedb.reducer(
  { identity: t.string(), property_id: t.u64(), report_id: t.u64(), text: t.string() },
  (ctx, a) => {
    requireService(ctx.db, ctx.sender);
    ctx.db.coach_message.insert({
      id: 0n,
      identity: identityFromHex(ctx, a.identity),
      property_id: a.property_id,
      report_id: a.report_id,
      role: 'assistant',
      text: a.text.slice(0, 2000),
      at: ctx.timestamp,
    });
  }
);
