'use client';

import { useMemo, useState } from 'react';
import { PIPELINE_STEPS, PIPELINE_STEP_LABELS, type AgentStep, type PipelineStepName } from '@hack/contracts/agent';
import { formatDuration, normalizeSteps, type AgentStepRowLike } from './normalize';

/** Presentational trace: takes the step rows directly (tests, storybook, custom pages). */
export interface AgentTraceViewProps {
  reportId: string;
  /** agent_step rows for this report (live from the module; the caller subscribes). */
  steps: readonly AgentStepRowLike[];
  /** 'pipeline' = reporter status timeline; 'full' = every model/tool step (verified affected person only). */
  mode?: 'pipeline' | 'full';
  /** report.status, so the timeline can show failed / needs_more_footage. */
  status?: string;
  className?: string;
}

type StepState = 'done' | 'active' | 'pending' | 'failed';

/** Plain-language step names for the reporter timeline (the contract labels stay for logs and the full trace). */
const FRIENDLY_STEP: Record<PipelineStepName, string> = {
  uploaded: 'Photos received',
  extract_frames: 'Preparing your photos',
  analyze_frames: 'Looking for damage',
  estimate_cost: 'Estimating repair costs',
  check_declarations: 'Checking for disaster declarations',
  finalize: 'Report ready',
};

/** Worker summaries repeat the step name or use pipeline jargon; keep only useful progress, in plain words. */
function friendlyDetail(summary: string | undefined, contractLabel: string): string | undefined {
  if (!summary) return undefined;
  const s = summary.trim();
  if (s === contractLabel || ['Footage received', 'Done', 'More footage needed'].includes(s)) return undefined;
  const checking = s.match(/^Analyzing (\d+)\/(\d+)$/);
  if (checking) return `${checking[1]} of ${checking[2]} images checked`;
  const prepared = s.match(/^Extracted (\d+) frames?$/);
  if (prepared) return `${prepared[1]} image${prepared[1] === '1' ? '' : 's'} ready to check`;
  return s;
}

const KIND_LABEL: Record<AgentStep['kind'], string> = {
  pipeline: 'Status',
  vision: 'Vision',
  model: 'Agent',
  tool_call: 'Tool',
  tool_result: 'Result',
  error: 'Issue',
};

const KIND_STYLE: Record<AgentStep['kind'], string> = {
  pipeline: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  vision: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  model: 'bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  tool_call: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  tool_result: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  error: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
};

function pipelineView(steps: AgentStep[], status?: string) {
  const pipeline = steps.filter((s) => s.kind === 'pipeline' && s.visibility === 'reporter');
  const latest = new Map<string, AgentStep>();
  for (const s of pipeline) latest.set(s.name, s);
  const reached = PIPELINE_STEPS.reduce((max, name, i) => (latest.has(name) ? i : max), -1);
  const finished = latest.has('finalize') || status === 'assessed' || status === 'needs_more_footage';
  return PIPELINE_STEPS.map((name, i) => {
    let state: StepState = 'pending';
    if (finished || i < reached) state = 'done';
    else if (i === reached) state = status === 'failed' ? 'failed' : 'active';
    else if (i === 0 && (status === 'queued' || status === 'processing')) state = 'active';
    const step = latest.get(name);
    const contractLabel: string = PIPELINE_STEP_LABELS[name as PipelineStepName];
    let label: string = FRIENDLY_STEP[name as PipelineStepName] ?? contractLabel;
    if (name === 'finalize' && status === 'needs_more_footage') label = 'More photos needed';
    // The last step turns green once the run finished with an assessment (not for 'More footage needed').
    const complete = name === 'finalize' && state === 'done' && status !== 'needs_more_footage' && status !== 'failed';
    return { name, label, state, complete, detail: friendlyDetail(step?.summary, contractLabel) };
  });
}

function Dot({ state, complete = false }: { state: StepState; complete?: boolean }) {
  const base = 'relative mt-1 flex h-3 w-3 shrink-0 rounded-full';
  if (complete) return <span className={`${base} bg-emerald-600 dark:bg-emerald-400`} aria-hidden />;
  if (state === 'done') return <span className={`${base} bg-zinc-900 dark:bg-zinc-100`} aria-hidden />;
  if (state === 'failed') return <span className={`${base} bg-red-600`} aria-hidden />;
  if (state === 'active')
    return (
      <span className={`${base} bg-zinc-900 dark:bg-zinc-100`} aria-hidden>
        <span className="absolute inset-0 rounded-full bg-zinc-900 opacity-40 motion-safe:animate-ping dark:bg-zinc-100" />
      </span>
    );
  return <span className={`${base} border border-zinc-300 dark:border-zinc-600`} aria-hidden />;
}

export function AgentTraceView({ reportId, steps, mode = 'full', status, className = '' }: AgentTraceViewProps) {
  const normalized = useMemo(() => normalizeSteps(steps, reportId), [steps, reportId]);
  const [showStatus, setShowStatus] = useState(false);

  if (mode === 'pipeline') {
    const view = pipelineView(normalized, status);
    return (
      <ol className={`w-full space-y-3 ${className}`} aria-label="Processing status" aria-live="polite">
        {view.map((s) => (
          <li key={s.name} className="flex items-start gap-3">
            <Dot state={s.state} complete={s.complete} />
            <div className="min-w-0">
              <p
                className={`text-sm leading-5 ${
                  s.complete
                    ? 'font-medium text-emerald-700 dark:text-emerald-400'
                    : s.state === 'pending'
                      ? 'text-zinc-400 dark:text-zinc-500'
                      : s.state === 'failed'
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-zinc-900 dark:text-zinc-100'
                } ${s.state === 'active' ? 'font-medium' : ''}`}
              >
                {s.state === 'failed' ? `${s.label}: didn’t finish` : s.label}
              </p>
              {s.detail && s.state !== 'pending' && <p className="text-xs text-zinc-500 dark:text-zinc-400">{s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    );
  }

  const visible = showStatus ? normalized : normalized.filter((s) => s.kind !== 'pipeline');
  const t0 = normalized[0]?.at ?? 0;
  const toolCount = normalized.filter((s) => s.kind === 'tool_call').length;
  const modelTurns = normalized.filter((s) => s.kind === 'model').length;

  return (
    <section className={`w-full ${className}`} aria-label="Agent trace">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {modelTurns} agent step{modelTurns === 1 ? '' : 's'} · {toolCount} tool call{toolCount === 1 ? '' : 's'}
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <input type="checkbox" checked={showStatus} onChange={(e) => setShowStatus(e.target.checked)} className="h-3.5 w-3.5" />
          Show status steps
        </label>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No steps yet.</p>
      ) : (
        <ol className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {visible.map((s) => (
            <li key={s.seq} className="grid grid-cols-[3.5rem_1fr_auto] items-start gap-3 py-2.5">
              <span className="pt-0.5 font-mono text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
                +{Math.max(0, (s.at - t0) / 1000).toFixed(1)}s
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${KIND_STYLE[s.kind] ?? KIND_STYLE.pipeline}`}>
                    {KIND_LABEL[s.kind] ?? s.kind}
                  </span>
                  <code className="truncate font-mono text-xs text-zinc-700 dark:text-zinc-300">{s.name}</code>
                </div>
                <p className="mt-1 break-words text-sm text-zinc-800 dark:text-zinc-200">{s.summary}</p>
              </div>
              <span className="pt-0.5 font-mono text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">{formatDuration(s.durationMs)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default AgentTraceView;
