# Deployment notes (Part 4 + Part 3)

**Hosting moved off Vultr.** Part 3 owns **Brev** (or whatever host runs web + worker) and the deploy scripts under `infra/**`. Part 4 does **not** provision VMs or Vultr Object Storage.

SpacetimeDB stays on **Maincloud** (Part 2 publishes). Part 4 still owns the **S3-compatible client** (`packages/storage`), upload/media/health routes, and the env var *names* in `.env.example`.

## Part 3 (Brev) — own these

- Provision Brev (or equivalent) so `web` + `worker` run with the app env file.
- Docker / compose / Caddy (or Brev’s reverse proxy) and redeploy after merges to `main`.
- Public HTTPS URL; wire DNS if the team keeps a GoDaddy domain (`MLHUTD84`). Optional: GoDaddy is not a submission track.
- Document the live URL and redeploy steps in `status/part3.md` (and update this file’s “live URL” line when known).

**Live URL:** _TBD by Part 3_

## Part 4 — object storage (S3-compatible, not Vultr)

Any S3-compatible bucket works (R2, AWS S3, MinIO on Brev, etc.). The app talks to it only through `S3_*` env vars and `@hack/storage`.

1. Create a **private** bucket (e.g. `aftermath-media`).
2. Put endpoint, region string, bucket, access key, and secret in the deploy env only (never git).
3. CORS so the browser can PUT/GET via presigned URLs:

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

4. Presigned URLs expire after ~10 minutes. Bucket is never public.
5. **`idv/` prefix:** worker deletes each object after ID extraction. Prefer a lifecycle rule expiring `idv/` after 1 day as a backstop. `/api/media` never serves `idv/` keys.

Local/dev without a bucket: `STORAGE_DRIVER=memory`.

## SpacetimeDB (Maincloud) — Part 2 publishes; everyone wires env

1. Part 2: publish module, regenerate bindings, register service identities (`worker`, `web`).
2. Env (see `.env.example`): `STDB_URI`, `STDB_MODULE`, `NEXT_PUBLIC_STDB_*`, `STDB_SERVICE_TOKEN` (P3), `STDB_WEB_TOKEN` (P4).
3. Dev DB: `aftermath-hackutd-dev`. Prod/demo: `aftermath-hackutd`.
4. Accounts are recovery-code only: no email, SMS or delivery-vendor env vars are needed (Brevo and Photon were dropped). The account module is published to dev; check docs/BACKEND_RUNBOOK.md for prod state before claiming prod.

## Health and logs

- `GET /api/health` → `{ ok, web, stdb, storage, version }` (Part 4 route).
- Worker logs: claim → work → complete; for `verify_identity` log only id + outcome, never ID image contents.

## Cost ledger

Host/GPU spend (Brev) → `status/part3.md`.  
P4 ledger in `status/part4.md` is for storage/API credits only if any.
