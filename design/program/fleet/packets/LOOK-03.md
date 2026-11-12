# LOOK-03 — A rock turns pure white in a Swarm fight

**Lane 1 [look].** Lead look 2026-11-12, Swarm round 3 (Ricochet Foundry), `scripts/fleet/looks/throw.mjs`:
`design/program/fleet/evidence/2026-11-12-white-rock-r3.png` — a large faceted asteroid fills a third of the frame,
its lit faces blown to flat white (shadowed facets still dark); every other rock in the arena reads tan. The aim tag over it
says `LINE TARGET · BLOCKED`. The owner's look ruling (`design/game/README.md` 2): bloom is a budget; neon only as accents.

## Find out which it is (measure, do not guess)
1. **Hit flash** — the rock sat between the player and the target under fire: does a damaged asteroid flash its whole
   mesh white (`grep -rn "hitFlash\|flashUntil\|damageFlash" src/render`)? If so, scale it to a short rim/edge flash.
2. **Pale albedo over the key** — LOOK-01 (lookMoods `LOOK_BASE`: warm key, `albedoGamma 0.90`, `rockFill 0.85`) may push a
   pale rock type (silicate/ice) above the bloom threshold. Render that rock type at the arena's light (a still from
   `?sector=…&shot=1` or the round) and read its lit-face luminance; rocks must stay under `paintCeiling` like paint.
3. **Hover/target highlight** — `src/render/objectHoverFeedback.js` (faint, unlikely) or another target overlay.
Fix the cause in its owner; never darken the whole look to hide it. Before/after frames at the same moment.

## Checks
`node --test` for the render files touched; a before/after still pair in the receipt with the rock in view; the sector
shots (`scripts/fleet/looks/sector-shots.mjs`) unchanged elsewhere.
Commit: `fix(LOOK-03): <cause> — rocks keep their colour under <what>`.
