/**
 * The ONLY file that imports generated SpacetimeDB bindings.
 *
 * After `pnpm stdb:generate` (Part 2), fix names here and nowhere else. Every other
 * web file imports `T` (tables/views), `R` (reducers) and the row types from this file.
 *
 * Accessor names are camelCased by the generator (CONTRACTS.md §5 uses snake_case).
 * VERIFY after spacetime generate: every accessor below exists with this exact name.
 */
import { DbConnection, tables, reducers, procedures } from '@hack/stdb-bindings';

export { DbConnection };

/** Tables and views the web app subscribes to. */
export const T = {
  // public tables
  property: tables.property,
  myPropertyReports: tables.myPropertyReports, // reports on properties I'm verified for (report is private since 2026-11-08)
  areaCellSummary: tables.areaCellSummary,
  areaNotice: tables.areaNotice, // NWS alerts + FEMA declarations per county (public, no PII)

  // Sender-scoped views over private tables (spacetimedb/src/views.ts, CONTRACTS §5 "Readable by").
  // Each view already returns only rows this identity may read; subscribe whole and filter client-side.
  myReports: tables.myReports, // reports I submitted
  myReportPrivates: tables.myReportPrivates, // report_private: reports I submitted + reports on properties I'm verified for
  myVerifications: tables.myVerifications, // my verification rows
  myPropertyPrivates: tables.myPropertyPrivates, // property_private for properties I'm verified for
  myMediaAssets: tables.myMediaAssets, // verified only
  myFrames: tables.myFrames, // verified only
  myAssessments: tables.myAssessments, // verified only
  myAgentSteps: tables.myAgentSteps, // verified: all steps; reporter-only: visibility='reporter' steps
  myAffectedProfiles: tables.myAffectedProfiles,
  myRecoveryPlans: tables.myRecoveryPlans,
  myCoachMessages: tables.myCoachMessages,
} as const;

/**
 * Reducers callable from the browser (service-only reducers are deliberately absent).
 * Call with one object of named args, e.g. startVerification({ addressJson, docKind, secretHash }).
 * VERIFY after spacetime generate: arg keys are camelCased (the module declares them snake_case,
 * e.g. address_json). If the generator keeps snake_case, update the call sites in app/affected/verify.
 */
export const R = {
  createReport: reducers.createReport,
  attachMedia: reducers.attachMedia,
  submitReport: reducers.submitReport,
  startVerification: reducers.startVerification,
  submitVerification: reducers.submitVerification,
  saveAffectedIntake: reducers.saveAffectedIntake,
  askCoach: reducers.askCoach,
  // File storage lives in this database (no S3): begin_upload, then upload_chunk for each 512 KiB piece.
  beginUpload: reducers.beginUpload,
  uploadChunk: reducers.uploadChunk,
} as const;

/**
 * Procedures callable from the browser (they return a value).
 * readBlob: one chunk of a stored file (footage/thumbnails for verified residents; never ID images).
 * geocodeAddress / geocodePoint: address lookup (US Census forward, Nominatim reverse), returning NormalizedAddress[] JSON.
 */
export const P = {
  readBlob: procedures.readBlob,
  geocodeAddress: procedures.geocodeAddress,
  geocodePoint: procedures.geocodePoint,
} as const;

// Row types. VERIFY after spacetime generate: the generator's exported type names.
export type {
  Property as PropertyRow,
  Report as ReportRow,
  AreaCellSummary as AreaCellRow,
  AreaNotice as AreaNoticeRow,
  Verification as VerificationRow,
  ReportPrivate as ReportPrivateRow,
  PropertyPrivate as PropertyPrivateRow,
  MediaAsset as MediaAssetRow,
  Frame as FrameRow,
  Assessment as AssessmentRow,
  AgentStep as AgentStepRow,
  AffectedProfile as AffectedProfileRow,
  RecoveryPlan as RecoveryPlanRow,
  CoachMessage as CoachMessageRow,
} from '@hack/stdb-bindings/types';
