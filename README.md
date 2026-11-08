# Aftermath 

**Anyone can film the damage. The family who lives there gets the help.**

The product has two interfaces:

- **Reporter view:** anyone at the scene (a neighbor, a first responder, a volunteer, or even the tenant themselves) records a 30–60 second phone video of a damaged property and submits it. They see only safety and status: live processing, the overall damage level, and a map of submissions that they've filmed.
- **Affected-person view:** the person whose property it is chooses "I've been affected", enters their address, and verifies their identity with an ID photo. Nemotron confirms that the address matches. They then get all pertinent information for their property: the full damage report, the repair-cost estimate, a draft insurance claim, an area map of nearby reports, and a financial Recovery Navigator.

Behind the scenes, Nemotron VL reads the footage to analyze the damage and another Nemotron agent calls tools (cost model, OpenFEMA, NWS alerts, geocoding, claim draft, finance engine) to assist in the examination and recovery. Everything lives in a SpacetimeDB backend and streams live to both views.

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
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hosting (Brev), Maincloud, HTTPS | Part 4, and anyone deploying |

## Sponsors we are targeting

We are submitting to exactly three tracks: **State Farm, PNC and NVIDIA (Nemotron)**. SpacetimeDB is still our whole backend, but Spacetime, Vultr and GoDaddy Registry are **not** submission tracks.

| Sponsor | Challenge | How we answer it |
|---|---|---|
| **PNC** | "360° Financial Health Navigator": one clear view of the whole financial picture and the next move | Recovery Navigator: 3+ health indicators, 90-day balance forecast, "what-if" funding simulator, coach |
| **NVIDIA** | "Use Nemotron Beyond a Chatbot": multi-step workflows, tool integration, real-world use | Nemotron VL on damage frames **and** ID documents, plus a Nemotron agent loop over tools, with a visible run trace |
| **State Farm** | "The Worst Day, at Scale" | Anyone at the scene can report for an evacuated family; verified hand-off to the resident; area map highlighting where life-safety hazards cluster; hazard detection + 911 prompt; auto-drafted claim summary. Partial fit: no per-person ranking or coordination dashboard (see IDEA.md) |

## Quick start (after Part 1 publishes the scaffold)

```bash
pnpm install
cp .env.example .env.local        # fill values from the team password manager, never commit
pnpm dev                          # web on :3000
pnpm --filter @hack/worker dev    # AI worker
pnpm check                        # typecheck + lint + tests; run before every push
```
