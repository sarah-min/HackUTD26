# Captured model outputs

Real Nemotron outputs captured with `node --env-file=.env.local --import tsx scripts/smoke-nim.ts --image <file> --capture`.
Each file records the model ID, prompt version, the raw content and whether it validated. They are regression
inputs for the Zod parsers. Never put ID-document output here (see `fixtures/verification/README.md`).
