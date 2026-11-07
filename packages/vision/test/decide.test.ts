import { describe, expect, it } from 'vitest';
import { normalizeAddress } from '@hack/address';
import { IdDocumentFieldsSchema, VerificationResultSchema } from '@hack/contracts';
import { decideVerification, parseAddressText } from '../src';
import specimen from '../../../fixtures/verification/id-fields-specimen.json';
import expired from '../../../fixtures/verification/id-fields-expired.json';
import notId from '../../../fixtures/verification/id-fields-not-an-id.json';
import wrong from '../../../fixtures/verification/id-fields-wrong-address.json';

const property = normalizeAddress({ line1: '1234 Main St', city: 'Dallas', state: 'TX', zip: '75201', lat: 32.78, lng: -96.8, source: 'census' });
const today = new Date('2026-11-07T12:00:00Z');
const f = (x: unknown) => IdDocumentFieldsSchema.parse(x);

describe('decideVerification (CONTRACTS §3.3 order)', () => {
  it('verifies a specimen with the matching address', () => {
    const r = decideVerification(f(specimen), property, today);
    expect(r).toEqual({ ok: true, nameOnDoc: 'SAMPLE SPECIMEN', matchedNormalized: property.normalized });
    expect(VerificationResultSchema.safeParse(r).success).toBe(true);
  });
  it('wrong address → address_mismatch', () => {
    expect(decideVerification(f(wrong), property, today)).toEqual({ ok: false, failReason: 'address_mismatch' });
  });
  it('different house number on the same street → address_mismatch', () => {
    const doc = f({ ...specimen, addressText: '1236 Main St, Dallas, TX 75201' });
    expect(decideVerification(doc, property, today).failReason).toBe('address_mismatch');
  });
  it('expired license → expired (before the address check)', () => {
    expect(decideVerification(f(expired), property, today).failReason).toBe('expired');
  });
  it('expiration is ignored for utility bills', () => {
    const bill = f({ ...specimen, docKind: 'utility_bill', expiration: '2001-01-01' });
    expect(decideVerification(bill, property, today).ok).toBe(true);
  });
  it('not an ID wins over everything', () => {
    expect(decideVerification(f({ ...notId, confidence: 0.1 }), property, today).failReason).toBe('not_an_id');
  });
  it('low confidence → unreadable', () => {
    expect(decideVerification(f({ ...specimen, confidence: 0.4 }), property, today).failReason).toBe('unreadable');
  });
  it('no validated fields → unreadable', () => {
    expect(decideVerification(null, property, today).failReason).toBe('unreadable');
  });
  it('ZIP+4, punctuation and unit tolerant', () => {
    const doc = f({ ...specimen, addressText: '1234 Main Street\n Dallas, Tx. 75201-4410' });
    expect(decideVerification(doc, property, today).ok).toBe(true);
  });
});

describe('parseAddressText', () => {
  it('parses comma and no-comma forms', () => {
    expect(parseAddressText('500 N Elm Ave Apt 3, Austin, TX 78701')).toMatchObject({ line1: '500 N Elm Ave Apt 3', city: 'Austin', state: 'TX', zip: '78701' });
    expect(parseAddressText('500 N ELM AVE AUSTIN TX 78701')).toMatchObject({ line1: '500 N ELM AVE', city: 'AUSTIN' });
    expect(parseAddressText('Austin, TX')).toBeNull();
  });
});
