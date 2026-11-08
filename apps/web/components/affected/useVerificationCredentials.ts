'use client';
import { useMemo } from 'react';
import { getVerificationSecret, idToString, useVerifiedFor } from '@/lib/stdb';

/**
 * The {id, secret} pair of this browser's *verified* verification for a property, used to
 * authorize /api/media reads. null when unverified or when the secret isn't in this browser.
 */
export function useVerificationCredentials(propertyId: bigint | null): { id: string; secret: string } | null {
  const { verifiedRow } = useVerifiedFor(propertyId);
  return useMemo(() => {
    if (!verifiedRow) return null;
    const secret = getVerificationSecret(verifiedRow.secretHash);
    return secret ? { id: idToString(verifiedRow.id), secret } : null;
  }, [verifiedRow]);
}
