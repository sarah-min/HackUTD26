import type { StoragePort } from './port';
import { PRESIGN_GET_TTL_SEC, PRESIGN_PUT_TTL_SEC } from './keys';

type Entry = { body: Buffer; contentType: string };

/** In-process StoragePort for unit tests and local demos (source: fixture). */
export class MemoryStorage implements StoragePort {
  private readonly objects = new Map<string, Entry>();

  async presignPut(
    key: string,
    contentType: string,
    _sizeBytes: number,
  ): Promise<{ url: string; expiresAt: number }> {
    const expiresAt = Date.now() + PRESIGN_PUT_TTL_SEC * 1000;
    const url = `memory://put/${encodeURIComponent(key)}?ct=${encodeURIComponent(contentType)}&exp=${expiresAt}`;
    return { url, expiresAt };
  }

  async presignGet(key: string, ttlSec = PRESIGN_GET_TTL_SEC): Promise<string> {
    if (!this.objects.has(key)) throw new Error(`object not found: ${key}`);
    const expiresAt = Date.now() + ttlSec * 1000;
    return `memory://get/${encodeURIComponent(key)}?exp=${expiresAt}`;
  }

  async getObject(key: string): Promise<Buffer> {
    const entry = this.objects.get(key);
    if (!entry) throw new Error(`object not found: ${key}`);
    return Buffer.from(entry.body);
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body: Buffer.from(body), contentType });
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async ping(): Promise<boolean> {
    return true;
  }
}
