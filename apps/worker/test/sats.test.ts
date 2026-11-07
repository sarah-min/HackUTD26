import { describe, expect, it } from 'vitest';
import { decodeRows } from '../src/stdb/sats';

describe('SATS-JSON SQL decoding', () => {
  it('decodes options, identities, timestamps and plain enums into camelCase', () => {
    const schema = {
      elements: [
        { name: { some: 'id' }, algebraic_type: { U64: [] } },
        { name: { some: 'lease_owner' }, algebraic_type: { Sum: { variants: [
          { name: { some: 'some' }, algebraic_type: { Product: { elements: [{ name: { some: '__identity__' }, algebraic_type: { U256: [] } }] } } },
          { name: { some: 'none' }, algebraic_type: { Product: { elements: [] } } },
        ] } } },
        { name: { some: 'created_at' }, algebraic_type: { Product: { elements: [{ name: { some: '__timestamp_micros_since_unix_epoch__' }, algebraic_type: { I64: [] } }] } } },
        { name: { some: 'state' }, algebraic_type: { Sum: { variants: [
          { name: { some: 'queued' }, algebraic_type: { Product: { elements: [] } } },
          { name: { some: 'leased' }, algebraic_type: { Product: { elements: [] } } },
        ] } } },
        { name: { some: 'last_error' }, algebraic_type: { Sum: { variants: [
          { name: { some: 'some' }, algebraic_type: { String: [] } },
          { name: { some: 'none' }, algebraic_type: { Product: { elements: [] } } },
        ] } } },
      ],
    };
    const rows = decodeRows({ schema, rows: [[42, { '0': ['0xABCdef'] }, [1_762_000_000_123_456], { '1': [] }, { none: [] }]] });
    expect(rows[0]).toEqual({ id: 42, leaseOwner: 'abcdef', createdAt: 1_762_000_000_123, state: 'leased', lastError: null });
  });
});
