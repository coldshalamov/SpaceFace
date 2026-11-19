# OVH-06a — Feeling the hit without shaking the screen: the camera answers only you

> **Pipeline (director, 2026-11-19):** make NO git writes (this overrides `PROTOCOL.md`'s commit
> step). Edit surgically: other agents keep uncommitted work in the same files (`renderer.js`,
> `camera.js`, `cameraDirector.js`, `feel.js` carry some) — never reformat, never normalise line
> endings (keep CRLF where a file has CRLF), never revert a hunk you did not write, and never build
> on another agent's uncommitted code (if a hunk you need to read is not in `git show HEAD:<file>`,
> do not depend on it — say so).

**Design:** `design/overhaul/03_COMBAT.md` §6.2–§6.3 and ruling R10 in `design/overhaul/00_RULINGS.md`.
Never-return (`build_map.md` §40, OVH-06): **camera trauma from room events; floating damage numbers**.
The owner's bar: an A-list game (Dead Space, Fable). Today a Swarm fight shakes the screen all the
time and the one beat that deserved it is invisible.

## Do

1. **Audit.** List every source of camera motion: each `camera:shake` emitter (`git grep -n
   "camera:shake" -- src`: combat, swarmJuice, gyreSnare, drill, explosionPresentationVfx,
   survivalAnnounce, presentationAdapters, tetherGameplay, swarmDrops, intervention, flybyFocus,
   shipMicroMotion, collectorKnot, …) and any trauma/kick added outside that event. Classify each as
   **player hull hit**, **hero beat**, **the player's own continuous texture** (boost opening the
   camera — FEEL_CONTRACT §C — and strain on the player's own line), or **room event** (everything
   else: other ships colliding, explosions that do not hit you, fodder kills, announcements).
2. **One gate.** At the renderer's chokepoint (`src/render/shakeAdmission.js` and the `camera:shake`
   handler that feeds it) admit only:
   - **your hull hit hard**: ≥ 8 % of your max hull in one blow → a small camera kick *toward the hit
     side*;
   - **hero beats**, one at a time: a throw kill on a heavy; a perfect release; a plough launch that
     kills ≥ 5; a boss phase break;
   - **your own continuous textures** (as classified in step 1).
   Room events are refused at the gate, with a per-cause refusal counter tests can read. Where an
   emitter's payload cannot tell the gate what it is, add a `cause` field at that emit line (one
   field, nothing else).
3. **Hitstop belongs to hero beats only:** 40–60 ms, **presentation-only** (render time scale — the
   simulation never pauses, so replays stay deterministic), at most once per 0.8 s. Find today's
   hitstop (`hsDur`, `feel.js`, the time-effects owner): if any collision hitstop slows the
   simulation, move the hero-beat hitstop to presentation and remove collision hitstop. Say exactly
   what you found and changed.
4. **Your hull hit hard → a red edge pulse on that side of the screen** (the side the blow came
   from), short and soft. Under reduced motion / reduced flashing: a static edge tint, no pulse. Reuse
   an existing damage-direction indicator if there is one.
5. **No floating damage numbers by default.** The `gameplay.damageNumbers` setting stays for players
   who want it, but defaults to **off** (settings defaults, the reset table, the profile picker);
   damage is read on the hull.
6. **The contract moves with the ruling.** Rewrite `design/FEEL_CONTRACT.md` row **B9** to 03 §6.2–§6.3
   (only player-hull and hero-beat events reach the camera; hitstop only on hero beats,
   presentation-only, ≤ once per 0.8 s). Tests that enforce the old "every collision with ΔV ≥ 8
   produces camera trauma" change to the new law — say which tests and why in the report. Do not
   weaken any other assertion in them.
7. **Tests** (`test/ovh-06a-camera-discipline.test.mjs` plus the rewritten ones): a seeded busy fight —
   fifty collisions and kills that do not involve the player — admits **zero** camera events; a 10 %
   blow to the player admits one kick toward the hit side and one edge pulse; a 5 % blow admits
   none; two hero beats 0.3 s apart get one hitstop; hitstop never changes `state.simTime`'s advance
   (the sim keeps stepping); reduced motion gets the static tint; `damageNumbers` defaults off and the
   setting still works.
8. **Measure it in play.** Through the game lock
   (`node scripts/fleet/game-lock.mjs run -- <cmd>`), run a Swarm round (the `?swarmRound=8` developer
   route is fine for this measurement) for ~90 s with a simple aim-and-fire pilot and record every
   admitted camera event with its cause. Report the counts: admitted by cause, refused by cause.

**Files:** `src/render/shakeAdmission.js`, the `camera:shake` handler in `src/render/renderer.js`
(only those lines), the emitters' emit lines (to add `cause`), the hitstop owner, the edge pulse,
the settings default rows (`src/ui/screens/settings.js` reset table, `src/save/profileSettings.js`,
`src/core/gameState.js` defaults if that is where it lives), `design/FEEL_CONTRACT.md` B9, tests.
**Not:** `src/systems/collisionConsequences.js`, `src/combat/damage.js`, `src/combat/impulseKernel.js`,
`src/systems/weapons.js`, `src/systems/playerModifiers.js`, `src/systems/flightV3.js` (another builder
is working there now) — if an emitter you must tag lives there, list it and leave it; also not
`src/systems/powerVerbs.js`, `src/systems/fields.js`, `src/systems/massSeed.js`,
`src/systems/impulseCharges.js`, `src/core/fields/fieldReadModel.js`, the Pilot Tree files
(`src/data/pilot*.js`, `src/ui/pilotCards*.js`, `src/systems/runSession.js`), or the crucible screens.

**Report:** the audit table (source → class → admitted or refused), each change with file:line, the
tests (new and rewritten, with results), the measured counts, anything left and why, every file you
touched.
