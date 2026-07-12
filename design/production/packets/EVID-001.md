# PACKET EVID-001 — Hash-bind every Alpha evidence artifact

packetId: EVID-001
milestone: M0 Wave A/B
kind: evidence-control
lane: sole code_mutation lease through an ACCEPTED SAFE-001 runner
writablePaths: src/contracts/evidenceSchemas.js, scripts/lib/alphaEvidenceChecker.mjs, scripts/check-alpha-evidence.mjs, test/alpha-evidence-checker.test.mjs, scripts/lib/alphaLiveBaselineContracts.mjs, scripts/lib/alphaLiveBaselineElectronContracts.mjs, scripts/check-alpha-live-baseline-browser.mjs, scripts/check-alpha-live-baseline-electron.mjs
coverage: ALPHA_PROGRAM evidence contract; ASSET-001 artifact-hash RED
dependsOn: SAFE-001@ACCEPTED
externalPrerequisites: no active owner of listed baseline/evidence files receipt
authorModel: <BOUND_AT_COMPILE>
authorModelFamily: <BOUND_AT_COMPILE>
reviewerModels: <BOUND_AT_COMPILE>
reviewerModelFamilies: <BOUND_AT_COMPILE>
qualityCard: <BOUND_AT_COMPILE>
qualityCardHash: <BOUND_AT_COMPILE>
qualityCardMode: control_plane
gates: scope, technical, runtime, operational
readDependencies: <BOUND_AT_COMPILE>

## Outcome

An artifact cannot be substituted after review merely because its path still exists. Every Alpha
evidence record binds the exact regular file, bytes, SHA-256, media signature/decode result,
candidate/input hashes, and producer receipt. Browser/Electron producers generate those facts;
workers cannot type them in and self-certify them.

## Contract

Replace path-only artifacts with controller-verified descriptors containing at least:

```json
{
  "artifactId": "stable-id",
  "kind": "screenshot",
  "relativePath": ".devshots/alpha/task/frame.png",
  "sha256": "64-lowercase-hex",
  "bytes": 123,
  "candidateHash": "64-lowercase-hex",
  "producerReceiptHash": "64-lowercase-hex",
  "decodeValidated": true
}
```

The checker resolves real paths beneath the task evidence root, requires a regular file, rejects
links/reparse points, traversal, absolute/URI/ADS/device/control-character paths and normalized-path
duplicates, recomputes bytes/hash/signature, decodes supported media, and rejects candidate or
producer-receipt mismatch. It rechecks artifacts at every gate so post-review mutation invalidates
the candidate.

## Migration behavior

- Update browser and Electron baseline producers to write descriptors from files they just captured.
- Legacy path-only records are reported `migration_required`; they never satisfy new primary
  acceptance. Do not silently synthesize hashes into historical records without re-reading and
  classifying the exact files.
- Emit a controller-hash-bound migration report listing every legacy record/artifact and the exact
  required recapture/revalidation action. EVID-001 changes the contract and producers only;
  EVID-002 owns the leased live `.devshots` migration.
- Supporting synthetic records follow the same integrity contract even though they cannot prove
  player-facing quality.

## Adversarial fixtures

Valid PNG/video controls plus: wrong hash, wrong byte count, post-write mutation, duplicate path,
same file through path alias/case alias, outside root, symlink/reparse point, hardlink to outside
evidence root, ADS/device path, mislabeled signature, decode failure, candidate mismatch, producer
receipt mismatch, and missing file.

## Acceptance

```powershell
npm run check:alpha:evidence:contract
node test/alpha-evidence-checker.test.mjs
npm run check:alpha:evidence -- --expect-migration-report
```

All hostile fixtures fail with the named reason, all controls pass, current producer tests emit v2
descriptors, and a mutate-after-review fixture proves revalidation fails. The live scan exits with
the exact hash-bound legacy migration report—not a green acceptance claim—until EVID-002 completes.
Independent review checks that no player-facing acceptance was grandfathered and that ASSET-001's
`require_artifact_hash` live RED becomes green through this shared contract rather than a duplicate
asset-only validator.
