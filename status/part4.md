# Part 4: Recovery Navigator & storage APIs: status log

Owner: Roselyn. Append-only, newest entry first. Format is in [STATUS.md](../STATUS.md). Only this part's owner (and their LLM) edits this file.

## 2026-11-08 09:58: Match live recovery UI to navigator chrome; drop fixture preview (branch part4/recovery-match-fixture)

- **Shipped:** Shared `RecoveryWorkspace` (disclaimer → intake → what-if → PlanView → coach). Live `RecoveryNavigator` uses it. `RecoverySummaryCard` on the damage report shows WhatIf + PlanView + coach when a plan exists. Deleted fixture `/recovery/preview` + `RecoveryFixturePreview`.
- **Verify:** `/affected/property/0/recovery/preview` → 404; live `/recovery` and report summary card show the shared plan chrome.
- **Fixtures still faked:** none new (personas still synthetic).
- **Requests to other parts:** none.
- **Blocked on:** none.

## Requests to other parts (open)

- **P2 (Sidd):** `c20050ec1127b417108012e8359d013e783d4186e6a0bad9f1c4a0db7c448468` is registered as worker on **dev**; still needs the same on **prod** (`aftermath-hackutd`) if we run against it. Local fake-worker restarted on `aftermath-hackutd-dev` after stale connection (report 14 / job 18).
- **P3 (Nemotron / Brev):** Hosting stays Brev. Live HTTPS URL when ready. **Check the job queue before starting a local worker on shared dev.** (`planHandler` / `coachHandler` already registered on main.)
- **P2:** Confirm web identity registered as `web` if any legacy `/api/media` auth is kept. `RecoverySummaryCard` is already flipped on reconcile-p4.
- **P1:** Confirm workspace members `@hack/finance` + `@hack/storage` + `@hack/damage` on main. **Also:** `part4/updatedfront-ui` prioritizes Updatedfront Mapbox maps inside `components/map/**` and the Updatedfront home/shell. Plan still listed Leaflet — please confirm Mapbox is OK for demo or re-home ownership.

## 2026-11-08 07:50: Remove fixture Recovery Navigator preview (branch part4/remove-recovery-preview)

- **Shipped:** Deleted `RecoveryFixturePreview` and `/affected/property/[propertyId]/recovery/preview` (dummy route that should not have shipped).
- **Verify:** `/affected/property/0/recovery/preview` → 404; live `/recovery` unchanged.
- **Fixtures still faked:** none new.
- **Requests to other parts:** none.
- **Blocked on:** none.

## 2026-11-08 06:45: Plan subject filter + delete presign + restart fake-worker (branch part4/updatedfront-ui)

- **Shipped:** `planHandler` matches `svc_affected_profiles` by **propertyId + subject identity** (no cross-over between two verified people). Deleted `apps/web/app/api/uploads/presign/**`; moved `sha256HexSync` into `uploads/limits.ts` for legacy `/api/media`. CONTRACTS §8 marks presign removed. Restarted `pnpm --dir scripts fake-worker` on `aftermath-hackutd-dev` with registered `c20050ec…` token (restored mashed `.env.local` newlines).
- **Verify:** `pnpm --filter @hack/finance typecheck`; fake-worker log shows `connected … watching`; open report 14 — should leave `queued` once claimed. `GET /api/uploads/presign` → 404.
- **Fixtures still faked:** fake-worker analyze/plan/coach outputs.
- **Requests to other parts:** P2 register worker on prod if needed; P3 register plan/coach handlers.
- **Blocked on:** none for these three asks.

## 2026-11-08 02:05: Fix stuck Connecting + start fake-worker (branch part4/updatedfront-ui)

- **Shipped:** Rebased onto `origin/main` (PR #8 report privacy: stop subscribing to private `report`; use `my_*` / `svc_reports`). Cleared inline comment pollution on `STDB_MODULE` in local `.env.local`. Minted worker identity, set `DEV_WORKER_TOKEN` / `STDB_SERVICE_TOKEN` from `~/.config/aftermath/worker-token`, restarted Next (`:3000` webpack) and `pnpm --dir scripts fake-worker` (connected + watching). `ReportStatus` shows clearer connect/worker waiting copy.
- **Verify:** Hard-refresh `http://localhost:3000/report/<id>` — should leave “Connecting…” once Live. Typecheck `@hack/web` clean. Fake-worker log shows `connected … watching for jobs`.
- **Fixtures still faked:** analyze still needs a **registered** worker (or Brev P3) to leave `queued`.
- **Requests to other parts:** P2 register identity above (blocking).
- **Blocked on:** P2 `admin_add_service` for that hex.

## 2026-11-08 08:30: Photo EXIF GPS → reverse geocode on report capture (branch part4/updatedfront-ui)

- **Shipped:** `exifr` + `photoGps.ts`; selecting geotagged evidence on `/report/new` reads GPS (client-side, no EXIF logged) and reverse-geocodes via SpacetimeDB `geocode_point` into the confirmed address. Hint + status note in Location/Evidence UI. Autofill remains the manual path when EXIF is missing.
- **Verify:** Upload a JPEG with GPS → Location fills / note appears. Upload a stripped screenshot → “No GPS…” note; pick Mapbox suggestion instead.
- **Fixtures still faked:** none.
- **Requests to other parts:** P1 — touched `ReportCapture` / report helpers for EXIF flow.
- **Blocked on:** none.

## 2026-11-08 07:25: Mapbox Address Autofill on Location inputs (branch part4/updatedfront-ui)

- **Shipped:** `@mapbox/search-js-react` + `MapboxAddressInput` wired into reporter capture Location and `/affected/start` home address. Selecting a suggestion fills the field and runs the existing SpacetimeDB geocode so `NormalizedAddress` stays census/nominatim.
- **Verify:** Set `NEXT_PUBLIC_MAPBOX_TOKEN` (Search/Autofill enabled) in `.env.local`, restart web, type on `/report/new` or `/affected/start` — suggestions appear; pick one → canonical match list / confirmed address.
- **Fixtures still faked:** none new.
- **Requests to other parts:** P1/P2 — touched `ReportCapture` + `affected/start` for autofill.
- **Blocked on:** real Mapbox pk. token with Address Autofill product enabled.

## 2026-11-08 07:10: Prioritize Updatedfront Mapbox + phone UI (branch part4/updatedfront-ui)

- **Shipped:** Ported Mapbox building-highlight map into `apps/web/components/map/` (`MapboxDamageMap`, damage/geo helpers). `PinMap` + `CellMap` now use Mapbox 3D (Leaflet left unused). Home uses Updatedfront wide landing (no phone shell). `AppShell` / header match Updatedfront 480px phone frame + safe-area CSS. `NEXT_PUBLIC_MAPBOX_TOKEN` in `.env.example`.
- **Verify:** Set `NEXT_PUBLIC_MAPBOX_TOKEN` in `.env.local`, `pnpm --filter @hack/web typecheck`, `pnpm --filter @hack/web dev` → `/` looks like Updatedfront home; `/reporter` and `/affected/property/...` show Mapbox building map (token required).
- **Fixtures still faked:** CellMap area fill uses synthetic neighborhood shading when no live cells. Recovery/coach still as before.
- **Requests to other parts:** P1 confirm Mapbox vs Leaflet plan; touches `components/map/**` + home/chrome (reconcile ownership).
- **Blocked on:** real Mapbox pk. token in local env.

## 2026-11-08 06:20: Recovery Navigator UI + plan/coach handlers (branch reconcile-p4)

- **Shipped:** `/affected/property/[propertyId]/recovery` with intake → client `buildRecoveryPlan` / `simulate` what-if → indicators, gap, SVG forecast, funding options, grounded coach. Live `<RecoverySummaryCard>` reads `my_recovery_plans`. Exported `planHandler` / `coachHandler` from `@hack/finance` for P3 to register. Property page CTA to Recovery Navigator.
- **Verify:** `pnpm --filter @hack/finance typecheck && pnpm --filter @hack/finance test && pnpm --filter @hack/web typecheck`. Open a verified property with an assessed report → Recovery Navigator → Build recovery plan → move what-if sliders.
- **Fixtures still faked:** Personas are synthetic; coach replies are plan-grounded templates until the worker registers the handlers and (optionally) NIM. Presign/S3 paths remain unused (SpacetimeDB blobs).
- **Requests to other parts:** see open list (P3 register handlers).
- **Blocked on:** assessed report + verified identity for a full live walkthrough; worker registration for persisted `recovery_plan` rows.

## 2026-11-07 19:50: Drop Vultr from P4; hand hosting to P3/Brev (branch part4/finance-contracts)

- **Shipped:** Removed Vultr from P4 scope. `docs/DEPLOYMENT.md` rewritten (P3=Brev host; P4=S3-compatible client only). `.env.example` / CONTRACTS §10 / IMPLEMENTATION_PLAN P4 / KICKOFF P4 updated. Local `part4/infra-bootstrap` branch + Vultr infra stash deleted (never pushed).
- **Verify:** Grep P4-owned paths for `Vultr`/`vultrobjects` should be empty; DEPLOYMENT points at P3 for host.
- **Fixtures still faked:** same as before for engine/UI
- **Requests to other parts:** see open list above
- **Blocked on:** P3 Brev URL + bucket endpoint; recovery UI still to build

## 2026-11-07 17:45: T4.2–T4.3 storage + HTTP routes + summary card (branch part4/finance-contracts)

- **Shipped:** `@hack/storage` (`StoragePort`, `MemoryStorage`, `S3Storage`, key helpers, size/type guards). API routes: `/api/uploads/presign`, `/api/media/[...key]` (always 403 on `idv/`), `/api/health`. Auth reads via `WEB_AUTH_FIXTURE_JSON` until live `web_*` subscription client lands. `<RecoverySummaryCard>` stub under `components/finance/`.
- **Verify:** `cd packages/storage && pnpm install --ignore-workspace && pnpm test && pnpm typecheck`
- **Fixtures still faked:** live Vultr S3 round-trip; live STDB web auth (fixture JSON only); RecoverySummaryCard does not yet read `recovery_plan` rows
- **Requests to other parts:** `P2: flip external.ts RecoverySummaryCard import to @/components/finance`. `P1: workspace members @hack/storage + @hack/finance; transpilePackages`. `P3: assessment.ts` as before.
- **Blocked on:** Vultr bucket for real S3 ping; P1 Next package.json to run route tests in-app

## 2026-11-07 17:30: T4.6–T4.7 recovery engine + simulate (branch part4/finance-contracts)

- **Shipped:** Pure `@hack/finance` engine: payout/gap (incl. flood exclusion + renters), 5 indicators, funding options + recommended mix, 91-day forecast, `buildRecoveryPlan()`, `simulate()` (< 20 ms). Exact-cents tests in `packages/finance/test/engine.test.ts`.
- **Verify:** `cd packages/finance && pnpm install --ignore-workspace && pnpm test && pnpm typecheck`
- **Fixtures still faked:** no live `estimateRepairCost` yet (pass recomputed `CostEstimate` in); plan/coach job handlers not started; storage/APIs/UI pending
- **Requests to other parts:** same as below (P3 assessment + cost model; P1 workspace)
- **Blocked on:** Vultr for T4.1; P1 for recovery routes

## 2026-11-07 17:20: T4.4–T4.5 finance contracts + personas (branch part4/finance-contracts)

- **Shipped:** `packages/contracts/src/finance.ts` (intake, profile, scenario, plan, coach, simulation result). `@hack/finance` with 3 synthetic personas (`maria`, `james`, `aisha`) + `getPersona` / `PERSONAS`. Fixtures under `fixtures/finance/`. Contracts tsconfig now typechecks `finance.ts`.
- **Verify:** `cd packages/contracts && pnpm install --ignore-workspace && pnpm test`; `cd packages/finance && pnpm install --ignore-workspace && pnpm test`
- **Fixtures still faked:** recovery engine / simulate / storage / APIs not built yet. `RecoveryPlan.cost` uses a shape-compatible ref until P3’s `assessment.ts` is on main (then switch to `CostEstimateSchema`).
- **Requests to other parts:** `P3: merge assessment.ts (CostEstimateSchema) so finance can import it and drop CostEstimateRefSchema`. `P1: add @hack/finance to workspace when scaffold lands`. `P2 (Sidd): register web identity hex c20031dd428a584134bf24332b596afe4f25a327bfb5c4311e609915e5b7bf61 as role web` if not done.
- **Blocked on:** Vultr support (T4.1); P1 scaffold for Next routes; P3 cost model for T4.6 (fixture cost until then)

## 2026-11-07 15:14: Grok Bot + automation kit (merged #1)

- **Shipped:** Personal Cursor skill `hackutd-p4-grokbot` on this machine (`~/.cursor/skills/hackutd-p4-grokbot/`). Pasteables below for Grok Bot memory and two Cursor Automations. No product code yet.
- **Verify:** Create Bot → paste Memory A → send First task. Create automations at https://cursor.com/automations with prompts B and C. Confirm Cloud Agent delegation is on (Grok Bot dashboard).
- **Fixtures still faked:** everything (P4 packages not scaffolded yet)
- **Requests to other parts:** none
- **Blocked on:** P1 scaffold on `main` for real code PRs; Vultr account for T4.1

### Memory A — paste into Grok Bot standing instructions

```text
You are p4-navigator for HackUTD Project Aftermath (repo HackUTD26).
Before any code work, read AGENTS.md, IMPLEMENTATION_PLAN.md (P4 section),
ARCHITECTURE.md §7/§9, CONTRACTS.md finance/HTTP/env, docs/DEPLOYMENT.md,
and status/part4.md (newest first).

OWNED PATHS ONLY:
packages/finance/**, packages/storage/**, packages/contracts/src/finance.ts,
apps/web/app/affected/property/[propertyId]/recovery/**,
apps/web/components/finance/**,
apps/web/app/api/uploads/**, api/media/**, api/health/**,
infra/**, compose.yaml, Dockerfile*, .dockerignore, .env.example,
docs/DEPLOYMENT.md, fixtures/finance/**, finance sections of CONTRACTS.md,
status/part4.md (append only).

Never edit spacetimedb/**, apps/worker/**, other contracts, P1/P2/P3 UI,
or packages/stdb-bindings/**. If blocked, append a Request in status/part4.md
for P2 (reducers/tables) or P3 (register plan/coach handlers + build_recovery_plan tool).

Rules: integer cents; pure engine + simulate(); synthetic personas labeled;
no secrets in git; never serve idv/; product AI stays Nemotron (do not add Grok API to coach).

For code changes: delegate to a Cursor Cloud Agent on HackUTD26. Invoke skill
hackutd-p4-grokbot. Branch part4/<topic>. Commits part4(scope): …. Do not push main.
Do not commit/push unless I explicitly ask. After work, draft the status/part4.md entry.
```

### First task — send this as the first Bot message

```text
Kick off Part 4 against current main.
1) git fetch && summarize whether P1 scaffold exists (apps/web, pnpm workspace).
2) If scaffold is up: open a Cloud Agent PR for T4.4 + T4.5 — finance.ts contracts
   and ≥3 synthetic personas with getPersona + fixtures under fixtures/finance/.
3) If scaffold is missing: do not invent a second monorepo; list exact wait-on-P1 items
   and draft the T4.2 StoragePort interface + T4.3 route shapes as a design note in
   status/part4.md only.
4) Report back with PR link or the status entry text for me to paste.
```

### Automation B — P4 CI fix (cursor.com/automations)

- **Trigger:** CI completed (failure) on pull requests whose branch starts with `part4/`
- **Repository:** HackUTD26 (single repo)
- **Tools:** Pull request creation (or push to same branch), Comment on pull request
- **Prompt:**

```text
This is HackUTD26 Part 4. Read AGENTS.md and IMPLEMENTATION_PLAN.md P4 owned files.
Only modify Part 4 owned paths. If the failure is outside P4 ownership, comment on the
PR explaining which part owns the fix and stop.

Reproduce with pnpm check (or the failing CI command). Fix the failure with a minimal
diff. Prefer pushing to the same part4/* branch over opening a duplicate PR.
Comment: root cause, files touched, how to re-verify.
Never commit .env, secrets, or media. Do not rebase onto main unless needed for the fix.
```

### Automation C — post-merge redeploy reminder

- **Trigger:** Pull request merged into `main`
- **Repository:** HackUTD26
- **Tools:** Send to Slack (optional) or comment only — no code edits required
- **Prompt:**

```text
A PR just merged to main on HackUTD26. Post a short checklist for Part 4 (Roselyn):
1) git switch main && git pull --ff-only
2) If infra/web/worker/env changed: redeploy per docs/DEPLOYMENT.md (< 5 min target)
3) Hit https://<domain>/api/health (or note domain pending)
4) Append status/part4.md cost ledger if Vultr spend changed
5) Tell teammates in chat: merged — rebase soon

If the PR touched only non-P4 paths, still remind rebase; only flag redeploy when
infra/**, Dockerfiles, compose, web API routes P4 owns, or .env.example changed.
Do not open code PRs from this automation.
```

## Cost ledger

| When | Service | Item | Amount | Credit or cash |
|---|---|---|---|---|
| 2026-11-07 | Vultr | abandoned — hosting moved to P3/Brev | $0 further | — |
