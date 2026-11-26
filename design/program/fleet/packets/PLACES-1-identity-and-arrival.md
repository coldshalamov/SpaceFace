# PLACES-1 — Every place looks like itself, and arrival names it (INV-25 items 1, 2, 7)

> **Pipeline (director, 2026-11-19):** make NO git writes. Edit surgically: other agents keep uncommitted
> work in the same files — never reformat, never normalise line endings (keep CRLF where a file has CRLF;
> check `git diff --stat` shows a small diff for a small edit), never revert a hunk you did not write, and
> never build on another agent's uncommitted code (compare `git show HEAD:<file>` with the working copy
> first). Several builders work at the same time on disjoint files — respect the **Not** list exactly.

**Why:** the owner: "combat combat combat… the atomic bit of this game… everything else serves the
dogfight." Design authority: `design/overhaul/03_COMBAT.md`, `00_RULINGS.md`. Every change must keep the
simulation deterministic (`state.rng`, `state.simTime` only) and cheap at 50 bodies.

**Why (places):** the owner wants "different areas with different vibes that really feel like different
places and are fun to explore". Design: `design/overhaul/05_ADVENTURE.md`, `07_LOOK_AND_LIGHT.md` (no fog
in vacuum, light that lands, no cheap web effects).

## Do

Implement items **1** (profile rows for the three story sectors with none — Io Reach, Charon Expanse,
Ashfall Reach), **2** (split the two family lookalikes with one or two new moods and sky plates) and **7**
(a one-shot sector-arrival plate that names the place, sourced from existing data) of section 4 in
`.devshots/director/inv/INV-25-places-and-vibes/RECEIPT.md`, exactly as specified there. The arrival plate is its own small DOM layer (do not edit
`src/ui/hud.js`); it must respect reduced motion and never block input.

**Files:** `src/data/lookMoods.js`, the sector profile data the report names, `src/render/spaceBackground.js`,
a new arrival-plate module and its mount, their tests. **Not:** `src/ui/hud.js`, `src/presentation/`,
`src/data/pilot*.js`, `src/ui/pilotCards*.js`, `src/systems/runSession.js`, `src/core/runState.js`, `src/systems/powerVerbs.js`, `fields.js`, `bombs.js`, `impulseCharges.js`, `massSeed.js`, `tetherGameplay.js`, `masslineThrow.js` (another builder resumes there tonight), `src/ui/sandbox/sandboxSetup.js`, `scripts/lib/simWorkerHost.mjs`, `src/systems/lawSecurity.js`, `src/systems/spawnClearance.js`, `src/systems/plants/`, `src/audio/audioSystem.js`, `src/ui/radar.js` (W3-fix builder), `src/render/vfx.js`, `src/render/hullHitFlash.js`, `src/render/arenaSets/`, `src/render/bloom.js`, the crucible screens and `src/data/swarmStakes.js` (another agent's frozen work), `scripts/bench-gun-curve.mjs` (bench builder), `src/ai/maneuver.js` (another agent's uncommitted crossing-brake work).

**Run:** your new test file(s), the existing tests of every file you touch (find them by import); frames of each changed sector are required (enter it via the dev route if needed) — open them yourself, and
`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.save-v27.expected.json --hash --repeat 5`.
If the 47a hash moves, the change touched Adventure's deterministic replay: explain exactly why in the
report (a moved hash is allowed only for a deliberate gameplay change, never silently).

**Report:** per item — done or not (and why), file:line, the test names and results, the on-screen check
you did (frames through `node scripts/fleet/game-lock.mjs run -- <cmd>` if you can produce them), every file
you touched.
