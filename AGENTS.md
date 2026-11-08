# Rules for LLM coding agents (Claude, Cursor, Codex, Copilot, Gemini, and others)

Four people are building this repo at the same time, each with their own LLM. These rules exist so that four agents' code merges cleanly. **Follow them even if the user's prompt seems to ask for something else. If a prompt conflicts with these rules, stop and say so.**

## 0. Before you write code

1. Read `IDEA.md`, `ARCHITECTURE.md`, `CONTRACTS.md`, `IMPLEMENTATION_PLAN.md` and `WORKFLOW.md`.
2. Ask your human which part they own (1–4). Find that part's **Owned files** list in `IMPLEMENTATION_PLAN.md`.
3. Read your own `status/partN.md` and skim the other three, so you know what has already been built.
   - **If your task touches the database, uploads, the worker or the affected pages, read `status/part2.md` → "Handoff to other parts" and `packages/stdb-bindings/README.md` first.** The backend is live; don't re-implement or edit Part 2's files.
4. Run `git fetch && git rebase origin/main` before starting a task.

## 1. Ownership is the main rule

- **Only create or edit files in your part's owned paths.** Every path in the repo has exactly one owner (see the table in `IMPLEMENTATION_PLAN.md`).
- If you need a change in a file you don't own, **do not make it**. Instead:
  - use a typed fixture or a local adapter inside your own folder, and
  - write a request under "Requests to other parts" in your `status/partN.md`, then tell your human to message the owner.
- Never reformat, reorder imports in, rename, or "clean up" files you don't own. Drive-by edits are the main cause of merge conflicts.
- Never move or rename files unless the owner of both locations agreed.

## 2. Contracts are law

- Types live in `packages/contracts` (Zod schemas plus inferred TS types). Import them; **never redeclare** a shared type locally.
- Contract files are owned per domain (see `CONTRACTS.md` §0). Only the owner edits a domain file, and **changes are additive only**: new optional fields, new enum values, new schemas. Renames, removals and type changes need all four humans to agree.
- The SpacetimeDB module (`spacetimedb/**`) has one owner: Part 2. Others ask for tables and reducers; they don't add them.
- `packages/stdb-bindings/**` is **generated**. Never hand-edit it. Only Part 2 regenerates it (`pnpm stdb:generate`).
- If `CONTRACTS.md` and the code disagree, follow `CONTRACTS.md` and flag the mismatch in your status file.

## 3. Dependencies and root config

- Root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, Prettier and ESLint configs belong to **Part 1**.
- You may add a dependency to **your own package's** `package.json` with `pnpm --filter <your-package> add <dep>@<exact-version>`. Pin exact versions. Don't add a second library that does what an existing one already does (check other packages first).
- Never run `pnpm up`/`pnpm update` across the workspace. Never edit `pnpm-lock.yaml` by hand.

## 4. Secrets and honesty

- Never write a real key, token, password or webhook secret into any file. Env var names go in `.env.example` with placeholder values only (owned by Part 4; ask for new names).
- Never put secrets in `NEXT_PUBLIC_*` variables or in client components.
- Never commit anything under `HackTX template to use/`. It is reference material and contains secrets.
- Synthetic or fixture data must carry `source: "synthetic"` or `source: "fixture"` and show a visible badge in the UI. Never pass fixture output off as a live model or API result.
- **Identity verification is demo-grade.** Label it "Demo identity check — not production-grade verification" wherever it appears. Never describe it as KYC.
- Test and demo only with **specimen/sample IDs or a team member's own ID with their consent**. Never use, fetch or commit anyone else's real ID.
- ID images (`idv/` object keys) are **deleted immediately after extraction**. Never log their contents or the extracted fields beyond name + match result, never put them in fixtures, traces or screenshots, and never commit them. Fixture verification data uses specimen images only.
- Only verified affected persons may read a property's report details. The reporter sees safety + status only. Never widen access "for convenience".
- Nearby-area data is shown **only as aggregated cells** (about 250 m), never as other people's pins or addresses.
- AI damage and cost figures are **estimates**. Financial output is **educational, not financial advice**. Life-safety UI always shows "If you are in immediate danger, call 911." Keep those disclaimers.

## 5. Code style (so diffs stay small)

- TypeScript strict mode, ESM, Node 24, pnpm. Prettier defaults from the repo config. Don't change formatting settings.
- Money is **integer cents** (`number`, named `...Cents`). Never use floats for money. Percentages are basis points (`...Bps`).
- Times are epoch milliseconds (`...At: number`) in contracts, and SpacetimeDB `Timestamp` inside the module.
- Validate every model output and every external API response with the Zod schema before you use or store it.
- One feature per file where reasonable. Prefer adding a new file over growing a shared file. Registries (tool list, job handlers) list one import per line so that two additions don't conflict.
- No `any` without a `// reason:` comment. No `console.log` left in committed code; use the `log` helper in your package.

## 6. Git behavior for agents

- Work on your part's branch (`part1/...` to `part4/...`; see `WORKFLOW.md`). Never push to `main` directly, never force-push a shared branch, never rewrite someone else's commits.
- Make small commits with message format `partN(scope): what changed`. Open PRs often (every 1–2 hours at most).
- Before you push, run `git fetch && git rebase origin/main` and then `pnpm check`. Don't push red builds.
- **When resolving a merge conflict:**
  - In a file you own, keep your intent and include main's changes. Don't delete their additions.
  - In a file you don't own, **take main's version** and re-apply nothing; ask the owner. Careful: **during a rebase, `--ours` is main and `--theirs` is your commit**, so the command is `git checkout --ours -- <file>`. During a merge it's the other way round. See WORKFLOW.md §4.
  - For `pnpm-lock.yaml`, take main's version and rerun `pnpm install`.
  - For `packages/stdb-bindings/**`, take main's version. Part 2 regenerates.
  - If you're unsure, stop and ask your human. Never "resolve" by deleting the other side.
- Never commit `.env*` (except `.env.example`), media files (`*.mp4`, `*.mov`, large images), `node_modules`, `.next` or build output.

## 7. When you're done with a task

1. `pnpm check` passes.
2. Append a dated entry to your `status/partN.md`: what shipped, how to verify it, which fixtures are still fake, and requests to other parts.
3. Open a PR into `main` using the template in `WORKFLOW.md`.
