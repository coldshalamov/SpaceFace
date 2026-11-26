# W3-fix — Make "a Swarm run in its own space" landable (review blockers)

> **Pipeline (director, 2026-11-19):** make NO git writes. Edit surgically: other agents keep uncommitted
> work in the same files — never reformat, never normalise line endings (keep CRLF where a file has
> CRLF), never revert a hunk you did not write.

**Context.** W3 (OVH-04 + OVH-09a: a Swarm run lives in its own space; loose rocks rest; every spawn is
clear) is parked as commit `652837cf04` and is LIVE in this working tree. An adversarial review (read it:
`.devshots/director/reviews/agy-w3-foundry.md`, the first section) found four blockers and two worthwhile
non-blockers. Fix exactly these, the way the review proposes unless you find a better fix (say why).
The Foundry section of that review is NOT yours.

## Fix

1. **Swarm launch without a `world` system** — `src/ui/sandbox/sandboxSetup.js` ~1380: fail closed only
   when a `world` system is installed; keep `world` required in `applyPreparedCrucibleSetup`.
   `test/swarm-overhaul-calm-start.test.mjs` must pass.
2. **Worker-lane arena switch shows the wrong sky** — `scripts/lib/simWorkerHost.mjs` (`newGameBoot`):
   invalidate the `world.sectors` and `world.discovery` leaves; `src/render/renderer.js` ~21551: fall back
   to `SECTOR_BY_ID.get(payload.sectorId)` when the mirrored sector is absent.
3. **Campaign story plants inside Swarm arenas** — `src/systems/plants/pl195FixedX.js`,
   `src/systems/plants/pl264LaneLight.js` (and any other Adventure plant keyed on `currentSectorId`):
   do nothing while `state.world.swarmArenaOnly`; remove `plantsPl195X` / `plantsPl264Light` from the
   allowlist in `test/ovh-04-swarm-census.test.mjs` so the census sees them.
4. **Wanted impound leaks yard hulls** — `src/systems/lawSecurity.js` `_postWantedImpound` (~5883–5996):
   derive the lock seat relative to the yard seat (ignore the yard itself), remove the yard if the lock
   seat or lock spawn fails, and store/pass the shifted seats.
5. (non-blocking, do it) `src/audio/audioSystem.js` and `src/ui/radar.js`: run their sector-enter resets
   on `swarm:arenaEntered` too.
6. (non-blocking, do it) `src/systems/spawnClearance.js`: never call `ensurePhysicsBodySpec` (it mutates
   dormant rock records) — read `physicsBody?.radius` or `asteroidColliderRadius(...)` for field rocks;
   add a cheap distance/AABB reject before the exact checks.

Add a focused test for each fix where one is missing (`test/w3-fix-swarm-space.test.mjs`).

**Not:** `src/systems/world.js` (already fixed by the director), the Foundry files
(`src/render/arenaSets/foundrySet.js`, `bloom.js`, the Foundry parts of `renderer.js`), the Pilot Tree
files, `powerVerbs.js`, `fields.js`, `bombs.js`, `impulseCharges.js`, `massSeed.js`, `tetherGameplay.js`,
`masslineThrow.js` (another builder works there tonight), `src/render/vfx.js`.

**Run:** your test file, `test/swarm-overhaul-calm-start.test.mjs`, `test/ovh-04-swarm-census.test.mjs`,
the existing tests of every file you touched, and
`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.save-v27.expected.json --hash --repeat 5`
(must pass unchanged).

**Report:** each fix with file:line, the tests and results, every file you touched.
