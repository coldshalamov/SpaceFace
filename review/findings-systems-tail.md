# Thermonuclear Review — `src/systems/` long tail (~115 files)
Source: read-only Explore subagent (deep + grep). Confirms single-writer (§0.6) and determinism (§0.5) hold across every file. Findings = mostly doc-drift, hardcoded ids, a few real bugs.

## 🔴 Real bugs
- 🔴 **`lossLedger.js:141,143` — uses `'faction_concord'` and `'faction_drift'` which DO NOT EXIST.** Canonical ids are `faction_scn` (Concord) and `faction_dmc` (Drift). Both branches dead → every Concord/Drift loss headline falls through to default "A a hauler went dark near…". `faction_reach`/`faction_quiet` branches correct. Tree-wide grep: those strings appear only here + one test fixture. **Fix ids to `faction_scn`/`faction_dmc`.** Real player-facing content bug.
- 🟠 **`intervention.js` — `_nextId` not re-derived on `save:loaded` → id/alert-key collisions after Continue.** Set in init/newGame but never re-derived from existing records on load. Next loss after load starts again at 1, collides with stored records; `'intervention-'+rec.id` alert keys collide too. Compare `claims.js:1568` which DOES re-derive `_nextClaimId = max(existing)+1` on deserialize — that's the repo pattern; intervention skips it. Real save/load bug.

## 🟠 Material
- 🟠 **`combat.js:553,635` emits `game:over`** (reasons `ironman_death`, `ship_destroyed`) — major runtime transition, NOT in §4.4 (which lists only `game:new/save/load/quit/started`). Save/UI/audio need its contract documented.
- 🟠 **`heistFacilities.js:162` listens to `physics:impact`** — undocumented; ambiguous whether alias of documented `collision` or a second physics event. Resolve (use `collision` or add to §4.4).
- 🟠 **§4.4 missing ~120 events** across these ~115 files (see findings-systems-tail full list). Largest cross-cutting doc-rot. Includes entire `encounter:*`, `tether:*`, `massline:*`, `sectorsim:*`, `uniqueWreck:*`, `claim:*`, `recovery:*`, `site:*`, `law:*`, `surrender:*`, `drill:*`, `nav:*`, `wingMorale:*`, `station:*`, `aftermath:*`, `tutorial:*`, `ai:telegraph/doctrinePhase/flee`, `combat:routeDamage/weakPointHit/nonlethalResolution`, `player:recoveryFailed`, `game:over`.
- 🟠 **`onboarding.js:1183-1320` builds its own DOM** (`document.createElement`/`innerHTML`/`head.appendChild`) — §1.2 says UI lives behind `#ui-root`/ScreenManager. Header justifies the exception ("self-contained"). Deliberate but precedent-setting arch-boundary deviation; confirm still intended.
- 🟠 **Hardcoded faction/sector/station ids scattered:** `CONCORD_FACTION_ID='faction_scn'` defined in BOTH `recoveryEncounter.js:22` AND `survivorPod.js:13`; `LAW_FACTIONS` set hardcoded in `lawSecurity.js:40`; `lawSecurity.js:1203-1204` hardcoded `station_helios`/`sector_helios_prime`; `scenarioRuntime.js:245,294,298` hardcoded `zone_47a_wreck_field`/`sector_helios_prime`/`station_helios`; `v2FlavorRuntime.js:17,19` `HUSH_SECTOR_ID`/`QUIESSENCE_SECTOR_ID`; `aceMemory.js:30-40` 3 hardcoded ace/sector triplets; `wingmen.js:148`; `moralMemory.js:49`. All ids canonical (no bug today) but every edit risks a drift like the lossLedger one. **Promote `CONCORD_FACTION_ID`/`LAW_FACTIONS` to data.**

## 🟡 Taste
- `encounterDirector.js:482-485` — `const sectorId` redeclared inside `if(g.claimsOnly)`, shadowing outer (`:453`). Same value, dead-duplicate, review-trap.
- `ships.js:344` — dead `const miningYieldMult = 1;` (comment says intentionally not applied; var deletable).
- `uniqueWrecks.js:1282-1295` — grants cargo via `pickup:collected` then re-reads `cargo.items[id]` to compute delta; relies on cargo handler running synchronously same frame. Load-bearing coupling, not noted in header. Not a current bug; would break if cargo ever defers.
- `uniqueWreckEncounterScripts.js:38-44` — 5 scripts each have `start`+`fire` keys pointing at same fn; encounterDirector only calls `.fire`, so `start` is dead on these 5.
- `sectorSim.js:62-73` — `STATION_GOODS` hardcoded station-type→commodity map should live in data.
- Many `:taste (doc drift)` per-file event omissions (consolidated into the §4.4 finding above).

## 🟢 Confirmed CLEAN (representative — nobody re-litigate)
- Single-writer + determinism hold across all 115 files (tree-wide sweeps: zero direct writes outside owners; only Math.random hits are telemetry session-ids/gamepad-timing/comments).
- Cleanest files: `aiPorts.js`, `tetherGameplay.js` (most paranoid concurrency reasoning, holds), `sectorSim.js`, `npcJobsRuntime.js`, `factionPresence.js`, `drill.js`, `routeFollower.js`, `travelLanes.js`, `fields.js`, `massSeed.js`, `planetRuntime.js`, the entire massline observer family, `worldSiteKernel.js`, `regionalEcology.js`, `titles.js`, `aftermathWrecks.js`, `flybyFocus.js`, `claims.js` (the _nextId re-derive reference implementation).

## PQ-047 in-flight (not bugs)
- `encounterScripts.js:825-833` adds `ai:telegraph` emit in `initializeConvoyPredation` (payload coherent; companion `pirate-predation-authority` test asserts it projects once at the manifest carrier). PQ-047.md acceptance still `unproven` — may grow.
