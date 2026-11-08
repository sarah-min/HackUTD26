// Sender-scoped views (T2.5). The underlying tables are private; clients subscribe to
// these views, which evaluate per subscriber with ctx.sender (CONTRACTS §5 "Readable by").
//   Reporter  = report.reporter == sender
//   Verified  = verification(identity == sender, state 'verified') for the property
//   Self      = row.identity == sender
import { t } from 'spacetimedb/server';
import { spacetimedb } from './schema';
import {
  report,
  report_private,
  property_private,
  media_asset,
  frame,
  assessment,
  agent_step,
} from './tables/core';
import { verification, affected_profile, recovery_plan, coach_message } from './tables/affected';
import { verifiedPropertyIds } from './auth';
import type { RoDb } from './constants';
import type { Identity } from 'spacetimedb';

/** Report ids the sender may see in detail (verified for the report's property). */
function verifiedReportIds(db: RoDb, who: Identity): bigint[] {
  const ids: bigint[] = [];
  for (const pid of verifiedPropertyIds(db, who)) {
    for (const r of db.report.property_id.filter(pid)) ids.push(r.id);
  }
  return ids;
}

/** Report ids the sender submitted. */
function reportedIds(db: RoDb, who: Identity): bigint[] {
  return [...db.report.reporter.filter(who)].map(r => r.id);
}

export const my_reports = spacetimedb.view({ name: 'my_reports', public: true }, t.array(report.rowType), ctx => [
  ...ctx.db.report.reporter.filter(ctx.sender),
]);

export const my_report_privates = spacetimedb.view(
  { name: 'my_report_privates', public: true },
  t.array(report_private.rowType),
  ctx => {
    const ids = new Set([...reportedIds(ctx.db, ctx.sender), ...verifiedReportIds(ctx.db, ctx.sender)]);
    const out = [];
    for (const id of ids) {
      const row = ctx.db.report_private.report_id.find(id);
      if (row) out.push(row);
    }
    return out;
  }
);

export const my_verifications = spacetimedb.view(
  { name: 'my_verifications', public: true },
  t.array(verification.rowType),
  ctx => [...ctx.db.verification.identity.filter(ctx.sender)]
);

export const my_property_privates = spacetimedb.view(
  { name: 'my_property_privates', public: true },
  t.array(property_private.rowType),
  ctx => {
    const out = [];
    for (const pid of verifiedPropertyIds(ctx.db, ctx.sender)) {
      const row = ctx.db.property_private.property_id.find(pid);
      if (row) out.push(row);
    }
    return out;
  }
);

export const my_media_assets = spacetimedb.view(
  { name: 'my_media_assets', public: true },
  t.array(media_asset.rowType),
  ctx => verifiedReportIds(ctx.db, ctx.sender).flatMap(id => [...ctx.db.media_asset.report_id.filter(id)])
);

export const my_frames = spacetimedb.view({ name: 'my_frames', public: true }, t.array(frame.rowType), ctx =>
  verifiedReportIds(ctx.db, ctx.sender).flatMap(id => [...ctx.db.frame.report_id.filter(id)])
);

export const my_assessments = spacetimedb.view(
  { name: 'my_assessments', public: true },
  t.array(assessment.rowType),
  ctx => {
    const out = [];
    for (const pid of verifiedPropertyIds(ctx.db, ctx.sender)) out.push(...ctx.db.assessment.property_id.filter(pid));
    return out;
  }
);

export const my_agent_steps = spacetimedb.view(
  { name: 'my_agent_steps', public: true },
  t.array(agent_step.rowType),
  ctx => {
    const verified = new Set(verifiedReportIds(ctx.db, ctx.sender));
    const out = [];
    for (const id of verified) out.push(...ctx.db.agent_step.report_id.filter(id));
    // Reporter-only reports: just the steps marked for the reporter's status timeline.
    for (const id of reportedIds(ctx.db, ctx.sender)) {
      if (verified.has(id)) continue;
      for (const s of ctx.db.agent_step.report_id.filter(id)) if (s.visibility === 'reporter') out.push(s);
    }
    return out;
  }
);

export const my_affected_profiles = spacetimedb.view(
  { name: 'my_affected_profiles', public: true },
  t.array(affected_profile.rowType),
  ctx => [...ctx.db.affected_profile.identity.filter(ctx.sender)]
);

export const my_recovery_plans = spacetimedb.view(
  { name: 'my_recovery_plans', public: true },
  t.array(recovery_plan.rowType),
  ctx => [...ctx.db.recovery_plan.identity.filter(ctx.sender)]
);

export const my_coach_messages = spacetimedb.view(
  { name: 'my_coach_messages', public: true },
  t.array(coach_message.rowType),
  ctx => [...ctx.db.coach_message.identity.filter(ctx.sender)]
);
