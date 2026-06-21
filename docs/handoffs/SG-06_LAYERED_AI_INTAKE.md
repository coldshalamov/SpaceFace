# SG-06 layered tactical AI intake

Snapshot date: 2026-06-21.

## Artifact inspected

- Final archive: `C:\Users\93rob\Downloads\SpaceFace-SG-06.zip`
- Archive SHA-256: `F10CC6B0FF01339EA90522D0C969DFE049DAF8788203580D3851B56220A358D5`
- Prior rejected branch: `origin/sg-06-layered-tactical-ai` at `c543cfbab576f85f7c4bc5145367ed764bd713a0`

## Current verdict

Accepted at port level.

The final archive provides the missing five-layer stack, canonical SG-03 action adapter, fail-closed tactical system wrapper, explainability trace, inspection endpoint, clean-room ledger, handoff document, checked acceptance evidence, and the deterministic 100-seed SG-06 acceptance harness.

SG-06 is now the default tactical AI when paired with SG-02 dynamic-body authority. `src/systems/aiPorts.js` installs production-shaped `helpers.aiSensors`, `helpers.aiRoster`, `helpers.aiManeuver`, and `helpers.aiEncounter` ports. `src/systems/tacticalAI.js` lazy-binds its ports, and `src/core/registry.js` selects it in the production AI slot when `settings.gameplay.aiBackend === 'sg06-tactical'` and `settings.gameplay.physicsBackend === 'rapier-dynamic'`. Legacy AI remains available only as an explicit compatibility backend until the deletion pass proves every non-slice caller has migrated.

## Accepted now

- `src/ai/contracts.js`
- `src/ai/director.js`
- `src/ai/inspection.js`
- `src/ai/maneuver.js`
- `src/ai/perception.js`
- `src/ai/shipDecision.js`
- `src/ai/sg03ActionPort.js`
- `src/ai/squad.js`
- `src/ai/stack.js`
- `src/ai/trace.js`
- `src/ai/index.js`
- `src/systems/aiPorts.js`
- `src/systems/aiEncounter.js`
- `src/systems/tacticalAI.js`
- `scripts/check-sg06-production-ports.mjs`
- `scripts/check-sg06-encounter-owner.mjs`
- `scripts/check-sg06-registry-init.mjs`
- `scripts/check-sg06-live-registry.mjs`
- `scripts/check-sg06-ai.mjs`
- `docs/Spec/SG-06_ACCEPTANCE.json`
- `docs/handoffs/SG-06_AI_HANDOFF.md`
- `third_party/reference-ledger-sg06.yml`
- `scripts/check-sg06-live-tether-break.mjs`

`check:sg06` now runs the intake guard, the production-port contract gate, the encounter-sink gate, the active encounter-owner gate, the live-shadow ActionDef gate, the lazy registry-init gate, the live production-registry gate, the live tether-break gate, the Rapier formation-convergence gate, and the 100-seed AI acceptance suite. `check:ai` remains an alias for the SG-06 seeded suite.

## Still blocked

- Deleting legacy `entity.data.intent.fire`, `fireGroup`, lead-angle, and direct NPC flight paths.
- Replacing live scenario actors with fully authored SG-05 actor packs.
- Deleting the explicit legacy-AI compatibility backend after non-slice callers migrate.

These are blocked until the tactical stack owns fully authored SG-05 actor packs and the remaining compatibility backend can be removed without losing non-slice coverage.

## Evidence

- `npm run check:sg06:intake`
- `npm run check:sg06:production-ports`
- `npm run check:sg06:encounter-sink`
- `npm run check:sg06:encounter-owner`
- `npm run check:sg06:live-shadow`
- `npm run check:sg06:registry-init`
- `npm run check:sg06:live-registry`
- `npm run check:sg06:tether-break`
- `npm run check:sg06:formation`
- `npm run check:sg06:ai`
- `npm run check:sg06`
- `npm run check:sg02:tether-break`

The checked evidence record is `docs/Spec/SG-06_ACCEPTANCE.json`. It records 100 seeds x 600 ticks, seven tactics, both canonical counter-tether actions (`action_cut`, `action_dash`), no privileged action path, bounded stationarity, pressure within the authored envelope, `covered_by_check_sg06_formation` physical-convergence status, `default_sg06_dash_armed_overload_proved` Massline threshold-break status, `covered_by_check_sg06_encounter_owner` active encounter-owner status, `covered_by_check_gameplay_core` save/load transient reset status, `covered_by_check_sg06_production_ports` runtime capability-gating status, and `covered_by_check_sg06_production_ports_and_encounter_owner` production-spawn tactical-capability status. The SG-06 live-registry gate proves the default production AI slot can drive SG-03 actions and SG-02 maneuvers without legacy intent. The SG-06 production-port gate proves authored tactical tags cannot re-add SG-03-disabled weapon/sensor-derived tactics and normal enemy spawns carry sorted tactical capabilities. The SG-06 encounter-owner gate proves whitelisted director commands are recorded by `aiPorts`, consumed by `src/systems/aiEncounter.js`, and can spawn owned reinforcements without mutating story, missions, or `state.combat.pendingReinforcements` while preserving tactical capabilities. The save/core gate proves `aiEncounter` is not serialized and destructive load clears live encounter recorder/owner state. The SG-06 live tether-break gate proves SG-06 first commits canonical `action_dash` in the default production registry, then a fixture loads the Massline through SG-03/SG-02 so threshold tension/impulse telemetry breaks the rope and releases the physical constraint.
