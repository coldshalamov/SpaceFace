# Resolved specification — truthful Market and Shipworks decisions

Companions: [SF-241 — A trade confirmation that cannot lie about quantity](../plans/17-interface/SF-241-a-trade-confirmation-that-cannot-lie-about-quantity.md) and [SF-242 — Shipworks explains a real capability tradeoff](../plans/17-interface/SF-242-shipworks-explains-a-real-capability-tradeoff.md).

## Current owners and design authority

Read [the current Market](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/station/screens/market.js#L50-L85), [trade helpers](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/market/tradeLogic.js), [Shipworks](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/station/screens/shipworks.js), [ships](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/ships.js) and [ORRERY](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/frontend/ORRERY.md). The older `src/ui/screens/market.js` route is not the verified live file in this snapshot. Existing `maxAffordableQuantity` and `expectedTotalForTerms` are real Market helpers; reuse their current law rather than creating another price model.

## Selected interaction contract

The screen projects current authoritative state, proposes a choice and submits an intent. It never writes credits, cargo or derived fit statistics directly. A preview remains a preview. Confirmation is a proposal under specified terms, not a promise that stale terms are still executable. A committed receipt is the truth of what happened.

| UI phase | What the player sees | What can mutate |
|---|---|---|
| Browse | Current item, availability and relevant capability/cost | Selection only |
| Preview | Candidate quantity or legal fit and explicit tradeoff | Local preview state only |
| Pending | The submitted choice and bounded pending feedback | Canonical owner processes the request |
| Refused | Actual reason and a useful next action | No transaction effects beyond the owner's valid refusal semantics |
| Committed | Receipt-backed quantity/cost or actual fitted capability | Only changes already committed by canonical owners |
| Return | Updated list, valid focus and retained context | No replay of the confirming input |

Reuse current request/receipt IDs and lifecycle. Do not add a second transaction coordinator in the UI.

## Market details

Compute buy affordability using the same executable quote shape, stock clamp and quantity as the actual command. On confirmation, revalidate terms through the existing economy path. If the proposed quantity is no longer executable, refuse or require an explicit new choice under current policy; do not silently buy a smaller amount. Guard repeated input while the request is unresolved and do not leave a button permanently pending after a canonical refusal.

Distinguish personal hold from operation shipment and physical pod. Identical commodity IDs do not imply identical owner or sell eligibility. A resource change underneath the open screen invalidates the relevant preview, not the entire interface.

## Shipworks details

Use the current candidate-fit projection and derived capability laws to explain one gained use and one cost. Purchase, inventory ownership and fit are distinct operations where current policy separates them. A refused fit must restore the prior preview/selection without unequipping the real ship. Informational synergy/build identity must not secretly grant stats.

Keep the explanation attached to the selected component through existing ORRERY elements. No generic replacement card grid, new design system or unrelated cosmetic cleanup is authorized by these packets.

## Input and accessibility

Pending/refused/committed states must be available without hover. Preserve keyboard/controller focus, semantic remapped prompts and a valid return target after the item disappears. A closing confirm key must not become a second purchase or a flight action. Reduced motion changes flourish, not the information that an action is pending or has failed.

## Tests and route

Change stock, funds and fit compatibility after preview; rapidly confirm twice; cancel pending through supported behavior; remove the selected item; reopen the screen repeatedly; use long content at a small viewport; rebind the action. Reconcile the displayed result with actual credits/cargo/fit, and check subscriptions/focus cleanup. Walk every changed control on the real screen using current ui-bench IDs discovered from its manifest. A mock alone does not prove the final interface.
