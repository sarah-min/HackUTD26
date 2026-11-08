export interface StoragePort {
  presignPut(
    key: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<{ url: string; expiresAt: number }>;
  presignGet(key: string, ttlSec?: number): Promise<string>;
  getObject(key: string): Promise<Buffer>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  ping(): Promise<boolean>;
}
