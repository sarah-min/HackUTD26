# IDEA: Project Aftermath (working name)

Product scope for HackUTD 2026, set Saturday, November 7, 2026. This document describes the intended product, not finished work. Technical design is in [ARCHITECTURE.md](ARCHITECTURE.md), interfaces in [CONTRACTS.md](CONTRACTS.md), and the four-person split, with a screen-by-screen breakdown, in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). If they disagree with this file on *product behavior*, this file wins. On *technical detail*, they win.

## Product promise

After a hurricane, flood, tornado or fire, the people closest to the damage are often not the people who own it: a first responder walking a street, a neighbor, a volunteer, a passer-by. Meanwhile the family who lives there may have evacuated. The product separates those two people:

- **Anyone at the scene** can record a 30–60 second video of a damaged property and submit it. That's the **reporter**.
- **The person whose property it is** proves who they are and where they live, and then receives everything: the damage report, the repair-cost estimate, safety guidance, a draft insurance claim summary, and a financial Recovery Navigator. That's the **affected person**.

The reporter never sees the affected person's report details or finances. The affected person never needs to know who filmed their home. The AI never acts silently: every model and tool call appears in a visible run trace.

## The two views

### Reporter view (anyone at the scene)

| What they do | What they see |
|---|---|
| Open the site → **"Report damage"** | A short capture flow |
| Choose the hazard type; the phone's GPS suggests the street address, which they confirm or correct | The address they confirmed |
| Answer "Is anyone in danger right now?" and add optional notes ("elderly man on porch", "water still rising") | The 911 banner appears immediately if they say yes |
| Record or upload a 30–60 s video, or photos | Upload progress |
| After submitting | **Safety + status only:** live processing status, any life-safety hazards found in the footage with the 911 banner (they're on scene), and the overall damage level. They also see a note: "The resident can find this report by visiting [site] and choosing *I've been affected*." |
| **"My submissions"** | A **map and list** of every property this browser has filmed. Each pin is colored by damage level, with a badge showing whether the affected person has claimed the report yet. Useful for a responder walking a block |

The reporter does **not** see the cost breakdown, frames with findings, claim draft, finances, or anything about the affected person.

### Affected-person view (the person whose property it is)

| Step | What happens |
|---|---|
| 1. Open the site → **"I've been affected"** | |
| 2. **Enter your home address** | Autocomplete/geocode to a normalized address |
| 3. **Verify your identity and address** | Photograph a government ID (driver's license or state ID). Nemotron VL reads the name and address. Code checks that the ID's address matches the address you entered. If the ID shows an old address, a second document (utility bill or insurance declarations page) can be used. The ID image is **deleted right after the check**; we keep only the name, the match result and the time. Labeled: *"Demo identity check — not production-grade verification."* |
| 4. **Verified → your property** | All reports filed for your address, newest first, each with a photo, damage level, hazard and time. **"Recent reports in your area"** shows a map of your property pin plus nearby reports from the last 72 hours within about 1 km, aggregated into map cells (count and worst damage level) so neighbors' homes aren't individually exposed. Active NWS weather alerts and any FEMA disaster declaration for your county appear too |
| 5. **Open a report** | The full damage report: key frames with findings, overall damage level, hazards with safety guidance (tailored by the household details you give), a cost range with line items, and a draft first-notice-of-loss claim summary to send to your insurer. Plus the agent trace |
| 6. **Recovery Navigator** | You answer a few questions: household (people, vulnerable members), own/rent, home size, insurance (policy type, deductible, flood coverage) and a **demo financial persona** (synthetic PNC-style accounts). You get health indicators, the coverage gap, a 90-day cash forecast, ranked funding options, a what-if simulator, and "Ask the coach" chat |

**Self-report shortcut.** If the reporter answers "Yes, this is my property" in the capture flow, then after submitting they go straight into the affected-person flow with the address prefilled. **They still verify their ID**, so there's one path and one rule.

## Questions this design answers

| Question | Answer |
|---|---|
| Who receives the damage report? | Only a **verified affected person** whose verified address matches the report's address. Never the reporter (unless they're also the verified affected person) |
| What does the reporter see? | Processing status, life-safety hazards + 911 banner, overall damage level, and their "My submissions" map/list with claimed/unclaimed badges |
| Is there a map? Whose side? | **Both sides, showing different data.** The reporter map shows only that reporter's own submissions. The affected map shows their own property plus aggregated nearby reports (cells, not individual homes) and area alerts |
| What if several people film the same house? | All their reports attach to the same property. The affected person sees all of them. The Recovery Navigator uses the most severe assessed report by default, and they can switch to another |
| What if nobody has filmed my house yet? | After verifying, the affected person sees "No reports for your address yet", the area map, and a button to **film it yourself** (which uses the self-report path) |
| What if the affected person can't verify (no ID, or the address doesn't match)? | They see area-level information only (map cells, alerts, declarations). No property details. "Try another document" is offered |
| Who answers the insurance and finance questions? | The **affected person**, never the reporter. The reporter can't know them |
| Who owns the report data? | The reporter's identity is recorded as the submitter. Detail access is granted to verified affected persons of that property. Both are anonymous SpacetimeDB identities, with no signup |
| Can a reporter see who claimed it? | No. Only a "claimed" badge, with no name |
| Is there a responder/insurer dashboard or triage queue? | **No.** It's out of scope |

## Main journey (the vertical slice we must ship)

1. **Reporter** on a phone: Report damage → hazard → confirm address → danger question → upload video → sees the live status, hazards and 911 banner if needed, and the damage level.
2. Behind the scenes: frames → Nemotron VL findings → Nemotron agent (cost, OpenFEMA, NWS, geocode, claim draft) → assessment, all streamed live.
3. **Affected person** on a second device: I've been affected → address → ID photo → verified → sees the report for their address and the area map.
4. Opens the full damage report and agent trace → fills the finance intake → Recovery Navigator with the what-if simulator and coach.
5. The reporter's "My submissions" pin flips to "claimed" live.

## Sponsor fit (what judges must be able to see)

| Sponsor | What their prompt asks | Where it shows up |
|---|---|---|
| **PNC: "360° Financial Health Navigator"** | Whole financial picture; 3+ health indicators; forecast balances and obligations; what-if simulator; conversational coach | Recovery Navigator: 5 indicators, 90-day forecast with obligations, what-if simulator, coach |
| **NVIDIA: "Nemotron Beyond a Chatbot"** | Multi-step workflows, tool integration, real-world applicability | Nemotron VL reads damage frames **and** ID documents. A Nemotron agent plans and calls tools (cost model, OpenFEMA, NWS alerts, geocoding, finance engine, claim draft). Validated structured output, with a visible trace |
| **Spacetime** | A reactive backend: logic in the DB, real-time sync, multiplayer | All state and server logic live in a SpacetimeDB module: verification-gated access, property matching, jobs. Two people on two devices (reporter and affected person) see the same report progress, and the claimed badge, live |
| **State Farm: "The Worst Day, at Scale"** | Identify the most urgent needs, coordinate help, ensure no one is overlooked | Anyone at the scene can document anyone's damage, so people who evacuated aren't left out. Verified hand-off to the actual resident; area map of reports; automatic hazard detection with a 911 prompt; auto-drafted claim summary. **Partial fit:** there's no multi-report triage or coordination dashboard |
| **Vultr** (MLH) | Best use of Vultr | Vultr VM runs web and worker; Vultr Object Storage holds footage, frames and (briefly) ID images |
| **GoDaddy Registry** (MLH) | Best domain | Production domain via GoDaddy Registry (code `MLHUTD84`) |

**Open question:** whether there's a cap on how many sponsor tracks we can select on Devpost. Check the Hackerpack/Discord. If there's a cap, prioritize **NVIDIA, PNC, Spacetime**, then State Farm.

## Product defaults (decided; don't re-litigate in code)

| Situation | Behavior |
|---|---|
| Reporter says someone is in danger right now | 911 banner immediately, before upload, kept on the reporter status page and on the affected person's report. We are not an emergency service |
| Footage shows a life-safety hazard | 911 banner + hazard-specific safety guidance at the top of **both** views |
| Footage is dark, blurry, or not a building | Frames marked `unusable`. If more than half are unusable → status `needs_more_footage`; the **reporter** is asked to re-shoot or add photos |
| Low AI confidence (< 0.5) | Estimate shown, labeled "low confidence" |
| Address matching | Both the reporter's confirmed address and the affected person's entered address are geocoded and normalized (CONTRACTS.md). A report matches a property on the same normalized address, or within 30 m of the same geocode point |
| ID verification | Demo-grade: Nemotron VL extracts the name and address from the ID photo; deterministic code compares the normalized address. Max 3 attempts per identity per hour. The ID image is deleted after extraction. Never call it production KYC. A real IDV provider (e.g. Stripe Identity / Persona) is the production path, and a stretch goal only |
| Area map privacy | Nearby reports are shown only as aggregated cells (about 250 m), never as individual pins or addresses |
| Flood damage and policy is homeowners without flood | Navigator assumes $0 dwelling payout for flood unless flood is covered. "Check your policy", not a determination |
| Cost estimate | Deterministic cost model; the model never invents dollar figures |
| Financial data | Synthetic personas only, labeled "Demo persona". "Educational, not financial advice" |
| Aid programs (FEMA IHP, SBA) | "Check eligibility" with a link; no invented rates |
| Disaster declaration | Live from OpenFEMA for the county; if there's none, say so |

## Build priorities (cut from the bottom if behind)

1. **Reporter vertical slice:** capture → upload → frames → Nemotron VL findings → assessment → live reporter status page.
2. **Affected vertical slice:** address → ID check → verified property → full report page.
3. Deployed on Vultr with HTTPS; 911 banner and safety guidance on both sides.
4. Nemotron agent tool loop with trace (cost, OpenFEMA, NWS, geocode, claim draft).
5. Recovery Navigator: intake, indicators, gap, forecast, ranked options.
6. What-if simulator.
7. Maps: reporter "My submissions" map, and the affected area map with cells and alerts.
8. Coach chat.
9. Polish: second-document fallback, claim-notice print view, Spanish UI strings.

## Pitch (draft; 50–55 seconds, claim only what ships)

> After a hurricane, the people who see the damage first usually aren't the people who own it. Families have evacuated. A neighbor or a first responder is standing in front of the house. With [Product], anyone at the scene films the damage for thirty seconds. NVIDIA Nemotron reads the footage, and an agent works through it step by step: it finds hazards that need a 911 call, prices the repairs, checks for a federal disaster declaration, and drafts the insurance claim. Then the family, wherever they are, verifies their ID and address and receives everything: the report, and a financial recovery plan showing what insurance will likely leave uncovered and the cheapest way to close the gap. Every step streams live through SpacetimeDB.

## Demo script

See [docs/DEMO.md](docs/DEMO.md).

## Honesty rules (also in AGENTS.md)

- Label synthetic, fixture and estimated data everywhere they appear.
- AI output is an estimate, not an insurance determination or inspection. The ID check is demo-grade, not KYC.
- For the demo, use a **sample/specimen ID or a team member's own ID with consent**. Never use someone else's real ID.
- Don't claim integrations that didn't ship. Devpost text follows the actual code.
- Footage comes from public-domain/licensed sources or our own recordings, with sources listed in SOURCES.md.
- Disclose the AI coding tools we used on Devpost.
