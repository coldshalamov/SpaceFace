# PERF-03 — Swarm round 20 draws too much

**Lane 2.** Ruling 4 (`design/game/README.md`): main-thread idle ≥ 30 % and sim/real ≥ 0.98 in Swarm round 20.
Today (pinned profile, `.devshots/main-thread-profile/stand-in-swarm20-retired-title/`, seed 4242, after the title
cinematic fix 883a1ba3): **11.9 fps, 0.15 % idle, sim/wall 0.68.** Inclusive main-thread time:
`_renderPostRoute` 30 % → `bloom.renderScenePass` 27 % (three.js internals ~26 % self), HUD frame 13 %,
`syncEntityViews` 6 %, worker reply apply 6.5 %, VFX update 6.3 %, native `(program)` 21 %.
In Adventure, PERF-01 measured render-off **+11 fps**. Drawing is the cost.

## Job
1. **Measure the draw** in Swarm round 20 through the lock (`?swarmRound=20`, launch the round like
   `scripts/fleet/looks/throw.mjs` does): per frame, `renderer.info.render.calls`, `.triangles`, programs, and how many
   draws each owner contributes (hostile hulls, wrecks/debris, projectiles, VFX, floor props, background). Write the
   table into your receipt. `npm run perf:renderer-info` and `scripts/profile-main-thread*.mjs` (find with `ls scripts | grep -i
   "profile\|renderer-info"`) are the existing tools — extend them, don't fork.
2. **Cut the biggest owner first**, keeping the picture identical (screenshots before/after at round 20 must look the same
   to a person): e.g. instanced hulls per enemy archetype instead of one mesh tree per ship, merged/instanced debris, a
   shared material instead of per-entity clones, fewer bloom-pass draws (objects that never bloom do not belong in the
   bloom scene pass). One change at a time; measure each (`main-thread` profile arms, same seed, same machine, back to
   back) and keep only what moves fps or idle.
3. Report before/after: fps, idle %, sim/wall, draw calls, at round 20 — and the opening (must not get slower).

## Rules
Never change how anything looks (owner's look ruling 2); no quality-preset change. Simulation untouched. One game at a
time through the lock; no other measurement while yours runs. `node --test` for each render file you touch;
`npm run gate -- --quick` at the end. Commits: `perf(PERF-03): <what got cheaper> (<fps/idle before → after>)`.
