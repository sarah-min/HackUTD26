import { z } from 'zod';
import { AgentFinishSchema, type AgentFinish } from '@hack/contracts/assessment';
import { scratchOf, type JobContext } from './context';
import { FixtureModeError, NimHttpError, type ChatMessage, type ToolDefinition } from './nim';
import { JSON_PROTOCOL } from './prompts/agent';
import type { AnyAgentTool } from './tools/types';

// ARCHITECTURE §6.3: ≤ 12 model steps, 90 s wall clock, 10 s per tool, native tool calls with a
// JSON "next action" fallback. Every model turn, tool call and tool result is recorded via ctx.step().

export interface AgentLoopOptions {
  ctx: JobContext;
  tools: AnyAgentTool[];
  system: string;
  user: string;
  maxSteps?: number;
  wallClockMs?: number;
  toolTimeoutMs?: number;
  mode?: 'auto' | 'native' | 'json';
  /** Return an error message to send back to the model (one more turn), or null when the finish is acceptable. */
  validateFinish?: (finish: AgentFinish, toolCalls: readonly ToolCallRecord[]) => string | null;
  beforeTool?: (name: string) => Promise<void>;
  extraBody?: Record<string, unknown>;
  now?: () => number;
}

export interface ToolCallRecord {
  name: string;
  ok: boolean;
  output?: unknown;
  error?: string;
}

export interface AgentLoopResult {
  finish: AgentFinish | null;
  mode: 'native' | 'json';
  modelTurns: number;
  toolCalls: ToolCallRecord[];
  stopReason: 'finish' | 'step_cap' | 'timeout' | 'model_error';
  error?: string;
}

const FINISH = 'finish';
const MAX_TOOL_RESULT_CHARS = 8_000;

export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

export function toolDefinitions(tools: AnyAgentTool[]): ToolDefinition[] {
  return [
    ...tools.map((t) => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: toJsonSchema(t.input) },
    })),
    {
      type: 'function' as const,
      function: {
        name: FINISH,
        description: 'Finish the assessment with the resident-facing summary and recommended actions.',
        parameters: toJsonSchema(AgentFinishSchema.omit({ claimNotice: true })),
      },
    },
  ];
}

function jsonSystemPrompt(system: string, tools: AnyAgentTool[]): string {
  const list = tools
    .map((t) => `- ${t.name}: ${t.description}\n  input JSON schema: ${JSON.stringify(toJsonSchema(t.input))}`)
    .join('\n');
  return `${system}\n\nTools:\n${list}\n\n${JSON_PROTOCOL}`;
}

const NextActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('call_tool'), tool: z.string(), input: z.record(z.string(), z.unknown()).optional() }),
  AgentFinishSchema.extend({ action: z.literal(FINISH) }),
]);

function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function issues(e: z.ZodError): string {
  return e.issues.slice(0, 6).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

function withTimeout<T>(ms: number, parent: AbortSignal | undefined, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parent?.reason);
  parent?.addEventListener('abort', onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`timed out after ${ms} ms`);
      reject(err); // settle the race first, then cancel the tool
      controller.abort(err);
    }, ms);
  });
  return Promise.race([fn(controller.signal), timeout]).finally(() => {
    clearTimeout(timer);
    parent?.removeEventListener('abort', onAbort);
  });
}

export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const { ctx, tools } = opts;
  const now = opts.now ?? Date.now;
  const started = now();
  const maxSteps = opts.maxSteps ?? 12;
  const wallClockMs = opts.wallClockMs ?? 90_000;
  const toolTimeoutMs = opts.toolTimeoutMs ?? 10_000;
  const byName = new Map(tools.map((t) => [t.name, t]));
  const records: ToolCallRecord[] = [];
  let mode: 'native' | 'json' = opts.mode === 'json' ? 'json' : 'native';
  const definitions = toolDefinitions(tools);
  let messages: ChatMessage[] =
    mode === 'native'
      ? [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user }]
      : [{ role: 'system', content: jsonSystemPrompt(opts.system, tools) }, { role: 'user', content: opts.user }];
  let modelTurns = 0;
  let finishRetries = 0;
  const scratch = scratchOf(ctx);

  const switchToJson = async (why: string) => {
    mode = 'json';
    messages = [{ role: 'system', content: jsonSystemPrompt(opts.system, tools) }, { role: 'user', content: opts.user }];
    await ctx.step({ kind: 'error', name: 'tool_protocol', summary: `Switched to JSON actions: ${why}`.slice(0, 400), visibility: 'affected' });
  };

  const executeTool = async (name: string, rawInput: unknown): Promise<string> => {
    const tool = byName.get(name);
    if (!tool) {
      records.push({ name, ok: false, error: 'unknown tool' });
      await ctx.step({ kind: 'error', name, summary: 'The model asked for an unknown tool', visibility: 'affected' });
      return JSON.stringify({ error: `Unknown tool "${name}". Available: ${[...byName.keys()].join(', ')}, finish.` });
    }
    const parsedInput = tool.input.safeParse(rawInput ?? {});
    if (!parsedInput.success) {
      records.push({ name, ok: false, error: 'invalid input' });
      await ctx.step({ kind: 'error', name, summary: `Invalid tool input: ${issues(parsedInput.error)}`.slice(0, 400), visibility: tool.visibility });
      return JSON.stringify({ error: `Invalid input: ${issues(parsedInput.error)}` });
    }
    await opts.beforeTool?.(name);
    await ctx.step({ kind: 'tool_call', name, summary: `Calling ${name}`, visibility: tool.visibility });
    const t0 = now();
    try {
      const output = await withTimeout(toolTimeoutMs, ctx.signal, (signal) =>
        tool.run(parsedInput.data, { ...ctx, signal, scratch }),
      );
      const valid = tool.output.parse(output);
      records.push({ name, ok: true, output: valid });
      await ctx.step({
        kind: 'tool_result',
        name,
        summary: (tool.summarize?.(valid) ?? 'Done').slice(0, 400),
        visibility: tool.visibility,
        durationMs: Math.round(now() - t0),
      });
      return JSON.stringify(valid).slice(0, MAX_TOOL_RESULT_CHARS);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      records.push({ name, ok: false, error: msg });
      await ctx.step({ kind: 'error', name, summary: `Tool failed: ${msg}`.slice(0, 400), visibility: tool.visibility, durationMs: Math.round(now() - t0) });
      return JSON.stringify({ error: `Tool failed: ${msg.slice(0, 200)}` });
    }
  };

  const acceptFinish = async (raw: unknown): Promise<{ finish: AgentFinish } | { retry: string }> => {
    const parsed = AgentFinishSchema.safeParse(raw);
    if (!parsed.success) return { retry: `finish input invalid: ${issues(parsed.error)}` };
    const problem = opts.validateFinish?.(parsed.data, records) ?? null;
    if (problem && finishRetries < 1) {
      finishRetries++;
      await ctx.step({ kind: 'error', name: 'post_check', summary: problem.slice(0, 400), visibility: 'affected' });
      return { retry: problem };
    }
    return { finish: parsed.data };
  };

  while (modelTurns < maxSteps) {
    const remaining = wallClockMs - (now() - started);
    if (remaining <= 1_000) return { finish: null, mode, modelTurns, toolCalls: records, stopReason: 'timeout' };

    const t0 = now();
    let res;
    try {
      res = await ctx.nim.chat(
        {
          model: ctx.nim.models.agent,
          messages,
          ...(mode === 'native' ? { tools: definitions, tool_choice: 'auto' as const } : {}),
          temperature: 0.2,
          max_tokens: 1_500,
          extraBody: opts.extraBody,
        },
        { signal: ctx.signal, timeoutMs: Math.min(remaining, 45_000) },
      );
    } catch (e) {
      if (e instanceof FixtureModeError) throw e;
      if (e instanceof NimHttpError && e.status === 400 && mode === 'native' && opts.mode !== 'native' && modelTurns === 0) {
        await switchToJson('the model endpoint rejected native tools');
        continue;
      }
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.step({ kind: 'error', name: ctx.nim.models.agent, summary: `Model call failed: ${msg}`.slice(0, 400), visibility: 'affected' });
      return { finish: null, mode, modelTurns, toolCalls: records, stopReason: 'model_error', error: msg };
    }
    modelTurns++;
    const durationMs = Math.round(now() - t0);

    if (mode === 'native') {
      const calls = res.toolCalls.filter((c) => c.function.name);
      await ctx.step({
        kind: 'model',
        name: ctx.nim.models.agent,
        summary: calls.length ? `Plan: ${calls.map((c) => c.function.name).join(', ')}` : 'Responded without a tool call',
        visibility: 'affected',
        durationMs,
      });
      if (calls.length) {
        messages.push({ role: 'assistant', content: res.content ?? null, tool_calls: calls });
        let finished: AgentFinish | null = null;
        for (const call of calls) {
          let args: unknown = {};
          try {
            args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          } catch {
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'arguments were not valid JSON' }) });
            continue;
          }
          if (call.function.name === FINISH) {
            const verdict = await acceptFinish(args);
            if ('finish' in verdict) finished = verdict.finish;
            else messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: verdict.retry }) });
          } else {
            messages.push({ role: 'tool', tool_call_id: call.id, content: await executeTool(call.function.name, args) });
          }
        }
        if (finished) return { finish: finished, mode, modelTurns, toolCalls: records, stopReason: 'finish' };
        continue;
      }
      // No tool calls: accept a JSON finish in content, else fall back to the JSON protocol once.
      try {
        const raw = extractJson(res.content ?? '') as Record<string, unknown>;
        const verdict = await acceptFinish(raw);
        if ('finish' in verdict) return { finish: verdict.finish, mode, modelTurns, toolCalls: records, stopReason: 'finish' };
        messages.push({ role: 'assistant', content: res.content ?? '' }, { role: 'user', content: verdict.retry });
      } catch {
        if (opts.mode !== 'native' && records.length === 0) await switchToJson('the model did not emit tool calls');
        else {
          messages.push({ role: 'assistant', content: res.content ?? '' });
          messages.push({ role: 'user', content: 'Call one of the tools, or call finish.' });
        }
      }
      continue;
    }

    // JSON protocol
    const content = res.content ?? '';
    messages.push({ role: 'assistant', content });
    let action: z.infer<typeof NextActionSchema>;
    try {
      const parsed = NextActionSchema.safeParse(extractJson(content));
      if (!parsed.success) throw new Error(issues(parsed.error));
      action = parsed.data;
    } catch (e) {
      await ctx.step({ kind: 'model', name: ctx.nim.models.agent, summary: 'Unreadable action; asked again', visibility: 'affected', durationMs });
      messages.push({ role: 'user', content: `Invalid action (${(e as Error).message.slice(0, 200)}). Reply with one JSON object.` });
      continue;
    }
    if (action.action === 'call_tool') {
      await ctx.step({ kind: 'model', name: ctx.nim.models.agent, summary: `Plan: ${action.tool}`, visibility: 'affected', durationMs });
      const result = await executeTool(action.tool, action.input ?? {});
      messages.push({ role: 'user', content: `Result of ${action.tool}: ${result}` });
      continue;
    }
    await ctx.step({ kind: 'model', name: ctx.nim.models.agent, summary: 'Plan: finish', visibility: 'affected', durationMs });
    const { action: _a, ...finishRaw } = action;
    const verdict = await acceptFinish(finishRaw);
    if ('finish' in verdict) return { finish: verdict.finish, mode, modelTurns, toolCalls: records, stopReason: 'finish' };
    messages.push({ role: 'user', content: `${verdict.retry}. Reply with a corrected finish action.` });
  }
  return { finish: null, mode, modelTurns, toolCalls: records, stopReason: 'step_cap' };
}
