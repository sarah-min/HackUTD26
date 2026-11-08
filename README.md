# Aftermath 

**Anyone can film the damage. The family who lives there gets the help.**

The product has two interfaces:

- **Reporter view:** anyone at the scene (a neighbor, a first responder, a volunteer, or even the tenant themselves) records a 30–60 second phone video of a damaged property and submits it. They see only safety and status: live processing, the overall damage level, and a map of submissions that they've filmed.
- **Affected-person view:** the person whose property it is chooses "I've been affected", enters their address, and verifies their identity with an ID photo. Nemotron confirms that the address matches. Afterward they may optionally create a recovery code (generated in the browser, shown once, only a hash stored, no email or phone) to get their properties back on a new device. They then get all pertinent information for their property: the full damage report, the repair-cost estimate, a draft insurance claim, an area map of nearby reports, and a financial Recovery Navigator.

Behind the scenes, Nemotron VL reads the footage to analyze the damage and another Nemotron agent calls tools (cost model, OpenFEMA, NWS alerts, geocoding, claim draft, finance engine) to assist in the examination and recovery. Everything lives in a SpacetimeDB backend and streams live to both views.


## Quick start

```bash
pnpm install
cp .env.example .env.local        # fill values from the team password manager, never commit
pnpm dev                          # web on :3000
pnpm --filter @hack/worker dev    # AI worker
pnpm check                        # typecheck + lint + tests; run before every push
```
