# DEMO-RINGS-2 — nothing in a Swarm fight looks like a ring around a thing

**For:** Gemini Neon (designer-engineer with eyes). **Kind:** look, trace, subtract, prove.
Commit your own files.

## Why
The owner, looking at a fight: "The weird Sonic The Hedgehog rings around everything look like
shit, I hope there's nothing in the game that looks stupid like that." Rings, circles, halos and
concentric arcs drawn around ships, rocks or the player read as cheap web-game markers. A 2026
arcade release marks things with light, shape, motion and the HUD's own type, not with circles.

Already removed: the ship pool/heading rings (shipMarkers.js), the rope's target astrolabe and
release annulus, the minimap's contact rings, and (177b71b7aa) the crimson threat plate on bosses
and targets. Swarm is the demo, so start there.

## Do
1. Capture a real Swarm fight with the current tree. Use the Swarm capture probe if it exists
   (`scripts/probe-first-swarm-minute.mjs`), otherwise `node scripts/fleet/game-lock.mjs run -- node scripts/probe-no-freeze-electron.mjs --route=swarm-r5 --no-focus-steal`
   or the boss frames path the look lane used (`.devshots/demo/wave2/look-subtract/boss/`). Rounds
   1-6 including the round-5 Iron Maw boss. Open every frame yourself.
2. For every ring, circle, halo, concentric arc or spiral you see around a ship, rock, projectile
   or the player, find the code that draws it and decide: remove it, or replace it with something
   that reads without a circle (a lit edge, a short floor stroke, a glint, the HUD tag). Known so far:
   - pale salmon concentric arcs around the player while an INCOMING tell is up (a thrown body is
     coming at you; the tell comes from `src/systems/tacticalAI.js` ~138 'ai:telegraph' kind
     'engine_flare' phase 'incoming_mass' and is drawn by `src/render/actionVfx.js`; source not yet
     confirmed — trace it);
   - coral spiral/swirl rings near small enemies (boss frames 2 and 3);
   - a thin white circle with a hexagon on a latched rock (maybe the lock bracket);
   - small red circles around Wasps (re-check after 177b71b7aa; may be gone);
   - a lavender circle and a pale-blue segmented torus seen in earlier boss frames.
   The minimap's own range rings and the speed dial are instruments, not world marks: leave them.
3. A mark that carries a real decision (where the throw will land, what is about to hit you) keeps
   its information in another form; say in the receipt what replaced it.

## Prove
Before/after frame pairs from the same route, opened and judged by you, listed in your receipt.
Focused tests of the files you touch; a test that pins a removed ring is rewritten to the new rule
("no rings around things, owner 2026-11-23") or deleted if it only pinned the ring's look.

## You may edit
`src/render/**` (VFX and marks only; never `src/render/renderer.js`'s frame loop structure),
`src/presentation/**`, `src/ui/**` for HUD-drawn rings, and their tests. Before editing a file run
`git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after.
Never git add -A, reset, stash, restore or checkout. Wrap anything that boots the game in
`node scripts/fleet/game-lock.mjs run -- <cmd>`; test windows must not steal focus.

## Receipt
Protocol headings; per mark: what it was, file:line, removed/replaced (commit), before/after PNGs.
