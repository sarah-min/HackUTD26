/** Public (non-secret) connection settings, CONTRACTS.md §10. Defaults to the DEV database; set the env vars for prod. */
export const STDB_URI = process.env.NEXT_PUBLIC_STDB_URI ?? 'https://maincloud.spacetimedb.com';
export const STDB_MODULE = process.env.NEXT_PUBLIC_STDB_MODULE ?? 'aftermath-hackutd-dev';
