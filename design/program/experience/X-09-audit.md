# X-09 audit — per-cause death lessons

Row: build_map §1P 567 (joint with attention ledger V-04). Catalog agent dad3c54b, recorded by devin-lanea 2026-10-24.

## What exists

- `buildDefeatReceipt` (`src/combat/playerDefeat.js:464-526`) → `defeatRangeOffer` (`:451-462`) fires only when
  `isSlackLineSnapDeath(lethal)` (`:414-448`); returns `{rungId:'swing_do_not_pull', once:true, line}` once per
  profile via `state.ui.deathRangeOfferedRung` (`:454,524`). `gameOver.js:258-263,970-973` renders the line.
- The receipt classifies `source.kind` environment/self/unknown/contact (`playerDefeat.js:165-192`), physical tags
  'thrown mass'/'arena impact'/'hull ram' (`:90-142`), environment context (`:32-37`); `KillCause`
  generic/kinetic/explosive/terrain_collision/ship_collision (`killCausality.js:10-16`).
- 16 Range rungs (`data/rangeRails.js:41-110`): braking `stopping_takes_room`, `slip_a_gap`, draw-to-fly, boost,
  five field powers, three massline drills. "Append rungs, never reorder" (`rangeRails.js:8`).
- Pinned by `test/infer-b-world-teach.test.mjs:252-276,361-378`.

## Missing

- A cause→rung map: collisions, gunfire and hazard deaths teach nothing.

## Approvals

- audit-gate reviewer 27464a4d — APPROVE (2026-10-24)
- audit-gate reviewer 98e62e20 — APPROVE (2026-10-24)
- audit-gate reviewer 03b56769 — APPROVE (2026-10-24) — audit✓3
