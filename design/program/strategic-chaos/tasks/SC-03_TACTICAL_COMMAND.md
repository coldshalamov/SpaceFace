# SC-03 — Tactical Command

**Implementation commission, not a shipped-feature claim.**

## Player outcome

The pilot controls a small useful wing while still flying: holding a position, screening a specific asset, concentrating attack, and regrouping are distinct tactical decisions.

**Decision:** Protect the cargo, deny a passage, commit the wing to a vulnerable target, or preserve it for an escape.

## Existing ownership and dependencies

Existing parents: build_map.md §1.8, existing wingmen / automation command seam.

Capability dependencies: existing live owners; no other SC packet required to start.

Known overlap to recheck: #605. PR status is not frozen by this document.

**Write boundary:** Existing wing-order data, radial intent and recipient behavior. Do not rewrite automation, input binding or AI authority; take exact hunks only.

Start at: `src/data/wingOrders.js`, `src/ui/wingmanRadial.js`, `src/systems/wingmen.js`, `src/systems/automation.js`.

## Implementation sequence

1. Trace Z radial → ui:wingOrder → order acceptance → real wing entities. Keep ALL versus selected recipient explicit and preserve existing attack/screen/hold/regroup semantics.
2. Complete asset-targeted screening and position holding using the existing activity/AI ports. Surface command accepted, executing, blocked and completed without inventing another serialized fleet ledger.
3. Make target loss, allied capture, low survivability and player withdrawal lead to documented fallbacks. Prevent a screen order from becoming unlimited pursuit.
4. Test ergonomics across keyboard/gamepad/touch through existing bindings. Do not add slowdown until the existing command action is already useful; any optional focus uses the sole time-effects owner.

## Bounded follow-on work

Each item is a complete player-visible or truth-preserving change, not a ticket to increase line count.

1. Add a truthful order acknowledgment and one actionable blocked reason.
2. Cover an invalid or captured attack target with regroup/fallback behavior.
3. Measure a guard’s leash and intercept on the real movement port.

## Adversarial cases

- Duplicate/out-of-order commands, a dead selected wingman, an ally that leaves the sector.
- Continue restores a hold only in its valid sector and never resurrects transient attack references.
- An allied unit must not open fire on a neutral target merely because an order UI accepted a click.

## Acceptance and evidence

The same encounter supports screening a hauler, holding a choke and a focused attack with measurably different positions, protected damage and exposure. Orders are acknowledged, cancellable and durable only where intended.

Focused real-owner command/lifecycle tests, then a two-strategy input tape in an existing lab fixture. Compare matching seed, source tree, kit and starting state using the strategy-trial format. Finish with Adventure route checks.

**Do not:** No RTS base-building, global army selection interface, extra order ledger or invisible teleport-to-formation.

## Workflow and delivery

Use the existing build map, exact live claims and nearest AGENTS instructions. Inspect the current owner and open PR overlap before changing files. A dependency is a required capability, not permission to wait indefinitely: verify whether it already exists, coordinate an exact shared hunk, and complete disjoint useful work. Do not silently absorb another open PR.

State one falsifiable player-outcome hypothesis. Reproduce the gap at the cheapest truthful layer; implement through existing owners; run focused and adversarial checks; review the integrated outcome. Agent review continues without waiting for the owner to play. Evidence limitations remain explicit. No metrics-only claim that the game is fun.

Commit only the owned paths. Return one scoped draft PR, exact commit, reproduction, checks and unmeasured boundaries. A partial child slice does not close its broader parent. No deployment, automatic merge, paid-agent launch, new dependencies or save-schema migration without the relevant existing workflow.

Generate this packet as an assignment with `node scripts/strategic-chaos.mjs brief SC-03`. See [foundations](../FOUNDATIONS.md), [architecture](../ARCHITECTURE.md) and [agent workflow](../AGENT_WORKFLOW.md).
