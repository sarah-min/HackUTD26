# Demo setup (do this before the demo, in order)

Everything below is for the **prod** database `aftermath-hackutd`. The demo script itself is in `docs/DEMO.md`; this page is how to get the stack running so that script works.

## What must be running

| Piece | Where | Status on 2026-11-08 |
|---|---|---|
| SpacetimeDB module | Maincloud `aftermath-hackutd` | Published, includes accounts, caps, duplicate-claim hold. Preflight passes. |
| 11 seeded fixture reports | prod | Present, map data valid until about **Nov 11 09:56 UTC** (72 h window) |
| Web app (Next.js) | **not deployed anywhere yet** (`aftermath.photo` is only the README on GitHub Pages) | Run it from a laptop (below) or deploy it |
| Nemotron VL + agent + worker | NVIDIA Brev GPU (Part 3) | **Unknown: ask Sarah if the instance is up.** Without it, new videos never leave `queued` |

## 1. Preflight (30 seconds)

```bash
scripts/demo-preflight.sh aftermath-hackutd https://<your-https-url>
```

Fix every `FAIL`. `WARN` lines are explained in the output. Rerun after each fix.

## 2. Run the web app against PROD

Phones need HTTPS for the camera, so use a tunnel. From the repo root:

```bash
brew install cloudflared                      # one time, free, no account
pnpm install --frozen-lockfile                # only if node_modules is missing; never edit the lockfile
cat > apps/web/.env.local <<'EOF'
NEXT_PUBLIC_STDB_URI=https://maincloud.spacetimedb.com
NEXT_PUBLIC_STDB_MODULE=aftermath-hackutd
EOF
pnpm --filter @hack/web build && pnpm --filter @hack/web start     # port 3000, production mode (dev mode blocks tunnel hosts)
# second terminal:
cloudflared tunnel --url http://localhost:3000                      # prints https://<random>.trycloudflare.com
```

Note the default in `.env.example` is the **dev** database; the demo must say `aftermath-hackutd`. If the maps need a token, add `NEXT_PUBLIC_MAPBOX_TOKEN` (Part 1 knows). Never put a service token in this file (`NEXT_PUBLIC_*` is public).

## 3. Make analysis work (pick one)

- **Real (best):** ask Sarah to confirm the Brev instance runs the vLLM servers and the worker with `STDB_MODULE=aftermath-hackutd` and the registered worker token. Then submit a 30 s video and watch the report move `queued` to `assessed`.
- **Fallback, labeled fixture:** run the dev fake worker against prod only if you accept that results are fixture output (it must say `source: fixture`). Do not present fixture output as live Nemotron. Needs the prod worker identity registered; see `docs/BACKEND_RUNBOOK.md`.
- **No worker at all:** the 11 seeded reports are already assessed, so the affected view, map and Recovery Navigator still demo from seeded data. Skip the live filming beat.

## 4. One-time checks with real people

1. **One specimen ID through the real worker** (Sarah). The ID prompt changed (`id-document-v2`); if the model omits the cue fields every genuine ID lands in `needs_review`. Use the specimen ID or a teammate's own ID with consent. `SAMPLE SPECIMEN` is accepted; any other specimen name needs `IDV_SPECIMEN_NAMES` on the worker.
2. **Phone run-through**: reporter flow on one phone, affected flow on another, from the tunnel URL.
3. **Account beat** (optional in the script): create the recovery code, sign out, sign in on a second device. Save the code somewhere you can paste from on stage.

## 5. Rehearsal vs demo behavior

- `hold_duplicate_claims` is **ON** in prod: a second person verifying an already-verified address is held. For rehearsals that reuse one address, turn it off, and turn it back on afterwards:
  ```bash
  spacetime call --server maincloud aftermath-hackutd admin_set_security_config '{"some":false}' '{"none":[]}' '{"none":[]}'   # off
  spacetime call --server maincloud aftermath-hackutd admin_set_security_config '{"some":true}'  '{"none":[]}' '{"none":[]}'   # on
  ```
- Verification starts are limited to 3 per hour per browser. If rehearsals hit it, use a fresh browser profile or wait.
- Look at open jobs any time: `spacetime sql -s maincloud aftermath-hackutd "SELECT id, kind, state FROM job"`.

## 6. Reseed (only if the map is empty or after Nov 11 09:56 UTC)

Reseeding needs a wipe, so it also deletes service identities, accounts and any rehearsal data. Follow the seeding section of `docs/BACKEND_RUNBOOK.md` exactly (wipe, re-register worker/web/admin identities, seed, mark fixtures, set the security config). Run the preflight afterwards.

## Open questions (owners)

- Is the Brev GPU instance up, and does the worker point at `aftermath-hackutd`? (Sarah)
- Is the web app meant to be deployed somewhere with HTTPS, or run from a laptop? (Roselyn)
- Does the map need `NEXT_PUBLIC_MAPBOX_TOKEN`? (Faith or Roselyn)
