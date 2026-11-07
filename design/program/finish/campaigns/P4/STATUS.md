# P4 — fits you can see — status

**2026-11-06, Lane 4 (SHIP).**

## Done

| Piece | Where |
|---|---|
| The part → visual table: which mount family a part gets (`gun`, `tool`, `pod`, `plate`, `hook`, `mast`, `bay`, `plume`, `sheen`), its tint, and its scale by size | `src/ui/ship/partVisuals.js` (new) |
| The socket resolver: `partVisualsForFittings({ shipId, fittings })` returns what to mount and on which real hull socket, read from the GLB empties through `data/modelTruth.js` — never invented coordinates | same |
| Diagnosis of why the hull already changes shape but never shows *which* parts: the `visuals.tiers[]` sum-of-tiers rule | `DIAGNOSIS.md` |

Verified by probe: `ship_wasp` with two guns + a drive + a ram plate resolves to
`SOCKET_Weapon_Front` ×2 (indices 0 and 1), `SOCKET_Engine_Main` (plume, glow), one pod, and a
shield sheen colour.

## Not done — P4 does **not** meet its Verify

- **Nothing mounts yet.** `src/render/partsLibrary.js` is being rewritten by the performance work
  in flight (`design/program/NOW.md`), so this campaign did not edit it. The table is the contract;
  the render lane consumes it. Until it does, a fit still shows only as the tier silhouette.
- **No part meshes.** Lane 6 builds them through the Forge route
  (`docs/visual-assets/README.md`). The mount families above are the list to build.
- **No lineup capture, and therefore no reviewer check** that five fits are distinguishable. That
  is P4's finish line and it is unreached.
- **Earned paint is not started.** `src/data/shipPaints.js` sells all 17 hull paints and 12 accents
  from the first dock and no save field gates them. The gate belongs with P3's pilot milestones, so
  it is sequenced after the owner approves the tree.

## Who takes the next step

| Step | Owner |
|---|---|
| Mount `partVisualsForFittings()` output in the ship stage | Lane 3 (renderer) — one call site inside the parts admission path |
| Author the nine mount meshes + per-hull socket fit | Lane 6 (LOOK & SOUND, Forge route) |
| Gate paint ids on pilot milestones | Lane 4, after P3 approval |
