import type { JobHandler } from '@hack/agent';
import { DamageAssessmentSchema } from '@hack/contracts/assessment';
import { AffectedIntakeSchema } from '@hack/contracts/finance';
import { estimateRepairCost } from '@hack/damage';
import { buildRecoveryPlan } from '../buildRecoveryPlan';
import { getPersona } from '../personas/index';

/** SpacetimeDB SDK connection shape used by the worker (apps/worker/src/stdb/sdk.ts). */
type ConnDb = {
  db: {
    svcAffectedProfiles: {
      iter(): Iterable<{
        propertyId: bigint;
        intakeJson: string;
        identity: { toHexString(): string };
      }>;
    };
    svcAssessments: { iter(): Iterable<{ reportId: bigint; json: string }> };
  };
};

/**
 * `plan` job: rebuild cost with intake home size, run `buildRecoveryPlan`, record it.
 * Part 3 registers this in `apps/worker/src/handlers/index.ts`.
 */
export const planHandler: JobHandler = async (ctx) => {
  const propertyId = ctx.job.propertyId;
  const reportId = ctx.job.reportId;
  const identity = ctx.job.subject;
  if (!propertyId || !reportId || !identity) {
    throw new Error('plan job requires propertyId, reportId, and subject');
  }

  const conn = (ctx.stdb as { conn?: ConnDb }).conn;
  if (!conn) throw new Error('plan handler requires SdkServiceConnection');

  const propId = BigInt(propertyId);
  const repId = BigInt(reportId);

  let intakeJson: string | undefined;
  for (const p of conn.db.svcAffectedProfiles.iter()) {
    // Match subject identity — two verified people on one property must not cross over.
    if (p.propertyId === propId && p.identity.toHexString() === identity) {
      intakeJson = p.intakeJson;
      break;
    }
  }
  if (!intakeJson) throw new Error('no affected_profile for plan job subject');

  let assessmentJson: string | undefined;
  for (const a of conn.db.svcAssessments.iter()) {
    if (a.reportId === repId) {
      assessmentJson = a.json;
      break;
    }
  }
  if (!assessmentJson) throw new Error('no assessment for plan job');

  const intake = AffectedIntakeSchema.parse(JSON.parse(intakeJson));
  const assessment = DamageAssessmentSchema.parse(JSON.parse(assessmentJson));
  const profile = getPersona(intake.personaId);

  const cost = estimateRepairCost({
    componentLevels: assessment.componentLevels,
    homeSqft: intake.homeSqft,
    stories: intake.stories,
    tenure: intake.tenure,
  });

  const plan = buildRecoveryPlan({
    propertyId,
    reportId,
    intake,
    profile,
    assessment: { hazard: assessment.hazard, declarations: assessment.declarations },
    cost,
  });

  await ctx.stdb.recordRecoveryPlan({
    identity,
    propertyId,
    reportId,
    json: JSON.stringify(plan),
  });

  await ctx.step({
    kind: 'pipeline',
    name: 'finalize',
    summary: 'Recovery plan ready',
    visibility: 'affected',
  });
};
