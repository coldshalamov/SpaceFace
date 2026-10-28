# Acceptance and falsification plan

## Status

All gameplay tests below are required future checks. They were not executed in this design-only task. The package validator only tests the delivered documents, references, generated image files, GLB structure and task graph. Passing that validator proves package completeness, not game correctness.

## Shared gates

**G0 — baseline and de-duplication.** Pin the implementation commit, inspect active work and all relevant current owners. Capture the existing normal-route state, input semantics, key UI screens and performance on a declared device. Search concept names and behavioral analogues; extend an existing matching mechanic instead of forking it.

**G1 — an honest encounter.** The content appears through normal play and has at least two meaningful choices where promised. It is distinguishable from its nearest existing analogue. It does not require a debug flag, hidden key, unavailable upgrade or a console command. Show a complete first encounter and a repeat visit.

**G2 — deterministic state.** Replay the same fixed-tick inputs under 30/60/144 Hz rendering, with assets loading in different orders. Compare authoritative outcomes, phase ticks, receipts and RNG state. Bitwise cross-platform physics determinism is not assumed; test the repository's supported equivalence contract on the target platform. Cosmetic changes must not consume gameplay RNG or alter an attack.

**G3 — lifecycle and persistence.** Save/reload at every state boundary, including the tick of a transfer or detach. Test New Game, sector leave/return, character death, player death, aborted run and missing asset. Exactly one physical item and one owner survive each legal transition. Every subscription, mesh, texture ownership claim and physics body is released according to its owner.

**G4 — physical truth.** Overlay colliders, sockets and threat shapes. Sweep representative hulls through every opening. Confirm a released body inherits point velocity and removes the former parent collider. A cancelled or missed attack cannot still produce damage because a visual timer finished. No safety advice can claim a passage is clear when it is not.

**G5 — resource conservation.** Double-submit each transaction, replay receipts, change stock/price while a quote is open and destroy actors during transfer. Validate exactly-once outcomes. Check that run-only content causes no unintended campaign credit, inventory or kill change. Test destroy/rebuild and repeated enter/exit for farming exploits.

**G6 — accessibility and perception.** Test muted audio, grayscale, reduced motion/flash, keyboard-only, controller-only, 1280×720 and 1920×1080. Critical facts remain available without color, hover or a transient voice line. Content-specific UI stays within ORRERY and preserves focus when an item disappears.

**G7 — performance and default route.** Record p50/p95/p99 CPU/GPU frame time where available, simulation cost, active bodies, draw calls, triangles and memory. Compare matched seed/location/device scenarios, not a quiet baseline against a busy scene. Include cold arrival, warm arrival, repeated load/unload and a maximum designed local encounter. Do not call a frame smoother because its progress indicator lies.

## Formative player protocol

Use five independent testers for early fault-finding, not population estimates. Give a neutral task and record what they do before offering hints. Ask what they think will happen before an action, and why afterward. Track misunderstanding, hesitation, unintended input and voluntary retries. Four-of-five targets in dossiers are provisional go/no-go heuristics, not statistical proof or predicted retention gains.

For run UI, measure selection/cost/tradeoff comprehension and reversing a choice. For enemies, measure recognition of windup and at least two independent counters. For places, measure route/clearance prediction. For narrative, distinguish observed facts from hypotheses and ask whether players remember a physical consequence rather than only text.

Reject features that require explaining away repeated unfairness. Slow or lengthen anticipation when necessary; do not silently add aim correction or remove the underlying physics. Re-test after each meaningful change.

## Evidence to attach to every finished implementation

One ordinary-route entry capture; one complete interaction recording; top/chase/close asset views; telegraph/action/recovery stills where applicable; save/load and transaction test output; frame-time comparison with hardware and settings; controller/keyboard walk; list of changed paths; remaining limitations with explicit severity. A passing unit test without a reachable player outcome is not completion.

The final per-concept page adds five specific cases that must accompany these shared gates.
