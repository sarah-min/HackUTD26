# Shared Technical Contracts

This file is the single source of truth for every interface between the four parts. Implement it exactly. If the live provider forces a change, the domain owner updates this file **in the same PR** as the code and posts in team chat.

## 0. Who owns which contract, and how to change it

| Contract area | Doc section | Code location | Owner |
|---|---|---|---|
| Conventions, shared enums, report and household | §1, §2 | `packages/contracts/src/common.ts`, `report.ts` | **Part 2** |
| Vision findings, assessment, cost, agent trace | §3, §6 | `packages/contracts/src/assessment.ts`, `agent.ts` | **Part 3** |
| Finance: profile, insurance, scenario, plan | §4, §7 | `packages/contracts/src/finance.ts` | **Part 4** |
| SpacetimeDB tables and reducers | §5 | `spacetimedb/**` (+ generated `packages/stdb-bindings/**`) | **Part 2** |
| HTTP routes | §8 | `apps/web/app/api/**` | **Part 4** |
| Worker job and tool interface | §9 | `packages/agent/src/tools/types.ts`, `apps/worker/src/handlers/types.ts` | **Part 3** |
| Env vars | §10 | `.env.example` | **Part 4** |

`packages/contracts/src/index.ts` is written once at scaffold time (Part 2) as `export * from './common'; export * from './report'; export * from './assessment'; export * from './agent'; export * from './finance';`. It never needs to change, so it never conflicts.

**Change rules**

- **Additive changes** (new optional field, new enum value, new schema) can be made by the domain owner at any time. Announce them.
- **Breaking changes** (rename, remove, retype, make required) need all four owners to agree, and must land with every consumer updated in one coordinated PR or a short-lived compatibility field.
- **Requests** from non-owners go in the requester's `status/partN.md` under *Requests to other parts*, plus a chat ping. The owner aims to merge within 30 minutes.

## 1. Conventions

- Every schema is defined in **Zod**, with TS types derived via `z.infer`. Export both: `FrameFinding` (schema) and `type FrameFinding`. If there's a name clash, the schema is `FrameFindingSchema` and the type is `FrameFinding`. Use the `...Schema` suffix everywhere for consistency.
- **Money:** integer cents, fields end in `Cents`. **Rates:** integer basis points, fields end in `Bps` (1% = 100 bps). **Ratios** in indicators are plain numbers for display only, never for money math.
- **Time:** epoch milliseconds (`At` suffix) in contracts and JSON. `Timestamp` columns in SpacetimeDB.
- **IDs:** SpacetimeDB `u64` auto-increment, represented as `string` in JSON/contracts (to avoid JS bigint issues). Convert at the boundary in `apps/web/lib/stdb` and the worker.
- Every object that might be shown as real has `source: 'live' | 'synthetic' | 'fixture'`.
- Every model-produced object has `modelId` and `promptVersion`.

## 2. Common enums and report types (Part 2: `common.ts`, `report.ts`)

```ts
export const HazardSchema = z.enum(['flood','hurricane_wind','tornado','wildfire','earthquake','hail','other']);
export const DamageLevelSchema = z.enum(['none','affected','minor','major','destroyed']); // FEMA PDA-style scale
export const DAMAGE_LEVEL_RANK = { none:0, affected:1, minor:2, major:3, destroyed:4 } as const;
export const ComponentSchema = z.enum(['roof','exterior_walls','windows_doors','foundation','interior','utilities','contents','vehicle','yard_debris']);
export const LifeSafetyFlagSchema = z.enum([
  'person_trapped','injury_visible','active_fire','gas_leak_suspected',   // severe
  'structural_collapse','downed_power_line','standing_water_interior',     // serious
  'road_blocked'                                                           // access
]);
export const VulnerabilitySchema = z.enum(['elderly','child_under_5','disability','medical_device','no_transport','pets','limited_english']);
export const ReportStatusSchema = z.enum(['draft','queued','processing','assessed','needs_more_footage','failed']);
export const SourceSchema = z.enum(['live','synthetic','fixture']);

export const HouseholdSchema = z.object({
  peopleCount: z.number().int().min(1).max(20),
  vulnerabilities: z.array(VulnerabilitySchema),  // tailors safety guidance
  selfReportedDanger: z.boolean(),             // "Is anyone in danger right now?" → 911 banner
  homeSqft: z.number().int().min(200).max(10000).default(1800),
  stories: z.number().int().min(1).max(4).default(1),
  tenure: z.enum(['own','rent']),
});

export const CreateReportInputSchema = z.object({
  hazard: HazardSchema,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  addressText: z.string().max(200),
  contactName: z.string().max(80).optional(),
  contactPhone: z.string().max(30).optional(),
  household: HouseholdSchema,
  insurance: InsuranceInfoSchema,              // from finance.ts (§4)
  personaId: z.string(),                       // synthetic financial persona chosen in the form
});
```

## 3. Vision, assessment, agent trace (Part 3: `assessment.ts`, `agent.ts`)

```ts
export const FrameFindingSchema = z.object({
  frameIndex: z.number().int().min(0),
  tSec: z.number().min(0),                       // 0 for photos
  usable: z.boolean(),
  unusableReason: z.enum(['dark','blurry','not_a_structure','parse_error','other']).optional(),
  components: z.array(z.object({
    component: ComponentSchema,
    level: DamageLevelSchema,
    evidence: z.string().max(200),               // what is visible, e.g. "missing shingles over ~1/3 of roof"
    confidence: z.number().min(0).max(1),
  })),
  lifeSafety: z.array(z.object({
    flag: LifeSafetyFlagSchema,
    evidence: z.string().max(200),
    confidence: z.number().min(0).max(1),
  })),
  hazardObserved: HazardSchema.optional(),
  waterDepth: z.enum(['none','ankle','knee','waist','above_waist','unknown']).default('unknown'),
  caption: z.string().max(240),                  // one-line human caption for the UI
});

export const CostLineItemSchema = z.object({
  component: ComponentSchema,
  level: DamageLevelSchema,
  basis: z.string(),                             // e.g. "1800 sqft × $150/sqft × 15% roof share × 50% major"
  likelyCents: z.number().int().nonnegative(),
});

export const CostEstimateSchema = z.object({
  lowCents: z.number().int().nonnegative(),
  likelyCents: z.number().int().nonnegative(),
  highCents: z.number().int().nonnegative(),
  lineItems: z.array(CostLineItemSchema),
  costModelVersion: z.string(),                  // e.g. "cost-v1"
  disclaimer: z.literal('Illustrative estimate, not a contractor quote or insurance determination.'),
});

export const DisasterDeclarationSchema = z.object({
  femaDeclarationString: z.string(),             // e.g. "DR-4xxx-TX"
  declarationType: z.string(),                   // DR / EM / FM
  incidentType: z.string(),
  title: z.string(),
  declarationDate: z.string(),
  ihProgramDeclared: z.boolean(),
  sourceUrl: z.string().url(),
});

export const DamageAssessmentSchema = z.object({
  reportId: z.string(),
  overallLevel: DamageLevelSchema,               // max component level, weighted by confidence ≥ 0.5 (code-computed)
  componentLevels: z.record(ComponentSchema, DamageLevelSchema),  // code-computed from findings
  lifeSafety: z.array(LifeSafetyFlagSchema),     // flags with any frame confidence ≥ 0.5 (code-computed)
  hazard: HazardSchema,
  confidence: z.number().min(0).max(1),          // mean confidence of usable findings (code-computed)
  usableFrameCount: z.number().int(),
  totalFrameCount: z.number().int(),
  cost: CostEstimateSchema,                      // from estimate_repair_cost tool, never the model
  declarations: z.array(DisasterDeclarationSchema),
  activeAlerts: z.array(z.object({ event: z.string(), severity: z.string(), headline: z.string() })),
  location: z.object({ stateCode: z.string(), countyName: z.string(), countyFips: z.string() }).optional(),
  summary: z.string().max(1200),                 // model: plain-language explanation; no $ not from tools
  recommendedActions: z.array(z.string().max(200)).max(8), // model: safety + next steps
  claimNotice: z.string().max(3000).optional(),  // model: first-notice-of-loss draft
  modelId: z.string(), visionModelId: z.string(), promptVersion: z.string(),
  source: SourceSchema,
  createdAt: z.number().int(),
});

export const AgentStepSchema = z.object({
  reportId: z.string(),
  seq: z.number().int(),
  kind: z.enum(['pipeline','vision','model','tool_call','tool_result','error']),
  name: z.string(),                              // e.g. "extract_frames", "lookup_disaster_declarations"
  summary: z.string().max(400),                  // human-readable, redacted
  visibility: z.enum(['public','owner']),        // 'owner' = contains personal/financial detail
  durationMs: z.number().int().optional(),
  at: z.number().int(),
});
```

**Code-computed vs. model-computed:** `overallLevel`, `componentLevels`, `lifeSafety`, `confidence` and `cost` are computed by code from the validated findings and tool results. The model's `finish` output supplies only `summary`, `recommendedActions`, `claimNotice` and an optional `hazard` correction. Code merges the two and validates the full `DamageAssessmentSchema`.

## 4. Finance (Part 4: `finance.ts`)

```ts
export const AccountSchema = z.object({
  id: z.string(),
  type: z.enum(['checking','savings','cd','ira','mortgage','auto_loan','personal_loan','credit_card']),
  name: z.string(),
  balanceCents: z.number().int().nonnegative(),  // asset value, or amount owed for liabilities
  aprBps: z.number().int().optional(),           // liabilities
  creditLimitCents: z.number().int().optional(), // credit_card
  monthlyPaymentCents: z.number().int().optional(), // mortgage/loans: payment; cards: minimum
  dueDay: z.number().int().min(1).max(28).optional(),
  earlyWithdrawalPenaltyBps: z.number().int().optional(), // cd
  maturityAt: z.number().int().optional(),       // cd
});

export const FinancialProfileSchema = z.object({
  id: z.string(), label: z.string(),             // e.g. "Maria, 34, renter, Houston"
  description: z.string(),
  accounts: z.array(AccountSchema),
  monthlyNetIncomeCents: z.number().int(),
  monthlyGrossIncomeCents: z.number().int(),
  monthlyEssentialExpensesCents: z.number().int(), // excluding account payments above
  payDays: z.array(z.number().int().min(1).max(28)),  // e.g. [1, 15]
  personalLoanOfferAprBps: z.number().int().optional(), // illustrative, labeled synthetic
  source: z.literal('synthetic'),
});

export const InsuranceInfoSchema = z.object({
  policyType: z.enum(['homeowners','renters','none','unknown']),
  carrier: z.string().max(60).optional(),
  dwellingCoverageCents: z.number().int().nonnegative().default(0),
  contentsCoverageCents: z.number().int().nonnegative().default(0),
  deductibleCents: z.number().int().nonnegative().optional(),
  deductibleBps: z.number().int().nonnegative().optional(), // % deductible (e.g. hurricane), of dwelling coverage
  floodCovered: z.boolean().default(false),       // separate flood policy (e.g. NFIP)
});

export const ScenarioSchema = z.object({
  repairCase: z.enum(['low','likely','high']).default('likely'),
  payoutDelayDays: z.number().int().min(0).max(180).default(30),
  deductibleOverrideCents: z.number().int().nonnegative().optional(),
  incomeLossMonths: z.number().min(0).max(6).default(0),
  repairStartDay: z.number().int().min(0).max(60).default(7),
  fundingMix: z.array(z.object({ optionId: z.string(), amountCents: z.number().int().nonnegative() })).optional(),
  // omitted fundingMix → use plan.recommendedMix
});

export const IndicatorSchema = z.object({
  id: z.enum(['liquidity_runway_months','emergency_fund_coverage','debt_to_income','credit_utilization','insurance_gap_ratio']),
  label: z.string(), value: z.number(), unit: z.enum(['months','ratio']),
  status: z.enum(['good','watch','risk']),
  explanation: z.string(),                        // deterministic template text
});

export const FundingOptionSchema = z.object({
  id: z.enum(['savings','credit_card','personal_loan','cd_early_withdrawal','ira_withdrawal','sba_disaster_loan','fema_ihp']),
  label: z.string(),
  availableCents: z.number().int().nonnegative().nullable(), // null = unknown (aid programs)
  costOfFundsCents: z.number().int().nonnegative().nullable(), // for the recommended amount; null = unknown
  daysToFunds: z.number().int().nullable(),
  eligibilityNote: z.string().optional(),
  link: z.string().url().optional(),
});

export const ForecastPointSchema = z.object({
  day: z.number().int().min(0).max(90), at: z.number().int(),
  liquidCents: z.number().int(),                  // may go negative = shortfall
  events: z.array(z.string()),                    // e.g. ["Mortgage −$1,450.00", "Insurance payout +$12,300.00"]
});

export const RecoveryPlanSchema = z.object({
  reportId: z.string(), profileId: z.string(),
  repairCostCents: z.object({ low: z.number().int(), likely: z.number().int(), high: z.number().int() }),
  expectedPayoutCents: z.object({ low: z.number().int(), likely: z.number().int(), high: z.number().int() }),
  gapCents: z.object({ low: z.number().int(), likely: z.number().int(), high: z.number().int() }),
  payoutNotes: z.array(z.string()),               // e.g. "Flood damage: homeowners policies typically exclude flood — check your policy."
  indicators: z.array(IndicatorSchema).min(3),
  options: z.array(FundingOptionSchema),
  recommendedMix: z.array(z.object({ optionId: z.string(), amountCents: z.number().int() })),
  forecast: z.array(ForecastPointSchema),         // default scenario, 91 points (day 0..90)
  firstShortfallDay: z.number().int().nullable(),
  nextSteps: z.array(z.string()).max(6),
  coachSummary: z.string().max(800).optional(),   // model-written, grounded in this JSON
  disclaimer: z.literal('Educational estimate using a synthetic demo profile. Not financial advice.'),
  source: SourceSchema, createdAt: z.number().int(),
});

export const CoachMessageSchema = z.object({
  reportId: z.string(), role: z.enum(['user','assistant']), text: z.string().max(2000), at: z.number().int(),
});
```

## 5. SpacetimeDB module (Part 2)

Below are logical definitions. Part 2 translates them into the current TS module syntax (`spacetimedb/server`: `table`, `t`, `schema`, reducers). **VERIFY** the syntax against the 2.x docs. Column names in the module are `snake_case`; the generated bindings expose them in camelCase.

### 5.1 Tables

| Table | Vis. | Columns (pk first) | Notes |
|---|---|---|---|
| `report` | public | `id u64 pk autoInc`, `owner Identity`, `created_at`, `updated_at`, `status`, `hazard`, `self_danger bool`, `life_safety_csv string`, `overall_level` (default `none`), `usable_frames u8`, `total_frames u8`, `status_reason string?`, `source` | Drives the live status timeline. No PII, no location, no finances |
| `report_private` | private | `report_id pk`, `owner`, `address_text`, `lat f64`, `lng f64`, `contact_name?`, `contact_phone?`, `household_json`, `insurance_json`, `persona_id`, `owner_secret string` | Owner only |
| `media_asset` | private | `id pk autoInc`, `report_id` (index), `kind 'video'|'image'`, `object_key`, `content_type`, `size_bytes u64`, `sha256`, `uploaded_at` | Owner only |
| `frame` | private | `id pk autoInc`, `report_id` (index), `frame_index u8`, `t_sec f32`, `thumb_key`, `finding_json` (FrameFinding) | Owner only |
| `assessment` | private | `report_id pk`, `json` (DamageAssessment), `created_at` | Owner only |
| `recovery_plan` | private | `report_id pk`, `json` (RecoveryPlan), `created_at` | Owner only |
| `agent_step` | private | `id pk autoInc`, `report_id` (index), `seq u16`, `kind`, `name`, `summary`, `visibility`, `duration_ms u32?`, `at` | Owner only. `visibility='owner'` steps are also redacted from logs |
| `coach_message` | private | `id pk autoInc`, `report_id` (index), `role`, `text`, `at` | Owner only |
| `job` | private | `id pk autoInc`, `kind 'analyze'|'coach'`, `report_id`, `payload_json`, `state 'queued'|'leased'|'done'|'failed'`, `attempts u8`, `lease_owner Identity?`, `lease_expires_at?`, `last_error?`, `created_at` | Service only |
| `service_identity` | private | `identity pk`, `role 'admin'|'worker'` | |
| `lease_tick` | scheduled | (interval 30 s) → `requeue_expired_jobs` | |

**Visibility VERIFY (hour 1):** document here which mechanism grants the owning identity read access to its private rows above (views / RLS / filters), or note that the HTTP fallback in §8 is in use.

### 5.2 Reducers

| Reducer | Caller | Args | Effect / checks |
|---|---|---|---|
| `init` | system | — | Inserts the publisher into `service_identity(admin)`. Schedules `lease_tick` |
| `admin_add_service` | admin | `identity, role` | |
| `create_report` | anyone | `CreateReportInput` as JSON string | Validates (light checks in module; full Zod in web). Inserts `report` (status `draft`, `source='live'`) and `report_private` (random `owner_secret`) |
| `attach_media` | owner | `report_id, kind, object_key, content_type, size_bytes, sha256` | Status must be `draft` or `needs_more_footage`. Max 8 images or 1 video |
| `submit_report` | owner | `report_id` | Needs ≥1 media. Allowed from `draft`, `needs_more_footage` or `failed` (resubmit). Status → `queued`. Inserts `job(analyze)` |
| `claim_job` | service | `job_id, lease_ms` | Only if `state='queued'` or the lease has expired. Sets lease. Report → `processing` |
| `record_frame` | service | `report_id, frame_index, t_sec, thumb_key, finding_json` | Upsert by (report_id, frame_index) |
| `record_agent_step` | service | `report_id, seq, kind, name, summary, visibility, duration_ms?` | |
| `record_assessment` | service | `report_id, json, overall_level, usable_frames, life_safety_csv, confidence` | Stores the assessment. Updates `report.overall_level`. Status → `needs_more_footage` if `usable_frames*2 < total`, else `assessed` (low confidence is a label, not a status) |
| `record_recovery_plan` | service | `report_id, json` | |
| `complete_job` | service | `job_id, ok, error?` | `ok` → done. Else attempts++ → requeue if < 2, else `failed` and report → `failed` with `status_reason` (page offers "Try again") |
| `ask_coach` | owner | `report_id, text` | Inserts `coach_message(user)` + `job(coach)`. Rate limit: 1 pending coach job per report |
| `record_coach_reply` | service | `report_id, text` | |
| `requeue_expired_jobs` | scheduled | — | |

## 6. Repair cost model (Part 3: `packages/damage`, `costModelVersion = "cost-v1"`)

All values are **illustrative defaults** and labeled as such in the UI. They're configurable in `packages/damage/src/costTable.ts`. If a citable public figure is found, cite it in SOURCES.md.

```text
replacementCostPerSqftCents = 15000            // $150/sqft, illustrative
structureValue = homeSqft × replacementCostPerSqftCents
componentShare  = roof 0.15 | exterior_walls 0.15 | windows_doors 0.07 | foundation 0.12 | interior 0.30 | utilities 0.11 | yard_debris 0.02
damageFraction  = none 0 | affected 0.05 | minor 0.15 | major 0.50 | destroyed 1.00
contents (fixed, not sqft): affected 50000 | minor 300000 | major 1500000 | destroyed 4000000 cents
vehicle  (fixed): affected 50000 | minor 250000 | major 1200000 | destroyed 2500000 cents
likelyCents(component) = round(structureValue × share × fraction)
likely = Σ components (structure capped at structureValue) + contents + vehicle
low = round(likely × 0.70); high = round(likely × 1.40)
renters (tenure='rent'): structure components excluded from the renter's cost (landlord), with a note; contents + vehicle kept
```

## 7. Finance formulas (Part 4: `packages/finance`)

```text
liquid = Σ checking + Σ savings
monthlyDebtPayments = Σ monthlyPaymentCents (mortgage, loans, card minimums)
monthlyOutflow = monthlyEssentialExpensesCents + monthlyDebtPayments
deductible = deductibleOverrideCents ?? deductibleCents ?? round(dwellingCoverageCents × deductibleBps / 10000) ?? 0

expectedPayout(case):
  structureCost, contentsCost from the assessment line items for that case (scale line items by low/high factor)
  if policyType ∈ {none, unknown} → 0, note
  floodExcluded = hazard == 'flood' && !floodCovered → structure and contents payout 0, note "Flood damage: standard homeowners/renters policies typically exclude flood — check your policy."
  homeowners: max(0, min(structureCost, dwellingCoverage) + min(contentsCost, contentsCoverage) − deductible)
  renters:    max(0, min(contentsCost, contentsCoverage) − deductible)
gap(case) = max(0, repairCost(case) − expectedPayout(case))

indicators (computed for the likely case):
  liquidity_runway_months = (liquid − gap.likely) / monthlyOutflow        good ≥ 3 | watch ≥ 1 | risk < 1
  emergency_fund_coverage = liquid / gap.likely   (gap 0 → value 99, good) good ≥ 1.5 | watch ≥ 1 | risk < 1
  debt_to_income          = monthlyDebtPayments / monthlyGrossIncome       good < 0.36 | watch ≤ 0.43 | risk > 0.43
  credit_utilization      = Σ card balance / Σ card limit                  good < 0.30 | watch ≤ 0.50 | risk > 0.50
  insurance_gap_ratio     = gap.likely / repairCost.likely                 good < 0.20 | watch ≤ 0.50 | risk > 0.50

options:
  savings:             available = max(0, liquid − monthlyOutflow)  (keep 1 month buffer); cost 0; days 0
  credit_card:         available = Σ (limit − balance); cost = round(amount × aprBps × 6 / 120000) (6 months to repay); days 0
  personal_loan:       only if persona offer exists; available = min(2500000, gap.likely); cost = round(amount × offerAprBps × 24 / 120000 / 2) (24-mo, simple avg-balance approx); days 3
  cd_early_withdrawal: available = Σ cd balance; cost = round(amount × penaltyBps / 10000); days 1
  ira_withdrawal:      available = Σ ira; cost null; note "Taxes and early-withdrawal penalties may apply — last resort."
  sba_disaster_loan:   only if a declaration exists; available null, cost null; link to SBA disaster loans; "Check eligibility"
  fema_ihp:            only if a declaration has ihProgramDeclared; available null; cost 0 (grant); link disasterassistance.gov; "Check eligibility"

recommendedMix: sort known-cost options by cost-per-dollar ascending, then daysToFunds; greedily fill gap.likely.
  Unknown-cost options are listed but never auto-filled.

forecast (day 0..90, daily):
  start = liquid
  each payDay: + monthlyNetIncome / payDays.length (skipped during incomeLossMonths from day 0)
  each day: − round(monthlyEssentialExpenses / 30)
  account dueDay: − monthlyPaymentCents
  day repairStartDay: − repairCost(case)
  day payoutDelayDays: + expectedPayout(case)
  each mix option on day daysToFunds: + amount (savings is already in liquid → not added)
  firstShortfallDay = first day liquidCents < 0, else null
All arithmetic is integer cents with Math.round at each multiplication. Never accumulate floats.
```

`simulate(profile, assessment, insurance, scenario) → { forecast, indicators, gapCents, firstShortfallDay, totalCostOfFundsCents }` is pure, runs in the browser, and finishes in < 20 ms.

## 8. HTTP API (Part 4 unless noted)

| Method + path | Auth | Request | Response |
|---|---|---|---|
| `POST /api/uploads/presign` | `reportId` + `ownerSecret` header `x-owner-secret` | `{ reportId, contentType: 'video/mp4'|'video/quicktime'|'image/jpeg'|'image/png'|'image/webp', sizeBytes, sha256 }` | `{ putUrl, objectKey, expiresAt }`. Rejects > 200 MB video / 15 MB image |
| `GET /api/media/[...key]` | owner secret (`x-owner-secret`), or the owner-view approach Part 2 picks | — | 302 to a presigned GET (10 min) |
| `GET /api/health` | none | — | `{ ok, web: true, stdb: bool, storage: bool, version }` |
| `GET /api/reports/[id]/private` | `x-owner-secret` | — | **Only if the §5 visibility fallback is chosen** (owned by Part 2) |

Object keys: `media/<reportId>/<sha256>.<ext>`, `frames/<reportId>/<frameIndex>.jpg`.

## 9. Worker interfaces (Part 3)

```ts
// apps/worker/src/handlers/types.ts
export interface JobContext {
  job: { id: string; kind: 'analyze' | 'coach'; reportId: string; payload: unknown };
  stdb: ServiceConnection;          // typed reducer calls from packages/stdb-bindings
  storage: StoragePort;             // from packages/storage (Part 4)
  nim: NimClient;                   // from packages/agent
  log: Logger;
  step(s: Omit<AgentStep, 'reportId' | 'seq' | 'at'>): Promise<void>; // auto seq + record_agent_step
}
export type JobHandler = (ctx: JobContext) => Promise<void>;

// packages/agent/src/tools/types.ts
export interface AgentTool<I, O> {
  name: string;                      // snake_case, matches ARCHITECTURE §6.3
  description: string;               // shown to the model
  input: z.ZodType<I>;               // converted to JSON Schema for `tools`
  output: z.ZodType<O>;
  visibility: 'public' | 'owner';    // for trace redaction
  run(input: I, ctx: JobContext): Promise<O>;
}

// packages/storage (Part 4)
export interface StoragePort {
  presignPut(key: string, contentType: string, sizeBytes: number): Promise<{ url: string; expiresAt: number }>;
  presignGet(key: string, ttlSec?: number): Promise<string>;
  getObject(key: string): Promise<Buffer>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  ping(): Promise<boolean>;
}

// packages/finance (Part 4)
export function buildRecoveryPlan(args: { reportId: string; profile: FinancialProfile; insurance: InsuranceInfo;
  assessment: DamageAssessment; tenure: 'own'|'rent' }): RecoveryPlan;          // without coachSummary
export function simulate(args: { /* same */ ; scenario: Scenario }): SimulationResult;
export function getPersona(id: string): FinancialProfile;
export const PERSONAS: FinancialProfile[];
```

## 10. Environment variables (`.env.example`, Part 4)

| Name | Used by | Example / note |
|---|---|---|
| `APP_BASE_URL` | web | `https://<domain>` |
| `APP_DOMAIN` | caddy | bare domain for TLS, e.g. `example.tech` |
| `NEXT_PUBLIC_STDB_URI` | web | Maincloud websocket URI (public, not secret) |
| `NEXT_PUBLIC_STDB_MODULE` | web | module/database name |
| `STDB_URI`, `STDB_MODULE` | worker, scripts | same values |
| `STDB_SERVICE_TOKEN` | worker | token of the worker identity (**secret**) |
| `NVIDIA_API_KEY` | worker | **secret** |
| `NVIDIA_BASE_URL` | worker | `https://integrate.api.nvidia.com/v1` |
| `NEMOTRON_VL_MODEL` | worker | `nvidia/nemotron-nano-12b-v2-vl` (VERIFY) |
| `NEMOTRON_AGENT_MODEL` | worker | VERIFY on build.nvidia.com |
| `S3_ENDPOINT` | web, worker | Vultr Object Storage endpoint, e.g. `https://<region>.vultrobjects.com` |
| `S3_REGION`, `S3_BUCKET` | web, worker | |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | web, worker | **secret** |
| `WORKER_CONCURRENCY` | worker | `2` |
| `VL_CONCURRENCY` | worker | `4` |
| `USE_FIXTURES` | worker | `false`; `true` = return labeled fixture model output (dev only) |

## 11. Fixtures

- Location: `fixtures/<domain>/*.json`, owned by the domain owner (`fixtures/report` P2, `fixtures/assessment` P3, `fixtures/finance` P4).
- Every fixture validates against its schema in a unit test, and has `source: "fixture"`.
- Real model outputs captured during development go in `fixtures/assessment/captured/` with the model ID, and are used as regression tests for the Zod parsers.
- Media files are **not** committed. `fixtures/media/README.md` lists the source URL, license and object-storage key for each demo clip.
