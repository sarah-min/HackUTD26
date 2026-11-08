'use client';

import { useMemo } from 'react';
import { useCallback } from 'react';
import { useSpacetimeDB, useTable, useReducer, useProcedure } from 'spacetimedb/react';
import type { Identity } from 'spacetimedb';
import { T, R, P, type VerificationRow } from './bindings';

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

/** Report rows for one property, newest first. Only a verified owner of that property gets rows (`report` is private). */
export function useReportsForProperty(propertyId: bigint | null) {
  const [rows, ready] = useTable(T.myPropertyReports.where((r) => r.propertyId.eq(propertyId ?? 0n)), {
    enabled: propertyId !== null,
  });
  const sorted = useMemo(() => [...rows].sort((a, b) => (a.id < b.id ? 1 : -1)), [rows]);
  return { reports: sorted, ready };
}

/** One report: the reporter's own (my_reports) or a verified owner's (my_property_reports). */
export function useReport(reportId: bigint | null) {
  const [mine, readyMine] = useTable(T.myReports.where((r) => r.id.eq(reportId ?? 0n)), {
    enabled: reportId !== null,
  });
  const [owned, readyOwned] = useTable(T.myPropertyReports.where((r) => r.id.eq(reportId ?? 0n)), {
    enabled: reportId !== null,
  });
  return { report: mine[0] ?? owned[0], ready: readyMine && readyOwned };
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

// ── Recovery-code accounts (affected persons; reporters never need one) ────────────────────────────
// No email, no SMS: the browser generates a 20-char recovery code (lib/stdb/recoveryCode.ts), shows it ONCE, and the module
// stores only its hash. Flow order, all against spacetimedb/src/reducers/accounts.ts:
//   1. useAccountStatus(): enabled === false means new sign-ups / sign-ins are switched off (hide the entry points).
//   2. create  (verified owner, no account):   generateRecoveryCode() -> show + have the user save it -> createAccount(code)
//      signin  (new device, existing account): signInWithCode(code)
//      stepup  (signed-in device, require_stepup on): stepUpWithCode(code)
//      rotate  (signed-in device):             replaceRecoveryCode(oldCode, generateRecoveryCode())
//   3. All four return { ok, error, retryAfterS, attemptsLeft } and never throw for expected failures. Enable submit only when
//      isRecoveryCodeShape(input); the module normalizes the same way (case, spaces, dashes, O->0, I/L->1).
//      createAccount errors:  accounts_disabled | locked | rate_limited | already_signed_in | not_verified_owner | invalid_code | code_taken
//      signInWithCode errors: accounts_disabled | locked | rate_limited | invalid_code (EVERY wrong code, attemptsLeft) | already_signed_in
//      stepUpWithCode errors: not_signed_in | locked | rate_limited | invalid_code
//      replaceRecoveryCode errors: not_signed_in | locked | rate_limited | invalid_code (old code) | invalid_new_code | code_unchanged | code_taken
//      locked / rate_limited carry retryAfterS (seconds); invalid_code carries attemptsLeft (5 failures per 15 min, then locked).
//   Label for the identity step: "Demo identity check — not production-grade verification."

/** This device's account (null when not signed in). The row has no secrets: { id, createdAt, lastLoginAt }. */
export function useAccount() {
  const [rows, ready] = useTable(T.myAccount);
  return { account: rows[0] ?? null, ready };
}

/** Are new sign-ups / sign-ins accepted? `enabled` is true until an admin sets account_config.accounts_enabled = false. */
export function useAccountStatus() {
  const [rows, ready] = useTable(T.myAccountStatus);
  return { enabled: rows[0]?.enabled ?? true, ready };
}

/** Devices on my account, current device first. */
export function useDevices() {
  const [rows, ready] = useTable(T.myDevices);
  const devices = useMemo(() => [...rows].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent)), [rows]);
  return { devices, ready };
}

/**
 * Step-up state of this device. `required` = the module enforces step-up for full reports (account_config.require_stepup);
 * `active` = a step-up is currently in effect (cleared by the module within ~60 s of expiry); `linked` = device is signed in.
 * When required && !active, full-report views are empty: push the user to create an account (not linked) or step up (linked).
 */
export function useStepup() {
  const [rows, ready] = useTable(T.myStepup);
  const row = rows[0];
  return {
    required: row?.requireStepup ?? false,
    active: row?.active ?? false,
    linked: row?.linked ?? false,
    until: row?.stepupUntil ?? null,
    ready,
  };
}

/** createAccount(recoveryCode) -> { ok, error, retryAfterS, attemptsLeft }. Pass the code the browser generated (any grouping/case). */
export function useCreateAccount() {
  const call = useProcedure(P.createAccount);
  return useCallback((recoveryCode: string) => call({ recoveryCode }), [call]);
}

/** signInWithCode(recoveryCode) -> { ok, error, retryAfterS, attemptsLeft }. Every wrong code is the same 'invalid_code'. */
export function useSignInWithCode() {
  const call = useProcedure(P.signInWithCode);
  return useCallback((recoveryCode: string) => call({ recoveryCode }), [call]);
}

/** stepUpWithCode(recoveryCode) -> { ok, error, retryAfterS, attemptsLeft }. Opens a 15-minute step-up window on success. */
export function useStepUpWithCode() {
  const call = useProcedure(P.stepUpWithCode);
  return useCallback((recoveryCode: string) => call({ recoveryCode }), [call]);
}

/** replaceRecoveryCode(oldCode, newCode) -> { ok, error, retryAfterS, attemptsLeft }. The old code stops working; other devices stay linked. */
export function useReplaceRecoveryCode() {
  const call = useProcedure(P.replaceRecoveryCode);
  return useCallback((oldCode: string, newCode: string) => call({ oldCode, newCode }), [call]);
}

/** Reducer wrappers. They throw on error (e.g. 'not_signed_in'). */
export function useSignOutDevice() {
  const call = useReducer(R.signOutDevice);
  return useCallback(() => call(), [call]);
}
export function useRemoveDevice() {
  const call = useReducer(R.removeDevice);
  return useCallback((identityHex: string) => call({ identityHex }), [call]);
}
export function useSetDeviceLabel() {
  const call = useReducer(R.setDeviceLabel);
  return useCallback((label: string) => call({ label }), [call]);
}
/** Deletes my account and all device links (needs an active step-up while require_stepup is on: throws 'stepup_required'). Verifications and reports stay. */
export function useDeleteAccount() {
  const call = useReducer(R.deleteAccount);
  return useCallback(() => call(), [call]);
}

/**
 * Security warnings for properties I own (CONTRACTS §5.4): `open` = conflicts where someone else tried to verify my address
 * and was held for review. The rows carry no claimant details. Suggested copy: "Someone else tried to verify your address.
 * They did not get access; it is held for review."
 */
export function useClaimConflicts() {
  const [rows, ready] = useTable(T.myClaimConflicts);
  const conflicts = useMemo(() => [...rows].sort((a, b) => (a.id < b.id ? 1 : -1)), [rows]);
  return { conflicts, open: conflicts.filter((c) => c.status === 'open'), ready };
}

/**
 * Audit log of who-did-what-when on my properties, newest first (max 50): kind 'blob' (media/frames opened),
 * 'verify' (ownership granted), 'claim' (account sign-in bound a property). `mine` = done by one of my account's devices.
 * Never shows other identities.
 */
export function useAccessLog() {
  const [rows, ready] = useTable(T.myAccessLog);
  const entries = useMemo(() => [...rows].sort((a, b) => (a.id < b.id ? 1 : -1)), [rows]);
  return { entries, ready };
}
