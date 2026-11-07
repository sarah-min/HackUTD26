import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { AgentFinishSchema, FrameFindingSchema, IdDocumentFieldsSchema, VerificationResultSchema } from '@hack/contracts';

const root = path.resolve(__dirname, '../../../fixtures');
const read = (p: string) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));

describe('Part 3 fixtures validate and are labeled', () => {
  it('assessment fixtures', () => {
    const f = read('assessment/findings-sample.json');
    expect(f.source).toBe('fixture');
    for (const x of f.findings) expect(FrameFindingSchema.safeParse(x).success).toBe(true);
    const fin = read('assessment/agent-finish.json');
    expect(fin.source).toBe('fixture');
    expect(AgentFinishSchema.safeParse(fin).success).toBe(true);
  });
  it('verification fixtures use only the SAMPLE SPECIMEN identity', () => {
    for (const file of readdirSync(path.join(root, 'verification')).filter((f) => f.endsWith('.json'))) {
      const v = read(`verification/${file}`);
      const schema = file.startsWith('id-fields') ? IdDocumentFieldsSchema : VerificationResultSchema;
      expect(schema.safeParse(v).success, file).toBe(true);
      if (v.fullName || v.nameOnDoc) expect(v.fullName ?? v.nameOnDoc).toBe('SAMPLE SPECIMEN');
    }
  });
});
