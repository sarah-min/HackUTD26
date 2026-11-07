# Git workflow and merge-conflict playbook

Four people with four LLMs will produce a lot of code quickly. This workflow keeps `main` always runnable and makes conflicts rare, small and easy to resolve. LLM agents follow the same rules (see [AGENTS.md](AGENTS.md)).

## 1. Branches

| Branch | Purpose |
|---|---|
| `main` | Always builds (`pnpm check` green) and is always deployable. Protected: PRs only, no force-push |
| `partN/<short-topic>` | Your work, e.g. `part3/vl-findings`, `part2/triage-tick`. Short-lived (aim for under 2 hours) |
| `demo/freeze` | Cut from `main` at the 10:30 AM freeze. Only critical fixes, cherry-picked |

Don't keep one giant long-lived `partN` branch. Merge small slices often. A branch that is 6 hours old will conflict.

## 2. Daily loop (every task)

```bash
git switch main && git pull --ff-only
git switch -c part3/agent-tools
# … work, small commits: "part3(agent): add OpenFEMA tool"
git fetch origin && git rebase origin/main      # at least every 30–60 min
pnpm check                                      # typecheck + lint + test must pass
git push -u origin HEAD
gh pr create --fill --base main                 # use the PR template below
```

- **Merge strategy: squash merge.** One commit per PR on `main` keeps history readable and reverts easy.
- **Who merges:** the author merges their own PR once CI is green. It only needs a review if it touches a contract (`packages/contracts/**`, `spacetimedb/**`, `CONTRACTS.md`) or root config. Then the affected owners give a quick 👍.
- After a PR merges, everyone rebases soon: the merger posts in chat `merged: partN/<topic> — <one line>`.

## 3. Why conflicts should be rare here

1. **Single owner per path** (IMPLEMENTATION_PLAN.md). Most conflicts come from two agents editing the same file. Ownership stops that.
2. **Contracts are split by domain file** (`common.ts`, `report.ts`, `assessment.ts`, `agent.ts`, `finance.ts`), and `index.ts` never changes.
3. **JSON columns in SpacetimeDB** for AI and finance payloads, so Parts 3 and 4 rarely need module schema changes.
4. **Registries are one import per line** (`apps/worker/src/handlers/index.ts`, `packages/agent/src/tools/index.ts`). Two additions conflict at most trivially.
5. **Per-part status files** (`status/partN.md`), not one shared STATUS file everyone edits.
6. **Formatting is fixed** at scaffold (Prettier, LF line endings via `.gitattributes`), so LLMs don't create whitespace-only diffs. Run `pnpm format` only on files you own.
7. **Generated files are regenerated, never merged** (see below).

## 4. Resolving a conflict

First, note which side is which:

| Operation | `--ours` | `--theirs` |
|---|---|---|
| `git rebase origin/main` | **main** (the base being rebuilt on) | **your commit** being replayed |
| `git merge origin/main` | **your branch** | **main** |

We use **rebase**, so during conflicts `--ours` = main and `--theirs` = you.

| File kind | Resolution |
|---|---|
| A file **you own** | Keep your intent and include main's changes. Never drop the other side's additions |
| A file **you don't own** | You shouldn't have changed it. Take main's version: `git checkout --ours -- <file>`. Move your need into a request to the owner |
| `pnpm-lock.yaml` | `git checkout --ours -- pnpm-lock.yaml && pnpm install && git add pnpm-lock.yaml` |
| `packages/stdb-bindings/**` | Take main's version (`--ours`). Part 2 runs `pnpm stdb:generate` after merging module changes |
| Registry `index.ts` files | Keep both lines |
| `CONTRACTS.md` | Keep both sections. If the same section conflicts, its owner resolves |
| `status/partN.md` | Only the owner writes it, so it shouldn't conflict. If it does, keep both entries |

Then `git add <files> && git rebase --continue`, run `pnpm check`, and push (`--force-with-lease` is fine **on your own branch only**).

If an LLM proposes resolving by deleting a large block, or "simplifying" the other side, **stop**. Ask the owner in chat. Five minutes of talking beats an hour of lost work.

## 5. Contract changes (the most dangerous kind of PR)

1. The owner opens a PR titled `contract(partN): <change>` that touches only contracts, docs and the minimal code needed to compile.
2. It's additive (new optional field / enum value / schema) unless all four agreed to a breaking change.
3. Ping the channel. It merges as soon as CI is green, and everyone rebases.
4. For SpacetimeDB schema changes, Part 2 republishes the module, regenerates bindings, and states in the PR whether data was wiped (`--delete-data`) so the seed needs rerunning.

## 6. Generated and large files

- `packages/stdb-bindings/**`: committed (so others don't need the spacetime CLI to build), marked `linguist-generated`, regenerated only by Part 2.
- Never commit media, model outputs larger than ~100 KB, `.next`, `dist`, `node_modules`, or `.env*` (except `.env.example`).
- Demo footage lives in object storage. `fixtures/media/README.md` lists it.

## 7. PR template

```markdown
## Part N: <title>
**What:** one or two lines
**How to verify:** command or click path
**Contracts touched:** none | <files> (additive / breaking: agreed by …)
**Fixtures still in use:** …
**Requests to other parts:** …
- [ ] `pnpm check` green  - [ ] only my owned paths changed (or owner approved)  - [ ] status/partN.md updated  - [ ] no secrets
```

## 8. Freeze and release

- From Sunday **10:00 AM**, only demo-critical fixes are allowed. At **10:30 AM**, `demo/freeze` is cut and deployed, and the demo is recorded on it.
- Part 4 deploys `main` after every merge during the build (`infra/deploy.sh`). After the freeze, only `demo/freeze` is deployed.
- Tag the submitted commit: `git tag submission && git push --tags`.
