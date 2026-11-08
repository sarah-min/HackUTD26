import { z } from 'zod';

// Part 3 contract (CONTRACTS.md §3.2). Additive changes only.

export const AgentStepKindSchema = z.enum(['pipeline', 'vision', 'model', 'tool_call', 'tool_result', 'error']);
export const AgentStepVisibilitySchema = z.enum(['reporter', 'affected']);

export const AgentStepSchema = z.object({
  reportId: z.string(),
  seq: z.number().int(),
  kind: AgentStepKindSchema,
  name: z.string(),
  summary: z.string().max(400),
  visibility: AgentStepVisibilitySchema, // 'reporter' = reporter AND affected; 'affected' = affected only
  durationMs: z.number().int().optional(),
  at: z.number().int(),
});
export type AgentStep = z.infer<typeof AgentStepSchema>;
export type AgentStepKind = z.infer<typeof AgentStepKindSchema>;

/** Pipeline step names, in order. `kind='pipeline'` steps always use visibility 'reporter'. */
export const PIPELINE_STEPS = [
  'uploaded',
  'extract_frames',
  'analyze_frames',
  'estimate_cost',
  'check_declarations',
  'finalize',
] as const;
export type PipelineStepName = (typeof PIPELINE_STEPS)[number];

export const PIPELINE_STEP_LABELS: Record<PipelineStepName, string> = {
  uploaded: 'Uploaded',
  extract_frames: 'Extracting frames',
  analyze_frames: 'Analyzing footage',
  estimate_cost: 'Estimating repairs',
  check_declarations: 'Checking disaster declarations',
  finalize: 'Done',
};
