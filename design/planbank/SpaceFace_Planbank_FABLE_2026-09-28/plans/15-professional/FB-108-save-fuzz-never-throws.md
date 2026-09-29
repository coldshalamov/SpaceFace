# FB-108 — A seeded save fuzzer proves every corrupted envelope resolves to a named reason, never a throw

**Kind:** build · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: saveWorker.js, seam: saveSystem.js
**Write-set:** `test/fb-save-fuzz.test.mjs`, `scripts/fb-fuzz-save-envelope.mjs`
**Neighbours (extend, never restate):** SFQ-B222

## The gap
No property or fuzz test exists for the save path (`fuzz` has zero hits under `scripts/`; the only adversarial
tests are gameplay). `validateSaveJson` and `preflightSaveImport` are pure and name eight rejection reasons,
so the harness is ready and unused.

## Why this direction
QA-shaped adversarial testing is the mature-parity minimum for the best-tested area in the repo; the mechanism
is a seeded mutator over a real envelope.

## Mechanism
- Write a seeded mutator (bit flips, truncation, type swaps, depth bombs, key injection incl. `__proto__`) over
  a real seed-4242 envelope; run N thousand cases through validate and preflight.
- Assert every outcome is one of the eight named reasons or a successful load, and never an exception; record
  the reason histogram.
- Wire the script into the broad check list, bounded to a fixed case count.

## Done when
`test/fb-save-fuzz.test.mjs`: 5000 seeded cases, zero throws, histogram covers all eight reasons;
`m6-corrupt-save-recovery.test.mjs` stays green.

## Do not
Do not use unseeded randomness. Do not run more than a few seconds in the baseline gate.

## Focus test starting points
- `test/m6-corrupt-save-recovery.test.mjs`
- `test/save-import-html-safety.test.mjs`
