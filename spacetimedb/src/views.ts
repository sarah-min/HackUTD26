// Sender-scoped views (T2.5). The underlying tables are private; clients subscribe to
// these views, which evaluate per subscriber with ctx.sender (CONTRACTS §5 "Readable by").
//   Reporter  = report.reporter == sender
//   Verified  = verification(identity == sender OR any device linked to the sender's account, state 'verified')
//               for the property (auth.ts verifiedPropertyIds). With email_config.require_stepup ON the FULL-REPORT views
//               below additionally need a current step-up (auth.ts reportPropertyIds / hasReportAccess).
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
import { accountIdOf, accountIdentities, hasReportAccess, reportPropertyIds, verifiedPropertyIds } from './auth';
import type { RoDb } from './constants';
import type { Identity } from 'spacetimedb';

/** Report ids the sender may see in detail (owner of the report's property, step-up satisfied when required). */
function verifiedReportIds(db: RoDb, who: Identity): bigint[] {
  const ids: bigint[] = [];
  for (const pid of reportPropertyIds(db, who)) {
    for (const r of db.report.property_id.filter(pid)) ids.push(r.id);
  }
  return ids;
}

/**
 * Rows owned by the sender or any device on the same account (affected-person data keyed by identity). Step-up gated:
 * with require_stepup ON and no current step-up the caller gets nothing.
 */
function accountRows<R>(db: RoDb, who: Identity, byIdentity: (id: Identity) => Iterable<R>): R[] {
  if (!hasReportAccess(db, who)) return [];
  const out: R[] = [];
  for (const id of accountIdentities(db, who)) out.push(...byIdentity(id));
  return out;
}

/** Report ids the sender submitted. */
function reportedIds(db: RoDb, who: Identity): bigint[] {
  return [...db.report.reporter.filter(who)].map(r => r.id);
}

export const my_reports = spacetimedb.view({ name: 'my_reports', public: true }, t.array(report.rowType), ctx => [
  ...ctx.db.report.reporter.filter(ctx.sender),
]);

/** Reports on properties the sender is verified for (the affected person's report list). Never anyone else's. */
export const my_property_reports = spacetimedb.view(
  { name: 'my_property_reports', public: true },
  t.array(report.rowType),
  ctx => {
    const out = [];
    for (const pid of reportPropertyIds(ctx.db, ctx.sender)) out.push(...ctx.db.report.property_id.filter(pid));
    return out;
  }
);

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
  ctx => {
    // Own rows, plus the VERIFIED rows of other devices on the same account (so a newly signed-in device can see
    // which properties it now owns). Not step-up gated: the property list is not report detail.
    const out = [...ctx.db.verification.identity.filter(ctx.sender)];
    const seen = new Set(out.map(v => v.id));
    const add = (v: (typeof out)[number] | undefined | null) => {
      if (v && v.state === 'verified' && !seen.has(v.id)) {
        seen.add(v.id);
        out.push(v);
      }
    };
    for (const id of accountIdentities(ctx.db, ctx.sender)) {
      if (!id.isEqual(ctx.sender)) for (const v of ctx.db.verification.identity.filter(id)) add(v);
    }
    const accountId = accountIdOf(ctx.db, ctx.sender);
    if (accountId !== undefined) {
      for (const b of ctx.db.account_property.account_id.filter(accountId)) add(ctx.db.verification.id.find(b.verification_id));
    }
    return out;
  }
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
    for (const pid of reportPropertyIds(ctx.db, ctx.sender)) out.push(...ctx.db.assessment.property_id.filter(pid));
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
  ctx => accountRows(ctx.db, ctx.sender, id => ctx.db.affected_profile.identity.filter(id))
);

export const my_recovery_plans = spacetimedb.view(
  { name: 'my_recovery_plans', public: true },
  t.array(recovery_plan.rowType),
  ctx => accountRows(ctx.db, ctx.sender, id => ctx.db.recovery_plan.identity.filter(id))
);

export const my_coach_messages = spacetimedb.view(
  { name: 'my_coach_messages', public: true },
  t.array(coach_message.rowType),
  ctx => accountRows(ctx.db, ctx.sender, id => ctx.db.coach_message.identity.filter(id))
);
