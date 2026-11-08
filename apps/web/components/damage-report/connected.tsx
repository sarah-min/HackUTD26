'use client';

import { useMemo } from 'react';
import { idFromString, useReadFile, useReport, useVerifiedReportData } from '@/lib/stdb';
import { DamageReportView } from './DamageReport';
import { blobResolver } from './useMediaUrl';

/** Props Part 2's report page passes (apps/web/components/affected/placeholders/types.ts). */
export interface DamageReportProps {
  reportId: string;
  className?: string;
}

/**
 * Live damage report for a verified affected person. Reads the assessment and frames from `my_assessments` /
 * `my_frames` (empty for anyone not verified for the property) and loads frame thumbnails from SpacetimeDB storage
 * (read_blob checks that this browser identity is verified for the property).
 */
export function DamageReport({ reportId, className }: DamageReportProps) {
  const id = idFromString(reportId);
  useReport(id);
  const { assessment, frames, ready } = useVerifiedReportData(id);
  const read = useReadFile();
  const resolveMediaUrl = useMemo(() => blobResolver(read), [read]);
  if (id === null) return null;
  if (!ready && !assessment) {
    return <p className={`text-sm text-zinc-500 dark:text-zinc-400 ${className ?? ''}`}>Loading report…</p>;
  }
  return <DamageReportView reportId={reportId} assessment={assessment?.json ?? null} frames={frames} resolveMediaUrl={resolveMediaUrl} className={className} />;
}
