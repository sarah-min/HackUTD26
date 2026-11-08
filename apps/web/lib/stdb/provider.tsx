'use client';

import { useMemo, type ReactNode } from 'react';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection } from './bindings';
import { STDB_MODULE, STDB_URI } from './config';
import { readLocal, writeLocal, TOKEN_KEY } from './storage';

/**
 * One SpacetimeDB connection for the whole app (ARCHITECTURE §8: no part opens its own).
 * P1 mounts <StdbProvider> once in app/layout.tsx (or a client providers file).
 *
 * The anonymous identity's token is persisted in localStorage, so the same browser keeps
 * the same identity: the reporter keeps access to their submissions, and the affected
 * person keeps their verification.
 */
export function StdbProvider({ children }: { children: ReactNode }) {
  const connectionBuilder = useMemo(
    () =>
      DbConnection.builder()
        .withUri(STDB_URI)
        .withDatabaseName(STDB_MODULE)
        .withToken(readLocal(TOKEN_KEY) ?? undefined)
        .onConnect((_conn, _identity, token) => writeLocal(TOKEN_KEY, token))
        .onAutomaticReconnect((_conn, _identity, token) => writeLocal(TOKEN_KEY, token)),
    [],
  );
  return <SpacetimeDBProvider connectionBuilder={connectionBuilder}>{children}</SpacetimeDBProvider>;
}
