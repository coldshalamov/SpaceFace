# SG-06 layered tactical AI intake

Snapshot date: 2026-06-21.

## Artifact inspected

- Remote branch: `origin/sg-06-layered-tactical-ai`
- Latest inspected SHA: `c543cfbab576f85f7c4bc5145367ed764bd713a0`
- Merge base against current `master`: `5a5fc943488341242e01c8ad5e996aa1c1928cf1`

## Current verdict

Not accepted.

The refreshed branch is a partial artifact, not a production SG-06 handoff. Its merge-base diff adds only:

- `src/ai/index.js`
- `src/ai/inspection.js`
- `src/ai/trace.js`
- `src/systems/tacticalAI.js`

`src/ai/index.js` re-exports `contracts`, `director`, `maneuver`, `perception`, `shipDecision`, `sg03ActionPort`, `squad`, and `stack`, but those modules are absent from the branch. The inspection and trace files import `contracts.js`, which is also absent. The branch has no handoff document, reference ledger, seeded acceptance fixture, package script, or live integration proof.

## Accepted now

Nothing from SG-06 is accepted on `master` yet.

The existing live AI remains the pre-SG-06 deterministic single-ship FSM in `src/systems/ai.js`. It is not the layered director/squad/perception/utility/maneuver stack described by the master plan, and it should not be relabeled as SG-06.

## Not accepted yet

- Director pressure/escalation/respite/reinforcement/retreat layer.
- Squad commander roles, formations, focus target, and objective handoff.
- Sensor/perception memory with no hidden player-state reads.
- Utility or behavior selector that submits SG-03 `ActionDef` requests with `source.kind='ai'`.
- Maneuver planner that emits physical thruster/body intent instead of legacy fire/motion shortcuts.
- Circular explainability trace and inspection endpoint backed by the full stack.
- 100-seed acceptance harness proving tactics, counter-tether behavior, stationarity, oscillation, formation bounds, and director pressure envelope.
- SG-02 physical parity for tether/counter-tether actions.

## Required before integration

A real SG-06 package must provide all of the following in this repository:

- `docs/handoffs/SG-06_LAYERED_AI_HANDOFF.md`
- `third_party/reference-ledger-sg06.yml`
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
- `scripts/check-sg06-layered-ai.mjs`
- `scripts/check-sg06-action-port.mjs`
- `scripts/check-sg06-seed-suite.mjs`
- At least one `test/sg06` fixture.

`check:sg06` must run the intake guard and the production SG-06 acceptance suites. Production SG-06 code must not call damage routing directly, mutate HP directly, use legacy `intent.fire` shortcuts, or read hidden player state. Live AI actions must enter the same SG-03 ActionDef request path as the player.

## Next useful action

Ask the SG-06 producer for a complete artifact or a corrected PR. Do not create a privileged compatibility path and do not wire the current partial branch into live gameplay.
