# DEMO-VFX-CLOUDS-1 — hits never white out the player

**For:** Gemini Neon (designer-engineer with eyes). **Kind:** look, fix, prove. Commit your own files.

In real Swarm fights (`.devshots/fleet/runs/DEMO-SWARM-LOOK-2.deepseek.*/RECEIPT.md` section 3):
a cream-white shard cloud covers half the arena and the player (`.devshots/demo/swarm-minute/2026-11-23T23-09-08/23-card-1-card-taken.png`),
a 350x500 px white cloud sits over the ship (`25-s066.png`), a ~600 px golden bloom hides the ship
(`2026-11-23T22-51-26/70-s154.png`), and a white burst covers the ship on the first frame of a new
run (`2026-11-23T23-09-08/41-s111.png`, `42-again-round-start.png`).

## Do
Find the effects (hit shards, rupture/explosion clouds, bloom contribution; src/render/combat/**,
src/render/vfx/**, actionVfx.js). Make them read as impact and debris, not a white-out: lower
opacity and lifetime, size relative to what was hit, fade with distance from the impact, keep the
player's silhouette readable at all times (draw such clouds behind ships, or cap their alpha over
the player), and keep bloom from blowing out the centre. No new rings. Keep the punch: a big hit
still looks big for a beat.

Prove with real fight frames through the game lock (`node scripts/fleet/game-lock.mjs run -- node scripts/probe-first-swarm-minute.mjs`,
no focus steal) — before/after pairs, opened and judged by you. Note that fewer, smaller particles
also help frame rate on this machine's integrated GPU.

## You may edit
src/render/combat/**, src/render/vfx/**, src/render/actionVfx.js, and their tests. Before editing a
file run `git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after. Never
git add -A, reset, stash, restore or checkout.

## Receipt
Protocol headings; per effect: file:line, what changed (commit), before/after PNGs.
