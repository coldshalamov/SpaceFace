<!-- LIFETIME: VOLATILE — refresh base: origin/master at commit 82698b7d9 (2026-09-30). Expires when the next hull-burst session lands its first commit or on 2026-10-14, whichever is first; then read git log and docs/plans/2026-09-29-hull-burst-physics-overhaul-design.md sections 13-14 instead. -->

# Hull-burst overhaul — handoff to the next session

Read this first, then `docs/plans/2026-09-29-hull-burst-physics-overhaul-design.md` (section 0 for the owner's words,
section 10 for the slice list, sections 13-14 for what was built and measured). Do not re-run the brainstorm.

## 1. What the owner wants (plain words)

The owner does not read code. They fear the game drifts toward an "Endless Sky clone" and want it physics-driven and
arcade-fast, so that **where the ship is and how fast it arrives matters** (and the Massline matters). The picture they
gave: a timed, front-facing "hull burst" special; "you get a good throw on 3 enemies and they blast into an asteroid
field and they burst, and there's shiny winnings that come out of them and accelerate towards you and bling into you";
the player never takes physics damage (worst case a brief stun and tumble); enemies tumble away and ping off objects
(not "buzz against the wind"); every object a primitive with a reaction table. **The goal for the whole job:** build
all of it, hunt bugs for a demo, commit in packets with an independent review per chunk, push, and leave the game
working.

## 2. What is BUILT, pushed, and measured (origin/master at 82698b7d9)

| Slice | What | Key commits |
|---|---|---|
| A | A hull you knock loose is a projectile: free spin, bounce, chained credit and knock, outbound floor (no buzz); kill loot homes from anywhere after a beat, overflow ore pays credits; banking on dock/jump; real Massline throws credited | `028371241` `1c14281bf` `b3ef08974` `3b708fcba` `9a084c516` `41e035b11` `75d6faf28` `48c4def72` `302a060cb`, review fixes `dcd5583d0` |
| C | Gravity Bumper (timed front wedge, throw scaled by closing speed), key `Backslash`/`IntlBackslash`/middle-click, readout on the field pill, sound and flares, Helios rack 12,000 cr, wedge visual, rank-2 Mk2 modules | `41858027b` `be53726e1` `3c663b8dc` `9ddc001c3` `09f782428` `694c0a3f3` `49f212c4a` |
| E | Fire Lance (thermal damage through the combat kernel: light/medium die, heavies burn) and Grip Bumper (catch one light hull, carry it, release ahead) on the same framework | `a42bf8021` `980bfb61a` |
| D | Salvage bay: the player's own kill loot lands in a separate store (max(600, 5x hold)), docking cashes it in at 60% of reference price; additive optional save key | `a1e7a5157` |

Flags: `combat.tumbleFling`, `combat.arcadeLoot`, `combat.salvageBay` — production ON, `legacy47a` OFF (the frozen 47-A
golden cannot see any of it; its hash is identical with and without every packet, re-proved 2026-09-30).
`hullBurst` is a production-only system (absent from `LEGACY47A_SYSTEM_IDS`).

**Proof, all re-runnable:**
- `node scripts/run-bench-scenario.mjs feel.bumper_scene` (about 25 s) — 19 targets, all MET at this commit: a Wasp
  touched at a real 19 WU/s is moved 41 WU in 3 s, a 297 WU/s arrival throws it at 411 WU/s and 1,232 WU (30x); light and
  medium hulls leave the nose faster than the player flies (0 re-rams); a Warden is given 0.46 of a Wasp's delta-V and loses
  its helm 2.05 s vs 3.5 s; three Wasps into a rock wall = 3 kills credited, 21 of 21 pickups landed, 208 units in the
  salvage bay and the trade hold at 0; the Fire Lance kills 3 of 3 in a line and a Warden burns; the Grip Bumper carries
  a hostage within 0.004 WU of the nose, rams a rock (kill credited) and releases 109 WU/s ahead on a second press.
- `node scripts/run-bench-scenario.mjs feel.fling_scene` (about 35 s) — the slice-A yardstick incl. real Massline throw arms.
- `node scripts/probe-hull-burst-e2e.mjs [mod_gravity_bumper_s|mod_fire_lance_s|mod_grip_bumper_s]` — the real game in
  Chromium with the real keyboard; run in the BACKGROUND (boot takes minutes). Gravity reference run 2026-09-30: burst
  activated, pill "GRAVITY BUMPER - LIVE 6s", blue wedge drawn (see `.devshots/e2e-burst/gravity-2-after.png` if still
  there), 3 of 3 hostiles thrown at 417/416/429 WU/s; no page errors. **Lance and Grip have NOT been run end to end.**
- Tests: `node --test test/hull-burst.test.mjs test/hull-burst-input.test.mjs test/hull-burst-hud.test.mjs
  test/hull-burst-vfx.test.mjs test/salvage-bay.test.mjs test/arcade-loot.test.mjs test/arcade-loot-bling.test.mjs
  test/tumble-fling-*.test.mjs` (all green at this commit).

## 3. Working state of the tree (2026-09-30)

`npm run check:baseline` is 11/16 green. The five reds are NOT from this work and are already in the demo defect ledger
(`design/program/DEMO_READINESS_2026-09-20.md` section 6) or belong to another lane's uncommitted edits:
`sim` and `sim-v3` (47-A golden hash drift, ledger D83, from another lane's `954a0ab8c`), `massline` -> `check:massline:heads`
(`massline-elastic-whip-head` manual cut 43.77, ledger D99, hull-proportions collider change by another lane),
`pq020-ceres-topology` and `render-package-plan` (world/render files other lanes are editing). Also failing at this commit
and not analysed (none of them touches a file this work changed, and each failed the same way before the slice they sit
near): `freight-cargo-custody` "tacticalAI plus physics ... raider collect by contact" (physics telemetry null),
`shipworks-fit-from-hold`, `weapon-shove-identity` (greps `shipworks.js` for a string it no longer contains),
`place-identity-provenance`, the F1 faction tests, `pq-176-03-fit-sentences` (other lanes' new modules lack sentences).
Do NOT "fix" these as part of this job; do log anything new you find (AGENTS.md section 7).

## 4. What is NOT done — in priority order

**0. Independent review of what has never been reviewed.** Slices D (salvage bay), E/1 (Fire Lance), E/2 (Grip Bumper)
and the C/6, C/7 fixes were built and tested but no independent reviewer has read them. Spawn a
`superpowers:code-reviewer` per chunk with the owner's quotes (design doc section 0) and the done-when number, ask for
defects ranked by severity, then fix. Known suspects to point them at: the Grip carry (spring-damper impulses; helm
re-taken every 2.5 s; behaviour when the hostage is killed by someone else, when the player docks/dies while holding,
when two grip presses arrive in one tick); the Lance's use of `helpers.routeCombatDamage` and friendly-fire flags;
the salvage bay's cash-in on `dock:docked` (economy reason `salvage:bay_sale`, ordering with other dock handlers, a
player who docks with a full bay and a full hold); the field-pill voice ordering; `fieldForcePresentation` changes
(six-field limit, quiet-empty latch, render cost of an extra cone).

**1. Look at it.** Run the e2e probe for Lance and Grip, open the PNGs, judge the wedge tints (Lance orange, Grip green;
only Gravity blue has been seen), fix what looks wrong. Use `docs/UI_VISUAL_ITERATION.md` for HUD looks.

**2. Slice B — player stun (own flag `combat.playerStun`, default OFF).** Not started. The owner's ruling: the player never
takes physics damage; at worst a brief stun and tumble (cap about 1.0 s, 2 s immunity, conservative threshold, a warning
cue). The design flips "the player never tumbles". **The owner's cut-off sentence ("The player should sti...") is
unanswered: ask one plain question in the first report after B, do not block on it.** Seams found: the trigger channel
already exists (`combat:hitstunImpulse` is published for the player as a victim; `tumbleStates._beginFromImpulse`,
`_tickRcsLatches`, `_onStatusExpired` and `isTumbleEligible` exclude `state.playerId`); to remove the player's control
without editing flight, zero `state.input` axes/fire/boost from `tumbleStates` (it runs before `flight` and `weapons`) and
gate `flightV3.update`'s player branch (`playerFlightControlsActive` lives in `src/systems/flight.js`, a compat file); write
the player's tumble through `writePhysicsControl`. Flip these three assertions deliberately (never work around them):
`scripts/check-massline2.mjs` (player never tumbles), `test/weapon-impulse-consequence.test.mjs`,
`test/massline-presentation-uvp.test.mjs`. `masslineImpactDamage` "never damaged by physics" stays true. Ship it OFF for
the demo unless the owner says otherwise.

**3. Slice H — enemies that answer the burst.** Pattern: `src/ai/specialistPlans.js` (data), `specialistCounterplay.js`
(verb dispatcher), doctrines in the tactical stack. Stabilizer (light support hull, its pulse cancels tumbling on nearby
allies: `tumbleStates._clearTumbleStatus`/`clearRecovery` are the seams) and Skirmisher (keeps range from a live wedge:
read `state.hullBurst.phase === 'active'` and the player's heading; there is no wind-up phase today, so it reacts to the
live wedge, or add a short `windupS` to the types). Both need spawn integration in an encounter roster or they never
appear. Physics writs: new Open Line Contract offers judged from stunt receipts (`src/combat/stuntRecognition.js`).
Collateral (a flung hull killing a civilian is the player's harm) already arrives through attribution; verify the
civilian-harm rules fire (heat, reputation, scattered cargo). **Unverified: whether the stunt system recognises a burst
chain as a trick with a chain bonus** (design 5.2, 7.4): add `stuntGrammar` to a scene arm and read the receipts; the
chain bonus must ride the stunt-pay channel (reputation and salvage-rights chits, never credits) unless the owner
overrides credit parity (design 11.2).

**4. Slices F and G.** F: small/medium asteroids movable and throwable (dynamic on touch, asleep again, hard cap on awake
bodies; `promoteAsteroidFieldRock` in `mining.js` is the existing promotion path, `isTowCandidate` in
`combat/masslineTargetScoring.js` the tow rule, `data.towable`/`physicsBody.dynamic` the per-entity switches), grabbable
mines and enemy missiles, "one physics door". Gate on `npm run probe:runtime-witness` numbers. G: the reaction table;
note that jettisoned volatile pods already react on slam (`lootShards._onVolatileImpact`: explosive radial impulse,
cryo flash, corrosive tick) and bombs/statuses exist, so G is a small event-driven table with a chain-depth cap over
pieces that exist, not a new engine.

**5. Known gaps from the reviews.** (a) Flung hulls outrun the SG-02 body ring: a hull thrown at 400 WU/s leaves the
physics-admission radius and passes through rocks past about 850-900 WU, so "blast into an asteroid field" needs the
field within that range; a drag on tumbling hulls is the lever (light hull flies about 1,200 WU in 3 s today — likely
too far). (b) Boost (about 300 WU/s) and a rope swing (B7 measures 292 WU/s at 1.5x cruise) arrive at nearly the same
speed, so the burst alone does not make the Massline better than boost; that needs a rule elsewhere (boost is metered,
a swing is free). (c) A nudged non-hostile hull gets no cue, so a player cannot tell a nudge from a missed press. (d)
The salvage bay has only a tooltip line and a dock toast (no meter); the ORRERY cluster and the ordnance rail are pinned
to nine sockets by tests, so the burst readout rides the field pill. (e) A hostile that has not targeted the player
(ambient pirate) is only nudged. (f) One unexplained `404` console error during the e2e run (a missing resource; find it).
(g) Rank-2 module prices/tech gates, Helios rack price 12,000 cr, salvage sale rate 0.6 and cap 5x/600, burst durations
and recharges are untuned placeholders; the salvage economy needs the career benchmarks (`check:m3-career-cohorts`) run
on a quiet host.

## 5. Traps that cost hours (keep them)

- The runtime instantiates its OWN copy of every system (`runtime.getSystem(x) !== importedModule`). Drive scenes through
  the input edge (`state.input.actions.hullBurst = true`), never the imported module.
- The player is not slowed by what it touches, so it bulldozes any hull it reaches at its own speed: a "throw" slower than
  the player is the player's ram. Light and medium hulls must leave faster than the player; the scene reports `noRam` and
  a burst-never-lit control.
- Shove beat: any shove-class hit past u = 0.3 gives about one screen of travel, so a nudge must stay under it.
- Entity ids are recycled: latch by entity OBJECT (WeakMap), never id. Keep Sets/Maps out of `state`.
- Bench fittings must live in `state.player.ownedShips` or the ships system drops the module on the first pickup.
- A new module also needs: `MODULE_AIR_SENTENCE`, a tech unlock entry, the progression-verb audit vocabulary
  (`scripts/check-progression-verb-audit.mjs`), and (for a new system) the pinned counts in
  `test/authoritative-manifest.test.mjs` plus registry/manifest/`nodeSystemFactoryTable`.
- The tree is shared and hot and CRLF. Never reset/restore/checkout/clean/stash; no worktrees; stage by exact path; for a file
  another lane is editing use `node scripts/commit-mine.cjs <spec.json>` (a hunk-only commit; its header explains the
  spec) and read `git show --stat HEAD` afterwards. Shell heredocs containing apostrophes break: write patch scripts
  with the editor tool. Do not extract the whole repo (it is several GB and the disk had 0 bytes free once).
- Scenes need src/render/* to parse; another lane's mid-edit syntax error (`camera.js`) blocked every bench and browser
  run for a while. If a scene will not import, read the first error line before suspecting your change.

## 6. What to tell the owner (plain words, in the next report)

Lead with done/not done. Done and working in the real game: the throw, the loot that flies into the ship, three burst
modules on one key, a visible wedge, upgrades, a separate salvage bay that cashes in at the dock. Not done: player stun,
enemies that answer the burst, movable rocks/mines/missiles, the reaction table. Ask two plain questions: (1) the cut-off
sentence about the player's stun; (2) is a key on the right of the board (Backslash, or middle-click) acceptable for the
burst, or should it move? Say the numbers (prices, recharge, distances) are placeholders to tune by playing.

## 7. Paste-in prompt for the next session

> Continue the SpaceFace hull-burst physics overhaul. Read `docs/plans/2026-09-30-hull-burst-handoff.md` first, then
> `docs/plans/2026-09-29-hull-burst-physics-overhaul-design.md` sections 0, 10, 13, 14. Slices A, C, D, E are built and
> pushed. Work through handoff section 4 in order: (0) get an independent code-reviewer subagent on slices D, E/1, E/2 and
> C/6-7 and fix what they find; (1) run `scripts/probe-hull-burst-e2e.mjs` for the Fire Lance and Grip Bumper and look at
> the pictures; (2) build slice B behind `combat.playerStun` (default OFF); (3) slice H; (4) slices F and G; (5) close the
> known gaps. After every chunk: a focused test, `node scripts/run-bench-scenario.mjs feel.bumper_scene feel.fling_scene`
> (all targets must stay MET), the 47-A golden hash identical to the commit before your change, an independent review, an
> exact-hunk commit, push. Use the advisor before each slice and before declaring done. The tree is shared: never reset,
> restore, checkout, clean or stash; commit by exact path (`scripts/commit-mine.cjs` for files another lane is editing).
> Finish the job end to end; do not stop early. Report to the owner in plain words (handoff section 6).
