# PACKET EVID-002 — Revalidate or recapture the live Alpha evidence corpus

> **Manual packet; exact activation required.** See `README.md`. Discovery does not activate it.

packetId: EVID-002
milestone: M0 Wave A/B
kind: controller-evidence-migration
lane: controller-owned browser/Electron evidence lane; one explicit `.devshots/alpha` lease
writablePaths: .devshots/alpha/**, design/vision/ALPHA_PROGRAM.md, design/production/asset-classifications/**
coverage: every Alpha row whose current Complete/accepted claim cites a legacy v1 evidence record
dependsOn: SAFE-001@ACCEPTED, EVID-001@ACCEPTED
externalPrerequisites: EVID-001 migration-report artifact; current public browser/Electron route receipts; no active evidence producer
authorModel: controller
authorModelFamily: controller
reviewerModels: <BOUND_AT_COMPILE>
reviewerModelFamilies: <BOUND_AT_COMPILE>
qualityCard: <BOUND_AT_COMPILE>
qualityCardHash: <BOUND_AT_COMPILE>
qualityCardMode: control_plane
gates: scope, technical, runtime, quality, operational
readDependencies: <BOUND_AT_COMPILE>

## Outcome

No task remains Complete because an old path-only JSON happened to pass yesterday's checker. Every
legacy Alpha record is either revalidated into a controller-produced v2 descriptor at the exact
current artifact/candidate hash, naturally recaptured on its public route, or downgraded to
`migration_required`/open with the missing evidence named.

## Migration rules

- Start from the complete EVID-001 migration report; retain every row, including failures.
- Re-read each referenced regular file, recompute bytes/hash/signature/decode, candidate/input and
  producer-receipt bindings. Never type a hash into old JSON without this controller receipt.
- Public browser/Electron acceptance is recaptured through visible UI and public input when the old
  candidate/build hash is stale or its producer receipt cannot be reconstructed.
- Synthetic/Blender artifacts remain supporting only. Migration never upgrades their evidence class.
- Update ALPHA status or asset classification only beside the new v2 record and fresh route/check
  receipt. If proof is unavailable, downgrade the claim rather than grandfather it.
- This is controller evidence work, not an auto-approved worker editing the ignored live corpus.
  The explicit evidence lease prevents concurrent capture writers.

## Acceptance

- `npm run check:alpha:evidence` passes with zero v1/migration-required records.
- The number of migrated + recaptured + downgraded records equals the EVID-001 report exactly.
- Mutate-after-migration fixture invalidates the affected record.
- Browser/Electron records name current candidate/input hashes, public-input routes, GPU/runtime,
  decoded media, and producer receipts.
- Independent reviewer verifies every retained Complete/accepted Alpha claim has v2 primary evidence
  and every unavailable claim was honestly downgraded.
