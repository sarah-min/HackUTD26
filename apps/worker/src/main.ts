import { NimClient, createLogger } from '@hack/agent';
import { loadEnv } from './env';
import { handlers } from './handlers';
import { Runner } from './runner';
import { StdbHttp } from './stdb/http';
import { HttpServiceConnection } from './stdb/service';
import { createStorageFromEnv } from './storage';

const log = createLogger('worker');

async function main(): Promise<void> {
  const env = loadEnv();
  const http = new StdbHttp({ uri: env.STDB_URI, module: env.STDB_MODULE, token: env.STDB_SERVICE_TOKEN });
  const stdb = await HttpServiceConnection.connect(http);
  const storage = createStorageFromEnv();
  const nim = NimClient.fromEnv();
  if (!(await storage.ping().catch(() => false))) log.warn('object storage ping failed; jobs will fail until it is reachable');

  const runner = new Runner({ stdb, storage, nim, log, handlers, concurrency: env.WORKER_CONCURRENCY });
  runner.start();
  log.info('worker started', {
    identity: `${stdb.identityHex.slice(0, 12)}…`,
    handlers: Object.keys(handlers),
    visionModel: nim.models.vision,
    agentModel: nim.models.agent,
    fixtures: nim.useFixtures,
    concurrency: env.WORKER_CONCURRENCY,
  });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info('stopping', { signal });
    await runner.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  log.error('worker crashed on startup', { error: (e as Error).message });
  process.exit(1);
});
