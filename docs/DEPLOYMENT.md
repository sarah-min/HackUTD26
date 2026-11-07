# Deployment (owner: Part 4)

Target: one Vultr VM running Docker Compose (Caddy, web, worker), SpacetimeDB on Maincloud, footage in Vultr Object Storage, and a GoDaddy Registry domain. Deploy the scaffold by **hour 2** and redeploy after every merge to `main`. Steps marked **VERIFY** depend on the provider UI or CLI version.

## 1. Vultr VM

1. Redeem the event credit (mlh.link/vultr). **VERIFY** the amount.
2. Create a Cloud Compute instance: Ubuntu LTS (latest), 2 vCPU / 4 GB, in a US region near Dallas.
3. Add the team's SSH keys. Disable password login.
4. Firewall group: inbound **22** (restricted to team IPs if practical), **80** and **443** only. Nothing else, so the SpacetimeDB port is not exposed unless the fallback is in use.
5. Install Docker Engine and the Compose plugin (official Docker apt repo), then add the deploy user to the `docker` group.
6. `sudo mkdir -p /opt/app && sudo chown $USER /opt/app && git clone <repo> /opt/app`.

## 2. Compose layout (`infra/compose.yaml`)

```yaml
services:
  caddy:
    image: caddy:2            # pin an exact tag at scaffold time
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [web]
  web:
    build: { context: .., dockerfile: infra/web.Dockerfile }
    restart: unless-stopped
    env_file: /opt/app/.env
    expose: ["3000"]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      retries: 3
  worker:
    build: { context: .., dockerfile: infra/worker.Dockerfile }   # includes ffmpeg
    restart: unless-stopped
    env_file: /opt/app/.env
volumes:
  caddy_data: {}
  caddy_config: {}
```

## 3. Caddyfile sketch (`infra/Caddyfile`)

```text
{$APP_DOMAIN} {
  encode zstd gzip
  reverse_proxy web:3000
  request_body {
    max_size 20MB   # uploads go straight to object storage; this only covers API bodies
  }
}
```

Set `APP_DOMAIN` in `.env`. Until DNS is live, use the VM IP over plain HTTP for smoke tests only.

## 4. Vultr Object Storage

1. Create an Object Storage subscription in the same region, then create a private bucket (e.g. `aftermath-media`). **VERIFY** the endpoint hostname (`https://<region>.vultrobjects.com`).
2. Generate an access key/secret and put them in `/opt/app/.env` only.
3. Apply CORS so the browser can PUT directly (via `aws s3api put-bucket-cors --endpoint-url $S3_ENDPOINT` or the provider UI; **VERIFY**):

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://<domain>", "http://localhost:3000"],
      "AllowedMethods": ["PUT", "GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

4. Presigned URLs expire after 10 minutes. The bucket is never public.
5. **ID-document images (`idv/` prefix).** The worker deletes each `idv/<verificationId>/…` object immediately after extraction. As a backstop, add a bucket **lifecycle rule that expires everything under `idv/` after 1 day** (via `aws s3api put-bucket-lifecycle-configuration --endpoint-url $S3_ENDPOINT`, or the provider UI; **VERIFY** that Vultr supports lifecycle rules, and if it doesn't, run a small daily cleanup job from the worker instead):

```json
{
  "Rules": [
    { "ID": "expire-idv", "Filter": { "Prefix": "idv/" }, "Status": "Enabled", "Expiration": { "Days": 1 } }
  ]
}
```

   `/api/media` never serves `idv/` keys. Never back up or copy the `idv/` prefix.

## 5. SpacetimeDB (Maincloud). Part 2 runs the publish; Part 4 wires the env

Commands follow the 2.x CLI. **VERIFY** flags with `spacetime --help`.

1. Install the `spacetime` CLI, then `spacetime login` (GitHub). Redeem `HACKUTD2026` for Maincloud credit.
2. `cd spacetimedb && spacetime publish <module-name>` (Maincloud is the default server for logged-in users; **VERIFY**). The publisher identity becomes `admin` via the `init` reducer.
3. Generate bindings: `spacetime generate --lang typescript --out-dir ../packages/stdb-bindings` (wrapped as `pnpm stdb:generate`). Commit the output (Part 2 only).
4. Create the **worker** identity: run a tiny script that connects anonymously, prints its identity and token, and saves the token. **VERIFY** the token-issuing flow.
5. As admin: `spacetime call <module> admin_add_service <worker-identity> worker`.
6. Put `STDB_SERVICE_TOKEN`, `STDB_URI` and `STDB_MODULE` in `/opt/app/.env`, and `NEXT_PUBLIC_STDB_URI` / `NEXT_PUBLIC_STDB_MODULE` in both the env file and the web build args.
7. Breaking schema change during the event: Part 2 announces it, runs `spacetime publish --delete-data <module>`, and reruns step 5.

**Self-host fallback** (if Maincloud is unavailable): add a `spacetimedb` service to Compose using the official `clockworklabs/spacetime` image (**VERIFY** name and tag) with a persistent volume, publish to it with `spacetime publish -s <local-server>`, and route `wss://<domain>/stdb` through Caddy to it. Update the `STDB_URI` values.

## 6. Domain (GoDaddy Registry)

1. Register via mlh.link/godaddyregistry with code `MLHUTD84` (**VERIFY** eligible TLDs).
2. DNS: an `A` record for `@` (and `www` if wanted) pointing to the VM IPv4 address, with a low TTL (300).
3. Once DNS resolves, Caddy obtains TLS automatically. Check `https://<domain>/api/health`.
4. Set `APP_BASE_URL=https://<domain>` and add the domain to the bucket CORS.

## 7. Env file

- Path: `/opt/app/.env`, then `chmod 600 /opt/app/.env`. It's owned by the deploy user and never committed.
- Start from `.env.example`. Real values come from the team password manager or a DM, never from git or Discord channels.
- Variables added for the two-view design: `NOMINATIM_USER_AGENT` (a generic app name, not a personal email), `CENSUS_GEOCODER_BENCHMARK` (default `Public_AR_Current`) and `IDV_MAX_ATTEMPTS_PER_HOUR` (default `3`).

## 8. Deploy flow (`infra/deploy.sh`)

```bash
set -euo pipefail
cd /opt/app
git fetch origin && git checkout main && git pull --ff-only origin main
docker compose -f infra/compose.yaml build
docker compose -f infra/compose.yaml up -d
docker compose -f infra/compose.yaml ps
curl -fsS https://$APP_DOMAIN/api/health
```

Run it over SSH after every merge to `main`. Record the deployed commit hash in `status/part4.md`.

## 9. Health and logs

- `GET /api/health`: web, SpacetimeDB and storage reachability.
- `docker compose -f infra/compose.yaml logs -f web worker`
- The worker logs each job: claim → frames → VL → agent → complete, with durations. For `verify_identity` it logs only the verification ID, outcome and fail reason, never names, addresses or image contents.

## 10. Rollback

```bash
cd /opt/app && git checkout <last-good-sha> && docker compose -f infra/compose.yaml up -d --build
```

Keep the last good SHA in `status/part4.md`. Schema rollbacks on SpacetimeDB need a republish of the older module (and probably `--delete-data`, which wipes existing reports), so avoid schema changes after the internal freeze (Sun 10:30 AM).

## 11. Teardown and cost ledger

Keep the ledger in `status/part4.md`:

| Item | Credit/cost | Started | Expires / renews | Teardown done |
|---|---|---|---|---|
| Vultr VM | event credit | | | |
| Vultr Object Storage | event credit | | | |
| Maincloud | `HACKUTD2026` (~$38) | | | |
| Domain | `MLHUTD84` | | renewal date | |
| NVIDIA API | free tier | | | |

After judging, the team decides how long to keep the demo up. Then destroy the VM and object storage, unpublish or delete the module if it's not needed, and turn off domain auto-renew. Nothing paid rolls over silently.
