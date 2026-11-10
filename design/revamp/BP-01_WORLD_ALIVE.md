# BP-01 — WORLD ALIVE (encounter director depth)

> **Extends** `design/spec2/04_WORLD_ALIVE.md` + `SPEC3-F7` (§29 ambient traffic, §30 sector content).
> **Builds on** Wave-1 `encounterDirector.js` + `spawnBudget.js` + `sectorZones.js`. **Read** `REVAMP_MASTER.md`
> §3 contracts first (spawn budget, squadId, factionId-cosmetic, determinism).

## Goal
Make objective #1 real: *every contact has a story*. Sit still 5 minutes in any sector and three legible,
faction-motivated events happen nearby — without the player.

## Scope
- [ ] **Convoys** — traders + escorts run a `trade_lane` zone; player can rob / guard / front-run. Cargo is
      themed (Silt canisters, recyclers). Announced via `voiceArbiter` news channel.
- [ ] **Patrol beats** — a Concord wing walks gate→station→belt on a `patrol_corridor`; investigates gunfire,
      illegal mining, and distress; scans suspicious traffic (lawful gate: hostile only if player wanted).
- [ ] **Distress & rescue** — 60% genuine / 40% pirate bait (seeded roll); genuine rescues build rep, bait
      springs an ambush. Fuels risk-reading skill.
- [ ] **NPC miners contending belts** — miners + drones work `mining_belt` zones, flee under threat, and a
      killed miner ripples the local economy (ties to BP-04).
- [ ] **Named mini-bosses** — rare, callsign'd, with a behavioral gimmick and a bark corpus (`barks.js`).
- [ ] **NPC-vs-NPC faction combat** — patrols fight pirates, bounty hunters chase marks. **Keystone problem:**
      all NPCs are `team===1` and `isHostile` returns false for same-team. Add a *faction-relation* hostility
      path in `scanner.isHostile`/`aiPorts.isHostile` (two team-1 ships are hostile when their factions'
      relation < 0), gated so the player's own escorts aren't griefed. This unlocks "patrols save civilians."

## Primary files
`src/systems/encounterDirector.js`, `src/data/encounters.js` (own), `src/systems/traffic.js` (itineraries),
`src/systems/scanner.js` + `src/systems/aiPorts.js` (faction-relation hostility — single owner, careful),
`src/data/factions.js` (relations already present).

## Acceptance
`scripts/check-encounter-director.mjs` (new): deterministic schedule; budget respected (≤1 major + 2 minor /
10 min); ≥1 convoy + ≥1 patrol + one NPC-vs-NPC kill observed in a low-sec sector over N ticks; no `Math.random`
in the module; `check:sim:compare` unaffected (encounters are offscreen-budgeted, flag-off in the 47-A scenario).

## Dependencies
Wave-1 `encounterDirector` + `spawnBudget`; `voiceArbiter`; `barks.js`.
