// Job handler registry: one import per line, one entry per line (WORKFLOW.md §3).
// Part 4 adds `plan` and `coach` here (task T3.13).
import type { JobHandler, JobKind } from './types';
import { analyzeHandler } from './analyze';
import { verifyIdentityHandler } from './verifyIdentity';

export const handlers: Partial<Record<JobKind, JobHandler>> = {
  analyze: analyzeHandler,
  verify_identity: verifyIdentityHandler,
};
