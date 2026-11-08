// Object storage inside SpacetimeDB (no S3). The worker reads any object with the read_blob procedure (service role),
// writes frame thumbnails with put_blob and deletes ID images with delete_blob. Keys: media/<reportId>/...,
// frames/<reportId>/<n>.jpg, idv/<verificationId>/...
import type { ObjectStore } from '@hack/agent';
import type { SdkServiceConnection } from './sdk';

export class SpacetimeStore implements ObjectStore {
  constructor(private readonly svc: SdkServiceConnection) {}

  async getObject(key: string): Promise<Buffer> {
    const parts: Uint8Array[] = [];
    let count = 1;
    for (let seq = 0; seq < count; seq++) {
      const r = await this.svc.conn.procedures.readBlob({ objectKey: key, seq });
      if (!r.ok || !r.part) throw new Error(`object ${key}: ${r.error || 'unreadable'}`);
      count = r.part.chunkCount;
      parts.push(r.part.bytes);
    }
    return Buffer.concat(parts);
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.svc.conn.reducers.putBlob({ objectKey: key, contentType, bytes: new Uint8Array(body) });
  }

  async deleteObject(key: string): Promise<void> {
    await this.svc.conn.reducers.deleteBlob({ objectKey: key });
  }

  async ping(): Promise<boolean> {
    return this.svc.conn.isActive;
  }
}
