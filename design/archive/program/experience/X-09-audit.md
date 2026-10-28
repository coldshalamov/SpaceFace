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

## v2 addendum (2026-10-24, after impl review aa34888a)

- **The player never takes collision damage.** `src/systems/collisionConsequences.js:341` skips the player in the only
  collision-damage path (`:536` "impact damage is NPC-only by contract"; `_routeImpactDamage` `:566-599` is the only producer
  of `collision_*` kinds / `impactLink` tags); `masslineImpactDamage.js:76,94` also skips the player. So the v1 plan's
  arena-impact and hull-ram rows can never fire in live play today.
- **Causes that do kill the player:** NPC weapons (the common case), environment hazards (`ENVIRONMENT_LABELS`,
  `playerDefeat.js:32-37`), and the massline snap (already taught). A weapon death is deliberately silent (TEACH-08 pin,
  `test/infer-b-world-teach.test.mjs:266-277,368-379`) — "you lost a fight" is not a lesson.
- **One weapon death IS a teachable cause:** dying with the capacitor empty. The Range already teaches it —
  `you_can_run_dry` "YOU CAN RUN DRY — Hold fire for 20 seconds and keep cap above zero" (`rangeRails.js:44`).
  `buildDefeatReceipt(state, player, …)` has the player entity, so cap at death is readable.
- Residual (v3, corrected per 43750cd9): two live per-cause lessons exist beyond the snap — the dry-cap weapon death
  (`source.kind 'contact'`) and the dock-collar scrape (`world.js:6269-6313`, `origin.kind 'dock_collar'`, environment
  source) which `stopping_takes_room` teaches. Every other live killer (gas, reactor, debris, radiation, acid, mines, bombs,
  charges, status DoT) has no honest rung.

- v2/v3 addendum gate: 8c48fec7 APPROVE (v2), 7a171a19 APPROVE (v2), 43750cd9 REJECT (v2); v3: cd4a5e75, f6a502f4, 0ee7d530 APPROVE — audit✓3 (v3)
