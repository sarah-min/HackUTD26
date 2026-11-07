# @hack/worker (Part 3)

Runs `analyze` and `verify_identity` jobs (Part 4 registers `plan` and `coach` in `src/handlers/index.ts`).

```bash
pnpm --filter @hack/worker dev      # local, reads ../../.env.local
pnpm --filter @hack/worker start    # on the Vultr VM (env from /opt/app/.env or the process manager)
```

Env (CONTRACTS §10): `STDB_URI`, `STDB_MODULE`, `STDB_SERVICE_TOKEN`, `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`,
`NEMOTRON_VL_MODEL`, `NEMOTRON_AGENT_MODEL`, `S3_*`, `WORKER_CONCURRENCY`, `VL_CONCURRENCY`, `USE_FIXTURES`.

How it works
- Polls `job` rows with `state = 'queued'` every second over the SpacetimeDB HTTP API, calls `claim_job(id, 120000)`,
  and runs a job only if `lease_owner` is this worker's identity. No generated bindings needed.
- `STDB_SERVICE_TOKEN` must be able to read the private tables by SQL (the database owner token, or views for the
  service identity) and must be in `service_identity`.
- `analyze`: frames (ffmpeg-static, ≤ 8, 768 px) → Nemotron VL findings (cached by frame SHA-256 in
  `~/.cache/aftermath-vl`) → Nemotron agent loop (≤ 12 steps, 90 s, 10 s per tool) → code-computed levels and cost →
  `record_assessment`. Every step is written with `record_agent_step`.
- `verify_identity`: reads `idv/<id>/…`, Nemotron VL → `IdDocumentFields`, deterministic decision, deletes the object in
  `finally`, `record_verification`. Demo identity check — not production-grade verification.
- `USE_FIXTURES=true` uses labeled fixture model output (`fixtures/assessment`), never passed off as live.

Smoke test the provider first: `node --env-file=.env.local --import tsx scripts/smoke-nim.ts --image <public-domain photo>`.
