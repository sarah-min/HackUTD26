# Admin: publish, republish and wipe the SpacetimeDB module (Part 2)

Needs the `spacetime` CLI (`curl -sSf https://install.spacetimedb.com | sh`, then `spacetime login`).
Run from the repo root. `<db>` is the value of `STDB_MODULE`.

## First publish

```bash
cd spacetimedb
spacetime publish --server maincloud <db>      # the publishing identity becomes admin (init reducer)
pnpm generate                                  # writes packages/stdb-bindings/src (commit it)
cd ..
STDB_URI=https://maincloud.spacetimedb.com STDB_MODULE=<db> STDB_ADMIN_TOKEN="$(spacetime login show --token)" \
  node scripts/admin-add-service.ts            # mints the worker identity; store its token as STDB_SERVICE_TOKEN
```

## Republish after a schema change

```bash
cd spacetimedb && pnpm test && spacetime publish --server maincloud <db> && pnpm generate
```

If publish refuses because the change is incompatible with existing rows (removed/retyped columns), and only
then, **announce it in team chat first**, then wipe:

```bash
spacetime publish --server maincloud --delete-data <db>
```

A wipe deletes every report, verification and plan, **and** the service_identity table. So rerun
`scripts/admin-add-service.ts --identity <worker-hex>` with the existing worker identity. The worker keeps its
token, so there's no need to mint a new one.

## Notes

- Additive changes (new tables, new optional columns, new reducers/views) normally republish without a wipe.
- Never put tokens in files. They live in the password manager and the VM env file (`/opt/app/.env`, chmod 600).
- After `pnpm generate`, tell the team: "bindings regenerated, rebase". Only Part 2 regenerates bindings.
