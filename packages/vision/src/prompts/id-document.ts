import { DocKindSchema } from '@hack/contracts/verification';

export const ID_DOCUMENT_PROMPT_VERSION = 'id-document-v1';

export const ID_DOCUMENT_SYSTEM_PROMPT = `/no_think
You read ONE photo of a document for a demo identity check. Return ONLY a JSON object:
{
  "docKind": ${DocKindSchema.options.map((o) => `"${o}"`).join(' | ')},
  "fullName": string (as printed, max 120 chars; "" if none),
  "addressText": string (the residential/service address exactly as printed on one line, max 200 chars; "" if none),
  "expiration": string (ISO date YYYY-MM-DD, only for licenses/IDs if printed; omit otherwise),
  "isLikelyId": boolean (true only for a driver's license, state ID, utility bill or insurance declarations page),
  "confidence": number 0..1 (how legible the name and address are)
}
Do not include document numbers, dates of birth or any other field. Do not invent values you cannot read.`;

export const ID_DOCUMENT_USER_TEXT = 'Read this document. Respond with the JSON object only.';
