# FB-110 — A save restored from a backup says so, and an import lets you pick the slot

**Kind:** build · **Lane:** THE INSTRUMENT · **Routing:** ORRERY lane
**Seam tags:** seam: saveLoad.js, seam: saveSystem.js
**Write-set:** `src/ui/screens/saveLoad.js`, `test/fb-repaired-save-notice.test.mjs`
**Neighbours (extend, never restate):** SFQ-B228

## The gap
On primary failure the loader falls back to the recovery generation and emits `save:error { slot, reason, recoveryReason }`;
the player sees a toast, never a "restored from backup, here is what you may have lost" notice. Imports land
in quick with no choice. Pure UI; the sim half is the event that already fires and the slot parameter from
FB-104.

## Why this direction
The provenance is already in the event; the screen omits it.

## Mechanism
- Render the recovery provenance on the slot card after a fallback load (reason, generation age).
- Add a destination picker to import.
- Walk the screen with `node scripts/ui-bench.mjs --walk` before calling it done.

## Done when
`test/fb-repaired-save-notice.test.mjs`: a forced fallback load shows the notice with the reason; import to
slot 2 works; `check-save-load-slot-trust` passes.

## Do not
Do not change the load order. Do not add a repair verb that rewrites saves.

## Focus test starting points
- Run `node scripts/check-save-load-slot-trust.mjs` and `node scripts/check-save-resume-confidence.mjs`.
