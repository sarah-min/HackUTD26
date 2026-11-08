import { formatRecoveryCode, isRecoveryCodeShape } from '../../../lib/stdb/recoveryCode';

const CODE_IN_TEXT = /[0-9A-Za-z]{4}(?:[\s\-\u2010-\u2015]*[0-9A-Za-z]{4}){4}/;

/** Pulls a recovery code out of pasted text. Otherwise returns the text trimmed and capped. */
export function cleanPaste(text: string): string {
  if (isRecoveryCodeShape(text)) return formatRecoveryCode(text);
  const hit = text.match(CODE_IN_TEXT)?.[0];
  if (hit && isRecoveryCodeShape(hit)) return formatRecoveryCode(hit);
  return text.trim().slice(0, 40);
}
