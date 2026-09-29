# FB-109 — Quota eviction never destroys every rollback copy at once

**Kind:** build · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: saveSystem.js
**Write-set:** `src/save/saveSystem.js`, `test/fb-quota-keeps-one-recovery.test.mjs`
**Neighbours (extend, never restate):** SFQ-B223

## The gap
`_evictForQuotaPressure` tier 1 drops every `sf.recovery.*` generation (all insurance) and tier 2 also drops
the autosave primary. A single quota event destroys all rollback copies. Nothing tests that the end state is
recoverable.

## Why this direction
Compression (FB-093) shrinks the problem; this packet makes the policy safe regardless: keep one rotating
recovery for the newest slot before evicting anything else.

## Mechanism
- Reorder eviction: dev/import scratch first, then recovery copies of older slots, keeping the newest slot's
  recovery until last; never drop the newest slot's primary and recovery in the same pass.
- Pin with a stubbed quota that after a forced quota event the newest slot still loads from primary or recovery.

## Done when
`test/fb-quota-keeps-one-recovery.test.mjs`: after a forced `QuotaExceededError`, the newest slot loads;
`save-player-bounded-capture.test.mjs` stays green.

## Do not
Do not add a second store. Do not silently drop the newest save.

## Focus test starting points
- `test/save-player-bounded-capture.test.mjs`
- `test/m6-corrupt-save-recovery.test.mjs`
