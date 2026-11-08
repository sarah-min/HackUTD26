import type { z } from 'zod';
import type { JobContext } from '../context';

// CONTRACTS.md §9.
export interface AgentTool<I, O> {
  name: string; // snake_case, matches ARCHITECTURE §6.3
  description: string; // shown to the model
  input: z.ZodType<I>; // converted to JSON Schema for `tools`
  output: z.ZodType<O>;
  visibility: 'reporter' | 'affected'; // trace visibility of this tool's steps (all tools: 'affected')
  run(input: I, ctx: JobContext): Promise<O>;
  /** Additive: short, redacted trace summary of a result (≤ 400 chars, no PII). */
  summarize?(output: O): string;
}

// reason: the registry holds tools with heterogeneous I/O types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAgentTool = AgentTool<any, any>;

export function defineTool<I, O>(tool: AgentTool<I, O>): AgentTool<I, O> {
  return tool;
}
