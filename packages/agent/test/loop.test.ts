import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool, runAgentLoop, unsupportedAmounts, collectAllowedCents } from '../src';
import { fakeCtx, scriptedAgentNim } from './helpers';

const costTool = defineTool({
  name: 'estimate_repair_cost', description: 'cost', input: z.object({}), output: z.object({ likelyCents: z.number() }),
  visibility: 'affected', run: async () => ({ likelyCents: 3_540_000 }), summarize: () => 'estimated',
});
const slowTool = defineTool({
  name: 'slow', description: 'slow', input: z.object({}), output: z.object({}), visibility: 'affected',
  run: (_i, ctx) => new Promise((_, reject) => ctx.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
});
const finishArgs = { summary: 'Major roof damage. Likely $35,400.', recommendedActions: ['Call your insurer.'] };

describe('runAgentLoop', () => {
  it('native tools → tool result → finish, with trace steps', async () => {
    const nim = scriptedAgentNim([{ tool_calls: [{ name: 'estimate_repair_cost', arguments: {} }] }, { tool_calls: [{ name: 'finish', arguments: finishArgs }] }]);
    const { ctx, steps } = fakeCtx(nim);
    const r = await runAgentLoop({ ctx, tools: [costTool], system: 's', user: 'u' });
    expect(r.stopReason).toBe('finish');
    expect(r.finish?.summary).toContain('$35,400');
    expect(steps.map((s) => s.kind)).toEqual(['model', 'tool_call', 'tool_result', 'model']);
    expect(steps.every((s) => s.visibility === 'affected')).toBe(true);
  });

  it('stops at the step cap', async () => {
    const nim = scriptedAgentNim([{ tool_calls: [{ name: 'estimate_repair_cost', arguments: {} }] }]);
    const { ctx } = fakeCtx(nim);
    const r = await runAgentLoop({ ctx, tools: [costTool], system: 's', user: 'u', maxSteps: 3 });
    expect(r.stopReason).toBe('step_cap');
    expect(r.modelTurns).toBe(3);
  });

  it('falls back to the JSON action protocol when tools are rejected', async () => {
    const seen: any[] = [];
    const nim = scriptedAgentNim(
      [{ status: 400 }, { content: '{"action":"call_tool","tool":"estimate_repair_cost","input":{}}' }, { content: JSON.stringify({ action: 'finish', ...finishArgs }) }],
      seen,
    );
    const { ctx, steps } = fakeCtx(nim);
    const r = await runAgentLoop({ ctx, tools: [costTool], system: 's', user: 'u' });
    expect(r.mode).toBe('json');
    expect(r.stopReason).toBe('finish');
    expect(seen[1].tools).toBeUndefined();
    expect(steps.some((s) => s.name === 'tool_protocol')).toBe(true);
  });

  it('the $ post-check sends one correction turn', async () => {
    const nim = scriptedAgentNim([
      { tool_calls: [{ name: 'estimate_repair_cost', arguments: {} }] },
      { tool_calls: [{ name: 'finish', arguments: { summary: 'FEMA pays $10,000.', recommendedActions: [] } }] },
      { tool_calls: [{ name: 'finish', arguments: finishArgs }] },
    ]);
    const { ctx, steps } = fakeCtx(nim);
    const r = await runAgentLoop({
      ctx, tools: [costTool], system: 's', user: 'u',
      validateFinish: (f, calls) => {
        const bad = unsupportedAmounts([f.summary], collectAllowedCents(calls.map((c) => c.output)));
        return bad.length ? `unsupported ${bad.join(',')}` : null;
      },
    });
    expect(r.finish?.summary).toBe(finishArgs.summary);
    expect(steps.some((s) => s.name === 'post_check')).toBe(true);
  });

  it('enforces the per-tool timeout', async () => {
    const nim = scriptedAgentNim([{ tool_calls: [{ name: 'slow', arguments: {} }] }, { tool_calls: [{ name: 'finish', arguments: finishArgs }] }]);
    const { ctx, steps } = fakeCtx(nim);
    const r = await runAgentLoop({ ctx, tools: [slowTool], system: 's', user: 'u', toolTimeoutMs: 50 });
    expect(r.toolCalls[0]).toMatchObject({ name: 'slow', ok: false });
    expect(steps.some((s) => s.kind === 'error' && s.summary.includes('timed out'))).toBe(true);
  });

  it('rejects invalid tool input without running it', async () => {
    const strict = defineTool({ ...costTool, name: 'strict', input: z.object({ n: z.number() }), run: async () => ({ likelyCents: 1 }) });
    const nim = scriptedAgentNim([{ tool_calls: [{ name: 'strict', arguments: { n: 'x' } }] }, { tool_calls: [{ name: 'finish', arguments: finishArgs }] }]);
    const { ctx } = fakeCtx(nim);
    const r = await runAgentLoop({ ctx, tools: [strict], system: 's', user: 'u' });
    expect(r.toolCalls[0]).toMatchObject({ ok: false, error: 'invalid input' });
  });
});
