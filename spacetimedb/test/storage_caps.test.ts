// Upload caps (9 media blobs and 60 MB per report, 3 idv blobs per verification) and report privacy.
import { describe, expect, it } from 'vitest';
import { setup, mod, HEX } from './helpers';

const begin = (s: ReturnType<typeof setup>, who: any, key: string, type: string, size: number) =>
  s.call(who, mod.begin_upload as any, { object_key: key, content_type: type, size_bytes: BigInt(size), sha256: HEX('b'), chunk_count: Math.ceil(size / (512 * 1024)) });

describe('storage caps', () => {
  it('rejects a 10th media file for one report', () => {
    const s = setup();
    const a = s.user('a');
    const rid = s.createReport(a);
    for (let i = 0; i < 9; i++) begin(s, a, `media/${rid}/f${i}.jpg`, 'image/jpeg', 1000);
    expect(() => begin(s, a, `media/${rid}/f9.jpg`, 'image/jpeg', 1000)).toThrow(/too many files/);
  });

  it('rejects more than 60 MB of media for one report', () => {
    const s = setup();
    const a = s.user('a');
    const rid = s.createReport(a);
    begin(s, a, `media/${rid}/v1.mp4`, 'video/mp4', 50 * 1024 * 1024);
    expect(() => begin(s, a, `media/${rid}/v2.mp4`, 'video/mp4', 20 * 1024 * 1024)).toThrow(/too much media/);
  });

  it('rejects a 4th ID file for one verification', () => {
    const s = setup();
    const a = s.user('a');
    s.call(a, mod.start_verification as any, {
      address_json: JSON.stringify({ line1: '9 Elm St', city: 'Dallas', state: 'TX', zip: '75201', lat: 32.78, lng: -96.8, normalized: '9 ELM ST DALLAS TX 75201' }),
      doc_kind: 'state_id',
      secret_hash: HEX('e'),
    });
    const ver = [...s.h.db.verification.identity.filter(s.idOf(a))][0]!;
    for (let i = 0; i < 3; i++) begin(s, a, `idv/${ver.id}/d${i}.jpg`, 'image/jpeg', 1000);
    expect(() => begin(s, a, `idv/${ver.id}/d3.jpg`, 'image/jpeg', 1000)).toThrow(/too many files/);
  });
});

describe('report table is private', () => {
  it('is not a public table (no client can subscribe to it)', () => {
    const s = setup();
    const a = s.user('a');
    s.createReport(a);
    // Reporter still sees their own report through my_reports; a stranger sees nothing.
    expect((s.view(a, mod.my_reports as any) as any[]).length).toBe(1);
    expect((s.view(s.user('stranger'), mod.my_reports as any) as any[]).length).toBe(0);
    expect((s.view(s.user('stranger'), mod.my_property_reports as any) as any[]).length).toBe(0);
  });

  it('shows verified owners their property reports only, and the worker its open-job reports', () => {
    const s = setup();
    const reporter = s.user('reporter');
    const owner = s.user('owner');
    const other = s.user('other');
    const rid = s.createReport(reporter);
    s.attach(reporter, rid);
    s.call(reporter, mod.submit_report as any, { report_id: rid });
    s.verify(owner);
    expect((s.view(owner, mod.my_property_reports as any) as any[]).map(r => r.id)).toEqual([rid]);
    expect((s.view(other, mod.my_property_reports as any) as any[]).length).toBe(0);
    expect((s.view(s.worker, mod.svc_reports as any) as any[]).map(r => r.id)).toEqual([rid]);
    expect((s.view(owner, mod.svc_reports as any) as any[]).length).toBe(0);
  });
});
