# Project Aftermath (working name)

**Film the damage. Understand it in a minute. Know how you'll pay for it.**

Anyone at the scene of a natural disaster records a 30–60 second phone video of the damage. A Nemotron vision model reads the footage. A Nemotron agent then works through several steps with tools: it identifies damage and life-safety hazards, estimates repair cost, checks disaster declarations and weather alerts, drafts an insurance claim summary, and builds a financial recovery plan. All of this is written to a SpacetimeDB backend, so the report updates live, step by step, on every device that has it open.

> "Project Aftermath" is a placeholder. The UI must read the product name from `apps/web/lib/brand.ts`, so renaming takes one edit. The domain is also TBD (GoDaddy Registry, code `MLHUTD84`).

## Read in this order

| File | What it is | Who must read it |
|---|---|---|
| [AGENTS.md](AGENTS.md) | **Rules for every LLM coding agent**: ownership, git, no secrets, merge-conflict behavior | Every human, and every LLM, before writing any code |
| [IDEA.md](IDEA.md) | Product, users, sponsor fit, defaults, demo and pitch | Everyone |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, data flow, pipeline, deployment | Everyone |
| [CONTRACTS.md](CONTRACTS.md) | Shared types, SpacetimeDB tables/reducers, HTTP routes, env vars, formulas | Everyone; implement it exactly |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | The four parts, **file ownership**, handoffs, checkpoints | Everyone; this decides who owns which files |
| [WORKFLOW.md](WORKFLOW.md) | Branching, PRs, merge-conflict playbook, generated files, lockfile | Everyone before the first push |
| [STATUS.md](STATUS.md) + `status/partN.md` | Live progress log, one append-only file per part | Update after every merged PR |
| [SOURCES.md](SOURCES.md) | Sponsor prompts, API docs, data sources, what's verified and what isn't | Whoever touches an integration |
| [docs/KICKOFF_PROMPTS.md](docs/KICKOFF_PROMPTS.md) | Copy-paste first prompt for each part's LLM | Each owner at kickoff |
| [docs/DEMO.md](docs/DEMO.md) | Demo script, judge checklist, Devpost notes | Everyone near the end |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vultr, object storage, Maincloud, domain, HTTPS | Part 4, and anyone deploying |

## Sponsors we are targeting

| Sponsor | Challenge | How we answer it |
|---|---|---|
| **PNC** | "360° Financial Health Navigator": one clear view of the whole financial picture and the next move | Recovery Navigator: 3+ health indicators, 90-day balance forecast, "what-if" funding simulator, coach |
| **NVIDIA** | "Use Nemotron Beyond a Chatbot": multi-step workflows, tool integration, real-world use | Nemotron VL over video frames, plus a Nemotron agent loop over 8 tools, with a visible run trace |
| **Spacetime** | The reactive backend: tables, functions, auth, sync | The whole backend is a SpacetimeDB module. Every screen is a live subscription; one report on two devices updates in lockstep |
| **State Farm** | "The Worst Day, at Scale" | Anyone at the scene documents damage in a minute; life-safety hazard detection + 911 prompt; auto-drafted claim summary. Weaker fit: no multi-report triage (see IDEA.md) |
| **Vultr** (MLH) | Best use of Vultr | Web and worker on a Vultr VM; footage on Vultr Object Storage |
| **GoDaddy Registry** (MLH) | Best domain | Production domain registered via GoDaddy Registry |

## Quick start (after Part 1 publishes the scaffold)

```bash
pnpm install
cp .env.example .env.local        # fill values from the team password manager, never commit
pnpm dev                          # web on :3000
pnpm --filter @hack/worker dev    # AI worker
pnpm check                        # typecheck + lint + tests; run before every push
```

## Deadlines (from the opening ceremony; confirm in the Hackerpack)

- Initial Devpost: **Sat 11:00 PM**
- Final Devpost, code freeze: **Sun 12:00 PM** (our internal freeze is **10:30 AM**)
- Judging: Sun 1:00–4:00 PM
