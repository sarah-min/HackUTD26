import { z } from 'zod';
import { aggregateFindings } from '@hack/damage';
import { scratchOf } from '../context';
import { CLAIM_SYSTEM_PROMPT } from '../prompts/claim';
import { defineTool } from './types';
import { loadFindings, requireReportId } from './shared';

const Output = z.object({ claimNotice: z.string().max(3000) });

export const draftClaimNoticeTool = defineTool({
  name: 'draft_claim_notice',
  description:
    'Writes a first-notice-of-loss draft for the insurer from the findings (text only). Call after estimate_repair_cost so the estimate can be cited.',
  input: z.object({ emphasis: z.string().max(300).optional() }),
  output: Output,
  visibility: 'affected',
  async run(input, ctx) {
    const reportId = requireReportId(ctx);
    const report = await ctx.stdb.getReport(reportId);
    const findings = await loadFindings(ctx);
    const agg = aggregateFindings(findings);
    const scratch = scratchOf(ctx);
    const cost = scratch.get('cost') as { lowCents: number; likelyCents: number; highCents: number } | undefined;
    const location = scratch.get('location') as { location?: { countyName: string; stateCode: string } | null } | undefined;
    const facts = {
      hazard: report?.hazard ?? 'other',
      reportedAt: report ? new Date(report.createdAt).toISOString().slice(0, 10) : null,
      county: location?.location ? `${location.location.countyName}, ${location.location.stateCode}` : null,
      overallLevel: agg.overallLevel,
      damagedComponents: Object.fromEntries(Object.entries(agg.componentLevels).filter(([, l]) => l !== 'none')),
      lifeSafety: agg.lifeSafety,
      observations: findings.filter((f) => f.usable).map((f) => f.caption).slice(0, 8),
      illustrativeEstimate: cost
        ? {
            low: `$${Math.round(cost.lowCents / 100).toLocaleString('en-US')}`,
            likely: `$${Math.round(cost.likelyCents / 100).toLocaleString('en-US')}`,
            high: `$${Math.round(cost.highCents / 100).toLocaleString('en-US')}`,
          }
        : null,
      emphasis: input.emphasis ?? null,
    };
    const res = await ctx.nim.chat(
      {
        model: ctx.nim.models.agent,
        messages: [
          { role: 'system', content: CLAIM_SYSTEM_PROMPT },
          { role: 'user', content: `Facts JSON:\n${JSON.stringify(facts)}` },
        ],
        temperature: 0.3,
        max_tokens: 1200,
      },
      { signal: ctx.signal },
    );
    const text = (res.content ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim().slice(0, 3000);
    if (!text) throw new Error('empty claim draft');
    scratch.set('claimNotice', text);
    return { claimNotice: text };
  },
  summarize: (o) => `Drafted a claim notice (${o.claimNotice.length} characters)`,
});
