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

## Files you may edit (added after the first run stopped correctly on protocol rule 1)
`src/data/lookMoods.js`, `src/render/look.js`, `src/render/objectHoverFeedback.js`, the asteroid **material/shader** owner
you identify (`grep -rln "rockFill\|isRock\|rockRole" src/render` — name it in the receipt before editing), a new
`test/look-03-*.test.mjs`, and a new look script under `scripts/fleet/looks/`. **Not** `src/render/renderer.js`,
`asteroidInstancePool.js`, `vfx.js`, `latePipelineAdmission.js`, `visualFactory.js` (PERF-03/PERF-04 are editing them) — if
the cause lives there, write the exact change in the receipt and stop.

## Order
1. Measure first, no edits: open the evidence PNG and sample the white faces' pixel values; reproduce with
   `node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/throw.mjs .devshots/fleet/looks/look03/r3 3` (it logs
   events and saves frames; extend a copy to log the hovered/aimed entity's id, type, defId and material name when the aim tag
   reads `LINE TARGET · BLOCKED`). Name the cause with evidence.
2. Then fix within the allowlist.

## Second relaunch notes
Waiting for the game lock is normal (other workers run looks too) — wait up to 45 minutes; never stop a waiter early.
The white rock is intermittent: run your `scripts/fleet/looks/look-03.mjs` (prepared in the last run) on rounds 3, 5 and 2,
logging every frame's aimed/hovered body + material, until a white body shows; also scan saved frames for any large region
with mean luma > 240 and log what was under it. Commit the diagnostic script when it works.
