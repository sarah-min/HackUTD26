# Demo script and submission checklist

Show only what ships. If a step isn't working at demo time, skip it or label the fallback out loud.

## Setup (before judges arrive)

- **Phone** (resident): the site open at `/report/new`, logged into nothing (anonymous identity). The demo clip saved in the camera roll.
- **Laptop** (responder): `/ops` open and registered as a responder ("Dana, County EOC"). Map zoomed to the demo area.
- Run `pnpm tsx scripts/seed-surge.ts --count 300 --stream 180s` about 3 minutes before, so synthetic reports trickle onto the board. Each one shows a **Synthetic** badge.
- Pick a demo persona that produces a visible coverage gap (e.g., the homeowner with flood damage and no flood policy).
- Check `/api/health` is green.

## 3-minute judge demo

| Time | Screen | Action | Say |
|---|---|---|---|
| 0:00 | Laptop | Ops board with hundreds of reports streaming in | "A hurricane just hit. Hundreds of reports are coming in at once. These are synthetic, labeled, to simulate scale." |
| 0:15 | Phone | Report damage: hazard flood, location, 4 people, one elderly, insured homeowners, no flood policy | "A resident reports in under 30 seconds. No account needed." |
| 0:35 | Phone | Upload the 40-second clip | "They just film their home." |
| 0:45 | Phone + Laptop | Live status timeline and agent trace: extracting frames → Nemotron VL per frame → tool calls (cost, FEMA declarations, NWS alerts, recovery plan) | "Nemotron VL reads each frame. Then a Nemotron agent plans its own steps and calls real tools: a cost model, OpenFEMA, the Weather Service, our finance engine. Every step is visible." |
| 1:20 | Phone | Damage report: frames with findings, Major damage, standing-water hazard, cost range with line items | "Code computes the dollar figures, line by line. The model explains them." |
| 1:35 | Laptop | The new report jumps into the queue at P2 with reasons. Click Claim | "On the responder board it's ranked by life safety, severity, vulnerability and wait time. Every reason is shown." |
| 1:45 | Phone | The status changes to "A responder is on it" instantly | "That's SpacetimeDB: one live database, every screen subscribed." |
| 1:55 | Phone | Recovery Navigator: gap, 5 indicators, 90-day forecast with a shortfall day | "Then the money. Flood isn't covered, so here's the real gap and the day their cash runs out." |
| 2:15 | Phone | What-if: drag payout delay, switch to a CD withdrawal + card mix; the chart redraws instantly | "They can test what-ifs, and the cheapest mix is ranked for them." |
| 2:30 | Phone | Ask the coach: "Should I break my CD?" | "And a coach answers grounded in their plan." |
| 2:40 | Laptop | Overlooked lane: a report waiting 35 minutes, and one with unreadable footage | "And nobody falls through. Anyone waiting too long, or whose footage the AI couldn't read, rises here for a human." |
| 2:50 | Either | Disclaimers visible | "These are estimates, not insurance decisions or financial advice. If you're in danger, call 911. We say that on screen." |

## 60-second sponsor variants

- **State Farm:** Start on `/ops`. Show the surge, the ranked queue with reasons, collision-free claiming (two laptops claiming at once, one gets "Already claimed"), and the Overlooked lane. End on how the wait-time component makes stale reports climb.
- **PNC:** Start on the Recovery Navigator. Walk through the 5 indicators, the coverage gap, the forecast with obligations and shortfall day, the what-if simulator and the coach. Mention the synthetic personas spanning checking, savings, CDs, IRA, loans, cards and mortgage.
- **NVIDIA:** Start on the agent trace. Show VL frame findings (structured JSON), then the agent's multi-step tool calls and the validated final output. Point out that the model chooses the tools, code owns the numbers, and invalid output is retried and then routed to a human.
- **Spacetime:** Two screens side by side. Claim on the laptop, the phone updates. Show that triage runs inside the module as a scheduled reducer, and that there's no API server, ORM or websocket code.
- **Vultr / GoDaddy:** Show the live domain over HTTPS, the Vultr VM running web and worker, and footage in Vultr Object Storage via presigned upload.

## Pre-demo smoke checklist

- [ ] `/api/health` reports web, stdb and storage all OK on the production domain
- [ ] A fresh phone (private tab) can create, upload and submit a report
- [ ] Worker logs show job claim → frames → VL → agent → assessment within about 90 s
- [ ] The report appears on `/ops` and claiming updates the phone
- [ ] The Recovery Navigator renders, the what-if updates instantly, and the coach replies
- [ ] The surge seed runs and synthetic badges are visible
- [ ] The Overlooked lane has at least one item
- [ ] Disclaimers and the 911 banner are visible
- [ ] Phone and laptop are charged, there's a hotspot backup, and screen brightness is up

## Fallback plan

1. **Pre-recorded demo video** of the full journey, recorded as soon as the slice works and re-recorded after polish. It's always ready to play.
2. **Cached VL results:** the worker caches findings by frame SHA-256, so re-running the demo clip is fast and survives NVIDIA rate limits.
3. **`USE_FIXTURES=true`:** the worker returns captured fixture output with `source: "fixture"` and a visible **Fixture** badge. Say so out loud. Never present it as live.
4. If SpacetimeDB Maincloud is down, switch to the self-hosted container on the VM (docs/DEPLOYMENT.md).
5. If the domain or HTTPS fails, use the Vultr IP or provider hostname.

## Devpost checklist

- [ ] Public GitHub repo, with no secrets in history (`git log -p | grep -i key` sanity check)
- [ ] Demo video (under the length limit; **VERIFY**) uploaded and linked
- [ ] Description matches shipped behavior. Synthetic and fixture data called out
- [ ] AI coding tools disclosed (which LLMs and agents each member used)
- [ ] Tracks selected (priority: NVIDIA, State Farm, PNC, then Spacetime; plus MLH Vultr and GoDaddy Registry). **VERIFY** the limit
- [ ] All 4 team members added
- [ ] Domain and live URL listed
- [ ] Initial submission by 11:00 PM Saturday; final by 12:00 PM Sunday
