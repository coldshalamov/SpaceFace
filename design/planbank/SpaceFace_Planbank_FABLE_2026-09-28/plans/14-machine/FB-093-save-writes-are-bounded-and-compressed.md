# FB-093 — Save writes are bounded and gzip-compressed inside the worker that already serializes them

**Kind:** build · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: saveSystem.js, seam: saveWorker.js
**Write-set:** `src/save/saveSystem.js`, `src/save/saveWorker.js`, `test/fb-save-write-bound-gzip.test.mjs`

## The gap
`SAVE_IMPORT_LIMITS` (12 MiB, depth 64, 200k nodes) bound the import path only; nothing caps a write. There is
no compression anywhere under `src/save/` (zero hits for gzip, deflate, CompressionStream), and the notes at
the quota-eviction site record a real soak that hit the 5 MB localStorage quota and lost a save. Growth is
bounded downstream in producers, never in the envelope.

## Why this direction
A new storage backend was rejected (one game path, shared loopback store). The worker boundary already exists
(`_createSaveWorker`), and `shouldSerializeDuringPresent` in `saveDirtyJournal.js` guarantees serialization is
off the present callback, so compression there costs no frame. Bounding the write with the same limit object
the import uses keeps one law.

## Mechanism
- Assert the import limits pre-write in the worker: a chunk plan that would exceed them fails with a named
  reason and a toast, never a silent truncated save.
- Gzip the envelope with the CompressionStream web API (gzip) inside the worker; mark the envelope format so
  `validateSaveJson` accepts both compressed and legacy plain JSON, and recovery generations can be either.
- Extend `_evictForQuotaPressure` accounting to compressed byte counts so quota decisions use real sizes.

## Done when
A 3-hour seed-4242 save shrinks by ≥50% on disk; every pre-change save fixture in `test/` still loads;
`test/m6-corrupt-save-recovery.test.mjs`, `test/save-import-bounds.test.mjs` and
`test/bounded-autosave.test.mjs` stay green; `test/fb-save-write-bound-gzip.test.mjs` shows an over-limit
envelope refused with a reason.

## Do not
Do not compress on the main thread. Do not change `CURRENT_VERSION` unless a migration is genuinely needed. Do
not drop recovery generations to make room.

## Focus test starting points
- `test/save-restore-atomicity.test.mjs`
- `test/save-growth-dock-trade-flat.test.mjs`
- `test/save-player-bounded-capture.test.mjs`
