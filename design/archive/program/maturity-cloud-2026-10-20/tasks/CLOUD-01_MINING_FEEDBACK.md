<!-- LIFETIME: DURABLE -->
# CLOUD-01 · Cut is not collected

**Existing parent:** 466; first-hour integration 454. **Disposition:** proposed bounded slice; reverify current code and claims before dispatch.
**Contract:** [cloud workflow](../07_CLOUD_EXECUTION.md). **Evidence:** [source ledger](../09_EVIDENCE.md).

## Player result and evidence

The mining HUD already mirrors beam heat, seam and rich-core events. The source separates cutting
from physical pickups. Show a compact, truthful answer to “what did I get, and why did it stop?”
without adding another overlay. This is not the D227 mineability fix: open PR464 already owns it.

**Verified entry points / owner trace:** `src/ui/miningHud.js; read-only src/systems/mining.js and src/systems/cargo.js`.
Some consumer coverage remains a hypothesis until traced. If this exact result is already present,
return the source/route evidence; do not duplicate it or count an audit as implementation.

## Write boundary and refusals

Extend the existing mining HUD plus, only if necessary, one small pure read-model module.
Add one focused test file under test/. Mining, cargo, pickup, source depletion, damage and reward
owners are read-only. No new mining events unless an actual missing observation requires a narrow
reviewed owner change; do not invent a duplicate extraction or cargo receipt.

## Implementation sequence

1. Trace the real player extraction and pickup/acceptance receipts. Record which quantity means
   released ore, which means cargo accepted, and how full/partial capacity is represented.
2. Project one compact status: “ore released”, “ore collected”, or “hold full; loose ore remains”
   only when the corresponding fact is known. Keep expected yield separate from collected units.
3. Reuse the existing HUD's anchor, priority and lifecycle. Combine a burst of same-source receipts
   into one bounded display update; retain no growing session history and do not speak every tick.
4. Clear transient feedback on stop/target retirement/sector exit/New Game as appropriate. Continue
   reconstructs current capacity; it must not replay the last collection as new income.
5. Preserve the current vent/rich-core rhythm, reduced-motion behavior and NPC/player filtering.

## Regression and interruption cases

Empty and nearly full hold; partial pickup; extraction with zero collection; missed pickup;
NPC extraction; duplicate receipt; unknown commodity; source retirement; stop then rich-core
resolution in the same tick; pause; Continue and New Game. Assert zero cargo/credit mutations from
the presenter and no listener growth after repeated mount/destroy.

## Done when

A normal mining action shows actual accepted quantity separately from loose output. A full hold
produces an actionable reason without claiming ore vanished or was collected. Existing heat/core
presentation remains functional. Prove receipt truth headlessly, then inspect the existing mining
HUD at ordinary gameplay scale when the permitted host is available.

Finish with exact base/head, changed paths, actual commands/results, ordinary entry and remaining
acceptance. One focused test suite is not whole-game acceptance. Keep the broader parent open.

## Copy-ready agent prompt

> Implement CLOUD-01 as a narrow extension of miningHud. Trace real extraction versus pickup
> acceptance first; expose collected/released/full-hold facts without mutating gameplay or duplicating
> PR464. Preserve rich-core ordering and lifecycle. Deliver the runtime change, focused adversarial
> tests and a draft PR; report rendered acceptance separately.
