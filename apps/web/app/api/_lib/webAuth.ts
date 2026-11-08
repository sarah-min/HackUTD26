/**
 * Narrow auth reads for P4 HTTP routes (CONTRACTS / stdb-bindings README §7).
 * Live SpacetimeDB `web_*` subscriptions land with the Next scaffold + STDB_WEB_TOKEN.
 * Until then, optional fixture rows can be injected via WEB_AUTH_FIXTURE_JSON (dev only).
 */

export type ReportUploadAuth = {
  reportId: string;
  reporterSecretHash: string;
  status: string;
};

export type VerificationAuth = {
  verificationId: string;
  secretHash: string;
  state: string;
  propertyId: string;
};

export type MediaIndexRow = {
  objectKey: string;
  reportId: string;
  propertyId: string;
};

type FixtureBundle = {
  reports?: ReportUploadAuth[];
  verifications?: VerificationAuth[];
  media?: MediaIndexRow[];
};

function fixture(): FixtureBundle {
  const raw = process.env.WEB_AUTH_FIXTURE_JSON;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as FixtureBundle;
  } catch {
    return {};
  }
}

export async function lookupReportUploadAuth(reportId: string): Promise<ReportUploadAuth | null> {
  const row = fixture().reports?.find((r) => r.reportId === reportId);
  return row ?? null;
}

export async function lookupVerificationAuth(verificationId: string): Promise<VerificationAuth | null> {
  const row = fixture().verifications?.find((v) => v.verificationId === verificationId);
  return row ?? null;
}

export async function lookupMediaIndex(objectKey: string): Promise<MediaIndexRow | null> {
  const row = fixture().media?.find((m) => m.objectKey === objectKey);
  return row ?? null;
}

/** True when STDB_WEB_TOKEN is present (live ping wiring is a follow-up once the web client lands). */
export async function pingStdb(): Promise<boolean> {
  return Boolean(process.env.STDB_WEB_TOKEN && process.env.STDB_MODULE);
}
