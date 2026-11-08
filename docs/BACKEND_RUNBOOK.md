# Backend runbook (demo day)

Owner: Part 2 (Sidd). Prod database: `aftermath-hackutd`. Dev database: `aftermath-hackutd-dev`. Both are on Maincloud (`--server maincloud`).
Commands marked **(unverified)** haven't been run end to end. Everything else was checked against the repo or run during Part 2. **Never paste tokens into chat, files or `.env.example`.**

## 1. Pre-demo checklist (prod)

Do this the evening before, then again an hour before the demo.

- [ ] `git checkout main && git pull --ff-only origin main` and `git log -1` matches what the team agreed is the demo build.
- [ ] Module on prod == module on `main`. If anyone changed `spacetimedb/**`, republish (section 2) **dev first**, then prod.
- [ ] `cd spacetimedb && pnpm test` passes. `spacetime build` succeeds.
- [ ] Service identities are correct (section 3) and the two pending ones are verified (section 4).
- [ ] Seed data loaded if the area map needs it (section 5).
- [ ] Smoke test passes on dev (section 6). It refuses to touch prod.
- [ ] Health queries (section 7) show no stuck or failed jobs.
- [ ] The worker (Sarah) is running with its token and the real Nemotron endpoints, or `USE_FIXTURES` is on and the UI badges say so (section 9).
- [ ] The web app's `STDB_MODULE` points at `aftermath-hackutd` for the demo (dev while building).
- [ ] Fallback plan read: section 8 (wipe and republish) and section 10 (if X breaks).

## 2. Republish procedure

From `spacetimedb/` (real scripts in `spacetimedb/package.json`):

```bash
cd ~/HackUTD26/spacetimedb
pnpm test
spacetime build
spacetime publish --server maincloud aftermath-hackutd-dev     # dev first
pnpm generate                                                  # regenerates packages/stdb-bindings/src (only Part 2 does this)
# run the smoke test against dev (section 6), then:
spacetime publish --server maincloud aftermath-hackutd         # prod
```

- `pnpm generate` runs `spacetime generate --lang typescript --out-dir ../packages/stdb-bindings/src --module-path .`.
- Additive changes (new tables, views, reducers, optional columns) publish without losing data.
- Breaking changes (removed or retyped columns or tables) are refused, or need `--delete-data`, which **destroys all rows**. See section 8, and announce it to the team first.
- After a regenerate, commit `packages/stdb-bindings/src/**` and tell the team: "bindings regenerated, rebase".
- Don't commit `*/pnpm-lock.yaml` files that are untracked leftovers from local installs.

## 3. Service identities

Roles live in the private `service_identity` table. `admin` = you, the publisher. `worker` reads the `svc_*` views and calls worker reducers. `web` reads the three `web_*` views only.

| Role | Who | Where its token lives | Registered on |
|---|---|---|---|
| admin | Sidd (publisher, CLI login) | `spacetime login` | dev + prod |
| worker | Sarah, hex `c2008ae4f25b7e51b2552012c159aff74488be880c8dc5a5b22d5ffcbdf29dbd` | `STDB_SERVICE_TOKEN` (worker host env only) | dev + prod |
| web | Roselyn, hex `c20031dd428a584134bf24332b596afe4f25a327bfb5c4311e609915e5b7bf61` | `STDB_WEB_TOKEN` (web server env only, never `NEXT_PUBLIC_*`) | dev + prod |
| worker (dev only) | dev fake worker (`scripts/dev-fake-worker.ts`) | local `.env.local`, `DEV_WORKER_TOKEN` | dev only |

List what's registered:

```bash
spacetime sql --server maincloud aftermath-hackutd "SELECT * FROM service_identity"
```

Add or change one (hex is 64 chars, no `0x`; role is `admin`, `worker` or `web`):

```bash
spacetime call --server maincloud aftermath-hackutd admin_add_service '"<hex>"' '"worker"'
```

Remove one (verified working on both databases):

```bash
spacetime sql --server maincloud aftermath-hackutd "DELETE FROM service_identity WHERE identity = 0x<hex>"
```

Do both on dev and prod. A wipe-republish deletes this table, so re-add the rows afterward.

## 4. PENDING: verify Sarah's and Roselyn's identities

Both are registered but **never proven to match their real tokens.** A `spacetime call` from someone's CLI proves nothing, because the CLI login is a different identity from their app token.

Sarah (worker), either:
- `pnpm --filter @hack/worker identity` prints the identity her worker token maps to. It must equal the hex in the table above.
- `pnpm --filter @hack/worker e2e:dev` runs the real job loop against dev with `STDB_SERVICE_TOKEN`. A pass means she's registered.

Both (once `scripts/verify-identity.ts` is merged to `main`):

```bash
cd scripts && pnpm install --ignore-workspace
export STDB_SERVICE_TOKEN='...'            # or STDB_WEB_TOKEN for Roselyn
pnpm verify:identity -- STDB_SERVICE_TOKEN [aftermath-hackutd]
```

- Worker: expect the right `identity:` hex, `probe: job not found` and `registered as worker/admin`.
- Web: the identity hex match is the proof. The probe correctly says "service only" for the `web` role.
- If a hex is wrong: add the correct one with `admin_add_service`, then delete the old row (section 3), on both databases.
- Prod check: pass `aftermath-hackutd` as the second argument.

## 5. Seed data

`scripts/seed-demo.ts` exists and works (verified live on dev and prod, 2026-11-08). It creates 11 fixture reports in 3 cells near UT Dallas through the real reducers.

```bash
cd scripts && pnpm seed:demo -- --dry-run     # print the plan only
cd scripts && pnpm seed:demo                  # seed dev (refuses non -dev databases)
```

**Prod:** the script refuses unless you pass `--i-know-this-is-prod`, and it needs a worker identity. Register the dev fake worker on prod temporarily (`admin_add_service "<DEV_WORKER_IDENTITY>" '"worker"'`), run `STDB_MODULE=aftermath-hackutd pnpm seed:demo -- --i-know-this-is-prod`, then remove it again with `spacetime sql --server maincloud aftermath-hackutd "DELETE FROM service_identity WHERE identity = 0x<DEV_WORKER_IDENTITY>"`.

**After every seed, mark the reports as fixture** (`create_report` hardcodes `source = 'live'`, and the seed can't change it). Run this on each seeded database, and only when every report in it is seed data:

```bash
spacetime sql --server maincloud <db> "UPDATE report SET source = 'fixture' WHERE source = 'live'"
```

The map only counts the last 72 hours, so seed again close to the demo. Re-seeding needs a wipe first, because the script skips cells that already have their reports. Without seed data, the area map is empty until real reports exist.

## 6. Smoke test

```bash
cd scripts && pnpm smoke:p2
```

Runs 27 live checks against `aftermath-hackutd-dev` only (reads `../.env.local`). It must pass after every module change. For worker-path demos on dev without the real worker: `pnpm fake-worker` (fixtures only; refuses a non-`-dev` database).

## 7. Health queries

Run against prod before and during the demo (`SELECT` only):

```bash
D=aftermath-hackutd
spacetime sql --server maincloud $D "SELECT state, kind FROM job"                      # counts of queued/leased/done/failed
spacetime sql --server maincloud $D "SELECT id, kind, state, attempts, last_error FROM job WHERE state = 'failed'"
spacetime sql --server maincloud $D "SELECT id, kind, attempts, lease_expires_at FROM job WHERE state = 'leased'"   # stuck if the lease time is long past
spacetime sql --server maincloud $D "SELECT id, kind, state FROM job WHERE state = 'queued'"                        # queued for minutes = no worker
spacetime sql --server maincloud $D "SELECT * FROM service_identity"
spacetime sql --server maincloud $D "SELECT cell_id, report_count_72h, worst_level, last_report_at FROM area_cell_summary"
spacetime sql --server maincloud $D "SELECT id, status FROM report"
```

Column names are from the table definitions. If a query errors on a column, run `SELECT *` instead (unverified for every column).

## 8. Wipe-and-republish fallback

Full procedure: [scripts/admin-wipe-republish.md](../scripts/admin-wipe-republish.md). Short version:

```bash
cd spacetimedb && spacetime publish --server maincloud --delete-data aftermath-hackutd
```

This **destroys every report, verification, plan and service identity.** Announce it first. Afterward: re-add worker and web identities (section 3), reseed (section 5), rerun the health queries. Do not do this after demo data is recorded unless you have to. Note: the helper `scripts/admin-add-service.ts` uses an HTTP call shape that was never verified, so use the `spacetime call` form in section 3.

## 9. Worker dies mid-demo

- A job leased by a dead worker is requeued automatically: the scheduler runs every 30 s and expires leases after the lease time (default 120 s from the worker). After 2 failed attempts the job is marked `failed`.
- Restart the worker (Sarah) with `STDB_SERVICE_TOKEN`. It picks up `queued` jobs. A report stuck in `processing` returns to `queued` when its lease expires.
- If the real models are down, the worker can run with fixtures (`USE_FIXTURES=true`). Fixture output carries `source: "fixture"` and the UI must show the badge. Say so on stage.
- Last resort on dev only: `pnpm fake-worker`.

## 10. Honesty checklist (say these out loud)

- [ ] Damage and cost figures are **estimates**, not appraisals or claims.
- [ ] Recovery finance output is **educational, not financial advice**.
- [ ] Identity check is a **demo-grade check, not KYC**. The ID image is deleted right after the check. Use specimen IDs or a teammate's own ID with consent.
- [ ] Anything from the fake worker, seed script or `USE_FIXTURES` is fixture data and badged as such.
- [ ] The area map shows aggregated ~250 m cells only, never other people's pins or addresses.
- [ ] Life-safety screens show "If you are in immediate danger, call 911."

## 11. If X breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| Reports stay `queued` | Worker down or its identity isn't registered | Check `service_identity`, restart the worker, run section 4 |
| `unauthorized: service only` from the worker | Token maps to an unregistered identity | `admin_add_service` with the identity the worker prints |
| Web upload/media routes fail auth | `STDB_WEB_TOKEN` wrong or `web` identity missing | Section 4, re-register |
| Clients can't connect | Wrong `STDB_MODULE` or URI | Use `https://maincloud.spacetimedb.com` and `aftermath-hackutd` |
| Publish refused (incompatible schema) | Removed or retyped column | Section 8, after announcing |
| Area map empty | No reports in the last 72 h, or the refresh hasn't run (every 5 min) | Seed (section 5) or wait for the refresh |
| Address search fails | Census or Nominatim unavailable (module geocode procedures) | Retry. If it persists, enter the address by hand. Check upstream status |
| Verification stuck `pending` | `verify_identity` job queued with no worker | Restart the worker. A decided verification deletes its ID image |
| Reporter sees nothing in "My submissions" | Wrong browser or cleared storage (the secret lives in the browser) | Same browser profile that filed the report |
