# Nemotron + worker on NVIDIA Brev (Part 3)

The backend is **SpacetimeDB** (Maincloud): reports, jobs, permissions, area notices, **file storage** (footage, frame
thumbnails, ID images) and **address lookup** all live in the module. There is no S3 bucket, no Vultr VM and no
backend API route. The only other machine is one **Brev GPU instance** that runs:

| Service | What | Reachable from |
|---|---|---|
| `nemotron-vl` | `nvidia/NVIDIA-Nemotron-Nano-12B-v2-VL-FP8` on :8001 (vLLM) | the worker only (compose network) |
| `nemotron-agent` | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8` on :8002 (vLLM, tool calling) | the worker only |
| `worker` | claims `analyze` / `verify_identity` jobs from SpacetimeDB, reads and writes files there, calls the models | outbound only |

No port is published on the host, so the models and ID images never cross the public internet except to SpacetimeDB.

## 1. Create the instance
Brev console → New → **VM mode**, **1x H100 80 GB**, 200 GB+ disk, Jupyter off. (Docker and the NVIDIA Container
Toolkit are preinstalled; check `nvidia-smi`.) Two models on one 80 GB GPU is the untested part: watch the first boot.

## 2. Start everything
```bash
git clone https://github.com/sarah-min/HackUTD26.git && cd HackUTD26 && git checkout backend-spacetimedb-brev
cp apps/worker/brev/brev.env.example apps/worker/brev/.env    # set STDB_SERVICE_TOKEN and NEMOTRON_API_KEY
docker compose -f apps/worker/brev/compose.gpu.yaml --env-file apps/worker/brev/.env up -d --build
docker compose -f apps/worker/brev/compose.gpu.yaml logs -f   # first boot downloads ~50 GB of weights
```
The agent server starts after the vision server is healthy, and the worker after both. The worker logs
`model server ready` for each role, then `worker started`.

`STDB_SERVICE_TOKEN` is the token of the identity registered as `worker` (one Maincloud identity serves both
databases). Keep `STDB_MODULE=aftermath-hackutd-dev` while testing; switch to `aftermath-hackutd` for the demo.

## 3. Verify
```bash
docker compose -f apps/worker/brev/compose.gpu.yaml exec worker sh -c \
  'curl -s http://nemotron-agent:8002/v1/models -H "Authorization: Bearer $NEMOTRON_API_KEY"'
docker compose -f apps/worker/brev/compose.gpu.yaml exec worker sh -c \
  'cd /app && node --import tsx scripts/smoke-nim.ts --image <public-domain damage photo>'
```
Then file a real report through the app against the dev database.

## Notes
- Thinking is off for the agent by default (`chat_template_kwargs.enable_thinking=false`) to fit the 110 s job budget.
- Cost: Brev bills while the instance runs. Stop it (`brev stop <name>`) when not testing; delete it after the demo.
- VERIFY on first boot: the vLLM image tag supports both models; tool calls come back as `tool_calls`; FP8 loads with
  `--quantization modelopt` on H100.
- The worker image needs the root pnpm workspace (Part 1). Until it exists, run the worker on the instance directly:
  `pnpm install && pnpm --filter @hack/worker start` with the same env and
  `NEMOTRON_VL_BASE_URL=http://127.0.0.1:8001/v1` (publish the ports on 127.0.0.1 in that case).
