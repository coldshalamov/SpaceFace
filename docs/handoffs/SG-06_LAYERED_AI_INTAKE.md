# SG-06 layered tactical AI intake

Snapshot date: 2026-06-21.

## Artifact inspected

- Final archive: `C:\Users\93rob\Downloads\SpaceFace-SG-06.zip`
- Archive SHA-256: `F10CC6B0FF01339EA90522D0C969DFE049DAF8788203580D3851B56220A358D5`
- Prior rejected branch: `origin/sg-06-layered-tactical-ai` at `c543cfbab576f85f7c4bc5145367ed764bd713a0`

## Current verdict

Accepted at port level.

The final archive provides the missing five-layer stack, canonical SG-03 action adapter, fail-closed tactical system wrapper, explainability trace, inspection endpoint, clean-room ledger, handoff document, checked acceptance evidence, and the deterministic 100-seed SG-06 acceptance harness.

This is not a live replacement for `src/systems/ai.js` yet. SG-02 dynamic-body authority is still absent on master, so physical formation convergence, real Massline break telemetry, and production maneuver parity remain gated. `src/systems/tacticalAI.js` must stay unregistered until `helpers.aiManeuver`, `helpers.aiSensors`, and `helpers.aiRoster` are production ports over SG-02/SG-03 systems.

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
- `src/systems/tacticalAI.js`
- `scripts/check-sg06-ai.mjs`
- `docs/Spec/SG-06_ACCEPTANCE.json`
- `docs/handoffs/SG-06_AI_HANDOFF.md`
- `third_party/reference-ledger-sg06.yml`

`check:sg06` now runs the intake guard and the 100-seed AI acceptance suite. `check:ai` is an alias for the SG-06 suite.

## Still blocked

- Replacing the legacy live FSM in `src/systems/ai.js`.
- Registering `src/systems/tacticalAI.js` in `src/core/registry.js`.
- Deleting legacy `entity.data.intent.fire`, `fireGroup`, lead-angle, and direct NPC flight paths.
- Claiming physical formation convergence.
- Claiming real tether overload/break telemetry.
- Claiming SG-02/SG-06 shared physics authority in production.

These are blocked until SG-02 installs dynamic Rapier body authority and the production `helpers.aiManeuver`/sensor/roster ports described in `docs/handoffs/SG-06_AI_HANDOFF.md`.

## Evidence

- `npm run check:sg06:intake`
- `npm run check:sg06:ai`
- `npm run check:sg06`

The checked evidence record is `docs/Spec/SG-06_ACCEPTANCE.json`. It records 100 seeds x 600 ticks, seven tactics, both canonical counter-tether actions (`action_cut`, `action_dash`), no privileged action path, bounded stationarity, pressure within the authored envelope, and the explicit `blocked_on_sg02_dynamic_body_integration` physical-convergence status.
