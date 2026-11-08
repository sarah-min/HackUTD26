// Worker-only views (service role). Private tables are invisible to every client,
// including the worker, so the worker subscribes to these instead of using the owner
// token. Each view returns rows ONLY for a caller in service_identity, and only rows
// tied to an OPEN job (state 'queued' | 'leased'), keeping exposure and volume small.
// A non-service caller always gets [].
import { t } from 'spacetimedb/server';
import type { Identity } from 'spacetimedb';
import { spacetimedb } from './schema';
import { report_private, property_private, media_asset, frame, assessment } from './tables/core';
import { verification, affected_profile, recovery_plan, coach_message } from './tables/affected';
import { job } from './tables/system';
import { isService } from './auth';
import type { RoDb } from './constants';

const OPEN_STATES = ['queued', 'leased'] as const;

// reason: view callbacks receive generated row types; `any` keeps these helpers table-agnostic.
function openJobs(db: RoDb, who: Identity): any[] {
  if (!isService(db, who)) return [];
  const out: any[] = [];
  for (const s of OPEN_STATES) for (const j of db.job.state.filter(s)) out.push(j);
  return out;
}

function uniq<T>(xs: (T | undefined | null)[]): T[] {
  return [...new Set(xs.filter((x): x is T => x !== undefined && x !== null))];
}

export const svc_jobs = spacetimedb.view({ name: 'svc_jobs', public: true }, t.array(job.rowType), ctx =>
  openJobs(ctx.db, ctx.sender)
);

export const svc_report_privates = spacetimedb.view(
  { name: 'svc_report_privates', public: true },
  t.array(report_private.rowType),
  ctx => {
    const out = [];
    for (const id of uniq<bigint>(openJobs(ctx.db, ctx.sender).map(j => j.report_id))) {
      const row = ctx.db.report_private.report_id.find(id);
      if (row) out.push(row);
    }
    return out;
  }
);

export const svc_property_privates = spacetimedb.view(
  { name: 'svc_property_privates', public: true },
  t.array(property_private.rowType),
  ctx => {
    const jobs = openJobs(ctx.db, ctx.sender);
    const pids = new Set<bigint>(uniq<bigint>(jobs.map(j => j.property_id)));
    for (const rid of uniq<bigint>(jobs.map(j => j.report_id))) {
      const r = ctx.db.report.id.find(rid);
      if (r) pids.add(r.property_id);
    }
    const out = [];
    for (const pid of pids) {
      const row = ctx.db.property_private.property_id.find(pid);
      if (row) out.push(row);
    }
    return out;
  }
);

export const svc_media_assets = spacetimedb.view(
  { name: 'svc_media_assets', public: true },
  t.array(media_asset.rowType),
  ctx =>
    uniq<bigint>(openJobs(ctx.db, ctx.sender).map(j => j.report_id)).flatMap(id => [
      ...ctx.db.media_asset.report_id.filter(id),
    ])
);

export const svc_frames = spacetimedb.view({ name: 'svc_frames', public: true }, t.array(frame.rowType), ctx =>
  uniq<bigint>(openJobs(ctx.db, ctx.sender).map(j => j.report_id)).flatMap(id => [...ctx.db.frame.report_id.filter(id)])
);

export const svc_assessments = spacetimedb.view(
  { name: 'svc_assessments', public: true },
  t.array(assessment.rowType),
  ctx => {
    const out = [];
    for (const id of uniq<bigint>(openJobs(ctx.db, ctx.sender).map(j => j.report_id))) {
      const row = ctx.db.assessment.report_id.find(id);
      if (row) out.push(row);
    }
    return out;
  }
);

export const svc_verifications = spacetimedb.view(
  { name: 'svc_verifications', public: true },
  t.array(verification.rowType),
  ctx => {
    const out = [];
    for (const id of uniq<bigint>(openJobs(ctx.db, ctx.sender).map(j => j.verification_id))) {
      const row = ctx.db.verification.id.find(id);
      if (row) out.push(row);
    }
    return out;
  }
);

/** (subject identity, property id) pairs of open plan/coach jobs. */
function subjectPairs(db: RoDb, who: Identity): { subject: Identity; propertyId: bigint }[] {
  return openJobs(db, who)
    .filter(j => j.subject && j.property_id !== undefined && j.property_id !== null)
    .map(j => ({ subject: j.subject as Identity, propertyId: j.property_id as bigint }));
}

export const svc_affected_profiles = spacetimedb.view(
  { name: 'svc_affected_profiles', public: true },
  t.array(affected_profile.rowType),
  ctx => {
    const out = [];
    for (const { subject, propertyId } of subjectPairs(ctx.db, ctx.sender)) {
      for (const p of ctx.db.affected_profile.identity.filter(subject)) if (p.property_id === propertyId) out.push(p);
    }
    return out;
  }
);

export const svc_recovery_plans = spacetimedb.view(
  { name: 'svc_recovery_plans', public: true },
  t.array(recovery_plan.rowType),
  ctx => {
    const out = [];
    for (const { subject, propertyId } of subjectPairs(ctx.db, ctx.sender)) {
      for (const p of ctx.db.recovery_plan.identity.filter(subject)) if (p.property_id === propertyId) out.push(p);
    }
    return out;
  }
);

export const svc_coach_messages = spacetimedb.view(
  { name: 'svc_coach_messages', public: true },
  t.array(coach_message.rowType),
  ctx => {
    const out = [];
    for (const { subject, propertyId } of subjectPairs(ctx.db, ctx.sender)) {
      for (const m of ctx.db.coach_message.identity.filter(subject)) if (m.property_id === propertyId) out.push(m);
    }
    return out;
  }
);
