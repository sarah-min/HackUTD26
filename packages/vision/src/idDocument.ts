import { IdDocumentFieldsSchema, type IdDocumentFields } from '@hack/contracts/verification';
import type { ChatMessage, NimClient } from '@hack/agent';
import { toDataUrl, type ImageMime } from './image';
import { clampString, clampUnit, parseModelJson } from './json';
import { ID_DOCUMENT_PROMPT_VERSION, ID_DOCUMENT_SYSTEM_PROMPT, ID_DOCUMENT_USER_TEXT } from './prompts/id-document';

/**
 * Nemotron VL → IdDocumentFields. One retry on validation failure, then null (→ `unreadable`).
 * The caller owns deletion of the image. Never log the returned fields.
 */
export async function extractIdDocument(args: {
  nim: NimClient;
  image: Buffer;
  mime: ImageMime;
  signal?: AbortSignal;
}): Promise<IdDocumentFields | null> {
  const modelId = args.nim.models.vision;
  const prepare = (raw: unknown): unknown => {
    if (!raw || typeof raw !== 'object') return raw;
    const r = raw as Record<string, unknown>;
    const out: Record<string, unknown> = {
      ...r,
      fullName: clampString(r.fullName ?? '', 120),
      addressText: clampString(r.addressText ?? '', 200),
      confidence: clampUnit(r.confidence),
      modelId,
      promptVersion: ID_DOCUMENT_PROMPT_VERSION,
    };
    if (out.expiration === null || out.expiration === '') delete out.expiration;
    return out;
  };
  const messages: ChatMessage[] = [
    { role: 'system', content: ID_DOCUMENT_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: ID_DOCUMENT_USER_TEXT },
        { type: 'image_url', image_url: { url: toDataUrl(args.image, args.mime) } },
      ],
    },
  ];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await args.nim.chat({ model: modelId, messages, temperature: 0, max_tokens: 600 }, { signal: args.signal });
    const parsed = parseModelJson(res.content ?? '', IdDocumentFieldsSchema, prepare);
    if (parsed.ok) return parsed.value;
    // Retry message carries only the validation error, never the extracted text.
    messages.push({ role: 'assistant', content: '(previous answer omitted)' });
    messages.push({ role: 'user', content: `Your JSON failed validation: ${parsed.error}. Return the corrected JSON object only.` });
  }
  return null;
}
