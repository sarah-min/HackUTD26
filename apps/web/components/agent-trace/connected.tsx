'use client';

import { idFromString, useReport, useReportSteps } from '@/lib/stdb';
import { AgentTraceView } from './AgentTrace';

/** Props Part 2's pages pass (apps/web/components/affected/placeholders/types.ts). */
export interface AgentTraceProps {
  reportId: string;
  /** 'full' = every step (verified affected person); 'pipeline' = the reporter's status timeline. */
  mode: 'full' | 'pipeline';
  className?: string;
}

/**
 * Live agent trace for one report. Reads `my_agent_steps` through Part 2's hooks: a verified affected person gets every
 * step, the reporter only `visibility='reporter'` steps (the view enforces it), so 'pipeline' is also safe for them.
 */
export function AgentTrace({ reportId, mode, className }: AgentTraceProps) {
  const id = idFromString(reportId);
  const { report } = useReport(id);
  const { steps, ready } = useReportSteps(id);
  if (id === null) return null;
  if (!ready && steps.length === 0) {
    return <p className={`text-sm text-zinc-500 dark:text-zinc-400 ${className ?? ''}`}>Loading progress…</p>;
  }
  return <AgentTraceView reportId={reportId} steps={steps} mode={mode} status={report?.status} className={className} />;
}
