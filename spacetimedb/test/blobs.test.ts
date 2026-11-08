// File storage inside the module: upload authorization, read authorization, ID-image deletion, lifecycle.
import { describe, expect, it } from 'vitest';
import { setup, mod, HEX } from './helpers';

const read = (s: ReturnType<typeof setup>, auth: any, key: string, seq = 0) =>
  (mod.read_blob as any)(s.h.procedureContext(auth), { object_key: key, seq });

describe('blob storage', () => {
  it('stores multi-chunk media for the reporter only, and attach_media needs the bytes', () => {
    const s = setup();
    const rep = s.user('rep');
    const mallory = s.user('mallory');
    const id = s.createReport(rep);
    const key = `media/${id}/${HEX('c')}.mp4`;
    expect(() => s.upload(mallory, key, 'video/mp4', 1000)).toThrow(/reporter only/);
    expect(() =>
      s.call(rep, mod.attach_media as any, { report_id: id, kind: 'video', object_key: key, content_type: 'video/mp4', size_bytes: 1000n, sha256: HEX('c') }),
    ).toThrow(/upload the file first/);
    const size = 512 * 1024 * 2 + 10; // 3 chunks
    s.upload(rep, key, 'video/mp4', size);
    const b = s.h.db.blob.object_key.find(key)!;
    expect(b.complete).toBe(true);
    expect(b.chunk_count).toBe(3);
    expect(() =>
      s.call(rep, mod.attach_media as any, { report_id: id, kind: 'video', object_key: key, content_type: 'video/mp4', size_bytes: 999n, sha256: HEX('c') }),
    ).toThrow(/does not match/);
    s.call(rep, mod.attach_media as any, { report_id: id, kind: 'video', object_key: key, content_type: 'video/mp4', size_bytes: BigInt(size), sha256: HEX('c') });
    expect([...s.h.db.media_asset.iter()].some(m => m.object_key === key)).toBe(true);
  });

  it('rejects bad chunk sizes, wrong types and oversize files', () => {
    const s = setup();
    const rep = s.user('rep');
    const id = s.createReport(rep);
    const key = `media/${id}/${HEX('d')}.jpg`;
    expect(() => s.upload(rep, key, 'application/pdf', 100)).toThrow(/content_type/);
    expect(() =>
      s.call(rep, mod.begin_upload as any, { object_key: key, content_type: 'image/jpeg', size_bytes: BigInt(16 * 1024 * 1024), sha256: HEX('d'), chunk_count: 32 }),
    ).toThrow(/too large/);
    s.call(rep, mod.begin_upload as any, { object_key: key, content_type: 'image/jpeg', size_bytes: 100n, sha256: HEX('d'), chunk_count: 1 });
    expect(() => s.call(rep, mod.upload_chunk as any, { object_key: key, seq: 0, bytes: new Uint8Array(99) })).toThrow(/must be 100 bytes/);
    expect(() => s.call(rep, mod.begin_upload as any, { object_key: '../etc/passwd', content_type: 'image/jpeg', size_bytes: 1n, sha256: HEX('d'), chunk_count: 1 })).toThrow(/object_key/);
  });

  it('serves media to the worker and verified residents only; never serves idv/ to clients', () => {
    const s = setup();
    const rep = s.user('rep');
    const owner = s.user('owner');
    const stranger = s.user('stranger');
    const id = s.createReport(rep);
    s.attach(rep, id, 'image', 3);
    const key = `media/${id}/${HEX('3')}.jpg`;
    expect(read(s, s.worker, key).ok).toBe(true);
    expect(read(s, s.worker, key).part.bytes.length).toBe(1000);
    expect(read(s, stranger, key).error).toBe('forbidden');
    expect(read(s, owner, key).error).toBe('forbidden');
    const v = s.verify(owner);
    expect(v.state).toBe('verified');
    expect(read(s, owner, key).ok).toBe(true);
    expect(read(s, owner, `idv/${v.id}/doc.jpg`).error).toBe('forbidden');
  });

  it('deletes the ID image when the verification is decided', () => {
    const s = setup();
    const owner = s.user('owner');
    const v = s.verify(owner);
    expect(s.h.db.blob.object_key.find(`idv/${v.id}/doc.jpg`)).toBeFalsy();
    expect([...s.h.db.blob_chunk.iter()].some(c => c.object_key.startsWith('idv/'))).toBe(false);
  });

  it('lets only the worker store frames and delete objects', () => {
    const s = setup();
    const rep = s.user('rep');
    const id = s.createReport(rep);
    const fk = `frames/${id}/0.jpg`;
    expect(() => s.call(rep, mod.put_blob as any, { object_key: fk, content_type: 'image/jpeg', bytes: new Uint8Array(10) })).toThrow(/service only/);
    s.call(s.worker, mod.put_blob as any, { object_key: fk, content_type: 'image/jpeg', bytes: new Uint8Array(10) });
    expect(read(s, s.worker, fk).part.bytes.length).toBe(10);
    expect(() => s.call(rep, mod.delete_blob as any, { object_key: fk })).toThrow(/service only/);
    s.call(s.worker, mod.delete_blob as any, { object_key: fk });
    expect(read(s, s.worker, fk).error).toBe('not_found');
  });

  it('purges unfinished uploads after an hour', () => {
    const s = setup();
    const rep = s.user('rep');
    const id = s.createReport(rep);
    const key = `media/${id}/${HEX('e')}.mp4`;
    s.call(rep, mod.begin_upload as any, { object_key: key, content_type: 'video/mp4', size_bytes: 600000n, sha256: HEX('e'), chunk_count: 2 });
    s.advanceMs(61 * 60 * 1000);
    s.call(s.internal, mod.requeue_expired_jobs as any, { arg: { scheduled_id: 0n, scheduled_at: { tag: 'Interval', value: { micros: 30000000n } } } });
    expect(s.h.db.blob.object_key.find(key)).toBeFalsy();
  });
});
