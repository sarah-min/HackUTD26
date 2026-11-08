'use client';

import { useMemo } from 'react';
import { useSpacetimeDB, useTable, useReducer } from 'spacetimedb/react';
import type { Identity } from 'spacetimedb';
import { T, R, type VerificationRow } from './bindings';

export { useReducer, R, T };

/** Current connection state and this browser's anonymous identity. */
export function useStdb(): { identity: Identity | undefined; isActive: boolean; error: Error | undefined } {
  const s = useSpacetimeDB();
  return { identity: s.identity, isActive: s.isActive, error: s.connectionError };
}

/** This identity's verification rows (the view is already scoped to the sender). */
export function useMyVerifications() {
  return useTable(T.myVerifications);
}

/**
 * Is this browser identity verified for `propertyId`?
 * `latest` is the newest verification row for that property (any state), for status UI.
 */
export function useVerifiedFor(propertyId: bigint | null): {
  verified: boolean;
  /** The verified row, if any (used for /api/media credentials). */
  verifiedRow: VerificationRow | undefined;
  latest: VerificationRow | undefined;
  ready: boolean;
} {
  const [rows, ready] = useMyVerifications();
  return useMemo(() => {
    if (propertyId === null) return { verified: false, verifiedRow: undefined, latest: undefined, ready };
    const mine = [...rows.filter((v) => v.propertyId === propertyId)].sort((a, b) => (a.id < b.id ? 1 : -1));
    const verifiedRow = mine.find((v) => v.state === 'verified');
    return { verified: verifiedRow !== undefined, verifiedRow, latest: mine[0], ready };
  }, [rows, ready, propertyId]);
}

/** Finds the verification row created with a given client secret hash (see secrets.ts). */
export function useVerificationBySecretHash(secretHash: string | null): VerificationRow | undefined {
  const [rows] = useMyVerifications();
  return useMemo(
    () => (secretHash ? rows.find((v) => v.secretHash === secretHash) : undefined),
    [rows, secretHash],
  );
}

export function useProperty(propertyId: bigint | null) {
  const [rows, ready] = useTable(T.property.where((r) => r.id.eq(propertyId ?? 0n)), {
    enabled: propertyId !== null,
  });
  return { property: rows[0], ready };
}

/** Public report rows for one property (no PII), newest first. */
export function useReportsForProperty(propertyId: bigint | null) {
  const [rows, ready] = useTable(T.report.where((r) => r.propertyId.eq(propertyId ?? 0n)), {
    enabled: propertyId !== null,
  });
  const sorted = useMemo(() => [...rows].sort((a, b) => (a.id < b.id ? 1 : -1)), [rows]);
  return { reports: sorted, ready };
}

export function useReport(reportId: bigint | null) {
  const [rows, ready] = useTable(T.report.where((r) => r.id.eq(reportId ?? 0n)), {
    enabled: reportId !== null,
  });
  return { report: rows[0], ready };
}

/** Aggregated area cells (public). Filtered client-side to the requested cell ids. */
export function useAreaCells(cellIds: readonly string[]) {
  const [rows, ready] = useTable(T.areaCellSummary, { enabled: cellIds.length > 0 });
  const wanted = useMemo(() => new Set(cellIds), [cellIds]);
  const cells = useMemo(() => rows.filter((c) => wanted.has(c.cellId)), [rows, wanted]);
  return { cells, ready };
}

/**
 * Public area notices (NWS alerts + FEMA declarations) for the property's county.
 * Visible to everyone, verified or not: property → county_fips → area_notice rows.
 * Declarations first, then alerts by severity order the worker wrote them in.
 */
export function useAreaNotices(propertyId: bigint | null) {
  const { property, ready: propReady } = useProperty(propertyId);
  const fips = property?.countyFips ?? null;
  const [rows, ready] = useTable(T.areaNotice.where((n) => n.countyFips.eq(fips ?? '')), {
    enabled: fips !== null,
  });
  const notices = useMemo(
    () => [...rows].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'fema_declaration' ? -1 : 1)),
    [rows]
  );
  return { notices, countyFips: fips, ready: propReady && (fips === null || ready) };
}

/** Exact address for a property; only returns a row if this identity is verified for it. */
export function useVerifiedPropertyPrivate(propertyId: bigint | null) {
  const [rows, ready] = useTable(T.myPropertyPrivates, { enabled: propertyId !== null });
  return { propertyPrivate: rows.find((r) => r.propertyId === propertyId), ready };
}

/**
 * Everything this identity can read about one report. For a verified affected person that's
 * the assessment, frames, all trace steps, media and the private report row. For the reporter
 * (not verified) the views return only `visibility='reporter'` steps and their own private row.
 * P3's <DamageReport>/<AgentTrace> and P4's <RecoverySummaryCard> can use this instead of
 * subscribing themselves.
 */
export function useVerifiedReportData(reportId: bigint | null) {
  const enabled = reportId !== null;
  const [assessments, aReady] = useTable(T.myAssessments, { enabled });
  const [frames, fReady] = useTable(T.myFrames, { enabled });
  const [steps, sReady] = useTable(T.myAgentSteps, { enabled });
  const [media, mReady] = useTable(T.myMediaAssets, { enabled });
  const [privs, pReady] = useTable(T.myReportPrivates, { enabled });
  return useMemo(
    () => ({
      assessment: assessments.find((r) => r.reportId === reportId),
      frames: frames.filter((r) => r.reportId === reportId).sort((a, b) => a.frameIndex - b.frameIndex),
      steps: steps.filter((r) => r.reportId === reportId).sort((a, b) => a.seq - b.seq),
      media: media.filter((r) => r.reportId === reportId),
      reportPrivate: privs.find((r) => r.reportId === reportId),
      ready: aReady && fReady && sReady && mReady && pReady,
    }),
    [assessments, frames, steps, media, privs, reportId, aReady, fReady, sReady, mReady, pReady],
  );
}

// ── Reporter view (Part 1 pages: /report/[id], /reporter) ─────────────────────────────

/**
 * Reports this browser identity submitted, newest first, joined with their private row
 * (lat/lng for the My-submissions map pin; prefer deviceLat/deviceLng-derived lat/lng).
 */
export function useMyReports() {
  const [reports, r1] = useTable(T.myReports);
  const [privates, r2] = useTable(T.myReportPrivates);
  return useMemo(() => {
    const byId = new Map(privates.map((p) => [p.reportId, p]));
    const rows = [...reports]
      .sort((a, b) => (a.id < b.id ? 1 : -1))
      .map((report) => ({ report, private: byId.get(report.id) }));
    return { rows, ready: r1 && r2 };
  }, [reports, privates, r1, r2]);
}

/**
 * Status-timeline steps for one report, ordered by seq. For a reporter the view only returns
 * visibility='reporter' steps; a verified affected person gets every step.
 */
export function useReportSteps(reportId: bigint | null) {
  const [steps, ready] = useTable(T.myAgentSteps, { enabled: reportId !== null });
  const sorted = useMemo(
    () => (reportId === null ? [] : [...steps.filter((s) => s.reportId === reportId)].sort((a, b) => a.seq - b.seq)),
    [steps, reportId],
  );
  return { steps: sorted, ready };
}
