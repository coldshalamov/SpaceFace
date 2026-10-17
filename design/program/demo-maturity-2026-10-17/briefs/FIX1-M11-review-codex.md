# Task FIX1 — repair the two MAJOR review findings on row 351 (M11 playerHullEcho)

Read first: `_constraints-codex.md`.

## Context

Commit ffb7dff92b8 (HEAD) landed M11 "the ship that flew this before" (row 351). An independent
xhigh review VERIFIED the D203 commit and returned two MAJOR player-facing findings on M11 that
its tests miss. Fix exactly these two, in `src/world/playerHullEcho.js` (and its test), on top of
the current dirty tree (other agents have in-flight work in OTHER files — do not touch them):

1. **[P2][MAJOR] Keep the final marker attached to the physical wreck**
   (`src/world/playerHullEcho.js:55-56`): if the wreck is pushed or towed away, the final marker
   remains at the authored site center while alignment checks use the actual `echo.wreckPos`;
   the reviewer reproduced a 500-WU displacement where arriving correctly aligned at the DISPLAYED
   marker cannot release the recorder. Update the final marker from the wreck's current position.
2. **[P2][MAJOR] Preserve the remembered wreck's visual identity**
   (`src/world/playerHullEcho.js:74-75`): `wreckPackagedFile()` selects ship hulks through
   `hulkVisual` or `hulkOfDefId`, not the `defId`/`parentDefId` fields the commit wrote — a
   recorded Wasp resolves to a generic cockpit fragment, and rematerializing the same loss with
   another entity id can select a different generic wreck. Supply the renderer's hull identity
   (or a stable per-loss fragment identity).

## Done when

- Both findings fixed; the pinning tests are extended to cover the actual seams the reviewer
  named: a displaced wreck (marker follows the wreck's live position; release succeeds when
  aligned at the wreck, not at the site center) and a recorded named hull (the packaged wreck
  resolves through the same selection the renderer uses — `hulkVisual`/`hulkOfDefId` — and stays
  stable across a re-materialization with a different entity id).
- `node --test test/m11-ship-that-flew-before.test.mjs` green; run
  `node --test test/world-persistence-foundation.test.mjs` too.
- Touch only `src/world/playerHullEcho.js` (+ the one test file, plus `src/world/worldRecords.js`
  ONLY if the identity field must flow through record capture — justify if so).
