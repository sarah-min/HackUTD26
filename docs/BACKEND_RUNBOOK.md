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

## 12. Gotchas

- **Scheduled reducers and the host scheduler (fixed 2026-11-08, PR #11).** `requeue_expired_jobs` and `refresh_area_cells` (`spacetimedb/src/reducers/scheduled.ts`) were rejecting the host scheduler with `unauthorized: scheduled only`, because `ctx.senderAuth.isInternal` is false on a live host. The guard now also accepts `ctx.sender == ctx.databaseIdentity`. Published to dev and prod 2026-11-08 ~12:15 UTC. To check: `spacetime logs -s maincloud <db>` should show no `scheduled only` errors, and expired leases should requeue with `last_error` `lease expired`.
- **Seed assessments** now carry all 9 `componentLevels`. The live dev (12) and prod (11) rows were patched with a SQL UPDATE.
- **A local worker claims ANY open job.** Before running one against dev, check `SELECT id,kind,state FROM job` for teammates' queued jobs.

## 13. Recovery-code accounts

Accounts for affected persons; the contract is CONTRACTS.md §5.3. The browser generates a 20-character recovery code (about 100 bits, `apps/web/lib/stdb/recoveryCode.ts`), shows it once, and the module stores only `sha256(pepper + code)`. Signing in on another device, stepping up and rotating the code all take that code. **There is no delivery vendor and nothing to configure to make accounts work**: no row in `account_config` means accounts are enabled, step-up is off, and the pepper is generated on the first create or sign-in.

**Why Photon and Brevo were dropped.** SMS needed a registered US 10DLC campaign (days to weeks, not possible in time) and email needed a verified sender domain plus an unverified API shape; in demo mode the module had to show the one-time code on screen, which proves nothing about who is typing it. A high-entropy code held by the user needs no delivery at all, so the whole send path, its config, its secrets and its daily credit cap were deleted.

### Toggle the config

`spacetime call` takes Option args as `{"some":v}` / `{"none":[]}`. The order is `accounts_enabled?, require_stepup?`; omitted values keep their current setting.

```bash
D=aftermath-hackutd-dev          # prod only after the dev smoke passes
N='{"none":[]}'
spacetime call --server maincloud $D admin_set_account_config '{"some":false}' $N   # switch new sign-ups / sign-ins OFF
spacetime call --server maincloud $D admin_set_account_config '{"some":true}' $N    # ...and back ON
spacetime call --server maincloud $D admin_set_account_config $N '{"some":true}'    # require a step-up (recent code) for full reports
spacetime call --server maincloud $D admin_set_account_config $N '{"some":false}'   # step-up off (default)

spacetime sql --server maincloud $D "SELECT * FROM admin_account_config"   # booleans only; only the admin identity gets a row
```

- **Step-up is off by default** (`require_stepup = false`) so the UI keeps working with or without an account.
- **Do not run `SELECT * FROM account_config` or `recovery_account`**: as the database owner your CLI can read private tables and would print the pepper and the hashes. Use `admin_account_config` and `SELECT COUNT(*)`.
- The pepper is never rotated (rotating would orphan every account's `recovery_hash`). A wipe-republish deletes `account_config` and all accounts.
- `admin_set_account_config` (or the first create/sign-in) creates the 60 s `account_tick` schedule if it is missing. Check: `SELECT * FROM account_tick` has one row.

### Smoke test

```bash
cd scripts && pnpm smoke:accounts     # dev only, ~15 s, needs `spacetime login` as the dev admin
```

Covers a weak code, create, sign out, a wrong code (`attemptsLeft`), sign in on a second identity with the code typed in lowercase, five wrong codes -> `locked` (even the right code is refused), `replace_recovery_code` (old code dead, new code works, other device stays), step-up, `require_stepup` on (gated device sees nothing, `read_blob` -> `stepup_required`), and `delete_account`. It leaves `require_stepup = false` and records about 6 failed attempts (the global cap is 300 per hour).

### Schema migration note (email to recovery code, 2026-11-08)

The account tables changed shape again: `email_account` is replaced by `recovery_account`, and `email_challenge`, `demo_code` and `email_config` are removed (they were only ever test data). SpacetimeDB refuses to remove a table that still has rows ("table contains data"), and publishing a changed table needs `--delete-data` which destroys EVERYTHING. So on a database that ran the email build, first clear the rows of exactly those tables (and of `account_device` / `account_property`, whose `account_id` values point at the old account ids and would otherwise attach devices to the wrong new accounts), then publish normally. A database that never ran the email build publishes without any of this. There is no bulk-delete reducer; if the dev data is disposable, the wipe-and-republish fallback (section 8) does the same thing for the whole database. Check prod with `SELECT COUNT(*) FROM email_account` before its first publish of this build.

### Gotchas

- **The code is the account.** Anyone holding it can sign in. The UI must show it once, ask the user to save it, and never log or store it (not in `localStorage`, analytics or error reports). The module never sees it outside the four procedure calls.
- **Lost code = lost account** (the properties themselves stay verified on the original device). `replace_recovery_code` needs the old code. This is accepted for a demo-grade check.
- **Step-up is only as fresh as the 60 s tick.** Views have no clock, so a step-up that expired is cleared by `account_maintenance` within about a minute; `read_blob` and `delete_account` check the clock exactly.
- **An identity can lock itself out** (5 wrong codes, 15 min). Other identities are unaffected. A botnet of fresh identities hits the global cap (300 failures per hour), which blocks sign-in for everyone until it ages out: an accepted trade for a demo.
- **Failures are the same everywhere.** `sign_in_with_code` never distinguishes a wrong code, a near-miss or an unknown account (always `invalid_code`).
- **The 5th wrong code already answers `locked`**, not `invalid_code` (with `retryAfterS`).

## 12. Security hardening: duplicate claims, caps, audit log (2026-11-08)

What it does (full contract: CONTRACTS.md §5.4): a second identity that passes the ID check on a property that already has a verified owner is HELD instead of getting access; `start_verification` has a global per-hour and a per-property per-day cap; owner reads are audit-logged. All state is in private tables (`security_config`, `claim_conflict`, `access_log`, `verification_start`).

### Security config

Defaults when no `security_config` row exists: `hold_duplicate_claims = true`, 120 verification starts per hour across all identities, 6 starts per property per day. `spacetime call` takes Option args as `{"some":v}` / `{"none":[]}`; order is `hold_duplicate_claims?, max_verification_starts_per_hour_global?, max_verification_starts_per_property_per_day?`.

```bash
D=aftermath-hackutd-dev    # prod: aftermath-hackutd
N='{"none":[]}'
spacetime sql --server maincloud $D "SELECT * FROM admin_security_config"          # effective values (admin identity only), is_default = no row yet
spacetime call --server maincloud $D admin_set_security_config '{"some":false}' $N $N   # duplicate rule OFF (dev/demo)
spacetime call --server maincloud $D admin_set_security_config '{"some":true}' $N $N    # duplicate rule ON (prod)
spacetime call --server maincloud $D admin_set_security_config $N '{"some":300}' '{"some":20}'   # raise the caps for a load test
```

**Deliberate demo trade-off (read this).** The shared dev/demo team repeatedly verifies the SAME specimen address from different browsers. With the duplicate rule on, the second browser would be held. So on **dev and the demo database the flag is OFF** (set it after every wipe-republish, which deletes `security_config`). **On prod it stays ON** (the default; do not set it off there). With it off, any identity that passes the ID check becomes an owner of the property, which is the pre-hardening behavior. The caps stay on in both places; if teammates hit `too many verification attempts` while demoing, raise them with the last command above rather than turning them off. The per-property cap also lets someone burn a victim property's daily budget with junk attempts: an admin raises the cap if that happens.

### Resolving held claims and reviews

```bash
spacetime sql --server maincloud $D "SELECT id, property_id, existing_verification_id, new_verification_id, status FROM admin_claim_conflicts WHERE status = 'open'"
spacetime call --server maincloud $D admin_resolve_claim 7 true      # approve: the claimant becomes a verified owner too
spacetime call --server maincloud $D admin_resolve_claim 7 false     # reject: stays failed, fail_reason review_rejected

# verifications the worker held with fail_reason 'needs_review' (ID tamper cues). Admin-owned CLI can read the private table:
spacetime sql --server maincloud $D "SELECT id, property_id, state, fail_reason, created_at FROM verification WHERE fail_reason = 'needs_review'"
spacetime call --server maincloud $D admin_resolve_verification 42 true    # approve (still subject to the duplicate rule)
spacetime call --server maincloud $D admin_resolve_verification 42 false   # reject
```

Do not `SELECT name_on_doc` into chats or tickets: held rows keep the extracted name privately so you can compare it, and it is dropped on reject. The existing owner sees the open conflict through `my_claim_conflicts` (id, time, status only). To look at the audit log of a property: `spacetime sql --server maincloud $D "SELECT kind, at, property_id FROM access_log WHERE property_id = 25"` (identities and object keys exist in the table; do not paste them anywhere).

### Gotchas

- **Held verifications use the existing `failed` state.** The UI must map `fail_reason` `needs_review` / `duplicate_claim` to "held for review" and `review_rejected` to "couldn't be verified". `packages/contracts` `VerificationFailReasonSchema` is owned by Part 3 and still lacks these values (request to Part 3: add `needs_review`, `duplicate_claim`, `review_rejected`).
- **Failed attempts count toward the caps** (a start is a start). The 3-per-hour per-identity limit is unchanged.
- **Tests:** `setup()` in `spacetimedb/test/helpers.ts` writes `security_config { hold_duplicate_claims: false }` by default, because older tests verify two different identities on one property. `spacetimedb/test/security.test.ts` uses `setup({ security: 'defaults' })`.
- **Purges** run in the 60 s `account_maintenance` tick: `verification_start` after 24 h, `access_log` after 30 days. The caps count by timestamp, so they stay correct between ticks.
