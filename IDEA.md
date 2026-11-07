# IDEA: Project Aftermath (working name)

Product scope for HackUTD 2026, set Saturday, November 7, 2026. This document describes the intended product, not finished work. Technical design is in [ARCHITECTURE.md](ARCHITECTURE.md), interfaces in [CONTRACTS.md](CONTRACTS.md), and the four-person split in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). If they disagree with this file on *product behavior*, this file wins. On *technical detail*, they win.

## Product promise

After a hurricane, flood, tornado or fire, the damage needs to be documented fast, and the bill that follows is confusing. **Anyone at the scene who can record a 30–60 second video on their phone can use the app.** There are no user categories or roles. Within about a minute, the person recording gets:

- a plain-language damage report (which parts of the property are affected, how badly, and the hazards to watch for),
- an estimated repair-cost range, explained line by line,
- safety guidance, including a "call 911" prompt when the footage or the person indicates immediate danger, and
- a **Recovery Navigator**: the whole financial picture after the disaster, the gap between the likely repair bill and what insurance pays, a 90-day cash forecast, and a what-if simulator for paying the gap (savings, card, loan, CD, aid programs).

The AI never acts silently. Every model call and tool call shows up as a step in a visible run trace, and the report updates live while the agent works.

## Who uses it

Whoever records the video: one kind of user, with no signup. Each browser gets an anonymous SpacetimeDB identity on first visit, and the person recording owns the reports they create. The same report can be opened on a second device (for example a laptop) and updates live.

| Screen | What it does |
|---|---|
| `/report/new` | Capture flow: hazard, location, a few questions, upload the video or photos |
| `/report/[id]` | Live progress, frames with findings, damage report, cost, safety guidance, agent trace |
| `/report/[id]/recovery` | Recovery Navigator: indicators, gap, forecast, options, what-if, coach |

## Main journey (the vertical slice we must ship)

1. The person recording opens the site on a phone → **Report damage**.
2. They pick the hazard type, share location (browser geolocation, or an address they type), and answer quick questions about the property: people in the home, vulnerable members (elderly, under 5, disability, medical device, no transport, pets, limited English; used to tailor safety guidance), "Is anyone in danger right now?", home size and stories, own/rent, and insurance (carrier, policy type, deductible, flood coverage y/n).
3. They pick a **demo financial persona** (synthetic PNC-style accounts; see the defaults below), then upload a video or photos.
4. The report status changes live: *Uploaded → Extracting frames → Analyzing footage (frame 3/8) → Estimating cost → Checking disaster declarations → Building recovery plan → Done*. Each step comes from the agent trace.
5. **Damage report:** key frames with labeled findings, an overall damage level (FEMA scale: none / affected / minor / major / destroyed), hazards with safety guidance, a cost range with line items, and a draft first-notice-of-loss claim summary to send to an insurer.
6. **Recovery Navigator:** health indicators, the coverage gap, a forecast chart, a ranked list of funding options, and the what-if simulator (drag the payout delay, deductible or repair scenario and the forecast redraws instantly), plus "Ask the coach" chat grounded in the plan.
7. The same report open on a laptop updates step by step at the same moment, which shows SpacetimeDB's real-time sync.

## Sponsor fit (what judges must be able to see)

| Sponsor | What their prompt asks | Where it shows up |
|---|---|---|
| **PNC: "360° Financial Health Navigator"** | Whole financial picture; 3+ health indicators; forecast balances and obligations; what-if simulator; conversational coach | Recovery Navigator: 5 indicators, 90-day forecast with obligations, what-if simulator, coach. Disaster recovery is the moment people need this most |
| **NVIDIA: "Nemotron Beyond a Chatbot"** | Multi-step workflows, tool integration, real-world applicability | Nemotron VL reads frames → Nemotron agent plans and calls 8 tools (cost model, OpenFEMA, NWS alerts, geocoding, finance engine, claim draft…) → validated, structured output. Visible trace |
| **Spacetime** | A reactive backend: logic in the DB, real-time sync | All state and server logic live in a SpacetimeDB module. Every screen is a live subscription. One report open on two devices updates in lockstep |
| **State Farm: "The Worst Day, at Scale"** | Identify the most urgent needs, coordinate help, ensure no one is overlooked | Anyone at the scene can document damage in about a minute; automatic life-safety hazard detection with a 911 prompt; an auto-drafted first-notice-of-loss claim summary. **Weaker fit now:** we no longer rank or coordinate many reports, so we don't directly answer "identify the most urgent needs at scale" |
| **Vultr** (MLH) | Best use of Vultr | Vultr VM runs web and worker; Vultr Object Storage holds footage and frames |
| **GoDaddy Registry** (MLH) | Best domain | Production domain via GoDaddy Registry (code `MLHUTD84`) |

**Open question:** whether there's a cap on how many sponsor tracks we can select on Devpost. Check the Hackerpack/Discord. If there's a cap, prioritize **NVIDIA, PNC, Spacetime**, then State Farm; MLH prizes usually don't count toward it.

## Product defaults (decided; don't re-litigate in code)

| Situation | Behavior |
|---|---|
| The person says someone is in danger right now | Show the 911 banner immediately, before upload, and keep it on the report. We are not an emergency service and never say we are |
| Footage shows a life-safety hazard (person trapped, fire, gas, collapse, downed line…) | Show the 911 banner and hazard-specific safety guidance at the top of the report |
| Footage is dark, blurry, or not of a building | Frames are marked `unusable`. If more than half are unusable, set status `needs_more_footage` and ask the person recording to re-shoot or add photos |
| Low AI confidence (< 0.5 overall) | Still show the estimate, labeled "low confidence", with a prompt to add more footage |
| Flood damage and policy is homeowners without flood | The agent flags it: standard homeowners policies typically exclude flood. Navigator assumes $0 dwelling payout for flood unless `floodCovered`. Phrase it as "check your policy", not a determination |
| Cost estimate | Deterministic cost model (CONTRACTS.md §6): low / likely / high, line items shown. The model never invents dollar figures |
| Financial data | Synthetic personas only, labeled "Demo persona". No real bank connections. Output is "educational, not financial advice" |
| Aid programs (FEMA IHP, SBA disaster loans) | Shown as options to *check eligibility*, with a link. Don't invent rates or eligibility |
| Disaster declaration | Queried live from OpenFEMA for the report's county. If there's none, say so. Don't assume one exists |
| Privacy | Exact address, footage, assessment and finances are visible only to the identity that created the report |

## Build priorities (cut from the bottom if behind)

1. **Vertical slice:** upload → frames → Nemotron VL findings → assessment with cost → live report page (Spacetime subscriptions).
2. Deployed on Vultr with HTTPS, with the 911 banner and safety guidance.
3. Nemotron agent tool loop with trace (cost, OpenFEMA, NWS, geocode, claim draft).
4. Recovery Navigator: indicators, gap, forecast, ranked options.
5. What-if simulator (client-side, instant).
6. Coach chat.
7. Polish: claim-notice print view, before/after slider, Spanish UI strings.

## Pitch (draft; 50–55 seconds, claim only what ships)

> After a hurricane, the first hours matter, and the bill that follows can bury a family. With [Product], anyone at the scene films the damage for thirty seconds. NVIDIA Nemotron reads the footage. Then an agent works through it step by step: it finds the damage and any hazards that need a 911 call, prices the repairs, checks for a federal disaster declaration, and drafts the insurance claim. Then it builds a financial recovery plan: what insurance will likely leave uncovered, how cash holds up over the next 90 days, and the cheapest way to close the gap. Every step streams live through SpacetimeDB, so you watch the agent work.

## Demo script

See [docs/DEMO.md](docs/DEMO.md).

## Honesty rules (also in AGENTS.md)

- Label synthetic, fixture and estimated data everywhere they appear.
- AI output is an estimate, not an insurance determination or a damage inspection.
- Don't claim integrations that didn't ship. Devpost text follows the actual code.
- Disaster footage comes from public-domain or properly licensed sources (FEMA/NOAA media are generally US-government public domain), or the team's own recordings. Record every source URL in SOURCES.md.
- Disclose the AI coding tools we used on Devpost.
