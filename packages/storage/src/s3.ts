import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StoragePort } from './port';
import { PRESIGN_GET_TTL_SEC, PRESIGN_PUT_TTL_SEC } from './keys';

export type S3StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export class S3Storage implements StoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(cfg: S3StorageConfig) {
    this.bucket = cfg.bucket;
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }

  async presignPut(
    key: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<{ url: string; expiresAt: number }> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: PRESIGN_PUT_TTL_SEC });
    return { url, expiresAt: Date.now() + PRESIGN_PUT_TTL_SEC * 1000 };
  }

  async presignGet(key: string, ttlSec = PRESIGN_GET_TTL_SEC): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: ttlSec });
  }

  async getObject(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error(`empty object: ${key}`);
    return Buffer.from(bytes);
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}
