// Row shapes the worker reads through ServiceConnection (camelCase; u64 ids as decimal strings; identities as hex;
// times in epoch ms). They mirror the generated @hack/stdb-bindings row types (Part 2); apps/worker/src/stdb/sdk.ts converts.

export interface ReportRow {
  id: string;
  reporter: string;
  propertyId: string;
  cellId: string;
  status: string;
  hazard: string;
  selfDanger: boolean;
  lifeSafetyCsv: string;
  overallLevel: string;
  usableFrames: number;
  totalFrames: number;
  statusReason: string | null;
  claimed: boolean;
  source: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReportPrivateRow {
  reportId: string;
  isSelfReport: boolean;
  addressLine1: string;
  lat: number | null;
  lng: number | null;
  notes: string | null;
}

export interface PropertyPrivateRow {
  propertyId: string;
  normalized: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  countyFips: string | null;
}

export interface MediaAssetRow {
  id: string;
  reportId: string;
  kind: 'video' | 'image';
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: number;
  /** Upload round: 0 for the first submission, +1 per re-shoot after needs_more_footage. */
  round: number;
}

export interface FrameRow {
  id: string;
  reportId: string;
  frameIndex: number;
  tSec: number;
  thumbKey: string;
  findingJson: string;
}

export interface VerificationRow {
  id: string;
  identity: string;
  propertyId: string;
  docKind: string;
  state: string;
  failReason: string | null;
  objectKey: string | null;
  attemptNo: number;
  createdAt: number;
}

export interface JobRow {
  id: string;
  kind: 'analyze' | 'verify_identity' | 'plan' | 'coach';
  reportId: string | null;
  propertyId: string | null;
  verificationId: string | null;
  subject: string | null;
  payloadJson: string;
  state: string;
  attempts: number;
  leaseOwner: string | null;
  leaseExpiresAt: number | null;
  lastError: string | null;
  createdAt: number;
}
