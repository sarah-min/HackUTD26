# How to use the Part 2 backend

This guide is for teammates and their LLM coding agents. It describes the **actual code** in `spacetimedb/src/**`, `packages/stdb-bindings/src/**` (generated) and `apps/web/lib/stdb/**`. If anything here disagrees with CONTRACTS.md, the code wins. See "Doc mismatches" at the end. Owner: Part 2 (Sidd).

## 1. Databases and env

| Database | Use it for | Notes |
|---|---|---|
| `aftermath-hackutd` | **The demo / production** | Don't write test data here |
| `aftermath-hackutd-dev` | **Everything while building**: your pages, your worker, smoke tests, fixtures | Same module and schema as prod. Data may be wiped |

Both live on Maincloud. Use the **dev** database until the team switches to prod for the demo.

```bash
# web (browser) — public, not secrets
NEXT_PUBLIC_STDB_URI=https://maincloud.spacetimedb.com
NEXT_PUBLIC_STDB_MODULE=aftermath-hackutd-dev     # → aftermath-hackutd for the demo
# worker / scripts
STDB_URI=https://maincloud.spacetimedb.com
STDB_MODULE=aftermath-hackutd-dev
STDB_SERVICE_TOKEN=<worker token>                 # SECRET: env only, never in git
```

If the env vars are missing, `apps/web/lib/stdb/config.ts` defaults to `ws://localhost:3000` / `aftermath`, which is only useful with a local `spacetime start`. `.env.example` currently shows `wss://maincloud.spacetimedb.com` with `your-module-name`. Use the values above.

## 2. Golden rules

1. **Never hand-edit this package.** It's generated. Part 2 runs `pnpm generate` in `spacetimedb/` after every module change and commits the result.
2. **Reducers are the only write path.** There's no REST API for data. Browsers and the worker call reducers over the SDK connection.
3. **Private tables are invisible to every client, the worker included.** Read them through views:
   - `my_*` views for people in the browser
   - `svc_*` views for the worker

   Don't look for `job`, `frame`, `assessment` and so on in `tables`; they aren't there.
4. **Reducers return no data.** After a call, wait for the row to show up in your subscription (e.g. a new `myReports` row). Errors arrive as a rejected call carrying the error string.
5. **Ids are `bigint` (u64)** in the SDK and **decimal strings** in URLs, JSON and contracts. Use `idToString` / `idFromString` from `@/lib/stdb`.
6. **Generated names are camelCase.** Table `area_cell_summary` → `tables.areaCellSummary`, column `property_id` → `propertyId`, reducer arg `address_json` → `addressJson`. Watch for digits: `report_count_72h` → `reportCount72H`.
7. **Timestamps are SDK `Timestamp`s.** `timestampToMs(ts)` turns one into the contracts' epoch ms.
8. **Web code imports from `@/lib/stdb`, never from `@hack/stdb-bindings` directly.** `apps/web/lib/stdb/bindings.ts` is the only file that touches the generated package.

## 3. Web usage (P1 / P2 / P4 pages)

Mount one connection for the whole app. P1 does this once, in `app/layout.tsx` or a client providers file:

```tsx
import { StdbProvider } from '@/lib/stdb';
export default function RootLayout({ children }) {
  return <html><body><StdbProvider>{children}</StdbProvider></body></html>;
}
```

`<StdbProvider>` connects to `NEXT_PUBLIC_STDB_URI` / `NEXT_PUBLIC_STDB_MODULE` and saves the anonymous identity's token in `localStorage` under `stdb:token`, so the same browser keeps the same identity. **No part opens a second connection.**

Exports from `@/lib/stdb`:

| Export | Returns | Notes |
|---|---|---|
| `useStdb()` | `{ identity, isActive, error }` | Connection state and this browser's identity |
| `useTable(T.x)` / `useTable(T.x.where(r => r.col.eq(v)), { enabled })` | `[rows, ready]` | The raw SDK hook (`spacetimedb/react`) |
| `useReducer(R.x)` | callable `(args) => Promise<void>` | The raw SDK hook. Pass ONE object of camelCase args |
| `T` | table/view handles | `property`, `report`, `areaCellSummary`, `areaNotice` (public) plus `myReports`, `myReportPrivates`, `myVerifications`, `myPropertyPrivates`, `myMediaAssets`, `myFrames`, `myAssessments`, `myAgentSteps`, `myAffectedProfiles`, `myRecoveryPlans`, `myCoachMessages` |
| `R` | browser reducers | `createReport`, `attachMedia`, `submitReport`, `startVerification`, `submitVerification`, `saveAffectedIntake`, `askCoach`. Service reducers are deliberately absent |
| `useMyVerifications()` | `[rows, ready]` | My verification rows |
| `useVerifiedFor(propertyId: bigint \| null)` | `{ verified, verifiedRow, latest, ready }` | `latest` = newest row for the property in any state (for status UI) |
| `useVerificationBySecretHash(hash)` | `VerificationRow \| undefined` | Finds the row created with a given secret |
| `useProperty(propertyId)` | `{ property, ready }` | Public row: `id`, `cellId`, `createdAt`, `countyFips` |
| `useReport(reportId)` | `{ report, ready }` | Public report row (no PII) |
| `useReportsForProperty(propertyId)` | `{ reports, ready }` | Newest first |
| `useAreaCells(cellIds: string[])` | `{ cells, ready }` | Raw `area_cell_summary` rows. Convert with `toAreaCell()` in `components/affected/helpers.ts`, which also re-applies the ≥3-report flag rule |
| `useAreaNotices(propertyId)` | `{ notices, countyFips, ready }` | Public NWS/FEMA notices for the property's county. Declarations first |
| `useVerifiedPropertyPrivate(propertyId)` | `{ propertyPrivate, ready }` | Exact address. A row only if verified |
| `useVerifiedReportData(reportId)` | `{ assessment, frames, steps, media, reportPrivate, ready }` | Verified: everything. The reporter: only their `reportPrivate` and `visibility='reporter'` steps |
| `idToString`, `idFromString`, `timestampToMs` | | id/time helpers |
| `generateSecret()`, `sha256Hex(s)` | | Client secrets (below) |
| `saveReporterSecret(reportId, s)` / `getReporterSecret(reportId)` | | `localStorage` key `secret:report:<reportId>` |
| `saveVerificationSecret(hash, s)` / `getVerificationSecret(hash)` | | `localStorage` key `secret:verification:<hash>` |
| row types | `PropertyRow`, `ReportRow`, `AreaCellRow`, `AreaNoticeRow`, `VerificationRow`, `ReportPrivateRow`, `PropertyPrivateRow`, `MediaAssetRow`, `FrameRow`, `AssessmentRow`, `AgentStepRow`, `AffectedProfileRow`, `RecoveryPlanRow`, `CoachMessageRow` | |

### Client secrets (upload and media authorization)

Each secret is 32 random bytes, base64url-encoded, generated in the browser (`generateSecret()`):

| Secret | When it's created | Goes to the **module** (hash only) | Goes to **HTTP routes** (raw secret) |
|---|---|---|---|
| reporter secret | in `/report/new`, before `createReport` | `reporterSecretHash = await sha256Hex(secret)` inside `createReport`'s `inputJson` | `POST /api/uploads/presign` body `{ kind:'media', reportId, reporterSecret, contentType, sizeBytes, sha256 }` |
| verification secret | in `/affected/verify`, before `startVerification` | `secretHash = await sha256Hex(secret)` arg of `startVerification` | `POST /api/uploads/presign` body `{ kind:'idv', verificationId, verificationSecret, contentType, sizeBytes }`, and `GET /api/media/<key>` headers `x-verification-id` + `x-verification-secret` (the verification must be `verified`) |

- Save the reporter secret with `saveReporterSecret(reportId, secret)` once the report id is known: watch `myReports` for the new row. Save the verification secret with `saveVerificationSecret(hash, secret)` immediately, then find its row with `useVerificationBySecretHash(hash)`. Reducers don't return ids.
- Never log or send a raw secret anywhere except those routes. Reporters have **no** media access. `idv/` keys are never served.

## 4. Who reads and calls what

| Role | How you're recognized | Subscribe to | May call |
|---|---|---|---|
| **Reporter** (anyone at the scene) | `report.reporter == me` | `report` (or `myReports`), `myReportPrivates` (own reports: `addressLine1`, `lat`, `lng`, `notes`), `myAgentSteps` (only `visibility='reporter'` steps of own reports) | `createReport`, `attachMedia`, `submitReport` |
| **Affected, unverified** | no `verified` row for the property | `property`, `report` (public rows only), `areaCellSummary`, `areaNotice`, `myVerifications` | `startVerification`, `submitVerification` |
| **Affected, verified** | `verification(identity=me, state='verified')` for the property | everything above, plus `myPropertyPrivates`, `myReportPrivates`, `myMediaAssets`, `myFrames`, `myAssessments`, `myAgentSteps` (all steps), `myAffectedProfiles`, `myRecoveryPlans`, `myCoachMessages` | `saveAffectedIntake`, `askCoach` (+ the unverified ones) |
| **Worker / service** (P3, P4 handlers) | a row in `service_identity` (role `worker` or `admin`) | `svcJobs`, `svcReportPrivates`, `svcPropertyPrivates`, `svcMediaAssets`, `svcFrames`, `svcAssessments`, `svcVerifications`, `svcAffectedProfiles`, `svcRecoveryPlans`, `svcCoachMessages` (+ any public table) | `claimJob`, `completeJob`, `recordFrame`, `recordAgentStep`, `recordAssessment`, `recordVerification`, `recordRecoveryPlan`, `recordCoachReply`, `recordAreaNotices` |
| **Admin** (Sidd's CLI login, the publisher) | `service_identity.role = 'admin'` | anything | `adminAddService` (+ all service reducers) |

- `svc_*` views return rows **only** to a service identity, and **only** rows tied to a job in state `queued` or `leased`. Once a job is `done` or `failed`, its rows disappear from the worker's views.
- `my_*` views are evaluated per subscriber. Subscribe to the whole view and filter client-side; the hooks above do this.

## 5. Reducer reference

The SDK call is `conn.reducers.<camelName>({ ...args })` or `useReducer(R.<camelName>)`. `u64` args are `bigint`. `u8`, `u16`, `u32` and `f32` args are `number`. Optional args may be omitted. Errors are thrown as the exact string shown.

### Browser reducers

| Reducer | Args | Who | Preconditions / effect | Errors |
|---|---|---|---|---|
| `createReport` | `{ inputJson: string }`, the JSON of `CreateReportInput` (§8) | anyone | Upserts the property (same normalized address, or within 30 m). Inserts `report` (status `draft`, `source 'live'`, `claimed` = property already has a verified person) + `report_private` | `input_json is not valid JSON`, `input_json must be an object`, `invalid hazard: …`, `invalid address`, `invalid address.<field>`, `selfDanger must be boolean`, `isSelfReport must be boolean`, `reporterSecretHash must be 64 hex chars`, `notes must be a string ≤ 500 chars`, `invalid deviceLat`, `invalid deviceLng` |
| `attachMedia` | `{ reportId: bigint, kind: 'video'\|'image', objectKey: string, contentType: string, sizeBytes: bigint, sha256: string }` | the report's reporter | Status `draft` or `needs_more_footage`. `objectKey` starts with `media/<reportId>/`. Per round: 1 video **or** ≤ 8 photos, never mixed | `report not found`, `unauthorized: reporter only`, `cannot attach media in status <s>`, `invalid kind: …`, `object_key must start with media/<reportId>/`, `sha256 must be 64 hex chars`, `max 1 video, and no mixing with photos`, `max 8 photos, and no mixing with a video` |
| `submitReport` | `{ reportId: bigint }` | the report's reporter | Status `draft`, `needs_more_footage` or `failed`. Needs media in the current round (a `failed` retry reuses the last round). Status → `queued`. Enqueues `analyze` with payload `{"round": n}` | `report not found`, `unauthorized: reporter only`, `cannot submit in status <s>`, `attach at least one photo or video first` |
| `startVerification` | `{ addressJson: string (NormalizedAddress JSON), docKind: 'drivers_license'\|'state_id'\|'utility_bill'\|'insurance_declarations', secretHash: string }` | anyone | Max 3 per identity per hour. Upserts the property. Inserts a `verification` row (state `pending`). Read the `propertyId` from your own `myVerifications` row | `invalid doc_kind: …`, `secret_hash must be 64 hex chars`, `address_json is not valid JSON`, `invalid address…`, `rate_limited` |
| `submitVerification` | `{ verificationId: bigint, objectKey: string }` | the verification's owner | State `pending` and not yet submitted. `objectKey` starts with `idv/<verificationId>/`. Enqueues `verify_identity` | `verification not found`, `unauthorized: not your verification`, `cannot submit in state <s>`, `already submitted`, `object_key must start with idv/<verificationId>/` |
| `saveAffectedIntake` | `{ propertyId: bigint, intakeJson: string (AffectedIntake JSON, ≤ 20 000 chars), reportId?: bigint }` | verified for the property | Report = the given one (must be `assessed` and on this property) or the most severe `assessed` report (newest on ties). Upserts `affected_profile`. Enqueues `plan` | `unauthorized: verify for this property first`, `intake_json too large`, `intake_json must be a JSON object`, `report is not on this property`, `report is not assessed yet`, `no assessed report for this property yet` |
| `askCoach` | `{ propertyId: bigint, reportId: bigint, text: string (1–2000) }` | verified for the property | A recovery plan must exist for (me, property, report). Max one pending coach job per identity. Inserts the user message and enqueues `coach` with payload `{"text": …}` | `unauthorized: verify for this property first`, `text must be 1–2000 chars`, `no recovery plan yet for this report`, `a coach reply is already pending` |

### Recovery-code accounts (affected persons; full contract in CONTRACTS.md §5.3)

No email or SMS: the browser generates the code (`apps/web/lib/stdb/recoveryCode.ts`), the module stores only its hash. Accounts work out of the box (an admin only needs `admin_set_account_config` to switch them off or to require step-up). Hooks are in `apps/web/lib/stdb/hooks.ts`: `useAccountStatus`, `useAccount`, `useDevices`, `useStepup`, `useCreateAccount`, `useSignInWithCode`, `useStepUpWithCode`, `useReplaceRecoveryCode`, `useSignOutDevice`, `useRemoveDevice`, `useSetDeviceLabel`, `useDeleteAccount`.

| Call | Args | Result |
|---|---|---|
| procedure `createAccount` | `{ recoveryCode: string }` | `{ ok, error, retryAfterS, attemptsLeft }` (returned, not thrown). Errors: `accounts_disabled`, `locked`, `rate_limited`, `already_signed_in`, `not_verified_owner`, `invalid_code`, `code_taken` |
| procedure `signInWithCode` | `{ recoveryCode: string }` | same shape. Errors: `accounts_disabled`, `locked`, `rate_limited`, `already_signed_in`, `invalid_code` (every wrong code, with `attemptsLeft`) |
| procedure `stepUpWithCode` | `{ recoveryCode: string }` | same shape. Errors: `not_signed_in`, `invalid_code`, `locked`, `rate_limited` |
| procedure `replaceRecoveryCode` | `{ oldCode: string, newCode: string }` | same shape. Errors: `not_signed_in`, `invalid_code` (old code), `invalid_new_code`, `code_unchanged`, `code_taken`, `locked`, `rate_limited` |
| reducers `signOutDevice` | `{}` | throws `not_signed_in` |
| reducer `deleteAccount` | `{}` | throws `not_signed_in`, or `stepup_required` while `require_stepup` is on and the step-up window has lapsed |
| reducer `removeDevice` | `{ identityHex: string }` | throws `device not found on your account` |
| reducer `setDeviceLabel` | `{ label: string (1-40) }` | throws `not_signed_in` |
| views `myAccount` (`id, createdAt, lastLoginAt`), `myDevices`, `myStepup`, `myAccountStatus` (`enabled`) | | sender-scoped, see CONTRACTS.md §5.3 |

`retryAfterS` is set for `locked` / `rate_limited`; `attemptsLeft` counts failed attempts left before `locked` (5 per identity per 15 min). `readBlob` also returns `error: 'stepup_required'` for an owner who needs a step-up (only when an admin turned `require_stepup` on).

### Security hardening (CONTRACTS.md §5.4)

- Hooks: `useClaimConflicts` (view `myClaimConflicts`: `{ id, propertyId, createdAt, status }`, "someone else tried to verify your address", no claimant details) and `useAccessLog` (view `myAccessLog`: `{ id, propertyId, kind: 'blob'|'verify'|'claim', at, mine }`, newest 50).
- A `verification` row can now end `state: 'failed'` with `failReason` `'needs_review'` (worker flagged the ID, held for an admin) or `'duplicate_claim'` (the property already has a different verified owner, held for an admin). Show both as "held for review". `'review_rejected'` = an admin rejected the hold. Only the module writes `duplicate_claim` / `review_rejected`; `recordVerification` accepts `needs_review` but not those two.
- `startVerification` can also fail with `rate_limited: too many verification attempts, try again later` (global or per-property cap). Match on `rate_limited`.
- Admin reducers (not for the browser): `adminResolveClaim({ conflictId, approve })`, `adminResolveVerification({ verificationId, approve })`, `adminSetSecurityConfig({ holdDuplicateClaims?, maxVerificationStartsPerHourGlobal?, maxVerificationStartsPerPropertyPerDay? })`. Admin-only views `adminSecurityConfig`, `adminClaimConflicts`.

### Service reducers (worker / admin only)

All of these first check `service_identity` and fail with `unauthorized: service only`. Identity args are **64-char hex strings** (`identity.toHexString()`; a `0x` prefix is accepted), and anything else fails with `invalid identity hex (expected 64 hex chars)`.

| Reducer | Args | Effect | Errors |
|---|---|---|---|
| `claimJob` | `{ jobId: bigint, leaseMs: number }` | Only if `queued` or the lease has expired. The lease is clamped to 1 s–10 min (use 120 000). `analyze` → report `processing`; `verify_identity` → verification `processing` | `job not found`, `job not claimable (state <s>)` |
| `completeJob` | `{ jobId: bigint, ok: boolean, error?: string }` | `ok` → `done`. Else attempts+1: requeue if < 2, else `failed`. A permanently failed `analyze` → report `failed` (+`statusReason`); a permanently failed `verify_identity` → verification `failed` / `unreadable` | `job not found`, `job not leased (state <s>)`, `job leased by another worker` |
| `recordFrame` | `{ reportId: bigint, frameIndex: number, tSec: number, thumbKey: string, findingJson: string }` | Upsert by (report, frameIndex) | `report not found` |
| `recordAgentStep` | `{ reportId: bigint, seq: number, kind: 'pipeline'\|'vision'\|'model'\|'tool_call'\|'tool_result'\|'error', name: string, summary: string, visibility: 'reporter'\|'affected', durationMs?: number }` | Insert. `name` is cut to 80 chars, `summary` to 400. `visibility:'reporter'` steps show on the reporter's status timeline | `report not found`, `invalid kind: …`, `invalid visibility: …` |
| `recordAssessment` | `{ reportId: bigint, json: string, overallLevel: DamageLevel, usableFrames: number, totalFrames: number, lifeSafetyCsv: string }` | Upserts `assessment`. Report → `needs_more_footage` if `usable*2 < total`, else `assessed`. Copies the level, frames and flags onto the public row. Recomputes the area cell | `report not found`, `invalid overall_level: …`, `invalid life_safety flag: …`, `usable_frames > total_frames` |
| `recordVerification` | `{ verificationId: bigint, ok: boolean, failReason?: 'address_mismatch'\|'unreadable'\|'not_an_id'\|'expired'\|'rate_limited'\|'needs_review', nameOnDoc?: string (≤ 120) }` | State → `verified` / `failed`. Clears `objectKey`. On ok, every report on the property gets `claimed = true` | `verification not found`, `already decided: <s>`, `fail_reason required when ok=false`, `invalid fail_reason: …`, `name_on_doc too long` |
| `recordRecoveryPlan` | `{ identity: hex, propertyId: bigint, reportId: bigint, json: string }` | Upsert by (identity, property, report) | identity hex error |
| `recordCoachReply` | `{ identity: hex, propertyId: bigint, reportId: bigint, text: string }` | Inserts an assistant message (text cut to 2000) | identity hex error |
| `recordAreaNotices` | `{ propertyId: bigint, countyFips: string (5 digits), noticesJson: string }` | Sets `property.countyFips` if empty, then **replaces** every notice for that county (§6) | `invalid county_fips (expected 5 digits)`, `property not found`, `notices_json is not valid JSON`, `notices_json must be an array`, `too many notices (max 20)`, `notice <i> is not an object`, `notice <i> needs a title`, `invalid notice kind: …`, `invalid notice <i> effectiveAt` / `expiresAt` |
| `adminAddService` | `{ identity: hex, role: 'worker'\|'admin' }` | Admin only. Insert or update | `unauthorized: admin only`, `invalid role: …` |

Scheduled (not callable): `requeue_expired_jobs` every 30 s (expired leases count as a failed attempt) and `refresh_area_cells` every 5 min (72 h cell window + purges expired NWS alerts). Direct calls fail with `unauthorized: scheduled only`.

## 6. Worker guide (P3, Sarah)

1. **Connect** with the SDK as a normal client:
   ```ts
   import { DbConnection } from '@hack/stdb-bindings';
   const conn = DbConnection.builder()
     .withUri(process.env.STDB_URI!).withDatabaseName(process.env.STDB_MODULE!)
     .withToken(process.env.STDB_SERVICE_TOKEN)            // omit on the very first run to mint an identity
     .onConnect((c, identity, token) => { /* first run: save token to env, print identity.toHexString() */ })
     .build();
   ```
2. **Get registered.** Send the identity hex (not the token) to Sidd, who runs:
   `spacetime call --server maincloud <db> admin_add_service '"<hex>"' '"worker"'`. Until then every service reducer fails with `unauthorized: service only`, and the `svc_*` views return nothing. Register separately on `aftermath-hackutd-dev` and `aftermath-hackutd`.
3. **Subscribe** to the `svc_*` views (plus `report`, `property` if needed):
   `conn.subscriptionBuilder().subscribe([tables.svcJobs, tables.svcReportPrivates, tables.svcPropertyPrivates, tables.svcMediaAssets, tables.svcFrames, tables.svcAssessments, tables.svcVerifications, tables.svcAffectedProfiles, tables.svcRecoveryPlans, tables.svcCoachMessages])`.
4. **Job lifecycle:**
   - Pick up `svcJobs` rows with `state === 'queued'`, then call `claimJob({ jobId, leaseMs: 120_000 })`.
   - Proceed only once the row shows `state === 'leased'` with `leaseOwner` equal to your identity. A losing claim throws `job not claimable`.
   - Do the work, then call `completeJob({ jobId, ok: true })`, or `ok: false, error` to retry.
   - Limits: max 2 attempts. An expired lease is retried by the 30 s scheduler. For long jobs, finish within the lease or claim with a longer one (max 10 min).
   - Job columns: `kind`, `reportId?`, `propertyId?`, `verificationId?`, `subject?` (the affected person, for `plan`/`coach`), `payloadJson`, `attempts`, `lastError`.
5. **Per kind:**
   - `analyze`: `payloadJson = {"round": n}`. Process **only** `svcMediaAssets` rows with `reportId` = the job's report **and** `round === n`. Earlier rounds are old footage. Write `recordAgentStep` (use `visibility:'reporter'` for the pipeline steps the reporter should see), `recordFrame` per frame, then `recordAssessment`. After the geocode/FEMA/NWS tools, call `recordAreaNotices({ propertyId, countyFips, noticesJson })` with the full current list:
     ```json
     [{ "kind":"nws_alert", "title":"Flash Flood Warning", "severity":"Severe", "headline":"…", "sourceUrl":"https://api.weather.gov/alerts/…", "effectiveAt":1762538400000, "expiresAt":1762560000000 },
      { "kind":"fema_declaration", "title":"Severe Storms and Flooding", "declarationString":"DR-4999-TX", "ihProgramDeclared":true, "sourceUrl":"https://www.fema.gov/disaster/4999", "effectiveAt":1762300000000 }]
     ```
     Times are epoch **ms**. An empty array clears the county. Max 20.
   - `verify_identity`: read the `svcVerifications` row (`objectKey`, `docKind`, `propertyId`) and the `svcPropertyPrivates` row (the normalized address to match). Delete the ID image in a `finally`, then call `recordVerification`.
   - `plan` / `coach`: P4's handlers (§7).
6. **Identity-hex args:** only `recordRecoveryPlan`, `recordCoachReply` and `adminAddService` take an identity. Pass `job.subject.toHexString()`.
7. **Reference stand-in:** `scripts/dev-fake-worker.ts` (Part 2; run `pnpm --dir scripts fake-worker`, dev DB only) claims jobs on the dev DB and writes fixture-labeled results. Use it as a working example of the loop.

## 7. Recovery Navigator guide (P4, Roselyn)

- **Intake:** the verified affected person calls `saveAffectedIntake({ propertyId, intakeJson, reportId? })`, where `intakeJson` = `AffectedIntake`. This enqueues a `plan` job with `subject` = that person and `reportId` = the chosen report.
- **Plan handler (worker side):**
  - Read `svcAffectedProfiles` (`intakeJson`) and `svcAssessments` (the report's assessment `json`) for the job.
  - Build the plan, call `recordRecoveryPlan({ identity: job.subject.toHexString(), propertyId, reportId, json })`, then `completeJob`.
  - The browser sees it in `myRecoveryPlans`.
- **Coach:**
  - `askCoach({ propertyId, reportId, text })` needs that plan to exist, and allows one pending reply per person. It enqueues `coach` with `payloadJson = {"text": …}`.
  - The handler reads `svcCoachMessages` (history), `svcRecoveryPlans` and `svcAffectedProfiles`, then calls `recordCoachReply({ identity, propertyId, reportId, text })`. The browser sees replies in `myCoachMessages`.
- **Presign / media routes:**
  - Inputs: the raw secrets (§3).
  - `media` presign: `sha256(reporterSecret) == report_private.reporterSecretHash`.
  - `idv` presign: `sha256(verificationSecret) == verification.secretHash`, with state `pending`.
  - `/api/media`: the verification must be `verified`, and the key must belong to a report on its property. `idv/` → 403.
  - **How the server reads those rows: the `web` role.** The Next.js server connects with its own identity (`STDB_WEB_TOKEN`, a server-only env var, never `NEXT_PUBLIC_*`), registered by Sidd with `spacetime call --server maincloud <db> admin_add_service '"<hex>"' '"web"'`. It subscribes to three narrow views. Each returns `[]` to every other identity, and the `web` role can't call worker reducers or read `svc_*`:
    - `webReportUploadAuth` → `{ reportId, reporterSecretHash, status }` for reports in `draft` / `needs_more_footage` / `failed` (the only states that accept uploads). Media presign: the row exists and `sha256(reporterSecret) === reporterSecretHash`.
    - `webVerificationAuth` → `{ verificationId, secretHash, state, propertyId }` for `pending` and `verified` verifications. idv presign: `state === 'pending'` and the hash matches. Media GET: `state === 'verified'` and the hash matches.
    - `webMediaIndex` → `{ objectKey, reportId, propertyId }` for every `media/…` and `frames/…` key (never `idv/`). Media GET: `webMediaIndex[key].propertyId === webVerificationAuth[id].propertyId`, otherwise 403.
    - Compare hashes with a constant-time comparison (`crypto.timingSafeEqual`).

## 8. Reporter view guide (P1, Faith)

- **`createReport({ inputJson: JSON.stringify(input) })`**, where `input` is:
  ```ts
  { hazard: 'flood'|'hurricane_wind'|'tornado'|'wildfire'|'earthquake'|'hail'|'other',
    address: { line1, city, state, zip, lat: number|null, lng: number|null, normalized?, source?: 'census'|'nominatim'|'manual' }, // from /api/geocode
    deviceLat?: number, deviceLng?: number,   // raw GPS if granted; preferred for the reporter's map pin
    selfDanger: boolean,                      // "Is anyone in danger right now?" → show <Banner911> immediately
    notes?: string /* ≤ 500 */,
    isSelfReport: boolean,                    // "Is this your property?" → after submit, go to /affected/start?address=…
    reporterSecretHash: string }              // sha256Hex(reporterSecret)
  ```
  The new report appears in `myReports` (status `draft`). Save the secret against its id.
- **Upload:** presign (P4) → PUT → `attachMedia({ reportId, kind, objectKey, contentType, sizeBytes, sha256 })` per file → `submitReport({ reportId })`.
- **Reporter status page (`/report/[id]`):**
  - The public `report` row gives `status` (`draft → queued → processing → assessed`, or `needs_more_footage` / `failed` with `statusReason`), `selfDanger`, `lifeSafetyCsv`, `overallLevel`, `usableFrames` / `totalFrames`, and `claimed`.
  - `myAgentSteps` filtered by `reportId` gives the timeline; it only contains `visibility='reporter'` steps.
  - On `needs_more_footage`, offer a re-shoot (`attachMedia` again, then `submitReport`). On `failed`, offer "Try again" (`submitReport`).
- **My submissions map (`/reporter`):**
  - Pins: `myReports` joined with `myReportPrivates` by `reportId`, using `lat` / `lng` (device GPS, or the geocode point) and `addressLine1`.
  - Color by `overallLevel`, with a badge from `claimed`.
  - Nobody else's pins are ever available.

## 9. Regenerating and republishing (Part 2 only)

```bash
cd spacetimedb
pnpm typecheck && pnpm test                     # must be green
spacetime build
spacetime publish --server maincloud aftermath-hackutd-dev    # dev first
spacetime publish --server maincloud aftermath-hackutd        # prod when ready
pnpm generate                                   # → packages/stdb-bindings/src (commit it)
```

- **Breaking schema changes** (removing or renaming columns or tables, changing types) need `--delete-data`, which **destroys all rows** in that database. Announce it first. On prod, only do it before the demo data is recorded. Additive changes (new tables, views, reducers, optional columns at the end) publish without wiping.
- After regenerating, if any accessor changed name, update `apps/web/lib/stdb/bindings.ts` only.

## Doc mismatches (code is authoritative)

1. ~~Server-side reads for HTTP routes~~ **Resolved** by the `web` role + `web_*` views (see §7). CONTRACTS §8 says "service read"; read that as the `web` role.
2. **The `.env.example` STDB values are stale.** It has `wss://maincloud.spacetimedb.com` + `your-module-name`; use §1. Also add `STDB_WEB_TOKEN` (server-only). That file is P4's.
3. ~~`config.ts` defaults~~ **Fixed:** they now default to `https://maincloud.spacetimedb.com` + `aftermath-hackutd-dev`. Set the env vars for prod.
4. **The `72h` columns are generated as `...72H`** (`reportCount72H`, `hazardReportCount72H`, `severeHazardCount72H`), while the contract `AreaCell` keeps `...72h`. `toAreaCell()` maps them.
5. **Two additive columns aren't in the CONTRACTS v1 tables:** `report_private.submit_count` and `media_asset.round` (re-shoot rounds). Also, `create_report` accepts the optional `deviceLat` / `deviceLng`, which are stored as the report's `lat` / `lng` in preference to the geocode point.
6. The `admin_add_service` CLI call takes **positional JSON args** (`'"<hex>"' '"worker"'`). `scripts/admin-add-service.ts`'s HTTP call shape is still unverified; prefer the CLI.
