import { describe, expect, it } from 'vitest';
import { extractJsonObject } from '../src';

describe('extractJsonObject', () => {
  it('handles think blocks, fences and trailing prose', () => {
    expect(extractJsonObject('<think>{"x":1}</think>```json\n{"a":{"b":"}"}}\n``` thanks')).toEqual({ a: { b: '}' } });
  });
  it('throws without JSON', () => {
    expect(() => extractJsonObject('no json here')).toThrow();
  });
});
