# @hack/worker (Part 3)

Runs `analyze` and `verify_identity` jobs (Part 4 registers `plan` and `coach` in `src/handlers/index.ts`).

```bash
pnpm --filter @hack/worker dev      # local, reads ../../.env.local
pnpm --filter @hack/worker start    # on the Vultr VM (env from /opt/app/.env or the process manager)
```

Env (CONTRACTS §10): `STDB_URI`, `STDB_MODULE`, `STDB_SERVICE_TOKEN`, `NEMOTRON_VL_BASE_URL`, `NEMOTRON_AGENT_BASE_URL`,
`NEMOTRON_API_KEY`, `NEMOTRON_VL_MODEL`, `NEMOTRON_AGENT_MODEL`, `S3_*`, `WORKER_CONCURRENCY`, `VL_CONCURRENCY`, `USE_FIXTURES`.

Models run on our own Vultr GPU instance (vLLM), not NVIDIA's hosted API: see [model-server/README.md](model-server/README.md).

## Connect to Part 2's backend (once per database)

Build against `STDB_MODULE=aftermath-hackutd-dev`; prod `aftermath-hackutd` is for the demo only.
`STDB_URI=https://maincloud.spacetimedb.com` (the SDK upgrades it to a WebSocket).

1. `pnpm --filter @hack/worker identity` mints the worker's identity. It prints the identity hex and saves the token
   (secret) to `~/.config/aftermath/worker-token-<module>`. Put the token in the worker's env as `STDB_SERVICE_TOKEN`.
2. Send the **identity hex** (never the token) to Sidd, who registers it:
   `spacetime call --server maincloud <db> admin_add_service '"<hex>"' '"worker"'`. Until then every service reducer
   fails with `unauthorized: service only` and the `svc_*` views are empty.

## How it works
- Connects with the SpacetimeDB SDK and Part 2's generated `@hack/stdb-bindings`, and subscribes to the worker-only
  `svc_*` views plus the public `report` / `property` tables (`src/stdb/sdk.ts`). Private tables are never read
  directly; `svc_*` rows exist only while their job is `queued` or `leased`.
- Every second, picks `svc_jobs` rows with `state = 'queued'`, calls `claimJob({ jobId, leaseMs: 120000 })`, and runs a
  job only once its row shows `state = 'leased'` with `leaseOwner` = this worker. Always ends with `completeJob`
  (max 2 attempts; expired leases are requeued by the module).
- Agent-step seqs are numbered per job (`round × 1000 + attempt × 100`), since the worker can't read `agent_step`.
- `analyze`: payload `{"round": n}`: only that round's media (a re-shoot adds a round). Frames (ffmpeg-static, ≤ 8, 768 px) → Nemotron VL findings (cached by frame SHA-256 in
  `~/.cache/aftermath-vl`) → Nemotron agent loop (≤ 12 steps, 90 s, 10 s per tool) → code-computed levels and cost →
  `record_assessment`. Every step is written with `record_agent_step`. After the geocode, FEMA and NWS lookups it
  calls `record_area_notices` with the county's full notice list, so unverified visitors see alerts and declarations
  (skipped if any of the three lookups didn't run, because the list replaces the county's notices).
- `verify_identity`: reads the `objectKey` from `svc_verifications` and the address from `svc_property_privates`, reads `idv/<id>/…`, Nemotron VL → `IdDocumentFields`, deterministic decision, deletes the object in
  `finally`, `record_verification`. Demo identity check — not production-grade verification.
- `USE_FIXTURES=true` uses labeled fixture model output (`fixtures/assessment`), never passed off as live.

Smoke test the model server first: `node --env-file=.env.local --import tsx scripts/smoke-nim.ts --image <public-domain photo>`.
