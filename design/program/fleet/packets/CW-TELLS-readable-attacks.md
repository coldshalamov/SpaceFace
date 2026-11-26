# CW-TELLS — Every attack readable before it lands (INV-21 items 3, 5)

> **Pipeline (director, 2026-11-19):** make NO git writes. Edit surgically: other agents keep uncommitted
> work in the same files — never reformat, never normalise line endings (keep CRLF where a file has CRLF;
> check `git diff --stat` shows a small diff for a small edit), never revert a hunk you did not write, and
> never build on another agent's uncommitted code (compare `git show HEAD:<file>` with the working copy
> first). Several builders work at the same time on disjoint files — respect the **Not** list exactly.

**Why:** the owner: "combat combat combat… the atomic bit of this game… everything else serves the
dogfight." Design authority: `design/overhaul/03_COMBAT.md`, `00_RULINGS.md`. Every change must keep the
simulation deterministic (`state.rng`, `state.simTime` only) and cheap at 50 bodies.

## Do

Implement items **3** ("make every attack tell complete and on time") and **5** ("make the Enemy Mind
legible, then let Swarm elites use it — start by surfacing, not by enabling everywhere") of section 4 in
`.devshots/fleet/runs/INV-21-dogfight-ai.deepseek.2026-11-19T20-30-36/RECEIPT.md`, exactly as specified there. Cap simultaneous lane wedges (nearest N) so a pack never paints a
wall of trapezoids; every tell must be cheap at 50 bodies and must not move the camera (ruling R10).

**Files:** `src/ai/combatDoctrine.js`, `src/ai/enemyMind/`, `src/render/vfx/actionEventRecipes.js`, the action
VFX owner it names, `src/ui/hud.js` (the doctrine-tell chip map), `src/presentation/` (combatChoreography,
a new enemyMindTells mapper, the presentation orchestrator), their tests.
**Not:** `src/systems/weapons.js`, `src/systems/aiFireIntent.js`, `src/ai/` otherwise, `src/data/pilot*.js`, `src/ui/pilotCards*.js`, `src/systems/runSession.js`, `src/core/runState.js`, `src/systems/powerVerbs.js`, `fields.js`, `bombs.js`, `impulseCharges.js`, `massSeed.js`, `tetherGameplay.js`, `masslineThrow.js` (another builder resumes there tonight), `src/ui/sandbox/sandboxSetup.js`, `scripts/lib/simWorkerHost.mjs`, `src/systems/lawSecurity.js`, `src/systems/spawnClearance.js`, `src/systems/plants/`, `src/audio/audioSystem.js`, `src/ui/radar.js` (W3-fix builder), `src/render/vfx.js`, `src/render/hullHitFlash.js`, `src/render/arenaSets/`, `src/render/bloom.js`, the crucible screens and `src/data/swarmStakes.js` (another agent's frozen work), `scripts/bench-gun-curve.mjs` (bench builder), `src/ai/maneuver.js` (another agent's uncommitted crossing-brake work).

**Run:** your new test file(s), the existing tests of every file you touch (find them by import), the doctrine-tell tests (`git grep -l DOCTRINE_TELEGRAPH_TICKS -- test`), and
`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.save-v27.expected.json --hash --repeat 5`.
If the 47a hash moves, the change touched Adventure's deterministic replay: explain exactly why in the
report (a moved hash is allowed only for a deliberate gameplay change, never silently).

**Report:** per item — done or not (and why), file:line, the test names and results, the on-screen check
you did (frames through `node scripts/fleet/game-lock.mjs run -- <cmd>` if you can produce them), every file
you touched.
