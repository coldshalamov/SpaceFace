# OVH-06b — Hit feel on the body: every hit reads on the hull it lands on

> **Pipeline (director, 2026-11-19):** make NO git writes (this overrides `PROTOCOL.md`'s commit
> step). Edit surgically: other agents keep uncommitted work in the same files — never reformat,
> never normalise line endings (keep CRLF where a file has CRLF), never revert a hunk you did not write,
> and never build on another agent's uncommitted code: before editing a file, compare
> `git show HEAD:<file>` with the working copy and treat any hunk not in HEAD as someone else's.

**Why now.** OVH-06a (parked) took the camera away from the room: only the player's own hard hits and
hero beats move it. That is right (ruling R10), but it means **the body that was hit now has to carry
the whole read**. If it doesn't, combat feels weaker than before.

**Design:** `design/overhaul/03_COMBAT.md` §6.1 (on the body that was hit) and §7 (ships that tumble),
`07_LOOK_AND_LIGHT.md` (light that lands; no cheap web effects: no blurry sprites, no halo blobs, no
full-screen filters). The owner's bar: A-list (Dead Space, Fable). Every effect must be cheap at ×50:
fifty hits a second are fifty local reads and zero camera events.

## Do

1. **Audit first, with frames.** For each item below, find what exists today
   (`src/render/vfx/weaponImpactVfx.js`, `woundSmoke.js`, `damagedPortVfx.js`, `combatContactVfx.js`,
   `mortalBlowRead.js`, `crushRead.js`, `src/render/livingHullPresentation.js`, the hull-burst /
   wreck owners, `feel.js`), and **shoot it in play** through the game lock
   (`node scripts/fleet/game-lock.mjs run -- <cmd>`; the `?swarmRound=N` developer route is fine for
   these frames). Open every PNG yourself. Write the table: item → exists? → where → how it looks in
   the frame → gap.
   - a two-frame emissive flash on the struck mesh (a per-instance uniform, not a new material);
   - a spark spray from the hit point along the shot's reflection;
   - a shield shell that ripples at the impact point when shields hold;
   - damage that stays: scorch/dent marks at hit points for the hull's lifetime;
   - damage states at 60 / 30 / 10 % hull: a smoke trail, then sparks and a flickering engine, then
     fire and a stuttering drive;
   - death: the hull breaks into two to four pieces that keep their momentum and come to rest as
     throwable wreckage, with a flash that lights its neighbours;
   - §7: a body that loses its helm tumbles in 3D on the mesh (pitch and roll about its velocity;
     the simulation stays planar), its plume sputters, a smoke-and-spark corkscrew trails it, its
     running lights flicker, and it recovers with a visible burn.
2. **Fill the gaps that matter most first** — in this order unless the audit shows otherwise:
   flash, sparks, damage states, shield ripple, tumble, marks, death flash. Reuse the existing VFX
   pools and primitives; presentation only (never a simulation write; `state.rng` is not yours —
   presentation randomness must be seeded from entity ids/ticks like the existing pools do).
3. **Cost.** Measure a busy Swarm round before and after (frame time from the existing perf readout
   or a GPU timer probe if one exists in `scripts/`); state the cost. Nothing may allocate per hit
   on the hot path.
4. **Accessibility:** reduced flashing dims the flash and the death flash; reduced motion keeps the
   tumble on the mesh but never moves the camera.
5. **Tests:** a focused test file `test/ovh-06b-hits-on-the-body.test.mjs` for whatever logic you add
   (state thresholds, pool reuse without allocation, reduced-flash dimming, determinism of
   presentation seeds). Existing tests of every file you touch must still pass.
6. **Proof:** before/after frames of the same moments (a hit landing, a shield holding, a 30 % ship, a
   death, a tumble), opened and described by you.

**Files:** the presentation owners named above and their tests. **Not:** `src/render/shakeAdmission.js`,
`src/render/camera.js` (the camera gate is done — do not add camera motion), any `src/systems/` or
`src/combat/` simulation file, the Pilot Tree files (`src/data/pilot*.js`, `src/ui/pilotCards*.js`,
`src/systems/runSession.js`), `src/systems/powerVerbs.js`, `fields.js`, `bombs.js`, `impulseCharges.js`,
`massSeed.js`, `tetherGameplay.js`, `masslineThrow.js` (another builder resumes there tonight).

**Report:** the audit table, what you built (file:line), the measured cost, the tests and results,
the frame paths with what you saw, anything left and why, every file you touched.
