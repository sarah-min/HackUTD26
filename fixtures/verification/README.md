# Verification fixtures (Part 3)

Demo identity check — not production-grade verification.

- These are **JSON field outputs only**, written by hand for a fictional person named "SAMPLE SPECIMEN" at a sample
  address. No ID image is committed, and no real person's data appears here.
- `id-fields-*.json` are `IdDocumentFields`; `result-*.json` are `VerificationResult` (P2's verify page can use them
  until the live job runs).
- Live tests use only published specimen/sample IDs (record each one in SOURCES.md) or a teammate's own ID with consent,
  uploaded through the app and deleted by the `verify_identity` job. Never save real extracted fields to this folder.
