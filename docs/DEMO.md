# Demo script and submission checklist

Show only what ships. If a step isn't working at demo time, skip it or label the fallback out loud.

There are two views and two people (see IDEA.md):

- **Teammate A, the reporter**, on a **phone**. Anyone at the scene: a neighbor, a first responder, a volunteer.
- **Teammate B, the affected person**, on a **laptop**. They verify with **their own ID, with consent**, or a **specimen/sample ID**. Never anyone else's real ID.

Both screens update live from SpacetimeDB.

## Setup (before judges arrive)

- **Phone (A):** the site open at `/`, private tab (fresh anonymous identity). The demo clip saved in the camera roll (public-domain FEMA/NOAA footage or our own recording; source in `fixtures/media/README.md`). Know the exact demo address you'll confirm.
- **Laptop (B):** the site open at `/`, a separate browser profile. B's ID (or the specimen) at hand. The demo address **must match the address on the ID used**. If you use a specimen, use the specimen's printed address as the demo address.
- Pick a demo persona with a visible coverage gap (e.g. a homeowner with flood damage and no flood policy).
- Check that `/api/health` is green, and that dev/prod were prepared per docs/BACKEND_RUNBOOK.md (wipe dev, `pnpm seed:demo` shortly before the demo because the map counts the last 72 hours). Pre-film one other report near the demo address (from a different identity) so the area map has a second cell.

## 3-minute judge demo

| Time | Who | Action | Say |
|---|---|---|---|
| 0:00 | A (phone) | Landing → **Report damage** | "A hurricane just hit. The family has evacuated, but a neighbor is standing in front of the house. Anyone at the scene can report it. No account." |
| 0:10 | A | Hazard: flood. GPS suggests the address; confirm. "Anyone in danger?" No. Note: "water inside to the knee". "Is this your property?" No | "Location, one safety question, done." |
| 0:20 | A | Upload the 40 s clip → status page | "Then they film it." |
| 0:30 | A | Live status: extracting frames → Nemotron VL → agent steps. **Standing water hazard** appears with safety guidance. Overall level: **Major** | "The reporter only gets what they need on scene: hazards, a 911 prompt if needed, and the damage level. Nothing private about the family." |
| 0:50 | B (laptop) | Landing → **I've been affected** → enter the home address | "Now the family, wherever they are." |
| 1:00 | B | Photograph the ID → verifying… → **Verified** | "Nemotron VL reads the ID, and code checks the address matches. The image is deleted right after. It's a demo-grade check, not real KYC." |
| 1:15 | B | Property page: the report from A, plus the **area map** (own pin + shaded cells of nearby reports, FEMA/NWS banner). Flip the toggle to **Hazards** so cells with life-safety hazards light up | "They see every report filed for their home, and what's happening around them, aggregated so neighbors aren't exposed." |
| 1:25 | A (phone) | "My submissions" map: the pin flips to **Claimed** live | "Back on the neighbor's phone, the pin just flipped to claimed. That's SpacetimeDB pushing the change." |
| 1:35 | B | Open the report: frames with findings, cost range with line items, claim-notice draft, agent trace | "The full report: what's damaged, priced line by line by code, and a drafted insurance claim. Every agent step is visible." |
| 2:00 | B | Recovery Navigator intake (4 people, one elderly, homeowners, no flood policy, persona) → plan: gap, 5 indicators, 90-day forecast with a shortfall day | "Flood isn't covered, so here's the real gap and the day their cash runs out." |
| 2:20 | B | What-if: drag the payout delay, switch to a CD + card mix; the chart redraws instantly | "They can test what-ifs. The cheapest mix is ranked." |
| 2:35 | B | Ask the coach: "Should I break my CD?" | "And a coach answers grounded in their plan." |
| 2:50 | Either | Disclaimers visible | "Estimates, not insurance decisions or financial advice. The ID check is a demo. If you're in danger, call 911. It's on screen." |

## 60-second sponsor variants

- **State Farm (partial fit, be honest):** Lead with the hand-off. Anyone at the scene documents damage in about a minute, the evacuated family gets it after verifying, the area map's Hazards mode shows where life-safety hazards cluster, so urgent pockets stand out, hazards trigger a 911 prompt, and a first-notice-of-loss claim is drafted. **Say plainly** that we surface urgent *areas*, but we don't rank individual people or run a coordination dashboard. That part of the prompt is out of our scope. Pitch it as "no one is overlooked because anyone can report for them."
- **PNC:** Start on the Recovery Navigator: the 5 indicators, coverage gap, forecast with obligations and shortfall day, what-if simulator and coach. Mention the synthetic personas spanning checking, savings, CD, IRA, loans, cards and mortgage.
- **NVIDIA:** Start on the agent trace. Nemotron VL is used twice (damage frames → structured findings, and ID documents → extracted fields). Then show the agent's multi-step tool calls (cost, OpenFEMA, NWS, geocode, claim draft, finance) and the validated output. The model picks the tools; code owns numbers and matching.
- **If a judge asks how it stays live across devices:** one sentence. Both browsers talk to SpacetimeDB directly, each only receives rows its views allow, and the reporter's pin flips to Claimed the moment the family verifies. No API server, ORM or websocket code. This is not a separate track pitch.

## Pre-demo smoke checklist

- [ ] `/api/health` reports web and stdb OK on the production domain (storage now lives in SpacetimeDB, so `storage` there may be a no-op)
- [ ] Reporter (fresh private tab): capture → upload → submit works. The status page shows hazards + damage level only (no cost, frames or finances)
- [ ] Worker logs: claim → frames → VL → agent → assessment within about 90 s
- [ ] Affected (separate profile): address → ID photo → **Verified** within about 30 s. The `idv/` blob is gone afterwards (`SELECT * FROM blob` as admin shows no `idv/` keys)
- [ ] An unverified identity cannot open `/affected/report/[id]` or the property page (gating works)
- [ ] A wrong-address ID returns `address_mismatch`, and the 4th attempt within an hour is `rate_limited`
- [ ] Area map shows cells only (no other pins). The reporter map shows only that reporter's pins. The claimed badge flips live
- [ ] Full report: frames, findings, cost lines, hazards, claim draft and trace render
- [ ] Navigator: intake → plan. What-if is instant. The coach replies
- [ ] A dark clip gives `needs_more_footage` with a re-shoot prompt on the reporter page
- [ ] Disclaimers, the 911 banner and the "demo identity check" label are visible
- [ ] Devices charged, hotspot backup, brightness up

## Fallback plan

1. **Pre-recorded demo video** of the full two-person journey, recorded as soon as both slices work. Always ready.
2. **Cached VL results:** findings are cached by frame SHA-256, so the demo clip re-runs fast and survives rate limits.
3. **`USE_FIXTURES=true`:** damage analysis or ID extraction returns captured fixture output with `source: "fixture"` and a visible **Fixture** badge. If VL ID extraction is flaky, use a **fixture verification (labeled)** for the specimen ID. Say so out loud. Never present it as live.
4. If Maincloud is down, use the self-hosted container (docs/DEPLOYMENT.md).
5. If the domain or HTTPS fails, use the Brev provider hostname.

## Devpost checklist

- [ ] Public GitHub repo, with no secrets or ID images in history (`git log -p | grep -i key` sanity check)
- [ ] Demo video (**VERIFY** the length limit) uploaded and linked. Any ID shown is a specimen or blurred
- [ ] Description matches shipped behavior: two views, demo-grade ID check, synthetic and fixture data called out, no claims of multi-report triage
- [ ] AI coding tools disclosed (which LLMs and agents each member used)
- [ ] Tracks selected: **State Farm, PNC and NVIDIA (Nemotron)** only. **VERIFY** the Devpost limit allows three
- [ ] All 4 team members added; domain and live URL listed
- [ ] Initial submission by 11:00 PM Saturday; final by 12:00 PM Sunday
