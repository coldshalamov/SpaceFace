# FB-115 — A fixture per save version walks all thirteen migration steps and proves idempotence

**Kind:** build · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: migrations.js
**Write-set:** `test/fb-migration-ladder.test.mjs`, `test/fixtures/fb-save-v01.json`
**Neighbours (extend, never restate):** SFQ-B222

## The gap
`MIGRATIONS` runs thirteen contiguous steps v1→v14, each commented with its packet; the tests that import it
cover one step each. No test walks a v1 fixture to v14, and the header's own contract (idempotent,
re-runnable) is unproven.

## Why this direction
QA-shaped: a fixture ladder is the standard guard for a migration chain.

## Mechanism
- Author a minimal fixture per version as `test/fixtures/fb-save-v01.json` through v14; walk each through
  `runMigrations` to current and assert the result validates and re-running is a no-op.
- Assert `readSaveVersion` refuses a version above current with the named reason.

## Done when
`test/fb-migration-ladder.test.mjs`: 13 fixtures migrate, validate and are idempotent;
`save-v9-global-coordinates.test.mjs` stays green.

## Do not
Do not edit migrations to pass. Do not add a down-migration.

## Focus test starting points
- `test/save-v9-global-coordinates.test.mjs`
- `test/m2-world-records.test.mjs`
