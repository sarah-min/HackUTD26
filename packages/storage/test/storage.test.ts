import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MemoryStorage,
  assertIdvUpload,
  assertMediaUpload,
  createStorageFromEnv,
  idvObjectKey,
  isIdvKey,
  mediaObjectKey,
} from '../src/index';

describe('keys + limits', () => {
  it('builds media and idv keys', () => {
    const sha = createHash('sha256').update('x').digest('hex');
    expect(mediaObjectKey('42', sha, 'video/mp4')).toBe(`media/42/${sha}.mp4`);
    expect(idvObjectKey('7', 'image/jpeg')).toMatch(/^idv\/7\/[0-9a-f-]+\.jpg$/i);
    expect(isIdvKey('idv/7/a.jpg')).toBe(true);
    expect(isIdvKey('media/1/a.mp4')).toBe(false);
  });

  it('rejects oversize / wrong types', () => {
    expect(() => assertMediaUpload('video/mp4', 201 * 1024 * 1024)).toThrow(/sizeBytes/);
    expect(() => assertMediaUpload('application/pdf', 100)).toThrow(/contentType/);
    expect(() => assertIdvUpload('video/mp4', 100)).toThrow(/contentType/);
    expect(() => assertIdvUpload('image/png', 16 * 1024 * 1024)).toThrow(/sizeBytes/);
  });
});

describe('MemoryStorage', () => {
  it('round-trips put/get/delete and presigns', async () => {
    const s = new MemoryStorage();
    await s.putObject('media/1/a.jpg', Buffer.from('hi'), 'image/jpeg');
    expect((await s.getObject('media/1/a.jpg')).toString()).toBe('hi');
    const put = await s.presignPut('media/1/b.jpg', 'image/jpeg', 2);
    expect(put.url).toContain('memory://put/');
    expect(put.expiresAt).toBeGreaterThan(Date.now());
    const get = await s.presignGet('media/1/a.jpg');
    expect(get).toContain('memory://get/');
    await s.deleteObject('media/1/a.jpg');
    await expect(s.getObject('media/1/a.jpg')).rejects.toThrow(/not found/);
    expect(await s.ping()).toBe(true);
  });
});

describe('createStorageFromEnv', () => {
  it('uses memory driver when requested', () => {
    const s = createStorageFromEnv({ STORAGE_DRIVER: 'memory' });
    expect(s).toBeInstanceOf(MemoryStorage);
  });

  it('throws when S3 env is incomplete', () => {
    expect(() => createStorageFromEnv({ S3_ENDPOINT: 'https://s3.example.com' })).toThrow(/incomplete/);
  });
});
