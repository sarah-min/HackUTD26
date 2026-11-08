# Nemotron model server on Vultr (Part 3)

The worker no longer calls NVIDIA's hosted API. Both Nemotron models run on our own Vultr Cloud GPU instance under
vLLM, which serves an OpenAI-compatible API. The worker (a CPU Vultr VM) calls it over the Vultr VPC.

| Role | Model | Port | Why this model |
|---|---|---|---|
| vision | `nvidia/NVIDIA-Nemotron-Nano-12B-v2-VL-FP8` | 8001 | Same model as before, FP8 (~14 GB) |
| agent | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8` | 8002 | Native tool calling, 3B active params, fits next to the VL model. The previous default (Nemotron 3 Super 120B) needs several GPUs. |

## 1. Create the GPU instance
- Vultr Cloud GPU, **1x NVIDIA H100 80 GB**, same region as the worker VM, attached to the **same VPC**. Use Vultr's
  GPU image with NVIDIA drivers + Docker + NVIDIA Container Toolkit (check `nvidia-smi` and `docker info | grep -i nvidia`).
- Firewall group: allow TCP 8001–8002 **only from the worker VM's VPC IP**; SSH from your IP. No public model port.
- Smaller card (L40S 48 GB)? Run only one model there and the other on a second instance, or lower the fractions.

## 2. Start the servers
```bash
scp apps/worker/model-server/{compose.gpu.yaml,model-server.env.example} root@<gpu-public-ip>:/opt/nemotron/
ssh root@<gpu-public-ip>
cd /opt/nemotron && cp model-server.env.example .env   # set NEMOTRON_API_KEY, BIND_ADDR=<gpu VPC IP>
docker compose -f compose.gpu.yaml up -d
docker compose -f compose.gpu.yaml logs -f              # first boot downloads ~50 GB of weights
```
The agent server waits for the vision server to be healthy so they don't race for GPU memory.

## 3. Point the worker at it (worker VM `.env`)
```bash
NEMOTRON_VL_BASE_URL=http://<gpu VPC IP>:8001/v1
NEMOTRON_AGENT_BASE_URL=http://<gpu VPC IP>:8002/v1
NEMOTRON_API_KEY=<same value as on the GPU box>
# optional: NEMOTRON_VL_MODEL / NEMOTRON_AGENT_MODEL (must match the served names), NEMOTRON_AGENT_THINKING=on
```
`NVIDIA_API_KEY` / `NVIDIA_BASE_URL` are no longer read. A missing URL is a startup error; there is no fallback to
the hosted API. On start the worker logs `model server ready` or `model server not ready` for each role.

## 4. Verify
```bash
curl -s http://<gpu VPC IP>:8002/v1/models -H "Authorization: Bearer $NEMOTRON_API_KEY"
node --env-file=.env.local --import tsx scripts/smoke-nim.ts --image <public-domain damage photo>
```
Paste the smoke JSON into `status/part3.md`. From a laptop, reach the private IP with an SSH tunnel:
`ssh -L 8001:<gpu VPC IP>:8001 -L 8002:<gpu VPC IP>:8002 root@<gpu-public-ip>` and use `http://127.0.0.1:800x/v1`.

## Notes
- Thinking is off for the agent by default (`chat_template_kwargs.enable_thinking=false`), for latency inside the
  110 s job budget. The vision prompts start with `/no_think`.
- Cost: the GPU instance bills hourly while it exists, even idle. Destroy it (or snapshot) after the demo.
- VERIFY on first boot: the vLLM image tag supports both models; tool calls come back as `tool_calls` (the
  `qwen3_coder` parser plus `nano_v3` reasoning plugin are required for Nemotron 3 Nano); FP8 loads with
  `--quantization modelopt` on H100.
