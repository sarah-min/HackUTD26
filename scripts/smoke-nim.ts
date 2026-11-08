// Part 3 smoke test for the Nemotron model server on the Vultr GPU instance (T3.1/T3.3).
// Verifies both servers serve the configured models, image input, FrameFinding parsing and tool calling.
//   node --env-file=.env.local --import tsx scripts/smoke-nim.ts --image ./fema-roof.jpg [--capture]
// Needs NEMOTRON_VL_BASE_URL, NEMOTRON_AGENT_BASE_URL and NEMOTRON_API_KEY (see apps/worker/model-server/README.md).
// --image accepts a local JPEG/PNG/WebP path or an https URL of a public-domain image (e.g. FEMA media library).
// Prints one JSON report; paste the VERIFY results into status/part3.md and SOURCES.md.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FrameFindingSchema } from '@hack/contracts/assessment';
import { NimClient, NimHttpError } from '@hack/agent';
import { DAMAGE_FRAME_PROMPT_VERSION, analyzeFrame, sniffImageMime } from '@hack/vision';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadImage(src: string): Promise<Buffer> {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src, { headers: { 'User-Agent': 'ProjectAftermath-smoke/0.1' } });
    if (!res.ok) throw new Error(`image download failed: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(src);
}

async function main() {
  const nim = NimClient.fromEnv();
  const report: Record<string, unknown> = {
    at: new Date().toISOString(),
    servers: { vision: nim.endpoints.vision.baseUrl, agent: nim.endpoints.agent.baseUrl },
    models: nim.models,
  };

  report.modelsListed = await nim.checkModels();

  const t0 = Date.now();
  try {
    const plain = await nim.chat({ model: nim.models.agent, messages: [{ role: 'user', content: 'Reply with the single word OK.' }], max_tokens: 400 });
    report.agentPlain = { ok: true, ms: Date.now() - t0, content: plain.content?.slice(0, 80) ?? null, hasReasoning: !!plain.reasoning };
  } catch (e) {
    report.agentPlain = { ok: false, error: (e as Error).message };
  }

  const t1 = Date.now();
  try {
    const res = await nim.chat({
      model: nim.models.agent,
      messages: [{ role: 'user', content: 'What is the weather alert status at 32.78,-96.80? Use the tool.' }],
      tools: [{ type: 'function', function: { name: 'get_weather_alerts', description: 'Active NWS alerts at a point',
        parameters: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } }, required: ['lat', 'lng'] } } }],
      tool_choice: 'auto',
      max_tokens: 800,
    });
    report.nativeToolCalling = { ok: res.toolCalls.length > 0, ms: Date.now() - t1, calls: res.toolCalls.map((c) => ({ name: c.function.name, arguments: c.function.arguments })) };
  } catch (e) {
    report.nativeToolCalling = { ok: false, error: e instanceof NimHttpError ? `HTTP ${e.status}: ${e.body.slice(0, 200)}` : (e as Error).message };
  }

  const imageSrc = arg('image');
  if (imageSrc) {
    const image = await loadImage(imageSrc);
    const mime = sniffImageMime(image);
    const t2 = Date.now();
    try {
      const r = await analyzeFrame({ nim, image, mime: mime ?? 'image/jpeg', frameIndex: 0, tSec: 0 });
      const valid = FrameFindingSchema.safeParse(r.finding).success && !r.parseError;
      report.vision = { ok: valid, ms: Date.now() - t2, attempts: r.attempts, parseError: r.parseError ?? null, finding: r.finding };
      if (process.argv.includes('--capture')) {
        const dir = path.join(process.cwd(), 'fixtures', 'assessment', 'captured');
        await mkdir(dir, { recursive: true });
        const file = path.join(dir, `${Date.now()}-${nim.models.vision.replace(/[^a-z0-9.-]/gi, '_')}.json`);
        await writeFile(file, JSON.stringify({ source: 'live', modelId: nim.models.vision, promptVersion: DAMAGE_FRAME_PROMPT_VERSION, image: imageSrc, finding: r.finding, valid }, null, 2) + '\n');
        report.captured = path.relative(process.cwd(), file);
      }
    } catch (e) {
      report.vision = { ok: false, error: (e as Error).message };
    }
  } else {
    report.vision = { skipped: 'pass --image <path|url> of a public-domain damage photo' };
  }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main().catch((e) => {
  process.stderr.write(`smoke-nim failed: ${(e as Error).message}\n`);
  process.exit(1);
});
