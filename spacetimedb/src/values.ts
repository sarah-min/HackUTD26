// Construct Timestamp/Identity values without importing the root `spacetimedb`
// package at runtime (it re-exports the client SDK, which doesn't belong in a module
// bundle). The constructors are taken from instances the host already gave us.
import type { Identity, Timestamp } from 'spacetimedb';
import { fail } from './constants';

type Timed = { timestamp: Timestamp };
type Sendered = { sender: Identity };

export function tsFromMicros(ctx: Timed, micros: bigint): Timestamp {
  const C = ctx.timestamp.constructor as new (m: bigint) => Timestamp;
  return new C(micros);
}

export function identityFromHex(ctx: Sendered, hex: string): Identity {
  const clean = hex.trim().replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) fail('invalid identity hex (expected 64 hex chars)');
  const C = ctx.sender.constructor as new (h: string) => Identity;
  return new C(clean);
}
