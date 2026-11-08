import { z } from 'zod';
import { CostEstimateSchema } from '@hack/contracts/assessment';
import { aggregateFindings, estimateRepairCost } from '@hack/damage';
import { scratchOf } from '../context';
import { defineTool } from './types';
import { loadFindings } from './shared';

/** Code-only. Levels come from the validated findings, never from the model; assumed home defaults. */
export const estimateRepairCostTool = defineTool({
  name: 'estimate_repair_cost',
  description:
    'Deterministic illustrative repair-cost range (cost-v1) from the code-computed damage levels, using the assumed home size. The only source of dollar figures.',
  input: z.object({}),
  output: CostEstimateSchema,
  visibility: 'affected',
  async run(_input, ctx) {
    const agg = aggregateFindings(await loadFindings(ctx));
    const cost = estimateRepairCost({ componentLevels: agg.componentLevels });
    scratchOf(ctx).set('cost', cost);
    return cost;
  },
  summarize: (o) => `Estimated ${o.lineItems.length} line item(s), assumed home size: ${o.inputs.assumed ? 'yes' : 'no'}`,
});
