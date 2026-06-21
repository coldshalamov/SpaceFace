# Foundation Handoff Intake Ledger

Snapshot date: 2026-06-21.

This ledger records external SG handoff intake status for the active 47-A vertical slice. It is an integration aid, not a substitute for `docs/Spec/MASTER_MAKEOVER_PLAN.md`. A handoff is not accepted because a branch, zip, or report exists; it is accepted only when its stated acceptance evidence passes in this repository and the resulting surface improves a named slice metric.

## Current Intake Status

| Job | Artifact inspected | Status | Integration boundary |
| --- | --- | --- | --- |
| SG-04 authored asset pipeline | Current master GLTFLoader/asset pipeline + Kestrel reference asset | Partial validation accepted | The Kestrel hero GLB and manifest are validated by both the legacy art checks and the agent-facing `sf validate asset` JSON contract. KTX2/Draco/Meshopt release gating, wider prefab validation, and release-mode procedural-fallback failure remain pending. |
| SG-08 presentation orchestration | `origin/commission/sg-08-presentation-orchestration` | Landed as received | The received GitHub branch contributed the presentation cue schema/validator surface now on master. Full SG-08 runtime orchestration remains gated by later semantic event mapping, budget enforcement, and golden cue/mix traces. |
| SG-05 scenario/mission/dialogue DSL | Current master 47-A scenario contract + runtime bridge | Schema skeleton accepted with headless boot evidence | `src/data/scenarios/47a.scenario.json` now declares the canonical 47-A actors, world facts, presentation event ids, proof metrics, eight beat windows, and four outcome branches. `npm run check:sg05` validates required beats/branches, reference integrity, critical SG-08 cue reservation, immediate world-fact consequences for every branch, and the `sf-sim 47a` runtime bridge. The bridge loads the validated contract, emits deterministic `scenario:*` trace events, snapshots/saves/reloads scenario state, binds the player actor, and reports unresolved slice actors instead of inventing them. Full DSL runtime, localization, branch policy runner, content hot reload, live actor migration, and complete branch implementation remain pending. |
| SG-03 combat/action/subsystem framework | `SpaceFace-SG-03-handoff.zip` plus current master integration | Landed | Shared ActionDef runtime, combat grammar, damage routing, subsystem/status/attachment semantics, deterministic combat trace, and v5 semantic combat save/reload are integrated. Live movement/constraint effects route through SG-02's `helpers.combatPhysics` port. Live projectile/beam hits now carry canonical `DamagePacket` snapshots while scalar hit fields remain compatibility-only; `npm run check:combat` includes the save/reload fixture, and `node scripts/check-gameplay-core.mjs` proves packet forwarding/routing. |
| SG-02 dynamic Rapier authority | `origin/sg-02-rapier-dynamic-authority`; recovered zip `6D3FE3C...E474AF` | Opt-in authority accepted | The recovered package is integrated as the explicit `rapier-dynamic` backend: command/telemetry membrane, dynamic body owner, Massline tether constraints, SG-03 `helpers.combatPhysics`, save schema v4/v5 reload support, Massline break telemetry gate, SG-01 folded quantized body snapshots, dynamic pickup contact parity, live projectile contact parity, docking/gate range parity, and acceptance tests are gated by `npm run check:sg02` plus `npm run check:combat`. `npm run check:sg02` now includes the 47-A dynamic replay gate, proving uninterrupted-vs-reload hash parity with folded SG-02 body snapshots. Default slice activation still waits on promoting `rapier-dynamic` into the default backend path and deleting the superseded predecessor in the same milestone. |
| SG-06 layered tactical AI | `SpaceFace-SG-06.zip` (`F10CC6B0...20A358D5`) | Production opt-in landed; default replacement gated | The five-layer director/squad/perception/utility/maneuver stack, SG-03 action adapter, inspection endpoint, trace ring, handoff doc, clean-room ledger, 100-seed acceptance harness, production-shaped `helpers.aiSensors`/`helpers.aiRoster`/`helpers.aiManeuver`/`helpers.aiEncounter` ports, the encounter-sink gate, the active encounter-owner gate, production-spawn tactical capability metadata, the live-shadow SG-03 ActionDef gate, the lazy registry-init gate, the production `sg06-tactical` registry gate, the opted-in tactical Massline overload gate, the save/load transient reset gate, and the standalone Rapier formation-convergence gate are integrated and gated by `npm run check:sg06` plus `node scripts/check-gameplay-core.mjs`. Default replacement of the legacy FSM remains blocked until default-backend activation of the Massline overload proof and same-milestone deletion of superseded intent paths land. Do not wire AI-only damage, motion, or hidden-state paths. |

## Accepted Evidence On Master

- SG-08 schema gate: `npm run check:presentation`.
- SG-05 scenario skeleton + runtime bridge gate: `npm run check:sg05`.
- SG-03 grammar + semantic combat save/reload gate: `npm run check:combat`; live weapon packet bridge: `node scripts/check-gameplay-core.mjs`.
- SG-04 asset CLI gate: `node scripts/sf.mjs validate asset assets/ships/kestrel/kestrel_reference.glb`.
- SG-02 partial intake + command membrane gate: `npm run check:sg02`.
- SG-06 production-port + port-level AI gate: `npm run check:sg06`.
- 47-A replay gate: `npm run check:sim`.
- Save/reload parity gate: `npm run check:sim:compare`.
- Long replay gate: `npm run check:sim:long`.
- Agent-facing trace gate: `node scripts/sf-sim.mjs trace 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --events scenario.*,combat.*,story.* --limit 50`.
- Full local evidence bundle: `npm run check`.

## Standing Rules For New Handoffs

- Read the handoff package first: interface spec, ownership table, schema/version changes, migration plan, tests, benchmark, inspection endpoint, limitations, reference ledger, fixture, and deletion list.
- Run the handoff acceptance test before integration. If it fails, record the exact failing contract instead of papering over it.
- Integrate on master only after the acceptance surface is clear. Migrate the 47-A actors that use the new contract and delete superseded paths in the same milestone.
- No temporary physics, mission, UI, or asset formats while waiting for the real SG owner. Missing SG-02 runtime authority stays pending, not half-implemented.
- Every accepted handoff must leave an agent-facing evidence surface: replay hash, event trace, combat trace, scenario trace, cue trace, profile, or validation report.
