# M-02 plan — lived vignettes 391–566

Tribunal synthesis (Drifter + Archivist + Skeptic):

**Slice**: one inserted `say` node in `src/data/encounters/391-lived-civilian-core-toll-choir-none.js`.
The ambient run a0→a3 already alternates say/motion; add `a2x` — "The hull ahead is paying
in clipped coin and a long apology." — between `a2` and `p2` (one `next` repoint, one new
node). Queue-side, small, unverifiable — the Skeptic's "don't over-claim" line.

Why not more: choices/receipts/costs are keyed and pinned; the schema has no follow-on
channel, so per-vignette texture is the honest whole slice. Foreign hunks in 401–429/536
left untouched; a per-family texture pass across all ~180 files is cataloged as follow-up,
not landed here.

Verification: `test/rc-vignettes-459-4242.test.mjs` (vignette spec validation) +
import smoke on the 391 module.

Review: plan ✓3 — recorded.

## Follow-up tranche — landed ff8ea0c5b2 (devin-attu, 2026-10-25)

The cataloged per-family texture pass, first tranche: one `a2x` ambient `say` node
inserted between `a2` and `p2` in eight clean files (the same one-repoint-one-node
pattern as the 391 slice), each line in the file's own actor register:

- 433 civilian core / CANTOR — the band praying by count, not name
- 448 trade lane / DESK — the pin marked sold three times this hour
- 466 mining belt yard / CLERK — the bench ledger's absent hand
- 495 colony puzzle / CLERK — three marks in one handwriting
- 511 outlaw zone / SLIP — the patrol checking its own mirror first
- 540 radiation field / SLIP — wreck paint nobody will cut
- 555 nebula fog / SABLE — eleven lamps manifested, twelve in the fog
- 566 derelict field / DISPATCH — the hulk skipped in every count

Only clean files touched; foreign-dirty 401–429/536 preserved. The remaining ~130
clean files in 430–566 stay open for later tranches — same pattern, one node each.

Verification: `test/depth-program-encounter-loader.test.mjs` 3/3, per-module import
smoke green, unique phase ids, `check:player-facing-labels` OK.
