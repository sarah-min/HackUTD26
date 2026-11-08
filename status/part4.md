# Part 4: Recovery Navigator & Infra: status log

Owner: Roselyn. Append-only, newest entry first. Format is in [STATUS.md](../STATUS.md). Only this part's owner (and their LLM) edits this file.

## 2026-11-07 15:14: Grok Bot + automation kit (local skill; no PR yet)

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

## Requests to other parts (open)

- none yet

## Cost ledger

| When | Service | Item | Amount | Credit or cash |
|---|---|---|---|---|
