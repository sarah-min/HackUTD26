import { NimClient, createLogger } from '@hack/agent';
import { PROD_MODULE, loadEnv } from './env';
import { handlers } from './handlers';
import { Runner } from './runner';
import { SdkServiceConnection } from './stdb/sdk';
import { SpacetimeStore } from './stdb/storage';

const log = createLogger('worker');

async function main(): Promise<void> {
  const env = loadEnv();
  if (env.STDB_MODULE === PROD_MODULE) log.warn('connected to the PRODUCTION database (demo); use aftermath-hackutd-dev while building');
  const stdb = await SdkServiceConnection.connect({ uri: env.STDB_URI, module: env.STDB_MODULE, token: env.STDB_SERVICE_TOKEN });
  const storage = new SpacetimeStore(stdb);
  const nim = NimClient.fromEnv();
  if (!(await storage.ping().catch(() => false))) log.warn('SpacetimeDB connection not active; storage reads will fail until it reconnects');
  if (!nim.useFixtures) {
    // The model server runs next to the worker on the Brev GPU instance and may still be loading weights; warn instead of exiting.
    const check = await nim.checkModels();
    for (const [role, r] of Object.entries(check)) {
      if (r.ok) log.info('model server ready', { role, url: r.url, model: nim.models[role as 'vision' | 'agent'] });
      else log.warn('model server not ready; jobs will fail until it is', { role, url: r.url, expected: nim.models[role as 'vision' | 'agent'], served: r.served, error: r.error });
    }
  }

  const runner = new Runner({ stdb, storage, nim, log, handlers, concurrency: env.WORKER_CONCURRENCY });
  runner.start();
  log.info('worker started', {
    module: env.STDB_MODULE,
    identity: `${stdb.identityHex.slice(0, 12)}…`,
    handlers: Object.keys(handlers),
    visionModel: nim.models.vision,
    visionServer: nim.endpoints.vision.baseUrl,
    agentModel: nim.models.agent,
    agentServer: nim.endpoints.agent.baseUrl,
    fixtures: nim.useFixtures,
    concurrency: env.WORKER_CONCURRENCY,
  });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info('stopping', { signal });
    await runner.stop();
    stdb.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  log.error('worker crashed on startup', { error: (e as Error).message });
  process.exit(1);
});
