import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { DamageAssessmentSchema, FrameFindingSchema } from '@hack/contracts/assessment';
import { NimClient, type JobContext } from '@hack/agent';
import { FFMPEG_PATH } from '@hack/vision';
import { analyzeHandler } from '../src/handlers/analyze';
import { fakeStdb, fakeStorage, silentLog } from './fakes';

const dir = mkdtempSync(path.join(os.tmpdir(), 'analyze-e2e-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => vi.unstubAllGlobals());

function clip(seconds: number): Buffer {
  const file = path.join(dir, `clip-${seconds}.mp4`);
  execFileSync(FFMPEG_PATH, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=1280x720:rate=10:duration=${seconds}`, '-pix_fmt', 'yuv420p', file]);
  return readFileSync(file);
}

function stubPublicApis() {
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.includes('geo.fcc.gov')) return new Response(JSON.stringify({ results: [{ county_fips: '48113', county_name: 'Dallas County', state_code: 'TX' }] }));
    if (url.includes('fema.gov')) return new Response(JSON.stringify({ DisasterDeclarationsSummaries: [] }));
    if (url.includes('weather.gov')) return new Response(JSON.stringify({ features: [] }));
    return new Response('nope', { status: 404 });
  });
}

function setup(nim: NimClient) {
  const { storage, puts } = fakeStorage({ 'media/7/clip.mp4': clip(30) });
  const { stdb, calls, steps } = fakeStdb({
    getReport: async () => ({ id: '7', reporter: 'r', propertyId: '9', cellId: '1:2', status: 'processing', hazard: 'hurricane_wind', selfDanger: false, lifeSafetyCsv: '', overallLevel: 'none', usableFrames: 0, totalFrames: 0, statusReason: null, claimed: false, source: 'live', createdAt: 0, updatedAt: 0 }),
    getReportPrivate: async () => ({ reportId: '7', isSelfReport: false, addressLine1: 'x', lat: 32.77, lng: -96.79, notes: 'water still rising' }),
    // Round 0 is old footage whose object is gone; the job is for round 1 and must only read round 1.
    listMedia: async (_reportId: string, round?: number) =>
      [
        { id: '1', reportId: '7', kind: 'video' as const, objectKey: 'media/7/old.mp4', contentType: 'video/mp4', sizeBytes: 1, sha256: 'x', uploadedAt: 0, round: 0 },
        { id: '2', reportId: '7', kind: 'video' as const, objectKey: 'media/7/clip.mp4', contentType: 'video/mp4', sizeBytes: 1, sha256: 'x', uploadedAt: 0, round: 1 },
      ].filter((m) => round === undefined || m.round === round),
  });
  let seq = 0;
  const ctx = {
    job: { id: '1', kind: 'analyze', reportId: '7', payload: { round: 1 } }, stdb, storage, nim, log: silentLog, scratch: new Map(),
    step: async (s: any) => stdb.recordAgentStep({ ...s, reportId: '7', seq: seq++ }),
  } as unknown as JobContext;
  return { ctx, calls, steps, puts };
}

describe('analyze handler end to end', () => {
  it('fixture mode: clip → frames → findings → assessment, ≥ 6 steps, reporter steps are status only', async () => {
    stubPublicApis();
    const { ctx, calls, steps, puts } = setup(new NimClient({ baseUrl: 'x', apiKey: '', visionModel: 'vl', agentModel: 'agent', useFixtures: true }));
    await analyzeHandler(ctx);
    const frames = calls.filter((c) => c.name === 'record_frame');
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.length).toBeLessThanOrEqual(8);
    expect(puts.every((k) => k.startsWith('frames/7/'))).toBe(true);
    const rec = calls.find((c) => c.name === 'record_assessment')!.args as any;
    const a = DamageAssessmentSchema.parse(JSON.parse(rec.json));
    expect(a.source).toBe('fixture');
    expect(a.location).toEqual({ stateCode: 'TX', countyName: 'Dallas County', countyFips: '48113' });
    expect(steps.length).toBeGreaterThanOrEqual(6);
    const reporter = steps.filter((s) => s.visibility === 'reporter');
    expect(reporter.every((s) => s.kind === 'pipeline')).toBe(true);
    expect(new Set(reporter.map((s) => s.name))).toEqual(new Set(['uploaded', 'extract_frames', 'analyze_frames', 'estimate_cost', 'check_declarations', 'finalize']));
    expect(reporter.some((s) => /\$|roof|claim/i.test(s.summary))).toBe(false);
    // Public county notices: full list (here empty = clears stale ones), county from the geocode.
    const notices = calls.find((c) => c.name === 'record_area_notices')!.args as any;
    expect(notices).toEqual({ propertyId: '9', countyFips: '48113', noticesJson: '[]' });
  }, 60_000);

  it('live path with a scripted model: agent tools run and no invented $ survives', async () => {
    const finding = JSON.stringify({ usable: true, components: [{ component: 'roof', level: 'major', evidence: 'hole', confidence: 0.9 }], lifeSafety: [], waterDepth: 'none', caption: 'Roof hole.' });
    let agentTurn = 0;
    const script = [
      { tool_calls: [{ name: 'get_frame_findings', arguments: {} }, { name: 'estimate_repair_cost', arguments: {} }] },
      { tool_calls: [{ name: 'finish', arguments: { summary: 'Major roof damage. You will receive $50,000 from FEMA.', recommendedActions: ['Tarp the roof.'] } }] },
      { tool_calls: [{ name: 'finish', arguments: { summary: 'Major roof damage. Still guessing $50,000.', recommendedActions: ['Tarp the roof.'] } }] },
    ];
    const fetchImpl = (async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.model === 'vl') return new Response(JSON.stringify({ choices: [{ message: { content: finding } }] }));
      const r = script[Math.min(agentTurn++, script.length - 1)]!;
      return new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: r.tool_calls.map((c, i) => ({ id: `c${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.arguments) } })) } }] }));
    }) as typeof fetch;
    stubPublicApis();
    const { ctx, calls, steps } = setup(new NimClient({ baseUrl: 'https://n/v1', apiKey: 'k', visionModel: 'vl', agentModel: 'agent', fetchImpl, sleep: async () => {} }));
    process.env.VL_CONCURRENCY = '2';
    await analyzeHandler(ctx);
    const a = DamageAssessmentSchema.parse(JSON.parse((calls.find((c) => c.name === 'record_assessment')!.args as any).json));
    expect(a.source).toBe('live');
    expect(a.overallLevel).toBe('major');
    expect(a.summary).toBe('Major roof damage.');
    expect(a.cost.likelyCents).toBe(2_025_000);
    expect(steps.filter((s) => s.kind === 'tool_call').map((s) => s.name)).toEqual(
      expect.arrayContaining(['get_frame_findings', 'estimate_repair_cost', 'reverse_geocode', 'lookup_disaster_declarations', 'get_weather_alerts']),
    );
    expect(steps.some((s) => s.name === 'post_check')).toBe(true);
    const frameRows = calls.filter((c) => c.name === 'record_frame').map((c) => FrameFindingSchema.parse(JSON.parse((c.args as any).findingJson)));
    expect(frameRows.every((f) => f.usable)).toBe(true);
  }, 60_000);
});
