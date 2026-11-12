# A household can receive the food in your hold

## Player experience and diagnosis

The actual Frontier homestead owner consumed only `data.supplyCargo` props. A pilot could build a household, buy ordinary Provisions, jettison a real cargo pod and haul it home, yet the household would ignore the food. The existing Barn first-provision crate supplies the first visit, but did not make subsequent household provisioning a player-supplied activity. This increment connects that physical cargo route to the established household delivery law. It does not add another free crate, model, mission, or payment authority.

A live registered household offers to buy a currently player-towed, ordinary pure Provisions load of at least ten units. The offer is made only outside its 200 WU receiving volume and within 600 WU. It names the entire quantity and the exact rounded household fee: all contents will go aboard, not just ten units. The player can keep the load outside or return it to the hold. Towing the same load inside, on the same active line, commits the delivery. A pod first encountered inside is not taken. No button or automatic jettison event authorizes this new path.

The nearest current household quotes when approaches overlap. The existing `frontierHomesteads._tickHomesteads` remains the sole consumer and reward writer: remove the physical body, record one delivery, refresh the supply clock, resolve the existing supply ask, then apply established tier fee/reputation/deed/lead/debt behavior. The twelve-unit native example costs twelve units of real cargo and pays the existing 140-credit fee; this is not a claim that delivering purchased food is profitable. No price or reward tuning is included.

## Source and ownership

- `src/systems/faction_frontier.js`: bounded candidate/offer admission inside the existing supply loop; transient reset at init, destroy, new run, sector entry and restore. All prior Barn/provision/aid/salvage continuity hunks are preserved.
- `src/missions/frontierProvisionFreight.js`: read-only food/provenance selection and transient outside-offer binding. Uses the existing `lootShards.gardenFeedMass` read to reject protected, mixed, malformed or inconsistent producer custody; it never writes cargo.
- `test/frontier-provision-freight.test.mjs`: ten focused tests.
- This evidence note.

Fresh origin/master checked at `f95de0eb1ba7560839209936afba48c7b96fe41a`. Current NOW, including Lane B, W1 and SIM CORE claims, was read. Parent approved this nearest disjoint household route because the reserved opening paths cannot be mutated. No encounter, held mission, economy, physics, cargo, save or asset file changed. Exact owner before snapshot: `/tmp/faction_frontier.before-provision-freight.js` SHA-256 `4fa1a69dab8fc8524e083aafab0f692ffe2459ffb6bdcbb346a9bc78d64b637f`. Increment patch: `/tmp/faction_frontier.provision-freight.increment.patch`. Earlier Frontier helper chain remains required; this is not a standalone replacement owner.

## Custody, consent and persistence boundaries

The quote binds exact live pod/recipient/player objects and generations, unchanged quantity and fee, plus the current standard attachment object and ID with canonical endpoint generations. Detached, wrong-life, foreign or protected freight does not deliver. Leaving offer range, invalid mode/dock or a cut observed by the owner revokes the offer. Recatching changes attachment identity even if the intervening cut was not sampled. Sector and restore boundaries clear the WeakMap. A new quote is required outside after Continue; the saved cargo body remains cargo, not a saved authorization to consume it.

The popup being emitted is evidence that an offer was presented, not proof a human read it. The existing comms surface can be busy. Rendered legibility and the ease of judging the receiving volume still need ordinary play review. No additional collision-free ring or safe approach corridor is claimed.

The fresh entity test serializes the real pod and household plus the Frontier owner, restores through `_spawnPersistentEntities` and the owner's generation remap, then establishes a new line fixture. Inside without a new offer preserves all food; going outside and returning settles once. This proves fresh physical/owner restore boundaries, not disk/UI Continue or restoration of a live rope.

## Verification

Author combined result: **57/57 passed**, including ten new tests:

```
node --test test/frontier-provision-freight.test.mjs test/barn-first-provision.test.mjs test/homestead-provision-contact.test.mjs test/frontier-aid-one-delivery.test.mjs test/faction-frontier-expansion.test.mjs
```

Log `/tmp/provision-freight-combined.log`. Covers ordinary supply compatibility, whole-load one-time consumption, missing outside offer, wrong/foreign/protected/mixed/small freight, quantity/fee/player/recipient changes, invalid-mode/range/line/sector revocation, rounding, overlap/distant/offsector household isolation, and actual fresh entity/owner restore.

Native Rapier probe: actual cargo owner jettisons twelve Provisions, pilot catches the live 20t body with ordinary Massline, receives the outside offer, then flies it into intake. **49.55 simulation seconds, zero pilot/load impacts, one 140-credit supply payment, one delivery, zero food left in the hold.** No body relocation or velocity assignment follows jettison. The recipient is a fixture registered household, not a newly played-through Barn campaign; the initial twelve food units are fixture cargo, not a demonstrated market purchase. No populated-world or full-campaign claim.

Failed first native controller chased the pod's old position while its real jettison drift carried it inside the receiver. The owner correctly refused consumption without an outside offer. The corrected controller catches promptly after clearance, then follows the intended route. No gameplay radius, mass or force was adjusted to pass. Reviewer also caught stale quote retention and floor/round wording; these were corrected with regressions before final freeze. A final distant-household test caught global quote invalidation by another recipient; invalidation is now scoped to the quoting household.

Independent read-only review by `/root/check_spaceface_pr`: final corrected combined **57/57 passed**, no remaining source blocker identified. No publishing, integration, rendered acceptance, new models or release acceptance performed by this worker.
