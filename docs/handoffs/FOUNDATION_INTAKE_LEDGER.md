# Foundation Handoff Intake Ledger

Snapshot date: 2026-06-21.

This ledger records external SG handoff intake status for the active 47-A vertical slice. It is an integration aid, not a substitute for `docs/Spec/MASTER_MAKEOVER_PLAN.md`. A handoff is not accepted because a branch, zip, or report exists; it is accepted only when its stated acceptance evidence passes in this repository and the resulting surface improves a named slice metric.

## Current Intake Status

| Job | Artifact inspected | Status | Integration boundary |
| --- | --- | --- | --- |
| SG-08 presentation orchestration | `origin/commission/sg-08-presentation-orchestration` | Landed as received | The received GitHub branch contributed the presentation cue schema/validator surface now on master. Full SG-08 runtime orchestration remains gated by later semantic event mapping, budget enforcement, and golden cue/mix traces. |
| SG-03 combat/action/subsystem framework | `SpaceFace-SG-03-handoff.zip` plus current master integration | Landed | Shared ActionDef runtime, combat grammar, damage routing, subsystem/status/attachment semantics, and deterministic combat trace are integrated. Live movement/constraint effects intentionally reject until SG-02 installs the `helpers.combatPhysics` port. |
| SG-02 dynamic Rapier authority | `origin/sg-02-rapier-dynamic-authority` | Pending usable artifact | The inspected branch contained only incomplete bootstrap payload shards. Current master still lacks authoritative dynamic bodies/tether constraints. Do not build a compatibility physics authority around kinematic observers. |
| SG-06 layered tactical AI | `origin/sg-06-layered-tactical-ai` and external completion report | Pending usable artifact | The inspected branch pointed at master and did not contain the reported local implementation. Do not wire AI-only damage, motion, or hidden-state paths. SG-06 may integrate after a real artifact is available and, for physical parity, after SG-02 lands. |

## Accepted Evidence On Master

- SG-08 schema gate: `npm run check:presentation`.
- SG-03 grammar gate: `npm run check:combat`.
- 47-A replay gate: `npm run check:sim`.
- Save/reload parity gate: `npm run check:sim:compare`.
- Long replay gate: `npm run check:sim:long`.
- Agent-facing trace gate: `node scripts/sf-sim.mjs trace 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --events combat.*,story.* --limit 50`.
- Full local evidence bundle: `npm run check`.

## Standing Rules For New Handoffs

- Read the handoff package first: interface spec, ownership table, schema/version changes, migration plan, tests, benchmark, inspection endpoint, limitations, reference ledger, fixture, and deletion list.
- Run the handoff acceptance test before integration. If it fails, record the exact failing contract instead of papering over it.
- Integrate on master only after the acceptance surface is clear. Migrate the 47-A actors that use the new contract and delete superseded paths in the same milestone.
- No temporary physics, mission, UI, or asset formats while waiting for the real SG owner. Missing SG-02/SG-06 artifacts stay pending, not half-implemented.
- Every accepted handoff must leave an agent-facing evidence surface: replay hash, event trace, combat trace, scenario trace, cue trace, profile, or validation report.
