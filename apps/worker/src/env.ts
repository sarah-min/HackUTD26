import { z } from 'zod';

// CONTRACTS.md §10 (names owned by Part 4). The worker reads only these.
const EnvSchema = z.object({
  STDB_URI: z.string().min(1),
  STDB_MODULE: z.string().min(1),
  STDB_SERVICE_TOKEN: z.string().min(1),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  VL_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  USE_FIXTURES: z.enum(['true', 'false']).default('false'),
  APP_BASE_URL: z.string().optional(),
});
export type WorkerEnv = z.infer<typeof EnvSchema>;

export function loadEnv(env: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`worker env invalid: ${missing} (see .env.example)`);
  }
  return parsed.data;
}
