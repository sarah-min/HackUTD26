import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  AgentFinishSchema,
  FrameFindingSchema,
  type AgentFinish,
  type AssessmentLocation,
  type DisasterDeclaration,
  type FrameFinding,
  type Hazard,
  type WeatherAlert,
} from '@hack/contracts';
import { aggregateFindings, estimateRepairCost, needsMoreFootage } from '@hack/damage';
import {
  AGENT_PROMPT_VERSION,
  AGENT_SYSTEM_PROMPT,
  analyzeTools,
  collectAllowedCents,
  runAgentLoop,
  scratchOf,
  unsupportedAmounts,
  type AnyAgentTool,
} from '@hack/agent';
import {
  DAMAGE_FRAME_PROMPT_VERSION,
  analyzeFrame,
  createLimiter,
  extractFrames,
  type MediaInput,
} from '@hack/vision';
import { loadFixture } from '../fixtures';
import { findingCache } from '../vlCache';
import { buildAssessment, deterministicFinish } from './assessment';
import type { JobContext, JobHandler } from './types';

const ANALYZE_BUDGET_MS = 110_000; // inside the 120 s job lease
const FRAME_TIMEOUT_MS = 45_000;
const TOOL_TIMEOUT_MS = 10_000;
const REQUIRED_TOOLS = ['reverse_geocode', 'lookup_disaster_declarations', 'get_weather_alerts', 'estimate_repair_cost'] as const;
const PIPELINE_FOR_TOOL: Record<string, { name: string; summary: string }> = {
  estimate_repair_cost: { name: 'estimate_cost', summary: 'Estimating repairs' },
  lookup_disaster_declarations: { name: 'check_declarations', summary: 'Checking disaster declarations' },
};

const EXT: Record<string, string> = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};

function vlConcurrency(): number {
  const n = Number(process.env.VL_CONCURRENCY ?? 4);
  return Number.isFinite(n) && n > 0 ? n : 4;
}

/** Runs a tool outside the model loop (the model skipped it), with the same trace and timeout. */
async function runToolDirect(ctx: JobContext, tool: AnyAgentTool, pipelineSent: Set<string>): Promise<unknown> {
  const pipe = PIPELINE_FOR_TOOL[tool.name];
  if (pipe && !pipelineSent.has(pipe.name)) {
    pipelineSent.add(pipe.name);
    await ctx.step({ kind: 'pipeline', name: pipe.name, summary: pipe.summary, visibility: 'reporter' });
  }
  await ctx.step({ kind: 'tool_call', name: tool.name, summary: `Calling ${tool.name} (automatic)`, visibility: tool.visibility });
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('tool timed out')), TOOL_TIMEOUT_MS);
  try {
    const out = tool.output.parse(await tool.run({}, { ...ctx, signal: controller.signal }));
    await ctx.step({ kind: 'tool_result', name: tool.name, summary: (tool.summarize?.(out) ?? 'Done').slice(0, 400), visibility: tool.visibility, durationMs: Date.now() - t0 });
    return out;
  } catch (e) {
    await ctx.step({ kind: 'error', name: tool.name, summary: `Tool failed: ${(e as Error).message}`.slice(0, 400), visibility: tool.visibility, durationMs: Date.now() - t0 });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const analyzeHandler: JobHandler = async (ctx) => {
  const started = Date.now();
  const reportId = ctx.job.reportId;
  if (!reportId) throw new Error('analyze job without report_id');
  const report = await ctx.stdb.getReport(reportId);
  if (!report) throw new Error(`report ${reportId} not found`);
  const media = await ctx.stdb.listMedia(reportId);
  if (!media.length) throw new Error('report has no media');
  const scratch = scratchOf(ctx);
  const fixtures = ctx.nim.useFixtures;

  await ctx.step({ kind: 'pipeline', name: 'uploaded', summary: 'Footage received', visibility: 'reporter' });
  const tmp = await mkdtemp(path.join(os.tmpdir(), `aftermath-${reportId}-`));
  try {
    // 1. Frames
    await ctx.step({ kind: 'pipeline', name: 'extract_frames', summary: 'Extracting frames', visibility: 'reporter' });
    const t0 = Date.now();
    const video = media.find((m) => m.kind === 'video');
    const selected = video ? [video] : media.filter((m) => m.kind === 'image').slice(0, 8);
    const inputs: MediaInput[] = [];
    for (const [i, m] of selected.entries()) {
      const file = path.join(tmp, `in-${i}.${EXT[m.contentType] ?? 'bin'}`);
      await writeFile(file, await ctx.storage.getObject(m.objectKey));
      inputs.push({ path: file, kind: m.kind });
    }
    const frames = await extractFrames(inputs, path.join(tmp, 'frames'));
    await ctx.step({
      kind: 'pipeline', name: 'extract_frames', summary: `Extracted ${frames.length} frame${frames.length === 1 ? '' : 's'}`,
      visibility: 'reporter', durationMs: Date.now() - t0,
    });

    // 2. Vision findings (cached by frame SHA-256), recorded as they finish
    const hazard = report.hazard as Hazard;
    const fixtureFindings = fixtures
      ? (await loadFixture<{ findings: unknown[] }>('assessment/findings-sample.json')).findings
      : [];
    const limit = createLimiter(vlConcurrency());
    let done = 0;
    await ctx.step({ kind: 'pipeline', name: 'analyze_frames', summary: `Analyzing 0/${frames.length}`, visibility: 'reporter' });
    const findings: FrameFinding[] = await Promise.all(
      frames.map((frame) =>
        limit(async () => {
          const thumbKey = `frames/${reportId}/${frame.frameIndex}.jpg`;
          await ctx.storage.putObject(thumbKey, frame.jpeg, 'image/jpeg');
          const tf = Date.now();
          let finding: FrameFinding;
          let note = '';
          if (fixtures) {
            const raw = fixtureFindings[frame.frameIndex % Math.max(1, fixtureFindings.length)] as Record<string, unknown>;
            finding = FrameFindingSchema.parse({ ...raw, frameIndex: frame.frameIndex, tSec: frame.tSec });
            note = ' (fixture)';
          } else {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(new Error('frame timed out')), FRAME_TIMEOUT_MS);
            try {
              const r = await analyzeFrame({
                nim: ctx.nim, image: frame.jpeg, frameIndex: frame.frameIndex, tSec: frame.tSec, hazard,
                cache: findingCache(), signal: controller.signal,
              });
              finding = r.finding;
              note = r.cached ? ' (cached)' : r.parseError ? ' (unreadable model output)' : '';
            } catch (e) {
              finding = FrameFindingSchema.parse({
                frameIndex: frame.frameIndex, tSec: frame.tSec, usable: false, unusableReason: 'other',
                components: [], lifeSafety: [], waterDepth: 'unknown', caption: 'This frame could not be analyzed.',
              });
              note = ` (error: ${(e as Error).message.slice(0, 80)})`;
            } finally {
              clearTimeout(timer);
            }
          }
          await ctx.stdb.recordFrame({ reportId, frameIndex: frame.frameIndex, tSec: frame.tSec, thumbKey, findingJson: JSON.stringify(finding) });
          const comps = finding.components.filter((c) => c.level !== 'none').map((c) => `${c.component} ${c.level}`).join(', ');
          await ctx.step({
            kind: 'vision', name: ctx.nim.models.vision,
            summary: `Frame ${frame.frameIndex + 1}${frame.tSec ? ` at ${frame.tSec.toFixed(1)} s` : ''}: ${finding.usable ? comps || 'no visible damage' : `unusable (${finding.unusableReason})`}${note}`.slice(0, 400),
            visibility: 'affected', durationMs: Date.now() - tf,
          });
          done++;
          await ctx.step({ kind: 'pipeline', name: 'analyze_frames', summary: `Analyzing ${done}/${frames.length}`, visibility: 'reporter' });
          return finding;
        }),
      ),
    );
    findings.sort((a, b) => a.frameIndex - b.frameIndex);
    scratch.set('findings', findings);
    const agg = aggregateFindings(findings);
    const tooLittle = needsMoreFootage(agg.usableFrameCount, agg.totalFrameCount);

    // 3. Agent (multi-step, tools) unless there is too little usable footage
    const pipelineSent = new Set<string>();
    let finish: AgentFinish;
    let modelId = ctx.nim.models.agent;
    const toolOutputs: unknown[] = [];
    const byName = new Map(analyzeTools.map((t) => [t.name, t]));
    const succeeded = new Set<string>();

    if (tooLittle) {
      modelId = 'deterministic';
      finish = deterministicFinish(agg, { needsMoreFootage: true, selfDanger: report.selfDanger });
      await ctx.step({ kind: 'model', name: 'deterministic', summary: 'Skipped the agent: more than half the frames were unusable', visibility: 'affected' });
    } else if (fixtures) {
      modelId = 'fixture';
      finish = AgentFinishSchema.parse(await loadFixture('assessment/agent-finish.json'));
      await ctx.step({ kind: 'model', name: 'fixture', summary: 'Fixture agent output (USE_FIXTURES=true)', visibility: 'affected' });
    } else {
      const remaining = ANALYZE_BUDGET_MS - (Date.now() - started) - 15_000;
      const result = await runAgentLoop({
        ctx,
        tools: analyzeTools,
        system: AGENT_SYSTEM_PROMPT,
        user: `Assess report ${reportId}. Investigate with the tools, then call finish.`,
        maxSteps: 12,
        wallClockMs: Math.max(10_000, Math.min(90_000, remaining)),
        toolTimeoutMs: TOOL_TIMEOUT_MS,
        beforeTool: async (name) => {
          const pipe = PIPELINE_FOR_TOOL[name];
          if (pipe && !pipelineSent.has(pipe.name)) {
            pipelineSent.add(pipe.name);
            await ctx.step({ kind: 'pipeline', name: pipe.name, summary: pipe.summary, visibility: 'reporter' });
          }
        },
        validateFinish: (f, calls) => {
          const allowed = collectAllowedCents([...calls.filter((c) => c.ok).map((c) => c.output), scratch.get('cost')]);
          const bad = unsupportedAmounts([f.summary, ...f.recommendedActions], allowed);
          return bad.length
            ? `Your text contains dollar amounts that are not in any tool result (${bad.join(', ')}). Remove them or use only the tool figures, then call finish again.`
            : null;
        },
      });
      for (const r of result.toolCalls) {
        if (r.ok) {
          succeeded.add(r.name);
          toolOutputs.push(r.output);
        }
      }
      if (result.finish) {
        finish = result.finish;
      } else {
        finish = deterministicFinish(agg, { needsMoreFootage: false, selfDanger: report.selfDanger });
        await ctx.step({ kind: 'error', name: 'agent', summary: `Agent stopped (${result.stopReason}); used a code-written summary`, visibility: 'affected' });
      }
    }

    // 4. Facts the assessment always needs: run any required tool the model skipped
    if (!tooLittle) {
      for (const name of REQUIRED_TOOLS) {
        if (succeeded.has(name)) continue;
        const out = await runToolDirect(ctx, byName.get(name)!, pipelineSent);
        if (out) toolOutputs.push(out);
      }
    }
    const cost = estimateRepairCost({ componentLevels: agg.componentLevels });
    const location = (scratch.get('location') as { location: AssessmentLocation | null } | undefined)?.location ?? undefined;
    const declarations = (scratch.get('declarations') as { declarations: DisasterDeclaration[] } | undefined)?.declarations ?? [];
    const activeAlerts = (scratch.get('alerts') as { alerts: WeatherAlert[] } | undefined)?.alerts ?? [];
    const allowedCents = collectAllowedCents([...toolOutputs, cost]);

    const assessment = buildAssessment({
      reportId,
      propertyId: report.propertyId,
      reportHazard: report.hazard,
      selfDanger: report.selfDanger,
      agg,
      finish,
      claimNotice: finish.claimNotice ?? (scratch.get('claimNotice') as string | undefined),
      cost,
      declarations,
      activeAlerts,
      location,
      allowedCents,
      modelId,
      visionModelId: ctx.nim.models.vision,
      promptVersion: `${AGENT_PROMPT_VERSION}+${DAMAGE_FRAME_PROMPT_VERSION}`,
      source: fixtures ? 'fixture' : 'live',
    });

    await ctx.stdb.recordAssessment({
      reportId,
      json: JSON.stringify(assessment),
      overallLevel: assessment.overallLevel,
      usableFrames: assessment.usableFrameCount,
      totalFrames: assessment.totalFrameCount,
      lifeSafetyCsv: assessment.lifeSafety.join(','),
    });
    await ctx.step({
      kind: 'pipeline', name: 'finalize', summary: tooLittle ? 'More footage needed' : 'Done',
      visibility: 'reporter', durationMs: Date.now() - started,
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
};
