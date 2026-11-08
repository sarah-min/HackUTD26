import { describe, expect, it } from 'vitest';
import { SourceSchema } from '@hack/contracts/common';
import { FinancialProfileSchema } from '@hack/contracts/finance';
import { PERSONAS, getPersona } from '../src/index';
import mariaFixture from '../../../fixtures/finance/persona-maria.json';
import jamesFixture from '../../../fixtures/finance/persona-james.json';
import aishaFixture from '../../../fixtures/finance/persona-aisha.json';

const fixtures = [mariaFixture, jamesFixture, aishaFixture];

describe('personas', () => {
  it('exposes at least 3 synthetic personas that validate', () => {
    expect(PERSONAS.length).toBeGreaterThanOrEqual(3);
    for (const p of PERSONAS) {
      expect(FinancialProfileSchema.parse(p).source).toBe('synthetic');
      expect(p.accounts.length).toBeGreaterThan(0);
    }
  });

  it('covers checking, savings, cd, ira, mortgage, loan and card types across the set', () => {
    const types = new Set(PERSONAS.flatMap((p) => p.accounts.map((a) => a.type)));
    for (const t of [
      'checking',
      'savings',
      'cd',
      'ira',
      'mortgage',
      'auto_loan',
      'credit_card',
    ] as const) {
      expect(types.has(t)).toBe(true);
    }
  });

  it('getPersona returns by id and throws on unknown', () => {
    const first = PERSONAS[0];
    expect(first).toBeDefined();
    expect(getPersona(first!.id)).toEqual(first);
    expect(() => getPersona('does-not-exist')).toThrow(/unknown persona/);
  });
});

describe('fixtures/finance', () => {
  it('every persona fixture is labeled synthetic and matches getPersona', () => {
    for (const f of fixtures) {
      expect(SourceSchema.parse(f.source)).toBe('synthetic');
      const data = FinancialProfileSchema.parse(f.data);
      expect(getPersona(data.id)).toEqual(data);
    }
  });
});
