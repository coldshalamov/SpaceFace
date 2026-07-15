# src/systems/ — Agent Notes

> The registered sim systems. Each is `init(ctx)` + `update(dt, state)`, wired in
> `src/core/registry.js` and run in `UPDATE_ORDER` (see `AGENTS.md` §8) by `src/core/loop.js`.
> Read root `AGENTS.md` §3 (uncommitted-tree trap) + §5 (live/legacy) + §7 (bug routing) first;
> full map in `docs/MODULE_MAP.md`.

## CRITICAL — duplicate systems. Edit the LIVE one.

| 🟢 LIVE | ⚪ LEGACY (don't edit — no effect in normal play) |
|---|---|
| `flightV3.js` | `flight.js` (statically imported fallback and compatibility-check fixture) |
| `tacticalAI.js` (+ `../ai/*` + `aiPorts.js`) | `ai.js` (statically imported fallback and compatibility-check fixture) |

Both `flight.js` and `ai.js` are retained because CI runs legacy `check:sim` against them. Don't delete without removing those scripts.

**Before diagnosing any bug here, run `git diff <file>`** — the shared working tree may already
contain the fix or a newer implementation than HEAD.

## The hostility system is SUBTLE — read the playbook

Live final-fire authority and fresh hostility oracle: **`../ai/engagementAuthority.js`**
(`authorizeAIEngagement`, `isHostileForAI`). `aiPorts.js` consumes that authority, while squad target
selection remains advisory. Read `docs/COMMON_BUGS.md` §2 before changing team, lawful, heat,
station-jurisdiction, response-window, or target-vote behavior.

Canonical "is player wanted" check: `heat.isPlayerWanted(state)`. The `ai.playerWanted` field is dead
compatibility state; do not use it as authority.

## Library modules vs registered systems

These live in `src/systems/` but are imported by other code; they do NOT run every tick on their own (editing them only matters via their importers):
- `dangerModel.js` → imported by `sectorSim.js` only. **NOT combat threat** (offscreen sector difficulty).
- `economyCycles.js` → imported by `ui/screens/market.js`.
- `alphabet.js`, `gamepad.js` → imported by check scripts + input.js.
- `telemetry.js` → instantiated in `main.js`, not the registry.
- `touch.js` → touch input helper.

## File quick reference

**Flight:** `flightV3.js` (live), `cruise.js`, `impulseCharges.js`. Physics math in `../core/flight/`.
**AI:** `tacticalAI.js` (live) + `../ai/*` (stack/perception/director/squad/shipDecision/maneuver/engagementAuthority); `aiPorts.js` (execution bridge); `aiEncounter.js` (reinforcements). Legacy: `ai.js`.
**Combat:** `combat.js` (registered) → calls into `../combat/` shared library (kernel/damage/attachments/etc — busy, imported by 9 systems). `weapons.js` (firing + weapon heat; `typeof window` vent preserves determinism). `countermeasures.js`.
**Heat (3 meanings!):** `heat.js` = WANTED heat (`state.player.heat`, sole writer, `isPlayerWanted`). Weapon heat = `weapons.js`. Sector danger = `dangerModel.js` (library, not combat).
**Mining/cargo/economy:** `mining.js`, `drill.js`, `cargo.js` (sole writer of `player.cargo`), `economy.js` (sole writer of `player.credits`, 5s tick), `crafting.js`.
**World/factions:** `world.js` (sectors, spawns, WANTED-hunter spawning), `factions.js` (sole writer of `factions[id].rep`; combat AI reads heat, not rep directly), `traffic.js` (civilian traffic), `sectorSim.js` (offscreen), `scanner.js` (`actions.scanPulse`), `claims.js` / `beacons.js` (`actions.deployBeacon`).
**Missions/story:** `missions.js`, `story.js`, `onboarding.js` (runs last, reads state only).
**Ships/wingmen:** `ships.js` (sole writer of `entity.derived`; default `team:0`), `wingmen.js` (team:0).
**Presentation:** `presentationOrchestrator.js` + `presentationAdapters.js` (registered; consume `../presentation/` data).

## Single-writer rules (don't violate)

- credits → only `economy.js` writes `player.credits`
- rep → only `factions.js` writes `factions[id].rep` (`applyRep`)
- cargo → only `cargo.js` writes `player.cargo` (`addCargo`/`removeCargo`)
- derived stats → only `ships.js` writes `entity.derived` (`getDerivedStats`)
- WANTED heat → only `heat.js` writes `player.heat`
