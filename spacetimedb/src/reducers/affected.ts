// Verified affected-person reducers: intake → plan job, coach (CONTRACTS §5.2).
import { t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { isVerifiedFor } from '../auth';
import { enqueueJob } from '../jobs';
import { DAMAGE_LEVEL_RANK, fail } from '../constants';

export const save_affected_intake = spacetimedb.reducer(
  { property_id: t.u64(), intake_json: t.string(), report_id: t.u64().optional() },
  (ctx, { property_id, intake_json, report_id }) => {
    if (!isVerifiedFor(ctx.db, ctx.sender, property_id)) fail('unauthorized: verify for this property first');
    if (intake_json.length > 20_000) fail('intake_json too large');
    try {
      const parsed = JSON.parse(intake_json);
      if (!parsed || typeof parsed !== 'object') throw new Error();
    } catch {
      fail('intake_json must be a JSON object');
    }

    // Pick the report: explicit (must be an assessed report on this property) or the most
    // severe assessed report, newest first on ties.
    let chosen: bigint | undefined;
    if (report_id !== undefined) {
      const r = ctx.db.report.id.find(report_id);
      if (!r || r.property_id !== property_id) fail('report is not on this property');
      if (r.status !== 'assessed') fail('report is not assessed yet');
      chosen = r.id;
    } else {
      let best: { id: bigint; rank: number; at: bigint } | undefined;
      for (const r of ctx.db.report.property_id.filter(property_id)) {
        if (r.status !== 'assessed') continue;
        const rank = DAMAGE_LEVEL_RANK[r.overall_level] ?? 0;
        const at = r.created_at.microsSinceUnixEpoch;
        if (!best || rank > best.rank || (rank === best.rank && at > best.at)) best = { id: r.id, rank, at };
      }
      if (!best) fail('no assessed report for this property yet');
      chosen = best.id;
    }

    let existing;
    for (const p of ctx.db.affected_profile.by_identity_property.filter([ctx.sender, property_id])) existing = p;
    if (existing) {
      ctx.db.affected_profile.id.update({ ...existing, intake_json, updated_at: ctx.timestamp });
    } else {
      ctx.db.affected_profile.insert({
        id: 0n,
        identity: ctx.sender,
        property_id,
        intake_json,
        updated_at: ctx.timestamp,
      });
    }
    enqueueJob(ctx, { kind: 'plan', property_id, report_id: chosen, subject: ctx.sender });
  }
);

export const ask_coach = spacetimedb.reducer(
  { property_id: t.u64(), report_id: t.u64(), text: t.string() },
  (ctx, { property_id, report_id, text }) => {
    if (!isVerifiedFor(ctx.db, ctx.sender, property_id)) fail('unauthorized: verify for this property first');
    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed.length > 2000) fail('text must be 1–2000 chars');
    const hasPlan = [...ctx.db.recovery_plan.identity.filter(ctx.sender)].some(
      p => p.property_id === property_id && p.report_id === report_id
    );
    if (!hasPlan) fail('no recovery plan yet for this report');
    for (const j of ctx.db.job.state.filter('queued')) {
      if (j.kind === 'coach' && j.subject?.isEqual(ctx.sender)) fail('a coach reply is already pending');
    }
    for (const j of ctx.db.job.state.filter('leased')) {
      if (j.kind === 'coach' && j.subject?.isEqual(ctx.sender)) fail('a coach reply is already pending');
    }
    ctx.db.coach_message.insert({
      id: 0n,
      identity: ctx.sender,
      property_id,
      report_id,
      role: 'user',
      text: trimmed,
      at: ctx.timestamp,
    });
    enqueueJob(ctx, { kind: 'coach', property_id, report_id, subject: ctx.sender, payload: { text: trimmed } });
  }
);
