# PQ-138 instrument — "does the world react?", measured on the real game

## WHAT I FOUND

The number the bench was printing for "the world reacts" was not a measurement. The old scenario
`world.cargo_spill` reported "a salvor arrives 3.75 seconds after cargo spills". It did not spawn a
salvor, did not run the game, and did not even read its own seed: it added a made-up 0.75 s reaction
delay to a made-up 450 units divided by a made-up speed of 150. The event it claimed to watch
(`freight:cargoSpilled`) had **nothing listening to it anywhere in the game**.

So I built an instrument that boots the actual shipping game — the real sector, the real stations,
the real patrol, the real ambient traffic, the real physics — causes one real thing, and then just
watches. It never spawns the reaction it is looking for. If nothing comes, it says "never".

## WHAT IT MEASURES (fixed seed 4242, sector Helios Prime)

| Clause | The question in plain words | Deadline |
|---|---|---|
| B10a | After you kill someone in front of a patrol, does the patrol have to CHOOSE — stay with the wreck or chase you? | 10 s |
| B10b | When cargo spills, does anyone in the world actually come for it? | 30 s |
| B10c | Do civilians near a firefight change course? | 3 s |
| B10d | Does a wreck keep the speed and spin of the ship that died, and can you shove it? | ≥ 80 % of the victim's speed |

## THE BEFORE NUMBERS — the world, before this lane touched anything

| Clause | Before |
|---|---|
| B10a patrol chooses | **NEVER.** All three responders chase. Nobody stays with the wreck. |
| B10b someone comes for the spill | **NEVER.** Two salvors sat idle in the sector; nothing came. |
| B10c civilians react to gunfire | **NEVER.** The civilian flew straight through the firefight. |
| B10d wreck keeps its momentum | **0 %.** The wreck spawns dead still, at mass 1 000 000 — a wall, not a body. |

`BEFORE-4242.json` is the raw run. It was taken at 19:52 on 2026-09-03, before any of this lane's
fixes existed on disk (the first fix landed at 19:57) — so it is a reading of the untouched game.

## THE TWO WAYS AN INSTRUMENT LIKE THIS LIES, AND WHAT I DID ABOUT THEM

1. **Anything far from the player is not simulated at all.** The game only gives a physics body to
   things near you. My first version staged the spilled cargo 1 800 units from the player, so the
   cargo, the wrecked hauler and any salvor flying to them were frozen — and the scenario would have
   read "never" forever, no matter how well the game worked. Every clause now walks the player to the
   event first, and then checks that every actor it depends on is really being simulated. If one is
   not, the answer is **UNMEASURED**, which is a different word from "never" and is never quietly
   counted as one.
2. **Ambient traffic turns all the time.** With no listener in the game at all, the "civilian reacted
   to gunfire" clause read *met at 2.4 seconds* — the NPC simply flew its own route. So that clause
   now runs the identical three seconds twice on the same seed, once with the shooting and once in
   silence, and only counts a turn that happens with the gunfire and not without it. Measured: it
   turns at 2.4 s in **both** runs. That is traffic, not a reaction, and the instrument now says so.

## THE FRAMES

Headless. The reactions here are decisions, arrivals and drift — they are read from the live sim,
and the per-leaf receipts carry any capture.

---

### Engineering appendix

- Module: `scripts/lib/bench/scenarios/world.reaction_trio.mjs` (drop-in bench scenario; nothing
  shared was edited — `verbBench.mjs` and `feelBars.mjs` untouched).
- Boot: `createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed })` +
  `world.enterSector('sector_helios_prime')` + `physics.prepareBackend`. Proof published in
  `metrics.realPathProof`: `backend rapier-dynamic`, `sg02Ready true`, `sg02Bodies 98`,
  `flightBackend v3`, `aiBackend sg06-tactical`, `profileId production`, `contactCaptureEnabled true`.
- It deliberately does not use `scripts/lib/bench/realPath.mjs`'s `bootRealPath`: that helper takes a
  focused explicit system list, and a focused list cannot materialize a sector (no `world` system →
  no stations, no jurisdiction, no traffic). It imports `realPathProof` from the same helper so the
  proof object is identical.
- Trap 1 (residency): `bodilessActors()` reads `physics._sg02.records` (keyed by entity id) for every
  actor a clause depends on; a miss sets `unmeasured: true` and the bar note says UNMEASURED.
- Trap 2 (feature flags): `withFeatures()` wraps `physics.prepareBackend` and **every** `bus.emit`
  with `snapshotFeatureMaps()` / `applyFeatureConfigToMaps(runtime.config.features)` /
  `restoreFeatureMaps()`. Without it `prepareBackend` builds SG-02 with contact capture off (the
  a82158c8 bug) and any flag-gated listener silently never runs.
- Two staging preconditions found the hard way and encoded in the module: `lawSecurity._handleDamage`
  ignores a `combat:damage` payload that carries only `amount` (it gates on `applied > 0`), and
  `aftermathWrecks.makeMarker` returns null for a kill outside a named zone — the kill must be inside
  `zone_helios_core` **and** inside a station protection ring, which `station_helios` (1280, −420)
  satisfies.
- Determinism: `state.rng` / `state.simTime` only; every staged position derives from the live
  sector's own entity ordering. No `Math.random`, no wall clock.
- Cost: ~150 s wall for all four clauses (six real runtime boots, including the silent control).
