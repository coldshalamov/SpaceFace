<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-180.02 — Ownership and order: every red cell has an owner, and the map mirrors the matrix

```text
DONE  PQ-180.02 — every red cell in the measured grammar matrix names the packet and the leaf that clears it, and the build map's §18.2 table is now the matrix's own rows, so the map and the check can no longer disagree about who owns a screen.
WHAT I FOUND     The matrix already assigned every failing cell an owner and a leaf (a test pins it), but eleven surfaces in the manifest had no owner of their own — the meta shell screens and the chart — so their reds fell to this packet by default, and the map's §18.2 table was a coarse hand-written grouping that named different packets for Asteroid Works and the base than the matrix did.
WHAT I CHANGED   The eleven surfaces now carry the owner the map names (the meta shell to PQ-181, the chart to PQ-168), and §18.2 is regenerated from the manifest row for row with the coarse reading kept underneath; nothing else moved.
WHAT YOU WILL FEEL   Nothing in play. When a screen fails its definition of done, the table says which packet answers for it, and the plan and the check say the same thing.
THE NUMBERS      surfaces with an owner of their own | 29 of 40 | 40 of 40 (9 flight/instrument rows are "done, re-checked" and fall to this packet) · red cells without an owner packet and leaf | 0 | 0 (754 owned) · map §18.2 rows | 14 coarse groups | 40, one per surface, mirrored from the manifest
THE FRAMES       none — this unit has no player-felt change.
NEXT             PQ-180.03 reference frames for every surface
```

## The clauses, verified

- **No red cell without an owner.** `test/ui-grammar-matrix.test.mjs` "every failing cell carries
  an owner packet AND a leaf" and "a measured defect belongs to the surface owner; an unowned one
  falls to PQ-180 .02" (42/42). The measured run (PQ-180.00) lists 754 failing cells, all owned:
  PQ-180 .00 533, PQ-162 40, PQ-183 40, PQ-184 40, PQ-180 .02 24, PQ-181 20, PQ-130 16, PQ-182 16,
  PQ-180 .03 13, PQ-168 12.
- **The map §18 table mirrors the matrix.** `CANONICAL_BUILD_MAP.md` §18.2 is generated from
  `SHIPPING_SURFACES` (id, title, archetype, how the probe reaches it, owner packet), forty rows,
  with the instruction to regenerate rather than edit one side.
- **Owners the manifest lacked**, taken from the map's own grouping: `title`, `new-game`,
  `settings`, `pause`, `save-load`, `help`, `codex`, `mission-log`, `tech-tree` → `PQ-181`;
  `chart`, `chart-galaxy` → `PQ-168`. The manifest audit (`--static`) accepts them (all admitted
  packets).
- **Where the map and the matrix had disagreed**, the matrix's assignment stands (Asteroid Works,
  base and automation to the live `PQ-130` campaign, not `PQ-185`/`PQ-145`), because the matrix is
  the frontend's queue and its owner rows are what the check prints; the coarse reading under the
  table says so.
