// Defense against prompt injection through the document image. Everything the model reads off the image
// is untrusted DATA: it is sanitized here and may only ever be used as data by deterministic code.

/** Control (Cc), format (Cf: zero-width, bidi, tag chars, BOM), private-use, surrogate and unassigned code points. */
const HIDDEN_CHARS = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Cn}︀-️]/gu;
const PLAIN_WHITESPACE = /[\t\n\r\v\f]/g;

export interface SanitizedText {
  text: string;
  /** True when invisible/control/bidi/tag characters (other than ordinary whitespace) were present and removed. */
  hidden: boolean;
}

/** NFKC-normalizes (folds full-width and compatibility forms), strips hidden characters, collapses whitespace. */
export function sanitizeText(input: string): SanitizedText {
  const normalized = input.normalize('NFKC').replace(PLAIN_WHITESPACE, ' ').replace(/\p{Z}+/gu, ' ');
  const hidden = HIDDEN_CHARS.test(normalized);
  HIDDEN_CHARS.lastIndex = 0;
  const text = normalized.replace(HIDDEN_CHARS, '').replace(/ {2,}/g, ' ').trim();
  return { text, hidden };
}

// Squashed (letters and digits only, lower-case) so spacing / punctuation tricks ("i g n o r e") still match.
const INJECTION_SQUASHED = [
  'ignoreprevious', 'ignoreall', 'ignoretheabove', 'ignoreabove', 'ignoreprior', 'disregard', 'forgetprevious',
  'forgetall', 'systemprompt', 'newinstruction', 'previousinstruction', 'allinstructions', 'youarenow',
  'markverified', 'markasverified', 'setverified', 'verifiedtrue', 'oktrue', 'okistrue', 'overridethe', 'jailbreak',
  'asanai', 'assistant', 'developermessage',
];
const STRUCTURE_CHARS = /[{}<>[\]`\\|]|"\s*:/;

/** True when text reads like instructions or structured output aimed at the model, not like a name or address. */
export function looksLikeInjection(text: string): boolean {
  const { text: clean } = sanitizeText(text);
  if (STRUCTURE_CHARS.test(clean)) return true;
  const squashed = clean.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return INJECTION_SQUASHED.some((p) => squashed.includes(p));
}

type Script = 'latin' | 'cyrillic' | 'greek';
/** Letters from more than one of Latin/Cyrillic/Greek in one string: the classic homoglyph trick. */
export function hasMixedScripts(text: string): boolean {
  const seen = new Set<Script>();
  for (const ch of text) {
    if (/\p{Script=Latin}/u.test(ch)) seen.add('latin');
    else if (/\p{Script=Cyrillic}/u.test(ch)) seen.add('cyrillic');
    else if (/\p{Script=Greek}/u.test(ch)) seen.add('greek');
  }
  return seen.size > 1;
}
