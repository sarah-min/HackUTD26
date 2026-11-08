import { describe, expect, it } from 'vitest';
import { generateRecoveryCode } from '../../../lib/stdb/recoveryCode';
import { downloadText } from './copy';
import { cleanPaste } from './cleanPaste';

describe('cleanPaste', () => {
  it('regroups a code pasted in any case or spacing', () => {
    const code = generateRecoveryCode();
    expect(cleanPaste(code.toLowerCase())).toBe(code);
    expect(cleanPaste(`  ${code.replace(/-/g, ' ')}\n`)).toBe(code);
    expect(cleanPaste(code.replace(/-/g, ''))).toBe(code);
  });

  it('finds the code inside the downloaded file text', () => {
    const code = generateRecoveryCode();
    expect(cleanPaste(downloadText(code))).toBe(code);
  });

  it('passes unrecognised text through, trimmed and capped', () => {
    expect(cleanPaste('  hello  ')).toBe('hello');
    expect(cleanPaste('x'.repeat(100))).toHaveLength(40);
  });
});
