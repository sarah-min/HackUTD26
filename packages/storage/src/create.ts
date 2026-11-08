import { MemoryStorage } from './memory';
import type { StoragePort } from './port';
import { S3Storage } from './s3';

export type StorageEnv = {
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  STORAGE_DRIVER?: string;
};

export function createStorageFromEnv(env: StorageEnv = process.env as StorageEnv): StoragePort {
  if (env.STORAGE_DRIVER === 'memory') return new MemoryStorage();

  const endpoint = env.S3_ENDPOINT;
  const region = env.S3_REGION ?? 'us-east-1';
  const bucket = env.S3_BUCKET;
  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'S3 storage env incomplete (need S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY) or set STORAGE_DRIVER=memory',
    );
  }

  return new S3Storage({
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
  });
}
