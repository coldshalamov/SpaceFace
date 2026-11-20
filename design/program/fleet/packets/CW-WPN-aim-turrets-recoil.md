# CW-WPN — Pilots who can miss, turrets you can out-turn, recoil on the hull (INV-21 items 2, 4; INV-22 item 7)

> **Pipeline (director, 2026-11-19):** make NO git writes. Edit surgically: other agents keep uncommitted
> work in the same files — never reformat, never normalise line endings (keep CRLF where a file has CRLF;
> check `git diff --stat` shows a small diff for a small edit), never revert a hunk you did not write, and
> never build on another agent's uncommitted code (compare `git show HEAD:<file>` with the working copy
> first). Several builders work at the same time on disjoint files — respect the **Not** list exactly.

**Why:** the owner: "combat combat combat… the atomic bit of this game… everything else serves the
dogfight." Design authority: `design/overhaul/03_COMBAT.md`, `00_RULINGS.md`. Every change must keep the
simulation deterministic (`state.rng`, `state.simTime` only) and cheap at 50 bodies.

## Do

1. INV-21 item **2** ("a pilot quiver instead of a perfect firing solution") from `.devshots/fleet/runs/INV-21-dogfight-ai.deepseek.2026-11-19T20-30-36/RECEIPT.md` section 4:
   NPC spread scales with `temperament.aim` and the target's lateral motion — in `src/systems/weapons.js`
   only (extend the existing spread read; the gate and the round read the same spread). Do NOT edit
   `src/systems/aiFireIntent.js` (another builder).
2. INV-21 item **4** ("a real turret slew ≤ 1.5 rad/s on capital and heavy mounts") from the same section.
3. INV-22 item **7** ("put recoil on the hull, not the camera") from `.devshots/fleet/runs/INV-22-guns-and-hits.deepseek.2026-11-19T20-30-36/RECEIPT.md` section 4: `recoilImpulse`
   on the Concussion S/M and Railgun through the existing physical-impulse path, and remove the per-shot
   FOV punch from the `combat:fire` listener (camera discipline, ruling R10 — the camera gate in
   `src/render/shakeAdmission.js` already refuses recoil trauma; do not touch the gate).

**Files:** `src/systems/weapons.js`, `src/data/weapons.js` (the recoil fields only), `src/render/feel.js`
(the FOV punch line only), `src/ai/temperament.js` (read; edit only if unavoidable), their tests.
**Not:** `src/systems/aiFireIntent.js`, `src/ai/` otherwise, `src/ui/hud.js`, `src/presentation/`, `src/data/pilot*.js`, `src/ui/pilotCards*.js`, `src/systems/runSession.js`, `src/core/runState.js`, `src/systems/powerVerbs.js`, `fields.js`, `bombs.js`, `impulseCharges.js`, `massSeed.js`, `tetherGameplay.js`, `masslineThrow.js` (another builder resumes there tonight), `src/ui/sandbox/sandboxSetup.js`, `scripts/lib/simWorkerHost.mjs`, `src/systems/lawSecurity.js`, `src/systems/spawnClearance.js`, `src/systems/plants/`, `src/audio/audioSystem.js`, `src/ui/radar.js` (W3-fix builder), `src/render/vfx.js`, `src/render/hullHitFlash.js`, `src/render/arenaSets/`, `src/render/bloom.js`, the crucible screens and `src/data/swarmStakes.js` (another agent's frozen work), `scripts/bench-gun-curve.mjs` (bench builder), `src/ai/maneuver.js` (another agent's uncommitted crossing-brake work).

**Run:** your new test file(s), the existing tests of every file you touch (find them by import), `test/ovh-01c1-body-effects.test.mjs`, `test/ovh-01c3-gun-effects.test.mjs`, `test/zc-a34-guns-nudge.test.mjs`, and
`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.save-v27.expected.json --hash --repeat 5`.
If the 47a hash moves, the change touched Adventure's deterministic replay: explain exactly why in the
report (a moved hash is allowed only for a deliberate gameplay change, never silently).

**Report:** per item — done or not (and why), file:line, the test names and results, the on-screen check
you did (frames through `node scripts/fleet/game-lock.mjs run -- <cmd>` if you can produce them), every file
you touched.
