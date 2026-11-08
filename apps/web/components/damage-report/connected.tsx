'use client';

import { useMemo } from 'react';
import { idFromString, useReport, useVerifiedReportData } from '@/lib/stdb';
import { useVerificationCredentials } from '@/components/affected/useVerificationCredentials';
import { DamageReportView } from './DamageReport';

/** Props Part 2's report page passes (apps/web/components/affected/placeholders/types.ts). */
export interface DamageReportProps {
  reportId: string;
  className?: string;
}

/**
 * Live damage report for a verified affected person. Reads the assessment and frames from `my_assessments` /
 * `my_frames` (empty for anyone not verified for the property) and loads frame thumbnails through /api/media with
 * this browser's verification credentials.
 */
export function DamageReport({ reportId, className }: DamageReportProps) {
  const id = idFromString(reportId);
  const { report } = useReport(id);
  const { assessment, frames, ready } = useVerifiedReportData(id);
  const creds = useVerificationCredentials(report?.propertyId ?? null);
  const mediaAuth = useMemo(() => (creds ? { verificationId: creds.id, verificationSecret: creds.secret } : undefined), [creds]);
  if (id === null) return null;
  if (!ready && !assessment) {
    return <p className={`text-sm text-zinc-500 dark:text-zinc-400 ${className ?? ''}`}>Loading report…</p>;
  }
  return <DamageReportView reportId={reportId} assessment={assessment?.json ?? null} frames={frames} mediaAuth={mediaAuth} className={className} />;
}
