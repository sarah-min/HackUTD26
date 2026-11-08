import type { JobHandler } from '@hack/agent';
import { RecoveryPlanSchema, type RecoveryPlan } from '@hack/contracts/finance';

type ConnDb = {
  db: {
    svcRecoveryPlans: {
      iter(): Iterable<{ propertyId: bigint; reportId: bigint; json: string }>;
    };
  };
};

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Grounded reply from plan figures only (no free-form dollars). */
export function coachReplyFromPlan(plan: RecoveryPlan, question: string): string {
  const q = question.toLowerCase();
  const gap = formatCents(plan.gapCents.likely);
  const repair = formatCents(plan.repairCostCents.likely);
  const payout = formatCents(plan.expectedPayoutCents.likely);
  const worst = [...plan.indicators].sort((a, b) => {
    const rank = { risk: 2, watch: 1, good: 0 } as const;
    return rank[b.status] - rank[a.status];
  })[0];

  if (q.includes('gap') || q.includes('short')) {
    return `Your likely coverage gap is about ${gap} after an estimated ${payout} payout on ${repair} of repairs. Educational estimate using a synthetic demo profile — not financial advice.`;
  }
  if (q.includes('option') || q.includes('fund') || q.includes('pay')) {
    const top = plan.recommendedMix
      .slice(0, 3)
      .map((m) => {
        const opt = plan.options.find((o) => o.id === m.optionId);
        return `${opt?.label ?? m.optionId}: ${formatCents(m.amountCents)}`;
      })
      .join('; ');
    return `Recommended mix for the likely gap: ${top || 'none sized yet'}. Educational estimate using a synthetic demo profile — not financial advice.`;
  }
  if (q.includes('indicator') || q.includes('risk') || q.includes('runway')) {
    return worst
      ? `Watch "${worst.label}" (${worst.status}): ${worst.explanation} Educational estimate using a synthetic demo profile — not financial advice.`
      : `Indicators are in your plan. Educational estimate — not financial advice.`;
  }

  const steps = plan.nextSteps.slice(0, 3).join(' ');
  return `Likely repair ${repair}, expected payout ${payout}, gap ${gap}. ${steps} Educational estimate using a synthetic demo profile — not financial advice.`;
}

/**
 * `coach` job: answer from the stored RecoveryPlan JSON only.
 * Part 3 registers this in `apps/worker/src/handlers/index.ts`.
 */
export const coachHandler: JobHandler = async (ctx) => {
  const propertyId = ctx.job.propertyId;
  const reportId = ctx.job.reportId;
  const identity = ctx.job.subject;
  if (!propertyId || !reportId || !identity) {
    throw new Error('coach job requires propertyId, reportId, and subject');
  }

  const payload = ctx.job.payload as { text?: string } | undefined;
  const question = typeof payload?.text === 'string' ? payload.text.trim() : '';
  if (!question) throw new Error('coach job missing question text');

  const conn = (ctx.stdb as { conn?: ConnDb }).conn;
  if (!conn) throw new Error('coach handler requires SdkServiceConnection');

  const propId = BigInt(propertyId);
  const repId = BigInt(reportId);

  let json: string | undefined;
  for (const p of conn.db.svcRecoveryPlans.iter()) {
    if (p.propertyId === propId && p.reportId === repId) {
      json = p.json;
      break;
    }
  }
  if (!json) throw new Error('no recovery plan for coach job');

  const plan = RecoveryPlanSchema.parse(JSON.parse(json));
  const text = coachReplyFromPlan(plan, question).slice(0, 2000);

  await ctx.stdb.recordCoachReply({ identity, propertyId, reportId, text });
};
