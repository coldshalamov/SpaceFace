# G18-02b — REDO: holding Q must open the context wheel in a real game

**Lane 2.** Follow-up to G18-02 (commit b931aac8). **Lead review 2026-11-11: the wheel never opens.**

## What the lead saw
In a live Swarm round (`?swarmRound=3`, round launched, canvas clicked, `Q` held for 1.1 s) the overlay
`#sf-context-wheel` exists in the DOM but stays hidden at 0×0, `state.ui.contextWheelOpen` is never set,
and `state.input.actions.contextWheel` is not true while Q is held. The unit tests pass; the real route
does not. The wheel's `tick()` (`src/ui/contextWheel.js:311`, called from `src/ui/comms.js:777`) opens it
when `state.input.actions.contextWheel === true`; `src/systems/input.js:2133` is meant to set that from the
`contextWheel: ['KeyQ']` binding (line 277). Somewhere between the key and that flag the hold is lost —
find where (candidates: the binding table actually used at runtime vs the one edited; a saved/default
profile that lacks the new action; the input running in the worker lane while the wheel reads the main
copy; `shouldNeutralizeFlightInput` / a modal flag being true in the fight; the action being consumed as
an edge instead of a hold). Fix the cause, not the symptom.

## Done when
`node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/context-wheel.mjs` prints a `wheel`
line with `"visible":true` and a non-zero size, and `.devshots/fleet/looks/context-wheel-held.png` shows
the wheel. Also: releasing Q over a slice fires that slice (add a step to the look script that releases
over the first slice and prints the action that fired). Add a test at the layer where the bug was, using
the real path (PROTOCOL rule 8).

Commit: `fleet(G18-02b): holding Q opens the context wheel in a real game`.
