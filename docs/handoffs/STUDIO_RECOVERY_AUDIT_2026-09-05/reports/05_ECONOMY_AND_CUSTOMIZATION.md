# 05 — Economy and customization that change how the player plays
## Replace timer management with comprehensible physical opportunity

The economy should not be judged solely by whether prices change or credits accumulate. It should make the player choose what to carry, where to take it, which risk to accept, what capability to build, and what operation to establish. A mathematically elaborate market can still feel hollow if those decisions are weak or if the displayed world is only a loose illustration of hidden counters.

The inspected code has a real base to retain: a canonical credits writer, finite integer bounds, role-sensitive station markets, price pressure, cycles, historical price records, and separate observed-price memory. The outfitting system likewise already has fit validation and engineering previews. This is not a proposal to replace missing foundations. It is a proposal to repair ownership and incentive policies, then expose the consequences that already matter. [ECON] [SHIPS] [OUTFIT]

## 5.1 What is structurally sound in the market

The price model uses a fixed reference stock for pricing while station roles alter equilibrium stock. That distinction allows producers and consumers to sustain different conditions instead of having every station's relative stock normalize its price back to the same value. Preserve that corrected structure. The inspected constants also include a spread, bounded price movement, periodic drift, and a separate cycle layer. [ECON]

Do not turn the game into a full physical accounting simulation merely because the market has abstract background supply. Background production is a valid abstraction. But make its role explicit. If stock drifts toward equilibrium regardless of visible deliveries, that drift acts as an implicit source or sink. A disruption to a supposedly important route may then have little practical significance unless the disruption also changes that background term.

Represent those terms as named causes: local production, local consumption, routine external supply, actual deliveries, loss, and temporary event pressure. The player need not see every accounting entry. They should be able to understand why a shortage exists and why their intervention matters.

The current drift constant is small per second but meaningful over a session. Under a simple exponential approximation using the inspected rate, the half-life is about nineteen minutes. That is analytical interpretation of a source constant, not a measured in-game price half-life; price also depends on roles, bounds, cycles, and events. Use a seeded intervention test to determine whether a missing delivery matters for the intended play interval. [ECON]

## 5.2 The passive cap is a product decision, not harmless balancing plumbing

Automation's passive-income token bucket and overflow discount apply to site export as well as other automated income. The mining design, meanwhile, describes a ladder in which farming, refining, and export create successively stronger income slopes. Those two policies can oppose each other. [AUTO] [SITES] [ROVERLAW]

The marginal effect of a haircut is easy to miss in a progress chart. In an illustrative bucket model with available allowance B and overflow factor ρ:

```text
credited(gross) = min(gross, B) + ρ * max(0, gross - B)
```

Once the allowance is consumed, the next machine earns only a fraction of its apparent output. The inspected automation description uses a quarter-rate overflow. The exact live distribution depends on update order and bucket refill, so the formula is an explanatory model rather than a complete replacement for that code. [AUTO]

A player may respond by concluding that the factory is bugged, that upgrades are pointless, or that they must keep performing manual tasks to justify the operation. None follows naturally from the visible fiction of a productive site.

I would replace this as the **primary** constraint on industrial growth. Let production hit visible bottlenecks: no exposed working face, insufficient power, full storage, a blocked lane, scarce processing input, limited launch capacity, a poor sale destination, or demand saturation. Stronger production then creates a new design problem rather than a hidden tax on competence.

Do not remove the cap in isolation. Recalculate representative operations, old saves, compound returns, and sinks first. Retain explicit economic brakes during migration until the replacement throughput and demand model is proven. A badly staged balance change could invalidate every ship price overnight.

## 5.3 Cargo custody must be unambiguous

The inspected programmed-miner path adds ore directly to the player's cargo. Its selling path removes the selected ore from that same hold, calculates gross, and routes the result through passive crediting. The visible call to `_orePrice(oreId)` does not pass the sale station, even though `_programSellCargo` receives one; the price helper's full definition was not reviewed here, so this is a call-path investigation target rather than proof that every station quote is ignored. [AUTO]

The deeper confirmed problem is shared custody. A worker selling “its” ore can also be selling units the player mined manually, because those units occupy the same inventory. That can route active earnings through a passive policy and makes it difficult to explain what the drone actually transported.

Give each operation an explicit inventory or shipment record. The player's hold, a site's local stores, a courier's manifest, and a station market are different custodians. Movement changes custody once, with a receipt. A rendered drone may project a virtual job, but that projection should not require its output to materialize inside an unrelated hold.

There is no need to simulate individual ore pebbles across the galaxy. A shipment record can represent a batch while preserving quantity, owner, origin, destination, departure, progress, risk state, and delivery status. Near the player, materialize the relevant carrier and cargo. Far away, advance the same job coherently. The NPC job runtime already demonstrates the live/virtual adapter pattern. [JOBS]

## 5.4 Transactions: validate once, commit once, explain once

A market purchase or shipment sale touches several authorities: credits, cargo, market stock, cost basis, mission progress, and presentation. The repository's single-writer rule is useful, but asynchronous or loosely ordered intents can still produce partial transactions unless there is a shared commit boundary. A credits owner and a cargo owner can each be locally correct while the combined operation loses value on a retry or save boundary. [AGENTS] [ECON]

Use a validated transaction plan with an identity, a quote version, quantities, total price, capacity effect, and intended state changes. Recheck the relevant preconditions at commit. Commit the economic state atomically within the simulation's chosen mutation phase, retain a durable receipt, and publish mission/UI effects afterward. A duplicate intent should retrieve the prior receipt, not repeat the payment.

```js
// Conceptual production flow, not existing SpaceFace API names.
const plan = validateTradeAgainstSnapshot(intent, economyView, cargoView);
if (!plan.ok) return rejectWithReason(plan.reason);

// Existing canonical owners participate in one indivisible transaction boundary.
const receipt = commitThroughCanonicalOwners(plan);
publishCommittedEffects(receipt);  // no effects from a rejected or partial trade
```

The complete standalone example, `transferPlan.mjs`, uses immutable snapshots to make those semantics inspectable. It validates integer arithmetic, money, stock, capacity, quote expiry, state version, and receipt identity before producing a new snapshot. Its tests include retries after a JSON save round trip, mismatched reuse of an ID, overflow, and atomic rejection.

It is intentionally not a production storage design. It uses one volume unit per item, trusted local quote inputs, a simple receipt map, and cloning rather than hot-path mutation. The production adapter must use actual commodity volume rules, existing canonical writers, the real save schema, and a durable outbox or equivalent post-commit mechanism. Do not import the example and let it directly write the real player's credits.

Receipt retention also needs a real policy. Silently evicting an old receipt can make a delayed retry execute twice. The reference rejects new transactions when its illustrative receipt capacity is reached; production should checkpoint transaction epochs with a defined retry horizon. That reference limit is not a proposed limit on the player's number of trades.

## 5.5 Routine shortages should stop work, not erase investment

The automation update path removes a programmed drone group when its fuel reaches zero. Upkeep is also an ongoing drain. Those are substantial experiential rules. They can turn leaving the ship to explore into a liability-management obligation. [AUTO]

The default industrial failure state should be legible inactivity: a drone waits, a refinery stalls, a buffer fills, or a courier cannot depart. The player can then decide whether the output is worth restoring. A fuel shortage can produce a rescue opportunity, but only when the carrier actually becomes stranded in a meaningful location. Routine depletion should not imply spontaneous destruction.

Operating costs can remain. Tie them to operating state and show them alongside gross and net throughput. A machine that is switched off should not behave as an unexplained negative-income asset unless the game has deliberately advertised a standing lease or other continuing cost. Separate chosen exposure to danger from an invisible maintenance tax.

For older saves, preserve purchased equipment and migrate its operating state explicitly. Never “balance” the new model by deleting accumulated machinery without a comprehensible conversion.

## 5.6 Market information should be useful without pretending to be a crystal ball

The current economy already distinguishes synthetic chart history generated from its cycle model from genuinely observed history, and it stores observed market memory with timestamps and source distinctions. Preserve that work. The UI should not erase the difference between a modeled past, an observed quote, and a remote survey snapshot. [ECON]

A forecast is conditional on information available to the player. A band should communicate uncertainty about arrival-time price, not expose unrevealed future random events because the simulation has a seed. A price can also move because the player brings enough supply to change it. Quote the **whole contemplated sale**, not just the first unit's price multiplied by quantity if the transaction model uses slippage.

The economy packet requires forecast readers to outperform nonreaders by at least thirty percent on a seeded hour. That is not a reliable measure of forecast quality: route policy, risk, starting capital, foreknowledge, and selected commodity can dominate. Replace it with calibration and decision tests. Does the stated band contain outcomes at its stated rate on held-out seeds? Can a player distinguish stale information from a fresh quote? Does the UI correctly compare net proceeds after travel and operating costs? [ECONPLAN]

The game does not need a professional trading terminal. It needs a compact explanation: what this place needs, why, how old the information is, and what the player's current load could accomplish. Supply-chain glyphs and a small chart can support that. They cannot repair incoherent custody or an arbitrary payout haircut underneath.

## 5.7 Customization: reveal behavioral possibilities early

The catalog already contains behavior-changing Massline heads, not only scalar upgrades. Tractor, elastic whip, frame coupler, monofilament sweep, transverse snare, and twin bridle form the beginnings of distinct tactical identities. The fitting owner enforces exclusivity, and the outfitting UI already has prospective budgets and engineering previews. Build on those assets. [MODULES] [SHIPS] [OUTFIT]

The inspected starter and several early hulls have Small utility slots while the inspected alternate heads are Medium. That can delay the game's most distinctive customization until the player has passed several economic and research gates. It does not mean the starter lacks basic Massline. The question is whether meaningful variation arrives before routine accumulation becomes the main activity. [SHIPDATA] [MODULES]

Prototype an early loaner, a reversible test-bay fit, or a deliberately limited Small head. Choose one route, not all three. Let the player experience a changed tactic before demanding a long explanation of its statistics. A successful first modification should create a sentence such as “now I can hold the object steady while turning” or “now I can store a stronger release,” not merely “my utility rating is higher.”

Each build should trade a useful capability against another useful capability. A hauler can gain capacity while paying in turn recovery or tow authority; a specialist can gain control range while giving up sustained weapon energy; a close fighter can gain response while losing cargo or endurance. Avoid options whose only downside is a tiny number that never becomes relevant in play.

Use the existing preview to show the trade in an actual maneuver. A before/after braking trace, a reachable tow envelope, or a predicted sustained-energy window is more useful than a decorative gauge. Make the preview distinguish simulated evidence, analytic estimate, and cosmetic presentation.

## 5.8 Progression and identity

The starter's player-facing name is Hitch while `ship_kestrel` remains the internal ID. Preserve that compatibility pattern for other renames. Changing visible language does not require breaking saves and asset references. [SHIPDATA]

Progression should move from direct manual work to better tools, then to operations that create new opportunities. Do not make automation merely a way to repeat the least interesting manual task more slowly. Its reward is freedom to tackle a new problem, not permission to watch the same counter advance unattended.

For identity, emphasize visible functional choices, authored hull character, colors, equipment, and the player's role in the world. The historical alignment record rejects a scar/recognition feature while current code contains living-hull imports. That needs provenance reconciliation before more work; it is not a reason to infer that all cosmetic history is now approved or to delete the current implementation without checking later decisions. [ALIGNMENT] [SHIPS]

The economy/customization milestone is a closed loop: a physical undertaking produces a comprehensible return; the return buys or enables a different capability; that capability changes the next undertaking. Finish that loop before increasing the number of goods, hull tiers, and research nodes.

<!-- Source links are pinned to the audited commit. -->
[AGENTS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/AGENTS.md
[ALIGNMENT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/VISION_ALIGNMENT_PLAN.md#L1-L180
[SHIPDATA]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/data/ships.js#L1-L160
[SHIPS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/ships.js#L1-L170
[MODULES]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/data/modules.js#L1-L165
[OUTFIT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/ui/screens/outfitting.js#L1-L180
[ECON]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/economy.js
[AUTO]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/automation.js
[ROVERLAW]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/ASTEROID_WORKS_DESIGN_LAW.md#L1-L210
[SITES]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/asteroidSites.js#L1-L200
[JOBS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/npcJobsRuntime.js#L1-L195
[ECONPLAN]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/roadmap/active/PQ-177.md#L1-L160
