# IDEA: Project Aftermath (working name)

Product scope for HackUTD 2026, set Saturday, November 7, 2026. This document describes the intended product, not finished work. Technical design is in [ARCHITECTURE.md](ARCHITECTURE.md), interfaces in [CONTRACTS.md](CONTRACTS.md), and the four-person split in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). If they disagree with this file on *product behavior*, this file wins. On *technical detail*, they win.

## Product promise

After a hurricane, flood, tornado or fire, thousands of people need help at once, and each of them faces a large, confusing bill. Our app has two sides that share one live backend:

1. **For the affected person:** record a 30–60 second video of the damage on your phone. Within about a minute you get:
   - a plain-language damage report (which parts of the home are affected, how badly, and the hazards to watch for),
   - an estimated repair-cost range, explained line by line,
   - your place in the help queue, plus safety guidance, and
   - a **Recovery Navigator**: your whole financial picture after the disaster, the gap between the likely repair bill and what insurance pays, a 90-day cash forecast, and a what-if simulator for paying the gap (savings, insurance advance, card, loan, CD, aid programs).
2. **For responders and insurers:** a live, shared dashboard that ranks every incoming report by urgency. Life-safety signals come first, then severity, vulnerability and time waited. Responders claim reports without double-booking, and a dedicated lane surfaces anyone who has waited too long or whose footage the AI couldn't read. **No one is overlooked.**

The AI never acts silently. Every model call and tool call shows up as a step in a visible run trace.

## Users

| User | Needs | Main screens |
|---|---|---|
| **Affected resident** (homeowner or renter) | Report damage fast, know they are in the queue, understand cost and the money plan | `/report/new`, `/report/[id]`, `/report/[id]/recovery` |
| **Responder / adjuster / volunteer coordinator** | See who needs help most, right now; coordinate without collisions; catch people who slip through | `/ops`, `/ops/report/[id]` |
| **Judges** | See real AI on real footage, scale, a real-time feel, and the money plan | Both, plus the agent trace |

There is no account signup. Residents get an anonymous SpacetimeDB identity on first visit, stored in the browser. Responders join with a team join code. This keeps the demo fast and avoids building auth.

## Main journey (the vertical slice we must ship)

1. Resident opens the site on a phone → **Report damage**.
2. They pick the hazard type, share location (browser geolocation, or an address they type), and answer quick household questions: people in the home, vulnerable members (elderly, under 5, disability, medical device, no transport, pets, limited English), "Are you in danger right now?", home size and stories, and insurance (carrier, policy type, deductible, flood coverage y/n).
3. They pick a **demo financial persona** (synthetic PNC-style accounts; see the defaults below), then upload a video or photos.
4. The report status changes live: *Uploaded → Extracting frames → Analyzing footage (frame 3/8) → Estimating cost → Checking disaster declarations → Building recovery plan → Done*. Each step comes from the agent trace.
5. **Damage report:** key frames with labeled findings, an overall damage level (FEMA scale: none / affected / minor / major / destroyed), hazards, and a cost range with line items.
6. **Queue status:** "Your report is Priority 2 (urgent). A responder has been notified." Their status updates live when a responder claims the report.
7. **Recovery Navigator:** health indicators, the coverage gap, a forecast chart, a ranked list of funding options, and the what-if simulator (drag the payout delay, deductible or repair scenario and the forecast redraws instantly), plus "Ask the coach" chat grounded in their plan.
8. At the same moment, the **ops dashboard** on a laptop shows the new report pop onto the map and into the ranked queue, among hundreds of synthetic reports from a simulated surge. A responder claims it, and the resident's phone updates.

## Sponsor fit (what judges must be able to see)

| Sponsor | What their prompt asks | Where it shows up |
|---|---|---|
| **State Farm: "The Worst Day, at Scale"** | Find those with the most urgent needs, coordinate help, ensure no one is overlooked | Ranked triage queue with explainable reasons; the *Overlooked* lane (waiting too long, or unreadable footage needing human review); collision-free claiming; surge simulation with 300+ reports; map clusters |
| **PNC: "360° Financial Health Navigator"** | Whole financial picture; 3+ health indicators; forecast balances and obligations; what-if simulator; conversational coach | Recovery Navigator: 5 indicators, 90-day forecast with obligations, what-if simulator, coach. Disaster recovery is the moment people need this most |
| **NVIDIA: "Nemotron Beyond a Chatbot"** | Multi-step workflows, tool integration, real-world applicability | Nemotron VL reads frames → Nemotron agent plans and calls 8 tools (cost model, OpenFEMA, NWS alerts, geocoding, finance engine, claim draft…) → validated, structured output. Visible trace |
| **Spacetime** | A reactive backend: logic in the DB, real-time sync, multiplayer | All state and server logic live in a SpacetimeDB module. Triage is recomputed inside the module by a scheduled reducer. Every screen is a live subscription. Multiple responders see the same board |
| **Vultr** (MLH) | Best use of Vultr | Vultr VM runs web and worker; Vultr Object Storage holds footage and frames |
| **GoDaddy Registry** (MLH) | Best domain | Production domain via GoDaddy Registry (code `MLHUTD84`) |

**Open question:** whether there's a cap on how many sponsor tracks we can select on Devpost. Check the Hackerpack/Discord. If there's a cap, prioritize **NVIDIA, State Farm, PNC**, then Spacetime; MLH prizes usually don't count toward it.

## Product defaults (decided; don't re-litigate in code)

| Situation | Behavior |
|---|---|
| Resident says "I'm in danger right now" | Show the 911 banner immediately, before upload. The report goes to P1 regardless of the AI. We are not an emergency service and never say we are |
| Footage is dark, blurry, or not of a building | Frames are marked `unusable`. If more than half are unusable, set status `needs_review`. The report appears in the Overlooked lane, and we ask the resident for photos |
| Low AI confidence (< 0.5 overall) | Still show the estimate, labeled "low confidence". Report goes to the review lane |
| Flood damage and policy is homeowners without flood | The agent flags it: standard homeowners policies typically exclude flood. Navigator assumes $0 dwelling payout for flood unless `floodCovered`. Phrase it as "check your policy", not a determination |
| Cost estimate | Deterministic cost model (CONTRACTS.md §7): low / likely / high, line items shown. The model never invents dollar figures |
| Triage score | Deterministic formula in the SpacetimeDB module (CONTRACTS.md §6). The model supplies findings; code decides priority. Reasons are always shown |
| Waiting | Every unassigned report gains priority with time waited, so no one sinks forever |
| Financial data | Synthetic personas only, labeled "Demo persona". No real bank connections. Output is "educational, not financial advice" |
| Aid programs (FEMA IHP, SBA disaster loans) | Shown as options to *check eligibility*, with a link. Don't invent rates or eligibility |
| Disaster declaration | Queried live from OpenFEMA for the report's county. If there's none, say so. Don't assume one exists |
| Privacy | Public tables hold only coarse location and non-identifying triage fields. Exact address, contact details, footage and finances are visible only to the owner (and to assigned responders for address and contact) |
| Synthetic surge reports | Always `source: "synthetic"`, with a visible badge on the ops board. The live demo report is the only `live` one |

## Build priorities (cut from the bottom if behind)

1. **Vertical slice:** upload → frames → Nemotron VL findings → assessment with cost → live report page and ops queue (Spacetime subscriptions).
2. Deterministic triage, scheduled recompute and responder claiming. Deployed on Vultr with HTTPS.
3. Nemotron agent tool loop with trace (cost, OpenFEMA, NWS, geocode, claim draft).
4. Recovery Navigator: indicators, gap, forecast, ranked options.
5. What-if simulator (client-side, instant).
6. Synthetic surge seeding with the Overlooked lane and map.
7. Coach chat.
8. Polish: claim-notice PDF/print view, map clustering, before/after slider, Spanish UI strings.

## Pitch (draft; 50–55 seconds, claim only what ships)

> When a hurricane hits, tens of thousands of people need help on the same day, and each of them is staring at a bill they can't make sense of. With [Product], you film your home for thirty seconds. NVIDIA Nemotron reads the footage. Then an agent works through it step by step: it finds the damage and the hazards, prices the repairs, checks for a federal disaster declaration, and builds your financial recovery plan. That covers what insurance will likely leave uncovered, how your cash holds up over the next 90 days, and the cheapest way to close the gap. At the same moment, responders see every report live on one board, powered by SpacetimeDB. The most urgent people are ranked first, and anyone who's been waiting too long rises to the top. Nobody gets overlooked.

## Demo script

See [docs/DEMO.md](docs/DEMO.md).

## Honesty rules (also in AGENTS.md)

- Label synthetic, fixture and estimated data everywhere they appear.
- AI output is an estimate, not an insurance determination or a damage inspection.
- Don't claim integrations that didn't ship. Devpost text follows the actual code.
- Disaster footage comes from public-domain or properly licensed sources (FEMA/NOAA media are generally US-government public domain), or the team's own recordings. Record every source URL in SOURCES.md.
- Disclose the AI coding tools we used on Devpost.
