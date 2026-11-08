// Job handler registry: one import per line, one entry per line (WORKFLOW.md §3).
// `plan` and `coach` come from Part 4's @hack/finance (task T3.13).
import type { JobHandler, JobKind } from './types';
import { analyzeHandler } from './analyze';
import { verifyIdentityHandler } from './verifyIdentity';
import { planHandler, coachHandler } from '@hack/finance';

export const handlers: Partial<Record<JobKind, JobHandler>> = {
  analyze: analyzeHandler,
  verify_identity: verifyIdentityHandler,
  plan: planHandler,
  coach: coachHandler,
};
