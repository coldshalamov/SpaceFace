# encr-progress — encounters stranding recovery (devin-encr)

Started 2026-10-25 ~22:30 EDT. Task: recover ~30 dirty `src/data/encounters/*-lived-*.js`
files stranded by a dead lane; identify strand, verify, land or finish.

## Strand identified (reading diffs, pre-verification)

One coherent **RC-459 curated-vignette "physical ask honesty" packet**, all files written
in the same second (2026-10-25 10:08:26):

- `src/systems/vignetteInterpreter.js` — every prop-dependent await step (`latched`,
  `strained`, `released`, `settled`) now validates the prop body each observation via
  `propEnt()` → dead/recycled/NaN prop returns `'gone'` (aborts as
  `aborted:physical_subject_gone`, never a satisfied ask). `gap` step reworked: crossing
  is measured on the PLAYER's own displacement against today's segment, so escort-hull
  motion sliding under a parked player can't count a crossing. `prop` verb spawns
  `type:'payload'` (was `'beacon'` — invisible to massline acquisition) and stamps
  `combatProfileId:'combat_profile_tether_payload'` when unauthored.
- `scripts/build-lived-vignettes.mjs` — `RC459_PROP_OFFSETS` per recipe kind (tow/relay/
  park/deliver/toll props start ~197 WU out so the instructed route clears the 120-WU
  displacement bar; `clear_scav` inside the scav ring; `strain` stays on the hook);
  instruction copy names the "hundred-twenty of drag"; `curatedHail()` capitalizes the
  place label in transmitted hails; sponsor `b` branch is paid AND physical ("then close
  in slow"); paid-lapse timeoutLines acknowledge the kept debit. Script already had
  `--row=459` write-if-changed mode covering exactly the 30 curated modules.
- `src/data/encounters/` 30 files (orders 401–429 + 536) — diffs are exactly the
  generator's output: prop dx/dz 54/-28 → per-kind offsets, capitalized hails, new copy,
  new timeoutLines. Pure regeneration, no authored hunks detected.
- `test/rc-vignettes-459-4242.test.mjs` — ~300 new lines: gone-prop aborts, gap
  player-path test, paid-lapse speech acks, a REAL Rapier massline tow end-to-end
  (real acquisition press + attachment service + tetherGameplay mirror), real
  `save._serializeEncounterDirector` round-trip, prop-start ≥150 WU gate.

## Status

- [x] Strand identified: RC-459 physical-ask packet (interpreter + generator + 30
      regenerated modules + extended test)
- [x] NOW.md row devin-encr added
- [x] `--row=459` regen byte-clean check → "regenerated 0 of 30" — dirty modules are
      byte-identical to current generator output (complete, not partial)
- [x] focused tests green — `rc-vignettes-459-4242`: 13/13 PASS after finishing the
      stranded tail (see below); lived-world/lived-frontier-pockets/vignette-cost-verb/
      encounter-shapes/global-coordinates/save-loaded-replan/loader all green
- [x] pathspec commit + push + LANDED_REVIEW row — DONE

## Landed

- `9d65866e15` — strand packet, 34 files (30 regenerated modules + generator +
  interpreter + extended test + this note). Verified `git show --stat` = exactly
  the intended paths, no sweep.
- `67cd85266c` — stale ambient-count assertion 16 → 24 (upstream `0749dfe36e`
  oversight).
- `85846f22c4` — LANDED_REVIEW row R-9d65866 (re-check: is tow_settle finishable
  by a human pilot without the scripted snub?).
- Pushed `origin master` (`a2f6f5c81b..85846f22c4`); strand commit had already
  ridden a live lane's push. NOW.md row devin-encr → DONE.

## What remains (not mine)

- `src/ai/maneuver.js` foreign dirty hunk (SF-2b orbit closing cap) breaks
  `test/vignette-navigation.test.mjs` 'moving-point speed allowance' — owner lane
  must finish or revert; preserved dirty.
- `test/encounter-barks.test.mjs` foreign cap 5→8 hunk — green, preserved.
- All other dirty files belong to live lanes (infb/fart/infa/infworld/d256/etc.) —
  untouched.

## Tail finished (what the dead lane left red)

`physical gate: a REAL massline tow resolves tow_settle (order 401)` was failing:
the scripted pilot hauled the prop on a shortening winch (117→46 WU), which snapped
it to ~47 WU/s into a **bound orbit** at ~8 WU/s around the player. Payload material
has NO linear damping (`physicsMaterials.payload`: restitution .10, angularDamping
.15, no linearDamping) and the rope damps only radial stretch — so a calm cut moment
(range<29 && speed<2.8) never arrived. Diagnosed with `probe-encr-tow.mjs` (scratch,
deleted after use): orbit decayed only ~0.008 WU/s per s.

Fix is test-side piloting only — production code untouched: after `released` becomes
the pending step, the pilot holds the ship on the trailing side of the prop's
velocity at rope length +6 WU (taut rope does negative work — the real "snub the
swing" maneuver), then creeps the hanging load into the ring at ~2 WU/s and cuts at
range<27 && speed<2.6. Resolves `done`/`a` in ~29 s of sim inside the 120 s timeout.

## Foreign failures seen en route (preserved, not mine)

- `test/lived-world.test.mjs` ambient count expects 16; HEAD ships 24 `*-scene-*.js`
  files and generator `AMBIENT` has 24 rows — stale constant from upstream
  `0749dfe36e` (row 540). Fixing as a one-line follow-up commit.
- `test/vignette-navigation.test.mjs` brake-cap failure comes from the FOREIGN dirty
  hunk in `src/ai/maneuver.js` (SF-2b orbit closing cap) — another lane's in-flight
  work; left untouched.
- `test/encounter-barks.test.mjs` dirty hunk (variant cap 5→8) — fill-lane work.

## Notes for the next reader

- devin-infworld's NOW row claims `src/data/encounters/**` broadly ("per-packet NOW
  rows"), but no packet row names these files and they sat untouched 12h; this recovery
  was explicitly assigned. Other dirty files in the dir? None — the only dirty
  encounters are the 30 regenerated ones.
- `test/encounter-barks.test.mjs` dirty-hunk is FOREIGN (bark variant cap 5→8, fill-lane
  work) — preserved, not mine. `en-US.generated.js` 3-line hunk likewise foreign.
