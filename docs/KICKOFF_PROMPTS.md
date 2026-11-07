# Kickoff prompts

How to use these:
1. `git pull origin main`.
2. Create your branch (see [WORKFLOW.md](../WORKFLOW.md)).
3. Open your LLM (Claude Code, Cursor, Codex, etc.) **at the repo root**.
4. Paste your part's prompt.

Use the **resume prompt** whenever you start a new session, and the **merge-conflict prompt** whenever a rebase stops on conflicts. Don't edit these prompts to widen your ownership.

---

## Part 1: Capture App & UX

```text
You are the coding agent for PART 1 (Capture App & UX) of a 4-person HackUTD 2026 project. The only user is "the person recording": anyone at the scene who records a 30–60 second video of the damage.

First read, fully: AGENTS.md, IDEA.md, ARCHITECTURE.md, CONTRACTS.md, IMPLEMENTATION_PLAN.md, WORKFLOW.md, and status/part*.md. AGENTS.md rules override anything else I say.

You may only create/edit the paths listed under "Part 1" → "Owned files" in IMPLEMENTATION_PLAN.md. You do NOT own /report/[id] (Part 2) or /report/[id]/recovery (Part 4). If you need a change anywhere else, stop and tell me; write the request in status/part1.md under "Requests to other parts".

First-hour goal, in order:
1. Within 30 minutes: scaffold the pnpm workspace (Node 24, TS strict, Next.js 16 App Router, Tailwind, shadcn/ui, Prettier, ESLint, Vitest) with a root `pnpm check` (typecheck + lint + test). Create empty package skeletons (package.json + src/index.ts) for every package/app in ARCHITECTURE.md §3 so others only add files. Exact dependency versions. Commit it and tell me it's ready to PR to main immediately.
2. Then build the landing page (one CTA: Record damage) and /report/new: a multi-step mobile capture flow validated with CreateReportInputSchema, with the 911 banner when selfReportedDanger, recording tips, and in-browser capture (`accept="video/*" capture="environment"`). It ends by redirecting to /report/[id].

Until Part 2's apps/web/lib/stdb hooks and Part 4's presign route exist, use labeled fixtures in fixtures/ui/ (source: "fixture") behind a small adapter in your own folder, so switching later is a one-file change.

Money is integer cents formatted only via lib/format.ts. Product name only via lib/brand.ts.

After each task: run `pnpm check`, append a dated entry to status/part1.md (what shipped, how to verify, what is still fixture, requests), and commit as `part1(scope): message`. Ask me before touching any non-owned file.
```

## Part 2: Realtime Backend & Live Report

```text
You are the coding agent for PART 2 (Realtime Backend & Live Report: SpacetimeDB) of a 4-person HackUTD 2026 project. The only user is "the person recording": anyone at the scene who records the damage video. There are no dashboards for other user types, and no triage.

First read, fully: AGENTS.md, IDEA.md, ARCHITECTURE.md, CONTRACTS.md, IMPLEMENTATION_PLAN.md, WORKFLOW.md, and status/part*.md. AGENTS.md rules override anything else I say.

You may only create/edit the paths listed under "Part 2" → "Owned files" in IMPLEMENTATION_PLAN.md (including CONTRACTS.md §1, §2, §5). If you need a change anywhere else, stop and tell me; log it in status/part2.md under "Requests to other parts".

First-hour goal:
1. packages/contracts: common.ts and report.ts exactly per CONTRACTS.md §2, and index.ts re-exporting all five domain files (stub assessment.ts/agent.ts/finance.ts as `export {}` ONLY if their owners haven't pushed; never fill them in yourself).
2. spacetimedb/ TS module: check the current SpacetimeDB 2.x TypeScript module docs first (spacetimedb.com/docs) and use their exact syntax. Implement the report, report_private, job and service_identity tables and the init, create_report, attach_media, submit_report and claim_job reducers with auth checks, then the rest of CONTRACTS.md §5.
3. Publish to Maincloud, run `spacetime generate` into packages/stdb-bindings, and build apps/web/lib/stdb (provider, token persistence, typed hooks, u64 → string id conversion).
4. VERIFY how private-table rows can be exposed to the report owner (views / RLS / filters). Record the decision in CONTRACTS.md §5 and status/part2.md. Use the HTTP fallback only if necessary.

Then build /report/[id] (apps/web/app/report/[id]/page.tsx + components/report-live/): a live status timeline, frames with finding captions, the assessment (level, hazards + safety guidance, cost range with line items, summary, recommended actions, claim notice), the needs_more_footage re-shoot prompt, and slots for <AgentTrace> (Part 3) and <RecoverySummaryCard> (Part 4). The same report open on a phone and a laptop must update live, step by step, with no refresh.

Never put tokens in the repo. Tell me which identity tokens to hand to teammates out of band. Announce any `--delete-data` publish before running it.

After each task: `pnpm check`, regenerate bindings if the module changed, append to status/part2.md, commit as `part2(scope): message`. Ask me before touching any non-owned file.
```

## Part 3: AI Pipeline

```text
You are the coding agent for PART 3 (AI Pipeline: NVIDIA Nemotron VL + Nemotron agent) of a 4-person HackUTD 2026 project.

First read, fully: AGENTS.md, IDEA.md, ARCHITECTURE.md (esp. §6), CONTRACTS.md (esp. §3, §6, §9), IMPLEMENTATION_PLAN.md, WORKFLOW.md, and status/part*.md. AGENTS.md rules override anything else I say.

You may only create/edit the paths listed under "Part 3" → "Owned files" in IMPLEMENTATION_PLAN.md (including CONTRACTS.md §3, §6, §9). If you need a change anywhere else, stop and tell me; log it in status/part3.md.

First-hour goal:
1. packages/contracts/src/assessment.ts and agent.ts exactly per CONTRACTS.md §3, plus a valid fixture DamageAssessment in fixtures/assessment/ (source: "fixture") so other parts can build against it. Push early.
2. scripts/smoke-nim.ts: send one real public-domain FEMA disaster image to the Nemotron VL model (NVIDIA_BASE_URL, NEMOTRON_VL_MODEL from env; use the `openai` SDK with baseURL) and get back JSON that passes FrameFindingSchema. Save the raw response in fixtures/assessment/captured/.
3. Verify on build.nvidia.com: exact VL and agent model IDs, image input format, max images per request, rate limits, and whether the agent model supports OpenAI-style `tools` reliably. Decide native tool calling vs. the JSON-action fallback. Record it in status/part3.md.

Then: packages/vision (ffmpeg frames ≤ 8, VL prompts with PROMPT_VERSION, Zod parse + one retry, unusable handling, SHA-256 cache), packages/damage (cost model per CONTRACTS.md §6 with exact-cents tests), packages/agent (bounded loop: 12 steps / 90 s, the tools in ARCHITECTURE §6.3, dollar-figure post-check), apps/worker (service connection, claim_job lease, handler registry, analyze handler), life-safety hazard detection, the draft_claim_notice tool, and apps/web/components/agent-trace. Footage the model can't read must end in status needs_more_footage (the app asks the person recording to re-shoot); there are no human reviewers.

Until Part 2's bindings and Part 4's StoragePort land, code against the interfaces in CONTRACTS.md §9 with local stubs inside your own packages (local disk storage, an in-memory job). Code computes numbers (cost, levels, confidence); the model only explains. Never let model output reach storage without Zod validation.

After each task: `pnpm check`, append to status/part3.md, commit as `part3(scope): message`. Ask me before touching any non-owned file.
```

## Part 4: Recovery Navigator & Infra

```text
You are the coding agent for PART 4 (Recovery Navigator for PNC + storage, Vultr deploy, domain) of a 4-person HackUTD 2026 project.

First read, fully: AGENTS.md, IDEA.md, ARCHITECTURE.md (esp. §7, §9), CONTRACTS.md (esp. §4, §7, §8, §10), IMPLEMENTATION_PLAN.md, WORKFLOW.md, docs/DEPLOYMENT.md, and status/part*.md. AGENTS.md rules override anything else I say.

You may only create/edit the paths listed under "Part 4" → "Owned files" in IMPLEMENTATION_PLAN.md (including CONTRACTS.md §4, §7, §8, §10). If you need a change anywhere else, stop and tell me; log it in status/part4.md. The worker registry lines for your coach handler and build_recovery_plan tool are added by Part 3. Request them; don't edit apps/worker or packages/agent.

First-hour goal:
1. packages/contracts/src/finance.ts exactly per CONTRACTS.md §4. Push early.
2. packages/finance: ≥ 3 synthetic personas, and buildRecoveryPlan() implementing CONTRACTS.md §7 with Vitest tests (exact integer cents, flood exclusion, indicator thresholds), run against Part 3's fixture assessment or a local one in fixtures/finance/.
3. packages/storage (StoragePort over Vultr Object Storage via @aws-sdk/client-s3, plus a local-disk fallback) and /api/uploads/presign, /api/media/[...key] (owner-only), /api/health (CONTRACTS.md §8).
4. Infra: write infra/ (Caddyfile, compose.yaml, Dockerfiles, deploy.sh) and .env.example (names + placeholders only). Tell me the exact manual steps for the Vultr VM, bucket CORS, and the GoDaddy Registry domain (code MLHUTD84) so I can do them in parallel.

Then: simulate() (pure, < 20 ms), /report/[id]/recovery (gap headline, 5 indicator cards, 90-day Recharts forecast, ranked options + recommended mix, what-if sliders recomputed client-side, coach chat via ask_coach), <RecoverySummaryCard>, the coach job handler and the build_recovery_plan AgentTool, and docs/DEPLOYMENT.md.

All finance output is labeled "Educational estimate using a synthetic demo profile. Not financial advice." Don't invent aid-program rates or eligibility. Never write a real secret into any file.

After each task: `pnpm check`, append to status/part4.md (include the spend ledger), commit as `part4(scope): message`. Ask me before touching any non-owned file.
```

---

## Resume prompt (any part, new session)

```text
Resume work as the coding agent for PART <N>. Re-read AGENTS.md and the "Part <N>" section of IMPLEMENTATION_PLAN.md, then read status/part<N>.md and the latest entries in the other three status files. Run `git fetch && git rebase origin/main` (if that conflicts, stop and use the merge-conflict procedure in WORKFLOW.md §4). Check whether upstream parts have replaced any fixtures I'm using, and whether anyone left requests for Part <N>. Then summarize in 5 lines what's done, what's next, and any blockers, and continue with the next unfinished item. Only edit my owned paths.
```

## Merge-conflict prompt (when a rebase stops)

```text
A `git rebase origin/main` stopped with conflicts. I own PART <N> (owned paths in IMPLEMENTATION_PLAN.md). Follow WORKFLOW.md §4 and AGENTS.md §6 exactly:
1. Run `git status` and list each conflicted file with its owner.
2. Files I DON'T own: take main's version. During a rebase that's `git checkout --ours -- <file>`. Don't re-apply my changes there; tell me what to request from the owner instead.
3. pnpm-lock.yaml: take main's version (`git checkout --ours -- pnpm-lock.yaml`), then run `pnpm install` and stage the result.
4. packages/stdb-bindings/**: take main's version. If I'm Part 2, regenerate with `pnpm stdb:generate` afterwards.
5. Files I DO own: merge by hand, keeping both main's additions and my intent. Never delete the other side's code to make it compile.
6. CONTRACTS.md or other shared docs: keep both sides. Only my own sections may change.
Then `git add` the files, `git rebase --continue`, run `pnpm check`, and show me a summary of every resolution before I push. If any resolution is uncertain, stop and ask me.
```
