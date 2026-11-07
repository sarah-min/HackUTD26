# Kickoff prompts

Pull `main`, open your LLM at the repo root, and paste your part's prompt. Each prompt points the agent at the docs and keeps it inside your owned files. When you start a new session later, use the resume prompt. When a rebase stops on a conflict, use the merge-conflict prompt.

The two views, which every prompt repeats:

- **Reporter view:** anyone at the scene films a property and submits it, and sees safety and status only, plus a map of their own submissions.
- **Affected-person view:** the property's resident enters their address, verifies with an ID photo, and then receives the full report, an area map and the Recovery Navigator.

---

## Part 1: Reporter View & Shared UI

```text
You are the coding agent for PART 1 (Reporter View & Shared UI) of a 4-person HackUTD 2026 project.
Two views: (1) Reporter: anyone at the scene films a property and submits it; they see safety + status only, plus a map of their own submissions. (2) Affected person: the resident verifies address + ID and receives the full report, area map and Recovery Navigator.

Before coding, read AGENTS.md, IDEA.md, ARCHITECTURE.md, CONTRACTS.md, IMPLEMENTATION_PLAN.md (sections 2–4 and P1) and WORKFLOW.md, then status/part1.md.
You own ONLY the P1 "Owned files" in IMPLEMENTATION_PLAN.md: root workspace config, the Next.js app config/layout/landing, /report/new, /report/[id] (reporter status), /reporter (My submissions), components/ui, components/report, components/map (<PinMap>, <CellMap>), components/safety (<Banner911>, <HazardList>), lib/brand.ts, lib/format.ts.
Start with task T1.1: push a working pnpm + Next.js 16 + Tailwind + shadcn scaffold within 30 minutes, with `pnpm check` (typecheck, lint, test). Then do T1.2 → T1.15 in order.
The reporter must NEVER see cost, frames, claim drafts or finances. Use labeled fixtures (fixtures/ui, fixtures/property, fixtures/report) for anything P2/P3/P4 hasn't shipped yet.
Never edit files outside your list. If you need something, write it under "Requests to other parts" in status/part1.md and tell me.
Work on a branch part1/<topic>, keep commits small, run `pnpm check` before pushing, and log progress in status/part1.md. Don't run git commit/push yourself unless I ask; give me the commands.
```

## Part 2: Backend & Affected View

```text
You are the coding agent for PART 2 (Backend & Affected View: SpacetimeDB) of a 4-person HackUTD 2026 project.
Two views: (1) Reporter: anyone at the scene films a property and submits it; they see safety + status only. (2) Affected person: the resident verifies address + ID and receives the full report, area map and Recovery Navigator. You build the backend for both and the affected flow.

Before coding, read AGENTS.md, IDEA.md, ARCHITECTURE.md, CONTRACTS.md (§1, §2, §5 are yours), IMPLEMENTATION_PLAN.md (sections 2–4 and P2) and WORKFLOW.md, then status/part2.md.
You own ONLY the P2 "Owned files": spacetimedb/**, contracts common/report/property/index, packages/stdb-bindings (generated), packages/address, apps/web/lib/stdb, /api/geocode, /affected/start, /affected/verify, /affected/property/[propertyId] (NOT recovery/), /affected/report/[id] shell, components/affected.
First hour: T2.1 contracts → T2.3 minimal module published to Maincloud → T2.4 bindings + typed hooks pushed so others can build. Then T2.5: VERIFY how SpacetimeDB 2.x exposes private rows only to the right identity (views keyed on ctx.sender joined to verification), or use the HTTP fallback, and write the result into CONTRACTS.md §5.
Hard rules: reducers are the only write path and check auth first; reducers do no network I/O; an unverified identity must never read frames/assessment/address details; nearby reports only appear as aggregated cells.
Never edit files outside your list; requests go in status/part2.md. Branch part2/<topic>, small commits, `pnpm check` before pushing, log in status/part2.md. Don't run git commit/push yourself unless I ask; give me the commands.
```

## Part 3: AI Pipeline (Nemotron)

```text
You are the coding agent for PART 3 (AI Pipeline: NVIDIA Nemotron) of a 4-person HackUTD 2026 project.
Two views: (1) Reporter: anyone at the scene films a property and submits it. (2) Affected person: the resident verifies address + ID and receives the full report. You turn footage into the damage assessment and ID photos into a verified/failed result.

Before coding, read AGENTS.md, IDEA.md, ARCHITECTURE.md §6, CONTRACTS.md (assessment/agent/verification, cost model, worker interfaces), IMPLEMENTATION_PLAN.md (sections 2–4 and P3) and WORKFLOW.md, then status/part3.md.
You own ONLY the P3 "Owned files": apps/worker/**, packages/agent, packages/vision, packages/damage, contracts assessment/agent/verification, components/agent-trace (<AgentTrace>), components/damage-report (<DamageReport>), fixtures/assessment, fixtures/verification, scripts/smoke-nim.ts, and the two registries.
First hour: T3.1 NIM client + smoke script. VERIFY the exact Nemotron VL and agent model IDs, the image input format and whether native tool calling works. T3.3: a public-domain FEMA image must return a Zod-valid FrameFinding. Post the results in status/part3.md.
Hard rules: code (not the model) computes cost, levels and the address match; no dollar figure may appear unless it came from a tool; delete idv/ objects right after extraction; ID fixtures must be specimen/sample documents only; record every step with ctx.step().
Never edit files outside your list; requests go in status/part3.md. Branch part3/<topic>, small commits, `pnpm check` before pushing. Don't run git commit/push yourself unless I ask; give me the commands.
```

## Part 4: Recovery Navigator & Infra

```text
You are the coding agent for PART 4 (Recovery Navigator & Infra: PNC + Vultr + domain) of a 4-person HackUTD 2026 project.
Two views: (1) Reporter: anyone at the scene films a property and submits it. (2) Affected person: the resident verifies address + ID and receives the full report and your Recovery Navigator. Only verified affected persons ever see finances.

Before coding, read AGENTS.md, IDEA.md, ARCHITECTURE.md §7 and §9, CONTRACTS.md (finance, finance formulas, HTTP API, env), IMPLEMENTATION_PLAN.md (sections 2–4 and P4), WORKFLOW.md and docs/DEPLOYMENT.md, then status/part4.md.
You own ONLY the P4 "Owned files": packages/finance, packages/storage, contracts finance.ts, /affected/property/[propertyId]/recovery/**, components/finance (<RecoverySummaryCard>), /api/uploads, /api/media, /api/health, infra/**, compose/Dockerfiles, .env.example, docs/DEPLOYMENT.md, fixtures/finance.
First hour: T4.1 Vultr VM + bucket + domain started; T4.2 StoragePort; T4.3 presign (kind=media|idv) + media (verified-only, never serve idv/) + health; personas + buildRecoveryPlan against a fixture assessment.
Hard rules: money is integer cents, rates are bps; the engine and simulate() are pure; personas are labeled synthetic; output says "educational, not financial advice"; never put secrets in files or NEXT_PUBLIC vars.
Never edit files outside your list; the worker registry belongs to P3, so ask them to register your plan/coach handlers and build_recovery_plan tool. Branch part4/<topic>, small commits, `pnpm check` before pushing, log in status/part4.md (including the cost ledger). Don't run git commit/push yourself unless I ask; give me the commands.
```

---

## Resume prompt (any part, new session)

```text
Resume work on PART <N>. Re-read AGENTS.md and the P<N> section of IMPLEMENTATION_PLAN.md, then status/part<N>.md (newest first) and skim the other status files for anything that unblocks or affects me. Run `git fetch && git rebase origin/main` (or tell me to), then `pnpm check`. Tell me which task (T<N>.x) is next, what fixtures I'm still using that can now be replaced with real integrations, and any open requests to or from other parts. Then continue with the next task. Only edit my owned files.
```

## Merge-conflict prompt (when a rebase stops)

```text
My rebase onto origin/main stopped with conflicts. Follow WORKFLOW.md §4 exactly. Remember: during a rebase, --ours is main and --theirs is my commit.
For each conflicted file: tell me who owns it (IMPLEMENTATION_PLAN.md). If I own it, merge both sides, keeping main's additions. If I don't own it, take main's version (`git checkout --ours -- <file>`) and list what I need to request from the owner. For pnpm-lock.yaml: take main's and run `pnpm install`. For packages/stdb-bindings/**: take main's. For registries: keep both lines.
Never delete the other side's code to "simplify". Show me the resolution plan before applying it, then run `pnpm check`. Don't continue the rebase or push without my OK.
```
