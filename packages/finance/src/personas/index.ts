import { FinancialProfileSchema, type FinancialProfile } from '@hack/contracts/finance';
import { aisha } from './aisha';
import { james } from './james';
import { maria } from './maria';

export const PERSONAS: FinancialProfile[] = [maria, james, aisha].map((p) =>
  FinancialProfileSchema.parse(p),
);

const byId = new Map(PERSONAS.map((p) => [p.id, p]));

export function getPersona(id: string): FinancialProfile {
  const profile = byId.get(id);
  if (!profile) {
    throw new Error(`unknown persona id: ${id}`);
  }
  return profile;
}

export { aisha, james, maria };
