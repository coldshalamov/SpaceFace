# System Registry — auto-generated

> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Derives the system list,
> init/update order, and per-system event emissions/subscriptions by scanning `src/`. The
> authoritative source is `src/core/registry.js`; this is a navigable projection of it.
>
> Generated: 2026-07-05. Live/legacy note: `flight` and `ai` slots are flag-selected
> (see root `AGENTS.md` §5). Defaults: `flightBackend:'v3'`, `aiBackend:'sg06-tactical'`,
> `physicsBackend:'rapier-dynamic'`. Legacy `flight.js`/`ai.js` are fallback-only.

## Init order (registration order — `registry.js` SYSTEMS array)

```
core → input → scanner → ai → physics → aiPorts → aiEncounter → actions → flight → cruise → weapons → countermeasures → impulseCharges → combat → tetherGameplay → mining → cargo → economy → automation → wingmen → intervention → world → factions → sectorSim → missions → story → scenarioRuntime → presentationOrchestrator → presentationAdapters → ships → crafting → heat → traffic → drill → claims → beacons → onboarding → render → vfx → feel → audio → ui → save
```

## Update order (per-tick sim step order — `registry.js` UPDATE_ORDER)

```
input → scanner → ai → aiEncounter → actions → beacons → flight → cruise → aiPorts → weapons → countermeasures → impulseCharges → physics → combat → tetherGameplay → mining → cargo → automation → wingmen → crafting → economy → intervention → world → factions → sectorSim → missions → story → scenarioRuntime → heat → traffic → drill → claims → onboarding
```

## Per-system detail

| Slot | Likely file | Lines | Emits (count) | Subscribes (count) | Top events |
|---|---|---|---|---|---|
| `input` | `systems/input.js` | 631 | 3 | 0 | `ui:targetNearestHostileToCursor`×2, `ui:setCourse`×1 |
| `scanner` | `systems/scanner.js` | 347 | 2 | 0 | `scan:pulse`×1, `scan:completed`×1 |
| `ai` | `systems/tacticalAI.js` (+ legacy) | 155 | 0 | 2 | — |
| `aiEncounter` | `systems/aiEncounter.js` | 298 | 0 | 0 | — |
| `actions` | `systems/actions.js` | 14 | 0 | 0 | — |
| `beacons` | `systems/beacons.js` | 160 | 5 | 2 | `audio:cue`×3, `economy:chargeCredits`×1, `beacon:deployed`×1 |
| `flight` | `systems/flightV3.js` (+ legacy) | 1050 | 7 | 3 | `ship:boostStop`×2, `ship:boostStart`×1, `ship:dash`×1 |
| `cruise` | `systems/cruise.js` | 136 | 4 | 3 | `cruise:engaged`×1, `cruise:charging`×1, `cruise:snared`×1 |
| `aiPorts` | `systems/aiPorts.js` | 905 | 1 | 0 | `ai:encounterCommand`×1 |
| `weapons` | `systems/weapons.js` | 665 | 5 | 0 | `weapons:vent`×2, `combat:fire`×2, `combat:beamStop`×1 |
| `countermeasures` | `systems/countermeasures.js` | 249 | 2 | 0 | `countermeasure:deployed`×1, `audio:cue`×1 |
| `impulseCharges` | `systems/impulseCharges.js` | 298 | 6 | 0 | `charge:stuck`×1, `charge:thrown`×1, `charge:detonated`×1 |
| `physics` | `core/physics.js` | 1059 | 8 | 1 | `projectile:hit`×2, `dock:range`×2, `gate:range`×2 |
| `combat` | `systems/combat.js` | 546 | 13 | 3 | `camera:shake`×4, `economy:grantCredits`×3, `player:death`×2 |
| `tetherGameplay` | `systems/tetherGameplay.js` | 457 | 7 | 0 | `tether:released`×2, `tether:broke`×2, `tether:cut`×1 |
| `mining` | `systems/mining.js` | 964 | 23 | 5 | `mining:yield`×3, `cargo:full`×2, `mining:start`×1 |
| `cargo` | `systems/cargo.js` | 177 | 2 | 3 | `cargo:changed`×1, `cargo:full`×1 |
| `automation` | `systems/automation.js` | 1530 | 23 | 5 | `asset:deployed`×4, `economy:chargeCredits`×4, `economy:applyTradePressure`×3 |
| `wingmen` | `systems/wingmen.js` | 156 | 2 | 3 | `combat:hitAsset`×1, `entity:destroyed`×1 |
| `crafting` | `systems/crafting.js` | 296 | 7 | 0 | `craft:queueChanged`×3, `craft:complete`×2, `audio:cue`×2 |
| `economy` | `systems/economy.js` | 1180 | 12 | 18 | `economy:tradeFailed`×2, `credits:changed`×2, `economy:tick`×1 |
| `intervention` | `systems/intervention.js` | 144 | 3 | 1 | `camera:shake`×1, `intervention:available`×1, `intervention:closed`×1 |
| `world` | `systems/world.js` | 1528 | 26 | 12 | `economy:chargeCredits`×2, `jump:chargeAbort`×2, `poi:discovered`×2 |
| `factions` | `systems/factions.js` | 553 | 9 | 10 | `faction:repChanged`×3, `faction:aggro`×3, `faction:repSpillover`×1 |
| `sectorSim` | `systems/sectorSim.js` | 783 | 8 | 12 | `sectorsim:tick`×1, `sectorsim:fieldAdvanced`×1, `economy:applyTradePressure`×1 |
| `missions` | `systems/missions.js` | 1949 | 38 | 18 | `mission:updated`×15, `faction:repDelta`×5, `nav:waypoint`×3 |
| `story` | `systems/story.js` | 653 | 16 | 11 | `graffiti:show`×4, `hud:phase`×3, `faction:repDelta`×2 |
| `scenarioRuntime` | `systems/scenarioRuntime.js` | 731 | 7 | 3 | `scenario:loaded`×1, `scenario:factsInitialized`×1, `scenario:actorBindings`×1 |
| `heat` | `systems/heat.js` | 292 | 1 | 4 | `heat:changed`×1 |
| `traffic` | `systems/traffic.js` | 384 | 1 | 2 | `aiTrader:requestTrade`×1 |
| `drill` | `systems/drill.js` | 388 | 11 | 0 | `drill:warn`×5, `drill:start`×1, `drill:end`×1 |
| `claims` | `systems/claims.js` | 235 | 7 | 0 | `economy:chargeCredits`×2, `audio:cue`×2, `claim:claimed`×1 |
| `onboarding` | `systems/onboarding.js` | 897 | 3 | 27 | `tutorial:say`×1, `tutorial:finished`×1, `loot:drop`×1 |

## Render-phase order (every animation frame)

`render.prepareFrame` → `render.drawPreparedFrame` (or `render.renderFrame`) → `vfx.update` → `feel.frame` → `ui.frame`

See `src/core/registry.js` `renderUpdate()` and root `AGENTS.md` §8 for rationale.
