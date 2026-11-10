<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-180.01 — The floor, written

```text
DONE  PQ-180.01 — every number the grammar matrix judges a surface by lives in one file, the grammar quotes it with a citation for each, the check reads it, and a deliberate violation goes red in the tests.
WHAT I FOUND     The earlier frontend lane had already built this leaf when it built the matrix (commit b59cd04a) and never marked it: the thresholds file, the grammar's §12 table that quotes it, and the tests that prove a font one hair under the floor or a surface one node over the budget goes red.
WHAT I CHANGED   Nothing in code; this receipt verifies each clause of the done-when against the tree and the tests, so the unit can be checked off honestly rather than rebuilt.
WHAT YOU WILL FEEL   Nothing in play. The numbers that decide "this screen is done" — no text under 12 px, every label surviving 40 % longer strings, three widths, at most 1,500 elements in a screen, at most 2 ms of a frame for the interface, four data states named — are written once and can never drift between the prose and the check.
THE NUMBERS      thresholds declared in one file | 12 px · +40 % · 1280/1920/2560 · ≤ 1,500 nodes · ≤ 2 ms · 4 data states · red on a deliberate violation | 11.9 px → red, 1,501 nodes → red, non-tabular figures → red, clipping at any width → red · matrix tests | 42 of 42
THE FRAMES       none — this unit has no player-felt change.
NEXT             PQ-180.02 ownership and order
```

## The clauses, verified

| clause of the done-when | where it is true |
|---|---|
| thresholds live in one file | `scripts/ui-grammar-thresholds.mjs`: `MIN_FONT_PX` 12, `PSEUDO_LOC_GROWTH` 0.40, `RESPONSIVE_WIDTHS` 1280/1920/2560, `MAX_SURFACE_DOM_NODES` 1500, `MAX_UI_FRAME_MS` 2, `REQUIRED_DATA_STATES` EMPTY/LOADING/ERROR/DENIED, each with the grammar section or packet clause it comes from |
| recorded once in the grammar | `design/frontend/INSTRUMENT_GRAMMAR.md` §12's floor table quotes the file ("the numbers behind this list live in `scripts/ui-grammar-thresholds.mjs` and nowhere else") |
| the check reads them | `scripts/check-ui-grammar-matrix.mjs` imports the thresholds; `test/ui-grammar-matrix.test.mjs` "the thresholds file is the only source of the floor numbers" pins that no other declaration exists |
| a deliberate violation goes red | the same test file: "a deliberately too-small font goes red on the type floor" (11 px < 12 px), "a font exactly at the floor passes; one hair under does not" (12 → green, 11.9 → red), "a surface over the DOM budget goes red" (1,501 > 1,500), "non-tabular figures go red", "clipping at any measured width goes red" — 42 of 42 pass on this tree |

The measured baseline (PQ-180.00, the same day) exercises every threshold against the running
game: the type floor, DOM budget, safe frame, pseudo-loc and tabular-numeral cells on the station,
Crucible and automation screens went from unproven to a measured verdict.
