import { readLocal, writeLocal } from './storage';

/**
 * Client-generated secrets (CONTRACTS.md §1): 32 random bytes, base64url, kept in
 * localStorage. The module stores only the sha256 hex; HTTP routes authorize with the secret.
 */
export function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const reporterKey = (reportId: string) => `secret:report:${reportId}`;
const verificationKey = (hash: string) => `secret:verification:${hash}`;

export function saveReporterSecret(reportId: string, secret: string): void {
  writeLocal(reporterKey(reportId), secret);
}
export function getReporterSecret(reportId: string): string | null {
  return readLocal(reporterKey(reportId));
}

/**
 * The verification id isn't known until the row appears (reducers return no data), so the
 * secret is stored under its own hash and matched to the `verification.secretHash` column.
 */
export function saveVerificationSecret(secretHash: string, secret: string): void {
  writeLocal(verificationKey(secretHash), secret);
}
export function getVerificationSecret(secretHash: string): string | null {
  return readLocal(verificationKey(secretHash));
}
