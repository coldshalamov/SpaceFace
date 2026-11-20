# CW-AI — Enemy pilots worth fighting (INV-21 items 1, 6, 7, 9, 10)

> **Pipeline (director, 2026-11-19):** make NO git writes. Edit surgically: other agents keep uncommitted
> work in the same files — never reformat, never normalise line endings (keep CRLF where a file has CRLF;
> check `git diff --stat` shows a small diff for a small edit), never revert a hunk you did not write, and
> never build on another agent's uncommitted code (compare `git show HEAD:<file>` with the working copy
> first). Several builders work at the same time on disjoint files — respect the **Not** list exactly.

**Why:** the owner: "combat combat combat… the atomic bit of this game… everything else serves the
dogfight." Design authority: `design/overhaul/03_COMBAT.md`, `00_RULINGS.md`. Every change must keep the
simulation deterministic (`state.rng`, `state.simTime` only) and cheap at 50 bodies.

## Do

Implement items **1, 6, 7, 9 and 10** of section 4 in `.devshots/fleet/runs/INV-21-dogfight-ai.deepseek.2026-11-19T20-30-36/RECEIPT.md` exactly as specified there (files,
functions, size, risk, verify): (1) BODY_DODGE behind the tier table; (6) the horde fights in flights
(squad/wing ids on Swarm gate groups so the existing squad recipes apply); (7) fodder's 60-WU pack and the
pack ring (density test required); (9) announce the pressure break (`ai:flee` or a mapped receipt);
(10) gate committed fire on line of sight (cheap: only in fire windows). Skip item 1's optional
`maneuver.js` wind-up.

**Files:** `src/ai/` (except `maneuver.js`, `combatDoctrine.js`, `enemyMind/`), `src/systems/aiPorts.js`,
`src/data/swarmCharacter.js`, `src/systems/waveMaterialization.js`, `src/systems/tacticalAI.js`,
`src/systems/aiFireIntent.js`, their tests. **Not:** `src/systems/weapons.js` (another builder), `src/ai/combatDoctrine.js`,
`src/ai/enemyMind/`, `src/ui/hud.js`, `src/presentation/` (another builder), `src/data/pilot*.js`, `src/ui/pilotCards*.js`, `src/systems/runSession.js`, `src/core/runState.js`, `src/systems/powerVerbs.js`, `fields.js`, `bombs.js`, `impulseCharges.js`, `massSeed.js`, `tetherGameplay.js`, `masslineThrow.js` (another builder resumes there tonight), `src/ui/sandbox/sandboxSetup.js`, `scripts/lib/simWorkerHost.mjs`, `src/systems/lawSecurity.js`, `src/systems/spawnClearance.js`, `src/systems/plants/`, `src/audio/audioSystem.js`, `src/ui/radar.js` (W3-fix builder), `src/render/vfx.js`, `src/render/hullHitFlash.js`, `src/render/arenaSets/`, `src/render/bloom.js`, the crucible screens and `src/data/swarmStakes.js` (another agent's frozen work), `scripts/bench-gun-curve.mjs` (bench builder), `src/ai/maneuver.js` (another agent's uncommitted crossing-brake work).

**Run:** your new test file(s), the existing tests of every file you touch (find them by import), `test/sfq-b045-thrown-body-dodge.test.mjs`, the AI density tests, and
`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.save-v27.expected.json --hash --repeat 5`.
If the 47a hash moves, the change touched Adventure's deterministic replay: explain exactly why in the
report (a moved hash is allowed only for a deliberate gameplay change, never silently).

**Report:** per item — done or not (and why), file:line, the test names and results, the on-screen check
you did (frames through `node scripts/fleet/game-lock.mjs run -- <cmd>` if you can produce them), every file
you touched.
