# Shared Technical Contracts

This file is the single source of truth for every interface between the four parts. Implement it exactly. If the live provider forces a change, the domain owner updates this file **in the same PR** as the code and posts in team chat.

Two kinds of people use the product (see IDEA.md): the **reporter** (anyone who submits footage) and the **affected person** (a verified resident of the property). Both are anonymous SpacetimeDB identities; their roles are derived from data (§5).

## 0. Who owns which contract, and how to change it

| Contract area | Doc section | Code location | Owner |
|---|---|---|---|
| Conventions, shared enums, report input | §1, §2.1, §2.2 | `packages/contracts/src/common.ts`, `report.ts` | **Part 2** |
| Property, normalized address, area cells, address rules | §2.3 | `packages/contracts/src/property.ts`, `packages/address/**` | **Part 2** |
| Vision findings, assessment, agent trace | §3.1, §3.2 | `packages/contracts/src/assessment.ts`, `agent.ts` | **Part 3** |
| ID-document verification | §3.3 | `packages/contracts/src/verification.ts` | **Part 3** |
| Repair cost model | §6 | `packages/damage/**` | **Part 3** |
| Finance: intake, profile, insurance, scenario, plan | §4, §7 | `packages/contracts/src/finance.ts`, `packages/finance/**` | **Part 4** |
| SpacetimeDB tables and reducers | §5 | `spacetimedb/**` (+ generated `packages/stdb-bindings/**`) | **Part 2** |
| HTTP routes | §8 | `apps/web/app/api/**`: geocode and private fallback are **Part 2**; uploads, media and health are **Part 4** | split |
| Worker job and tool interface | §9 | `packages/agent/src/tools/types.ts`, `apps/worker/src/handlers/types.ts` | **Part 3** |
| Env vars | §10 | `.env.example` | **Part 4** |

`packages/contracts/src/index.ts` is written once at scaffold time (Part 2) as `export * from './common'; export * from './report'; export * from './property'; export * from './assessment'; export * from './agent'; export * from './verification'; export * from './finance';`. It never needs to change, so it never conflicts.

**Change rules**

- **Additive changes** (new optional field, new enum value, new schema) can be made by the domain owner at any time. Announce them.
- **Breaking changes** (rename, remove, retype, make required) need all four owners to agree, and must land with every consumer updated in one coordinated PR or a short-lived compatibility field.
- **Requests** from non-owners go in the requester's `status/partN.md` under *Requests to other parts*, plus a chat ping. The owner aims to merge within 30 minutes.

## 1. Conventions

- Every schema is defined in **Zod**, with TS types derived via `z.infer`. Schemas use the `...Schema` suffix (`FrameFindingSchema`); types drop it (`type FrameFinding`).
- **Money:** integer cents, fields end in `Cents`. **Rates:** integer basis points, fields end in `Bps` (1% = 100 bps). **Ratios** in indicators are plain numbers for display only, never for money math.
- **Time:** epoch milliseconds (`At` suffix) in contracts and JSON. `Timestamp` columns in SpacetimeDB.
- **IDs:** SpacetimeDB `u64` auto-increment, represented as `string` in JSON/contracts. Convert at the boundary in `apps/web/lib/stdb` and the worker. Identities are hex strings in JSON.
- **Secrets:** `reporterSecret` (one per report) and `verificationSecret` (one per verification) are 32 random bytes, base64url, **generated in the browser** and kept in `localStorage`. The module stores only `sha256` hex. HTTP routes authorize with them (§8).
- Every object that might be shown as real has `source: 'live' | 'synthetic' | 'fixture'`.
- Every model-produced object has `modelId` and `promptVersion`.

## 2. Common, report and property types (Part 2)

### 2.1 Common enums (`common.ts`)

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
export const SEVERE_FLAGS  = ['person_trapped','injury_visible','active_fire','gas_leak_suspected'] as const;
export const SERIOUS_FLAGS = ['structural_collapse','downed_power_line','standing_water_interior'] as const;
export const VulnerabilitySchema = z.enum(['elderly','child_under_5','disability','medical_device','no_transport','pets','limited_english']);
export const ReportStatusSchema = z.enum(['draft','queued','processing','assessed','needs_more_footage','failed']);
export const VerificationStateSchema = z.enum(['pending','processing','verified','failed']);
export const SourceSchema = z.enum(['live','synthetic','fixture']);
```

### 2.2 Report input (`report.ts`)

The reporter answers **only** what someone at the scene can know. Household, insurance and finances come later from the affected person (`AffectedIntake`, §4).

```ts
export const CreateReportInputSchema = z.object({
  hazard: HazardSchema,
  address: NormalizedAddressSchema,            // confirmed/edited by the reporter (§2.3)
  deviceLat: z.number().min(-90).max(90).optional(),   // raw GPS at capture time, if granted
  deviceLng: z.number().min(-180).max(180).optional(),
  selfDanger: z.boolean(),                     // "Is anyone in danger right now?" → 911 banner
  notes: z.string().max(500).optional(),       // e.g. "elderly man on porch", "water still rising"
  isSelfReport: z.boolean(),                   // "Is this your property?" → redirect to /affected/start after submit
  reporterSecretHash: z.string().length(64),   // sha256 hex of reporterSecret
});
```

### 2.3 Property, address and area cells (`property.ts`, `packages/address`)

```ts
export const NormalizedAddressSchema = z.object({
  line1: z.string().max(120),                  // "1234 N MAIN ST APT 2"
  city: z.string().max(60),
  state: z.string().length(2),                 // USPS state code
  zip: z.string().regex(/^\d{5}$/),            // ZIP5 only
  lat: z.number().nullable(),                  // geocode point; null only for source='manual' without coords
  lng: z.number().nullable(),
  normalized: z.string(),                      // canonical matching key, see rules below
  source: z.enum(['census','nominatim','manual']),
});

export const AreaCellSchema = z.object({
  cellId: z.string(),                          // "<row>:<col>", see cellId() below
  reportCount72h: z.number().int().nonnegative(),
  worstLevel: DamageLevelSchema,
  hazardReportCount72h: z.number().int().nonnegative(),  // reports in the cell with ≥1 life-safety flag
  severeHazardCount72h: z.number().int().nonnegative(),  // reports with ≥1 SEVERE_FLAGS flag
  hazardFlags: z.array(LifeSafetyFlagSchema),            // distinct flags seen in the window; EMPTY unless reportCount72h ≥ 3 (privacy)
  lastReportAt: z.number().int(),
});
```

**Area-map hazard rule.** Counts come from `report.life_safety_csv` of reports with `status='assessed'` in the last 72 h. `hazardFlags` is filled only when the cell has at least 3 reports, so a hazard type can't be pinned to one house. Otherwise the UI just says "hazard reported". Hazard shading: 0 → none, 1 → amber, 2–4 → orange, ≥5 → red; any `severeHazardCount72h > 0` adds a ⚠ marker.

**`packages/address`** (pure TS, zero runtime dependencies, Part 2):

```text
normalizeAddress(parts) → NormalizedAddress.normalized
  1. uppercase; trim; collapse whitespace; strip punctuation except '#' (then '#' → 'APT')
  2. street suffixes → USPS abbreviations: STREET ST, AVENUE AVE, ROAD RD, DRIVE DR, LANE LN, BOULEVARD BLVD,
     COURT CT, CIRCLE CIR, PLACE PL, TERRACE TER, PARKWAY PKWY, HIGHWAY HWY, TRAIL TRL, WAY WAY
  3. directionals: NORTH N, SOUTH S, EAST E, WEST W, NORTHEAST NE, NORTHWEST NW, SOUTHEAST SE, SOUTHWEST SW
  4. unit designators: APARTMENT APT, SUITE STE, UNIT UNIT, BUILDING BLDG, FLOOR FL
  5. ZIP+4 → ZIP5
  normalized = `${line1} | ${city} | ${state} | ${zip}`

parseLine1(line1) → { houseNumber: leading digits (+ optional letter), streetName: remaining tokens before the unit designator, unit? }

matchAddresses(a, b) → boolean
  a.normalized === b.normalized
  OR (a.zip === b.zip AND houseNumber(a) === houseNumber(b) AND similarity(streetName(a), streetName(b)) ≥ 0.85)
  similarity = 1 − levenshtein(x, y) / max(len(x), len(y))
  Units: if both have a unit and they differ → false (different apartment)

haversineM(lat1, lng1, lat2, lng2) → meters
cellId(lat, lng): row = floor(lat / 0.00225); col = floor(lng / (0.00225 / cos(rowCenterLatRad)))   // ≈ 250 m cells
cellBounds(cellId) → [[south, west], [north, east]] for drawing
neighborCells(cellId, radiusCells) → string[]   // radius 4 ≈ 1 km for the affected area map
```

Property matching (in the module; §5): exact `normalized` match → else any property in the same or a neighboring cell within **30 m** of the geocode point → else create.

## 3. Vision, assessment, agent trace, verification (Part 3)

### 3.1 Findings and assessment (`assessment.ts`)

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
  inputs: z.object({ homeSqft: z.number().int(), stories: z.number().int(), tenure: z.enum(['own','rent']),
                     assumed: z.boolean() }),   // assumed=true → defaults were used; UI shows "assumed home size"
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
  propertyId: z.string(),
  overallLevel: DamageLevelSchema,               // max component level, weighted by confidence ≥ 0.5 (code-computed)
  componentLevels: z.record(ComponentSchema, DamageLevelSchema),  // code-computed from findings
  lifeSafety: z.array(LifeSafetyFlagSchema),     // flags with any frame confidence ≥ 0.5 (code-computed)
  hazard: HazardSchema,
  confidence: z.number().min(0).max(1),          // mean confidence of usable findings (code-computed)
  usableFrameCount: z.number().int(),
  totalFrameCount: z.number().int(),
  cost: CostEstimateSchema,                      // estimate_repair_cost with ASSUMED defaults (§6); never the model
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
```

**Code-computed vs. model-computed:** `overallLevel`, `componentLevels`, `lifeSafety`, `confidence` and `cost` are computed by code from the validated findings and tool results. The model's `finish` output supplies only `summary`, `recommendedActions`, `claimNotice` and an optional `hazard` correction. Code merges the two and validates the full `DamageAssessmentSchema`.

### 3.2 Agent trace (`agent.ts`)

```ts
export const AgentStepSchema = z.object({
  reportId: z.string(),
  seq: z.number().int(),
  kind: z.enum(['pipeline','vision','model','tool_call','tool_result','error']),
  name: z.string(),                              // e.g. "extract_frames", "lookup_disaster_declarations"
  summary: z.string().max(400),                  // human-readable, redacted
  visibility: z.enum(['reporter','affected']),   // 'reporter' = shown to the reporter AND affected; 'affected' = affected only
  durationMs: z.number().int().optional(),
  at: z.number().int(),
});
```

Rule: `kind = 'pipeline'` steps (Uploaded, Extracting frames, Analyzing 3/8, Estimating cost, Checking declarations, Done) use `visibility = 'reporter'`. Every other step uses `'affected'`. Reporter-visible summaries never mention costs, findings text or claim content.

### 3.3 ID-document verification (`verification.ts`)

```ts
export const DocKindSchema = z.enum(['drivers_license','state_id','utility_bill','insurance_declarations']);
export const VerificationFailReasonSchema = z.enum(['address_mismatch','unreadable','not_an_id','expired','rate_limited']);

export const IdDocumentFieldsSchema = z.object({   // Nemotron VL output for the ID-document prompt
  docKind: DocKindSchema,
  fullName: z.string().max(120),
  addressText: z.string().max(200),              // as printed; normalized by code, never stored
  expiration: z.string().optional(),             // ISO date if printed (IDs)
  isLikelyId: z.boolean(),                       // false → photo isn't an accepted document
  confidence: z.number().min(0).max(1),
  modelId: z.string(), promptVersion: z.string(),
});

export const VerificationResultSchema = z.object({
  ok: z.boolean(),
  failReason: VerificationFailReasonSchema.optional(),
  nameOnDoc: z.string().max(120).optional(),     // the only extracted field persisted
  matchedNormalized: z.string().optional(),      // property normalized address it matched (for logs/tests)
});
```

**Decision rule** (deterministic, `packages/vision/src/verify/decide.ts`), evaluated in this order:

1. `!isLikelyId` → `not_an_id`
2. `confidence < 0.5` → `unreadable`
3. docKind ∈ {drivers_license, state_id} and expiration < today → `expired`
4. `!matchAddresses(normalize(addressText), property.address)` (§2.3) → `address_mismatch`
5. otherwise → `ok`

The ID image is deleted on every path (ARCHITECTURE §6.5).

## 4. Finance and affected intake (Part 4: `finance.ts`)

```ts
export const HouseholdSchema = z.object({          // answered by the AFFECTED person, never the reporter
  peopleCount: z.number().int().min(1).max(20),
  vulnerabilities: z.array(VulnerabilitySchema), // tailors safety guidance on the affected view
});

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

export const AffectedIntakeSchema = z.object({     // saved via save_affected_intake (§5)
  household: HouseholdSchema,
  tenure: z.enum(['own','rent']),
  homeSqft: z.number().int().min(200).max(10000).default(1800),
  stories: z.number().int().min(1).max(4).default(1),
  insurance: InsuranceInfoSchema,
  personaId: z.string(),                          // synthetic demo persona
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
  propertyId: z.string(), reportId: z.string(), profileId: z.string(),
  cost: CostEstimateSchema,                       // RECOMPUTED with intake homeSqft/stories/tenure (inputs.assumed=false)
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
  propertyId: z.string(), reportId: z.string(),
  role: z.enum(['user','assistant']), text: z.string().max(2000), at: z.number().int(),
});
```

## 5. SpacetimeDB module (Part 2)

Below are logical definitions. Part 2 translates them into the current TS module syntax (`spacetimedb/server`: `table`, `t`, `schema`, reducers). **VERIFY** the syntax against the 2.x docs. Column names in the module are `snake_case`; the generated bindings expose them in camelCase.

**Who can read what.** *Reporter* = `report.reporter == sender`. *Verified* = a `verification` row with `identity == sender`, the row's property and `state == 'verified'`. *Self* = row identity == sender. *Service* = in `service_identity`.

### 5.1 Tables

| Table | Vis. | Columns (pk first) | Readable by |
|---|---|---|---|
| `property` | public | `id u64 pk autoInc`, `cell_id string` (index), `created_at`, `county_fips string?` (5-digit county FIPS, set by the service; coarse, not PII) | everyone (no PII) |
| `property_private` | private | `property_id pk`, `normalized string` (unique index), `line1`, `city`, `state`, `zip`, `lat f64?`, `lng f64?`, `county_fips string?` | Verified for this property; service |
| `report` | **private** (since 2026-11-08; read via `my_reports`, `my_property_reports`, `svc_reports`) | `id u64 pk autoInc`, `reporter Identity` (index), `property_id` (index), `cell_id` (index), `created_at`, `updated_at`, `status`, `hazard`, `self_danger bool`, `life_safety_csv string`, `overall_level` (default `none`), `usable_frames u8`, `total_frames u8`, `status_reason string?`, `claimed bool`, `source` | the reporter (own reports), a verified owner of the property, the worker (open jobs). Never anyone else |
| `report_private` | private | `report_id pk`, `reporter_secret_hash`, `is_self_report bool`, `address_line1`, `lat f64?`, `lng f64?` (device GPS or geocode), `notes string?` | Reporter of the report; Verified for its property; service |
| `media_asset` | private | `id pk autoInc`, `report_id` (index), `kind 'video'|'image'`, `object_key`, `content_type`, `size_bytes u64`, `sha256`, `uploaded_at` | Verified for the report's property; service |
| `frame` | private | `id pk autoInc`, `report_id` (index), `frame_index u8`, `t_sec f32`, `thumb_key`, `finding_json` (FrameFinding) | Verified; service |
| `assessment` | private | `report_id pk`, `property_id` (index), `json` (DamageAssessment), `created_at` | Verified; service |
| `agent_step` | private | `id pk autoInc`, `report_id` (index), `seq u16`, `kind`, `name`, `summary`, `visibility 'reporter'|'affected'`, `duration_ms u32?`, `at` | Reporter: rows with `visibility='reporter'`. Verified: all rows. Service |
| `verification` | private | `id pk autoInc`, `identity` (index), `property_id` (index), `doc_kind`, `state`, `fail_reason?`, `name_on_doc?`, `secret_hash`, `object_key?` (cleared after the job), `attempt_no u8`, `created_at`, `decided_at?` | Self; service |
| `affected_profile` | private | `id pk autoInc`, `identity` (index), `property_id`, `intake_json` (AffectedIntake), `updated_at` (unique on identity+property) | Self; service |
| `recovery_plan` | private | `id pk autoInc`, `identity` (index), `property_id`, `report_id`, `json` (RecoveryPlan), `created_at` (unique on identity+property+report) | Self; service |
| `coach_message` | private | `id pk autoInc`, `identity` (index), `property_id`, `report_id`, `role`, `text`, `at` | Self; service |
| `area_notice` | public | `id u64 pk autoInc`, `county_fips string` (index), `kind 'nws_alert'\|'fema_declaration'`, `title`, `severity?`, `headline?`, `declaration_string?` (e.g. `DR-4999-TX`), `ih_program_declared bool?`, `source_url?`, `effective_at`, `expires_at?`, `updated_at` | everyone (no PII). Lets **unverified** visitors see NWS alerts and FEMA declarations for their county |
| `area_cell_summary` | public | `cell_id pk`, `report_count_72h u32`, `worst_level`, `hazard_report_count_72h u32`, `severe_hazard_count_72h u32`, `hazard_flags_csv` (empty unless ≥3 reports), `last_report_at` | everyone (aggregated) |
| `job` | private | `id pk autoInc`, `kind 'analyze'|'verify_identity'|'plan'|'coach'`, `report_id u64?`, `property_id u64?`, `verification_id u64?`, `subject Identity?` (for plan/coach), `payload_json`, `state 'queued'|'leased'|'done'|'failed'`, `attempts u8`, `lease_owner Identity?`, `lease_expires_at?`, `last_error?`, `created_at` | Service |
| `service_identity` | private | `identity pk`, `role 'admin'|'worker'` | Service |
| `lease_tick` | scheduled | interval 30 s → `requeue_expired_jobs` | — |
| `area_tick` | scheduled | interval 5 min → `refresh_area_cells` | — |

**`record_area_notices` `notices_json` shape** (epoch ms, camelCase):

```json
[
  { "kind": "nws_alert", "title": "Flash Flood Warning", "severity": "Severe", "headline": "Flash flooding ongoing until 6 PM",
    "sourceUrl": "https://api.weather.gov/alerts/…", "effectiveAt": 1762538400000, "expiresAt": 1762560000000 },
  { "kind": "fema_declaration", "title": "Severe Storms and Flooding", "declarationString": "DR-4999-TX",
    "ihProgramDeclared": true, "sourceUrl": "https://www.fema.gov/disaster/4999", "effectiveAt": 1762300000000 }
]
```

An empty array clears the county's notices. Send the full current list each time (replace semantics).

**Visibility (VERIFIED against `spacetimedb@2.13.0`, implemented in `spacetimedb/src/views.ts`):** private tables stay private, and clients subscribe to **sender-scoped views** (`spacetimedb.view(...)`, evaluated per subscriber with `ctx.sender`) that enforce the "Readable by" column. There's no HTTP fallback: `/api/private/[...]` isn't needed.

| View | Returns (row type of) | Rows |
|---|---|---|
| `my_reports` | `report` | reports the sender submitted |
| `my_property_reports` | `report` | reports on properties the sender is verified for (the affected person's list) |
| `svc_reports` (worker) | `report` | reports tied to open jobs (queued/leased) |
| `my_report_privates` | `report_private` | sender's own reports + reports on properties the sender is verified for |
| `my_verifications` | `verification` | sender's own verification rows (the client reads the matched `property_id` here) |
| `my_property_privates` | `property_private` | properties the sender is verified for |
| `my_media_assets`, `my_frames`, `my_assessments` | `media_asset`, `frame`, `assessment` | reports on properties the sender is verified for |
| `my_agent_steps` | `agent_step` | verified: all steps; reporter of an unverified report: only `visibility='reporter'` steps |
| `my_affected_profiles`, `my_recovery_plans`, `my_coach_messages` | same-named tables | rows with `identity == sender` |

Limitations: view rows reuse the table row types, so `report_private.reporter_secret_hash` and `verification.secret_hash` are visible to whoever can read those rows. They're SHA-256 hashes of client secrets, which is harmless. Private tables are NOT in the client bindings, so the worker can't read them as a client. Instead it subscribes to the **worker-only views** `svc_jobs`, `svc_report_privates`, `svc_property_privates`, `svc_media_assets`, `svc_frames`, `svc_assessments`, `svc_verifications`, `svc_affected_profiles`, `svc_recovery_plans` and `svc_coach_messages` (`spacetimedb/src/views_service.ts`). Each returns rows only to an identity in `service_identity`, and only rows tied to a job whose state is `queued` or `leased`; everyone else gets `[]`. Nobody needs the owner token. **Web-server role:** `service_identity.role` also accepts `'web'` for the Next.js server (`STDB_WEB_TOKEN`, server-only). `isService` (worker reducers + `svc_*`) is `admin`|`worker` only. The `web` role reads three narrow views in `spacetimedb/src/views_web.ts`: `web_report_upload_auth` (`report_id, reporter_secret_hash, status` for uploadable reports), `web_verification_auth` (`verification_id, secret_hash, state, property_id` for pending/verified) and `web_media_index` (`object_key, report_id, property_id` for media and frame keys, never `idv/`). These are the "service read" that §8's presign/media auth uses. Additive module columns not in v1: `report_private.submit_count u8` and `media_asset.round u8`, so a re-shoot after `needs_more_footage` gets a fresh "max 8 images or 1 video" budget. The analyze job's `payload_json` is `{"round": n}`, and the worker should process only media with that round. `create_report` takes one arg, `input_json` (the CreateReportInput JSON). Ids/identities passed to service reducers as strings are 64-char hex. `start_verification` throws `rate_limited` (no row is inserted) when the limit is hit.

### 5.2 Reducers

| Reducer | Caller | Args | Effect / checks |
|---|---|---|---|
| `init` | system | — | Inserts the publisher into `service_identity(admin)`. Schedules `lease_tick` and `area_tick` |
| `admin_add_service` | admin | `identity, role` | |
| `create_report` | anyone | `CreateReportInput` JSON | Light validation. Matches/creates the property (§2.3). Inserts `report` (status `draft`, `claimed` = property already has a verified identity, `source='live'`) and `report_private` |
| `attach_media` | reporter | `report_id, kind, object_key, content_type, size_bytes, sha256` | Status must be `draft` or `needs_more_footage`. Max 8 images or 1 video |
| `submit_report` | reporter | `report_id` | Needs ≥ 1 media. Allowed from `draft`, `needs_more_footage` or `failed`. Status → `queued`. Inserts `job(analyze)` |
| `start_verification` | anyone | `address_json` (NormalizedAddress), `doc_kind`, `secret_hash` | Fails with `rate_limited` if the sender has ≥ `IDV_MAX_ATTEMPTS_PER_HOUR` verifications in the last hour. Matches/creates the property (§2.3) and inserts `verification(pending)` with its `property_id`. The client learns the property id from its own `verification` row (reducers return no data) |
| `submit_verification` | self | `verification_id, object_key` | State must be `pending`. The key must start with `idv/<verification_id>/`. Stores the key. Inserts `job(verify_identity)` |
| `record_verification` | service | `verification_id, ok, fail_reason?, name_on_doc?` | Sets `verified` / `failed`, `decided_at`; clears `object_key`. On ok: `claimed = true` on every report of the property |
| `save_affected_intake` | verified | `property_id, intake_json, report_id?` | Upserts `affected_profile`. Picks `report_id` (default: most severe `assessed` report on the property). Inserts `job(plan)` with `subject = sender`. Error if there's no assessed report |
| `ask_coach` | verified | `property_id, report_id, text` | Needs an existing `recovery_plan`. Inserts `coach_message(user)` + `job(coach)`. Max 1 pending coach job per identity |
| `claim_job` | service | `job_id, lease_ms` | Only if `state='queued'` or the lease has expired. Sets lease. analyze → report `processing`; verify_identity → verification `processing` |
| `record_frame` | service | `report_id, frame_index, t_sec, thumb_key, finding_json` | Upsert by (report_id, frame_index) |
| `record_agent_step` | service | `report_id, seq, kind, name, summary, visibility, duration_ms?` | |
| `record_assessment` | service | `report_id, json, overall_level, usable_frames, total_frames, life_safety_csv` | Stores the assessment. Updates the `report` columns. Status → `needs_more_footage` if `usable_frames*2 < total_frames`, else `assessed`. Updates `area_cell_summary` for the cell |
| `record_recovery_plan` | service | `identity, property_id, report_id, json` | Upsert |
| `record_coach_reply` | service | `identity, property_id, report_id, text` | |
| `complete_job` | service | `job_id, ok, error?` | `ok` → done. Else attempts++ → requeue if < 2, else `failed` (analyze → report `failed` + `status_reason`; verify_identity → verification `failed` / `unreadable`) |
| `requeue_expired_jobs` | scheduled | — | |
| `refresh_area_cells` | scheduled | — | Recomputes `area_cell_summary` from `report` rows with `status='assessed'` created in the last 72 h; deletes empty cells. Also deletes `nws_alert` rows in `area_notice` whose `expires_at` has passed |
| `record_area_notices` | service | `property_id, county_fips, notices_json` | Sets `property.county_fips` (and `property_private.county_fips`) if empty, then **replaces** every `area_notice` row for that county with the list. `county_fips` must be 5 digits. Max 20 notices; strings capped (title 200, headline 400, severity 40, declaration 40, url 500). Called by the worker during `analyze`, after `reverse_geocode`, `lookup_disaster_declarations` and `get_weather_alerts` |

## 6. Repair cost model (Part 3: `packages/damage`, `costModelVersion = "cost-v1"`)

All values are **illustrative defaults** and labeled as such in the UI.

**Two runs.** The `analyze` job runs the model with **assumed defaults** (`homeSqft 1800, stories 1, tenure 'own'`, so `inputs.assumed = true`; the UI shows "assumed home size"). The `plan` job reruns it with the affected person's intake values (`assumed = false`) and stores the result in `RecoveryPlan.cost`. The stored assessment is never modified. They're configurable in `packages/damage/src/costTable.ts`. If a citable public figure is found, cite it in SOURCES.md.

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
  structureCost, contentsCost from the RECOMPUTED plan cost line items for that case (scale line items by the low/high factor)
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

`simulate(profile, cost, intake, declarations, scenario) → { forecast, indicators, gapCents, firstShortfallDay, totalCostOfFundsCents }` is pure, runs in the browser, and finishes in < 20 ms.

## 8. HTTP API

> **Update 2026-11-07 (branch `backend-spacetimedb-brev`, Part 3):** SpacetimeDB is the whole backend. `/api/uploads/presign`,
> `/api/media` and `/api/geocode` are replaced by module functions called over the client's own connection:
> - Upload: `begin_upload({objectKey, contentType, sizeBytes, sha256, chunkCount})`, then `upload_chunk({objectKey, seq, bytes})`
>   for each 512 KiB piece (`useUploadFile()` in `apps/web/lib/stdb/files.ts`). Keys keep their shapes:
>   `media/<reportId>/<sha256>.<ext>` (reporter, while the report accepts footage; ≤ 100 MB video / 15 MB photo),
>   `idv/<verificationId>/<name>` (the person verifying, while pending; ≤ 15 MB), `frames/<reportId>/<n>.jpg` (worker,
>   `put_blob`). `attach_media` and `submit_verification` now require the completed upload.
> - Read: procedure `read_blob({objectKey, seq})` → `{ok, error, part?: {contentType, sizeBytes, chunkCount, seq, bytes}}`
>   (`useReadFile()` / `useFileObjectUrl()`). Worker: anything. Verified resident: `media/` and `frames/` of their property.
>   `idv/` is never readable by a client; `record_verification` deletes it, and unfinished uploads and leftover ID images
>   are purged after 1 hour.
> - Caps (2026-11-08): a report accepts at most 9 media files and 60 MB total per round (a re-shoot gets a fresh budget); a verification accepts at most 3 `idv/` files. Completed `media/` files never attached to a report are purged after 1 hour.
> - Address lookup: procedures `geocode_address({q})` (Census) and `geocode_point({lat, lng})` (Nominatim, 1 request /
>   1.1 s across all users; `error: 'busy'` means retry) → `{ok, error, addressesJson}` (NormalizedAddress[] JSON).


| Method + path | Owner | Auth | Request | Response |
|---|---|---|---|---|
| ~~`GET /api/geocode?q=<address>`~~ **(replaced by the `geocode_address` procedure)** | P2 | none (rate limited per IP) | — | `NormalizedAddress[]` via the US Census Geocoder (`source='census'`) |
| ~~`GET /api/geocode?lat=&lng=`~~ **(replaced by `geocode_point`)** | P2 | none (rate limited, ≤ 1 upstream req/s) | — | `NormalizedAddress[]` via Nominatim reverse (`source='nominatim'`) |
| ~~`POST /api/uploads/presign` (kind `media`)~~ **(replaced by `begin_upload` + `upload_chunk`)** | P4 | `reporterSecret` in the body; the route checks `sha256 == report_private.reporter_secret_hash` via a service read | `{ kind:'media', reportId, reporterSecret, contentType: 'video/mp4'|'video/quicktime'|'image/jpeg'|'image/png'|'image/webp', sizeBytes, sha256 }` | `{ putUrl, objectKey, expiresAt }`. Rejects > 200 MB video / 15 MB image |
| ~~`POST /api/uploads/presign` (kind `idv`)~~ **(replaced by `begin_upload` + `upload_chunk`)** | P4 | `verificationSecret`; checked against `verification.secret_hash`; state must be `pending` | `{ kind:'idv', verificationId, verificationSecret, contentType: 'image/jpeg'|'image/png'|'image/webp', sizeBytes }` | `{ putUrl, objectKey: 'idv/<verificationId>/<uuid>.<ext>', expiresAt }`. Max 15 MB; images only |
| ~~`GET /api/media/[...key]`~~ **(replaced by the `read_blob` procedure)** | P4 | header `x-verification-id` + `x-verification-secret`; the verification must be `verified`, and the key must belong to a report on that verification's property | — | 302 to a presigned GET (10 min). **Always 403 for `idv/` keys.** Reporters have no media access |
| `GET /api/health` | P4 | none | — | `{ ok, web: true, stdb: bool, storage: bool, version }` |
| `GET /api/private/[...]` | P2 | reporter or verification secret | — | **Only if the §5 visibility fallback is chosen.** Returns exactly the rows the "Readable by" column allows |

Object keys: `media/<reportId>/<sha256>.<ext>`, `frames/<reportId>/<frameIndex>.jpg`, `idv/<verificationId>/<uuid>.<ext>` (deleted by the verify job; 1-day lifecycle backstop).

## 9. Worker interfaces (Part 3)

```ts
// apps/worker/src/handlers/types.ts
export interface JobContext {
  job: { id: string; kind: 'analyze' | 'verify_identity' | 'plan' | 'coach';
         reportId?: string; propertyId?: string; verificationId?: string; subject?: string; payload: unknown };
  stdb: ServiceConnection;          // typed reducer calls + service reads from packages/stdb-bindings
  storage: StoragePort;             // from packages/storage (Part 4)
  nim: NimClient;                   // from packages/agent
  log: Logger;                      // never log IdDocumentFields or finance JSON
  step(s: Omit<AgentStep, 'reportId' | 'seq' | 'at'>): Promise<void>; // analyze only: auto seq + record_agent_step
}
export type JobHandler = (ctx: JobContext) => Promise<void>;
// registry (apps/worker/src/handlers/index.ts): analyze, verify_identity (P3) · plan, coach (P4)

// packages/agent/src/tools/types.ts
export interface AgentTool<I, O> {
  name: string;                      // snake_case, matches ARCHITECTURE §6.3
  description: string;               // shown to the model
  input: z.ZodType<I>;               // converted to JSON Schema for `tools`
  output: z.ZodType<O>;
  visibility: 'reporter' | 'affected';  // trace visibility of this tool's steps (all tools: 'affected')
  run(input: I, ctx: JobContext): Promise<O>;
}

// packages/damage (Part 3), also used by Part 4's plan handler
export function estimateRepairCost(args: { componentLevels: Record<Component, DamageLevel>;
  homeSqft?: number; stories?: number; tenure?: 'own'|'rent' }): CostEstimate;   // missing inputs → defaults, assumed=true

// packages/address (Part 2)
export function normalizeAddress(a: Omit<NormalizedAddress,'normalized'>): NormalizedAddress;
export function matchAddresses(a: NormalizedAddress, b: NormalizedAddress): boolean;
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number;
export function cellId(lat: number, lng: number): string;
export function cellBounds(cellId: string): [[number, number], [number, number]];
export function neighborCells(cellId: string, radiusCells: number): string[];

// packages/storage (Part 4)
export interface StoragePort {
  presignPut(key: string, contentType: string, sizeBytes: number): Promise<{ url: string; expiresAt: number }>;
  presignGet(key: string, ttlSec?: number): Promise<string>;
  getObject(key: string): Promise<Buffer>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;     // used by verify_identity in `finally`
  ping(): Promise<boolean>;
}

// packages/finance (Part 4)
export function buildRecoveryPlan(args: { propertyId: string; reportId: string; intake: AffectedIntake;
  profile: FinancialProfile; assessment: DamageAssessment; cost: CostEstimate /* recomputed */ }): RecoveryPlan; // without coachSummary
export function simulate(args: { profile: FinancialProfile; intake: AffectedIntake; cost: CostEstimate;
  declarations: DisasterDeclaration[]; hazard: Hazard; scenario: Scenario }): SimulationResult;
export function getPersona(id: string): FinancialProfile;
export const PERSONAS: FinancialProfile[];
export const planHandler: JobHandler;   // packages/finance/src/jobs/plan-handler.ts
export const coachHandler: JobHandler;  // packages/finance/src/coach/handler.ts
```

## 10. Environment variables (`.env.example`, Part 4)

> **Update 2026-11-07 (branch `backend-spacetimedb-brev`):** no `S3_*`, `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`,
> `NOMINATIM_USER_AGENT` or `CENSUS_GEOCODER_BENCHMARK` (storage and lookup run in the module). The worker adds
> `NEMOTRON_VL_BASE_URL`, `NEMOTRON_AGENT_BASE_URL`, `NEMOTRON_API_KEY` (secret); model defaults
> `nvidia/NVIDIA-Nemotron-Nano-12B-v2-VL-FP8` and `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8`. `STDB_WEB_TOKEN` is unused.


| Name | Used by | Example / note |
|---|---|---|
| `APP_BASE_URL` | web | `https://<domain>` |
| `APP_DOMAIN` | caddy | bare domain for TLS, e.g. `example.tech` |
| `NEXT_PUBLIC_STDB_URI` | web | Maincloud websocket URI (public, not secret) |
| `NEXT_PUBLIC_STDB_MODULE` | web | module/database name |
| `STDB_URI`, `STDB_MODULE` | web (server), worker, scripts | same values |
| `STDB_SERVICE_TOKEN` | worker, web (server routes) | token of the service identity (**secret**) |
| `NVIDIA_API_KEY` | worker | **secret** |
| `NVIDIA_BASE_URL` | worker | `https://integrate.api.nvidia.com/v1` |
| `NEMOTRON_VL_MODEL` | worker | `nvidia/nemotron-nano-12b-v2-vl` (VERIFY) |
| `NEMOTRON_AGENT_MODEL` | worker | VERIFY on build.nvidia.com |
| `S3_ENDPOINT` | web, worker | S3-compatible endpoint (not Vultr-specific), e.g. `https://<host>` |
| `S3_REGION`, `S3_BUCKET` | web, worker | |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | web, worker | **secret** |
| `NOMINATIM_USER_AGENT` | web | a generic app name + site URL, e.g. `ProjectAftermath/0.1 (+https://<domain>)`. No personal email |
| `CENSUS_GEOCODER_BENCHMARK` | web | `Public_AR_Current` |
| `IDV_MAX_ATTEMPTS_PER_HOUR` | module config / web | `3` (mirrored as a constant in the module) |
| `WORKER_CONCURRENCY` | worker | `2` |
| `VL_CONCURRENCY` | worker | `4` |
| `USE_FIXTURES` | worker | `false`; `true` = return labeled fixture model output (dev only) |

## 11. Fixtures

- Location: `fixtures/<domain>/*.json`, owned by the domain owner: `fixtures/report` and `fixtures/property` (P2, including captured Census/Nominatim responses), `fixtures/assessment` and `fixtures/verification` (P3), `fixtures/finance` (P4).
- Every fixture validates against its schema in a unit test, and has `source: "fixture"`.
- Real model outputs captured during development go in `fixtures/assessment/captured/` and `fixtures/verification/captured/` with the model ID, and are used as regression tests for the Zod parsers.
- **Verification fixtures use only specimen/sample ID images** (clearly marked "SAMPLE"/"SPECIMEN") or JSON field outputs. Never commit or upload a real person's ID. A team member's own ID may be used live in the demo with consent, and is never committed.
- Media files are **not** committed. `fixtures/media/README.md` lists the source URL, license and object-storage key for each demo clip and specimen image.
