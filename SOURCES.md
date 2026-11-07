# Technical Source Register

Compiled Saturday, November 7, 2026 during planning. **No provider accounts were provisioned, charged or tested during planning.** Anything marked **VERIFY** has not been confirmed against a live account or endpoint. The owner confirms it, then records the result here and in their `status/partN.md`.

## Event evidence

Source: `HackTX template to use/Public HackUTD Opening Ceremony Slides.pdf` (local, not committed). Page numbers refer to that PDF.

| Sponsor | Page | Key prompt text |
|---|---|---|
| **PNC** | p20 | "360° Financial Health Navigator… How could AI help someone see their whole financial picture, make sense of it & feel confident about their next move?" Suggested answers: "A Conversational Coach", "3+ Health Assessment Indicators", "Forecast Balances & Financial Obligations", "'What if' Simulator", "Something no one has thought of yet!" Prizes: PS5 Slim / Ninja CREAMi / AirPods Pro 3 |
| **State Farm** | p57 | "The Worst Day, at Scale — Intelligent Catastrophe Response. When a major disaster affects thousands of people simultaneously, how might we use AI and technology to identify those with the most urgent needs, coordinate assistance, and ensure no one is overlooked?" Prizes: Beats Studio Pro / RC drone / portable monitor |
| **NVIDIA** | p64 | "Use Nemotron Beyond a Chatbot. In addition to using Nemotron, your project must include: Beyond a Chatbot (not just responding directly to prompts); Multi-step workflows (agents that plan and execute complex tasks); Tool integration (using external APIs and services intelligently); Real-world applicability (solving actual problems)." Prizes: 1st 2× RTX 5080 + $200 Brev credits; 2nd 1× RTX 5080 + $200 Brev credits + swag |
| **Spacetime** | p49 | "The reactive backend. Build the whole thing by Sunday. A database that runs your server logic inside it and streams every change to connected clients in real time — tables, functions, auth, hosting and sync in one system." "No glue code", "Agents love it", "Multiplayer by default". 100,000 TeV free Maincloud credit (~$38), code **`HACKUTD2026`**, one per GitHub account |
| **GoDaddy Registry** (MLH) | p87 | "Best Domain from GoDaddy Registry." Code **`MLHUTD84`**; mlh.link/godaddyregistry |
| **Vultr** (MLH) | p88 | "Best Use of Vultr — the ultimate developer toolkit for building on the cloud." mlh.link/vultr |
| **Schedule** | p105–108 | Sponsor workshops 1:30–8:00 PM; initial Devpost deadline **11:00 PM**; final Devpost deadline **12:00 PM**; judging 1–4 PM. **VERIFY** the dates and full schedule in the Hackerpack |

Not found in the slides: any limit on the number of tracks a team may select. **VERIFY** in the Hackerpack/Discord.

**How honestly we fit State Farm (p57):** we no longer do multi-report triage or coordination dashboards. Our fit rests on (1) letting anyone at the scene document damage in about a minute, (2) automatic life-safety hazard detection with a 911 prompt, and (3) an auto-drafted first-notice-of-loss claim summary. This is weak on "identify those with the most urgent needs" across thousands of people and on "coordinate assistance"; don't claim those parts.

## NVIDIA / Nemotron

| Item | Source | Status |
|---|---|---|
| Nemotron Nano 12B v2 VL (vision; multi-image and video understanding) | https://build.nvidia.com/nvidia/nemotron-nano-12b-v2-vl | Model ID `nvidia/nemotron-nano-12b-v2-vl` from third-party listings. **VERIFY** the exact ID, image input format, max images per request and rate limits |
| Llama 3.1 Nemotron Nano VL 8B v1 (fallback vision model; image/document focused) | https://build.nvidia.com/nvidia/llama-3.1-nemotron-nano-vl-8b-v1/deploy | The deploy page shows `nvidia/llama-3.1-nemotron-nano-vl-8b-v1` with `image_url` chat input. **VERIFY** |
| Model catalog | https://build.nvidia.com/models?q=Nemotron | Use it to pick `NEMOTRON_AGENT_MODEL` |
| OpenAI-compatible endpoint | `https://integrate.api.nvidia.com/v1` | **VERIFY** with a real key |
| Agent model candidates | Nemotron 3.5 Lightning (30B-A3B, tool calling, 1M context); Nemotron 3 Super (120B-A12B, function calling) | **VERIFY** availability, slug and tool-calling reliability. Pick one in hour 1 |
| Brev credits | Prize only; not needed for the base plan | — |

## SpacetimeDB

| Item | Source | Notes |
|---|---|---|
| TypeScript module library | https://spacetimedb.com/docs/modules/typescript | Module in `src/index.ts`; tables via `table(...)`, reducers |
| TypeScript quickstart (2.0.0) | https://spacetimedb.com/docs/quickstarts/typescript | `spacetime dev --template basic-ts`; module at `spacetimedb/src/index.ts` |
| Reducers | https://spacetimedb.com/docs/functions/reducers | Reducers have full read-write access to all tables (public and private) via `ReducerContext` |
| Chat app tutorial | https://spacetimedb.com/docs/tutorials/chat-app | `schema({ user, message })` pattern; `ctx.db.<table>` accessors |
| **API style caveat** | — | The current 2.x style imports from `spacetimedb/server` and uses `schema` / `table` / `t` builders. Older 1.x examples (`import { spacetimedb, table, t } from 'spacetimedb'`, `table({ name, public })`) are outdated, so ignore them. **VERIFY** against the docs for the installed CLI version |
| Per-identity visibility (views / RLS) | docs | **VERIFY** (Part 2, hour 1): how the report owner reads private rows; see ARCHITECTURE §5 |
| Scheduled reducers | docs | **VERIFY** the syntax for `lease_tick` (job lease requeue) |
| Maincloud credit | Slide p49 | Code `HACKUTD2026`, one per GitHub account |

## Public data APIs (free, no key)

| API | Endpoint | Used for | Status |
|---|---|---|---|
| OpenFEMA Disaster Declarations Summaries v2 | `https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries` (OData `$filter` on `state`, `designatedArea`, `declarationDate`) | `lookup_disaster_declarations`; `ihProgramDeclared` field | **VERIFY** field names and filter syntax |
| NWS active alerts | `https://api.weather.gov/alerts/active?point={lat},{lng}` | `get_weather_alerts` | Requires a descriptive `User-Agent` (use a generic app name, not a personal email). **VERIFY** |
| FCC Area API | `https://geo.fcc.gov/api/census/area?lat={lat}&lon={lng}&format=json` | `reverse_geocode` → state and county FIPS | **VERIFY** |
| DisasterAssistance.gov | https://www.disasterassistance.gov | FEMA IHP "check eligibility" link | Link only |
| SBA disaster loans | https://www.sba.gov/funding-programs/disaster-assistance | SBA "check eligibility" link | Link only. Never invent rates |

## Hosting and domain

| Item | Source | Status |
|---|---|---|
| Vultr credit / onboarding | mlh.link/vultr | **VERIFY** the credit amount |
| Vultr Object Storage (S3-compatible) | https://docs.vultr.com/products/cloud-storage/object-storage | Works with `@aws-sdk/client-s3`. **VERIFY** the endpoint hostname for the chosen region and CORS support |
| GoDaddy Registry domain | mlh.link/godaddyregistry, code `MLHUTD84` | **VERIFY** which TLDs the code covers |
| Caddy automatic HTTPS | https://caddyserver.com/docs/automatic-https | Needs ports 80/443 open and the A record live |

## Media (demo footage)

Use only public-domain or properly licensed media, or the team's own recordings. FEMA and NOAA imagery produced by US federal employees is generally public domain. **VERIFY** per item, since some FEMA media is contributed by third parties with restrictions.

- FEMA media library: https://www.fema.gov/multimedia-library (**VERIFY** URL)
- NOAA imagery: https://www.noaa.gov (e.g., NOAA Emergency Response Imagery, https://storms.ngs.noaa.gov), which is aerial (**VERIFY**)

Never commit media files. Add a row for every clip used:

| # | Description | Source URL | License / basis | Object key | Added by |
|---|---|---|---|---|---|
| 1 | _e.g. flooded living room, 40 s_ | | | `media/demo/<sha256>.mp4` | |
| 2 | | | | | |

## Unverified / open items

- [ ] Exact Nemotron VL model ID, image input format, images-per-request limit, rate limits (Part 3)
- [ ] Which Nemotron agent model supports reliable OpenAI-style tool calling (Part 3)
- [ ] SpacetimeDB 2.x private-row visibility mechanism (views/RLS), or use the HTTP fallback (Part 2)
- [ ] SpacetimeDB scheduled reducer syntax and Maincloud publish/identity token flow (Part 2)
- [ ] Vultr Object Storage regional endpoint and CORS config (Part 4)
- [ ] Vultr event credit amount; GoDaddy Registry code TLD coverage (Part 4)
- [ ] OpenFEMA / NWS / FCC field names and response shapes (Part 3)
- [ ] Devpost track-selection limit; exact event dates and deadlines (everyone)
- [ ] License of each demo clip (whoever adds it)
