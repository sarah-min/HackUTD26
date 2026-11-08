import { type IdDocumentFields } from '@hack/contracts/verification';
import type { ChatMessage, NimClient } from '@hack/agent';
import { toDataUrl, type ImageMime } from './image';
import { parseIdExtraction } from './verify/idExtraction';
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
    const res = await args.nim.chat({ model: modelId, messages, temperature: 0, max_tokens: 800 }, { signal: args.signal });
    const parsed = parseIdExtraction(res.content ?? '', modelId, ID_DOCUMENT_PROMPT_VERSION);
    if (parsed.ok) return parsed.value;
    // Retry message carries only known key names, never model-provided text (no injection channel).
    messages.push({ role: 'assistant', content: '(previous answer omitted)' });
    messages.push({ role: 'user', content: `Your JSON failed validation (${parsed.error}). Return only the JSON object with exactly the listed keys.` });
  }
  return null;
}
