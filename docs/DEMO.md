# Demo script and submission checklist

Show only what ships. If a step isn't working at demo time, skip it or label the fallback out loud.

There is one kind of user: **the person recording**, meaning anyone at the scene who records a 30–60 second video of the damage. The demo uses two screens showing **the same report**: a phone (where the person records) and a laptop (where the same report link is open). Both update live from SpacetimeDB.

## Setup (before judges arrive)

- **Phone:** the site open at `/report/new`, logged into nothing (anonymous identity). The demo clip saved in the camera roll (public-domain FEMA/NOAA footage or our own recording; source listed in `fixtures/media/README.md`).
- **Laptop:** ready to open the report link the phone shares after upload (or scan its QR code).
- Pick a demo persona that produces a visible coverage gap (e.g., the homeowner with flood damage and no flood policy).
- Check `/api/health` is green.

## 3-minute judge demo

| Time | Screen | Action | Say |
|---|---|---|---|
| 0:00 | Phone | Landing → Record damage | "A hurricane just hit. Whoever is standing in front of the damage (the owner, a neighbor, a volunteer) can document it in about a minute. No account needed." |
| 0:10 | Phone | Short form: hazard flood, location, 4 people, one elderly, homeowners insurance, no flood policy | "A few quick questions." |
| 0:25 | Phone | Record or upload the 40-second clip | "Then they just film it." |
| 0:35 | Laptop | Open the same report link | "Here's the same report on a laptop." |
| 0:40 | Phone + Laptop | Live status timeline and agent trace, updating on both screens at once: extracting frames → Nemotron VL per frame → tool calls (cost, FEMA declarations, NWS alerts, claim draft, recovery plan) | "Nemotron VL reads each frame. Then a Nemotron agent plans its own steps and calls real tools: a cost model, OpenFEMA, the Weather Service, our finance engine. Every step is visible, and both screens update together. That's SpacetimeDB." |
| 1:15 | Phone | Damage report: frames with findings, Major damage, a standing-water hazard with safety guidance, cost range with line items | "Hazards are flagged automatically with safety guidance and a 911 prompt. Code computes the dollar figures, line by line. The model explains them." |
| 1:35 | Laptop | Claim-notice draft (copy/print) | "It also drafts the first-notice-of-loss summary for the insurance claim." |
| 1:50 | Phone | Recovery Navigator: gap, 5 indicators, 90-day forecast with a shortfall day | "Then the money. Flood isn't covered, so here's the real gap and the day their cash runs out." |
| 2:10 | Phone | What-if: drag payout delay, switch to a CD withdrawal + card mix; the chart redraws instantly | "They can test what-ifs, and the cheapest mix is ranked for them." |
| 2:25 | Phone | Ask the coach: "Should I break my CD?" | "And a coach answers grounded in their plan." |
| 2:40 | Phone | Show a `needs_more_footage` example (dark clip) | "If the footage can't be read, it asks them to re-shoot instead of guessing." |
| 2:50 | Either | Disclaimers visible | "These are estimates, not insurance decisions or financial advice. If you're in danger, call 911. We say that on screen." |

## 60-second sponsor variants

- **State Farm:** Start with the person recording. Show capture in about a minute, automatic life-safety hazard detection with the 911 prompt, and the auto-drafted first-notice-of-loss claim summary. **Be honest:** this is weaker on the "identify those with the most urgent needs at scale" and "coordinate assistance" parts of the prompt, since we don't rank or coordinate many reports. Pitch it as the fast, structured intake that response at scale depends on.
- **PNC:** Start on the Recovery Navigator. Walk through the 5 indicators, the coverage gap, the forecast with obligations and shortfall day, the what-if simulator and the coach. Mention the synthetic personas spanning checking, savings, CDs, IRA, loans, cards and mortgage.
- **NVIDIA:** Start on the agent trace. Show VL frame findings (structured JSON), then the agent's multi-step tool calls and the validated final output. Point out that the model chooses the tools, code owns the numbers, and invalid output is retried and then routed to a re-shoot request.
- **Spacetime:** Two screens on the same report side by side. Upload on the phone and watch frames, trace steps, the assessment and the plan arrive live on both, then send a coach message and see it on both. There's no API server, ORM or websocket code.
- **Vultr / GoDaddy:** Show the live domain over HTTPS, the Vultr VM running web and worker, and footage in Vultr Object Storage via presigned upload.

## Pre-demo smoke checklist

- [ ] `/api/health` reports web, stdb and storage all OK on the production domain
- [ ] A fresh phone (private tab) can create, upload and submit a report
- [ ] Worker logs show job claim → frames → VL → agent → assessment within about 90 s
- [ ] The same report open on the laptop updates live alongside the phone
- [ ] Hazards with safety guidance and the claim-notice draft render
- [ ] The Recovery Navigator renders, the what-if updates instantly, and the coach replies
- [ ] A dark/unreadable clip produces `needs_more_footage` with a re-shoot prompt
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
- [ ] Description matches shipped behavior. Synthetic and fixture data called out. No claims of multi-report triage
- [ ] AI coding tools disclosed (which LLMs and agents each member used)
- [ ] Tracks selected (priority: NVIDIA, PNC, Spacetime, then State Farm; plus MLH Vultr and GoDaddy Registry). **VERIFY** the limit
- [ ] All 4 team members added
- [ ] Domain and live URL listed
- [ ] Initial submission by 11:00 PM Saturday; final by 12:00 PM Sunday
