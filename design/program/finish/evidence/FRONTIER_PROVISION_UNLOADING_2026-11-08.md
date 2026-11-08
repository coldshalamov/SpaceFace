# Stop for the household crew to unload

## Authored action

The prior physical Provisions route could consume a quoted, attached food pod on the first frame its center crossed the household's 200 WU volume. This increment makes the new food handoff an unloading stop, not an invisible tripwire. Before entry, the named household states the whole quantity, exact fee, maximum load speed relative to the frame (3 WU/s), two-second hold and cancellation conditions. On a slow inside arrival the crew says “Hold the load steady”; after two uninterrupted sampled seconds the existing Frontier intake takes the whole load and pays once.

Moving faster or leaving the volume cancels the accumulated unloading time and reports that the provisions remain in the pod. A later slow stop starts a full new interval. Cutting the line, changing the load/quote, docking, invalid mode, sector transition or restore does not retain permission for an inside handoff; the prior outside-offer rule still applies. This introduces no new loot, currency, model, generic delivery framework or mission stage. Ordinary generated `supplyCargo` crates retain the prior instantaneous intake rule; only this explicitly offered player-food route changes.

## Scope and prior work

Fresh origin/master remained `f95de0eb1ba7560839209936afba48c7b96fe41a`; live NOW and source inspected before exact ownership announcement and parent approval. Reserved opening encounter/onboarding/W1/core paths remain untouched. This is the nearest disjoint established household route, not a claim to have implemented another Helios opening scene.

Owned paths:
- `src/missions/frontierProvisionFreight.js`: food-only unloading state in the existing transient per-load offer; start/stop comms.
- `test/frontier-provision-freight.test.mjs`: prior success assertions now exercise the necessary real owner time instead of expecting an instantaneous crossing. Existing identity, protected freight, restore, rounding and household-isolation regressions remain.
- `test/frontier-provision-unloading.test.mjs`: seven focused timing and cancellation tests.
- This note.

No changes to faction_frontier, cargo, physics, economy, held missions, rendering or save files. Before snapshots `/tmp/frontierProvisionFreight.before-unloading.js` and `/tmp/frontier-provision-freight.before-unloading.mjs` preserve the prior reviewed57/57 candidate for publication without relying on the changing checkout. Increment patches `/tmp/frontierProvisionFreight.unloading.increment.patch` and `/tmp/frontier-provision-freight.unloading.increment.patch`. Full earlier Frontier/provision dependency chain remains required.

## Time and custody law

The same exact active attachment, living player, payload, recipient, amount and fee binding is required throughout. Relative speed uses current payload minus household linear velocity, so a co-moving load can be unloaded at a moving frame. Non-finite speed/time does not advance. Duplicate timestamps add zero; rewind or an observation gap over0.25s resets the full interval. This is observed owner continuity, not an assertion that the helper sees every sub-tick UI transition. No skipped simulation time counts toward unloading. State is latched before synchronous comms callbacks, so a reentrant owner tick cannot recursively start/stop or count the same interval twice. Material mismatch permanently revokes the quote; changing contents back inside does not recover consent. Both defects were found in independent review and corrected with dedicated regressions.

The offer/dwell remains WeakMap-only. Existing sector/new-run/restore resets erase it, and fresh saved physical cargo is not saved consent. The existing intake alone removes the body, increments delivery, and grants established fees. The helper emits only comms and returns admission. It never deducts inventory or pays.

## Evidence

Author combined **64/64 passed** (17 provision-route/timing tests plus earlier household/Barn/aid neighbors):

```
node --test test/frontier-provision-unloading.test.mjs test/frontier-provision-freight.test.mjs test/barn-first-provision.test.mjs test/homestead-provision-contact.test.mjs test/frontier-aid-one-delivery.test.mjs test/faction-frontier-expansion.test.mjs
```

Log `/tmp/unload-combined.log`. New focused checks cover exact2s requirement, relative rather than world speed, moving/outside cancellation and fresh interval, long gaps/rewind/duplicate time, and mode/line/content/restore interruptions. Prior real entity+Frontier restore and exactly-once intake tests continue to pass.

Native production flight, cargo jettison, Massline, physics and intake probe: **75.10 simulation seconds, actual20t body holding12 Provisions, one140-credit delivery, two pilot/load-related contact events**. It physically catches and brings the load in; the new dwell is traversed through real owner updates. The unchanged simple controller continues winching while settling, so this is not collision-free handling acceptance. Previous instant-crossing route was49.55s/zero contacts; these are different completion conditions, not a matched performance improvement. No force, collision radius or payment changed to make the test pass.

Initial household and starting food remain fixtures. This is not a demonstrated market purchase→Barn campaign journey. The receiving geometry is not collision protection, and the existing popup emission is not proof a human read it. Rendered legibility, full-world approach and disk/UI Continue remain unverified. Fresh entity/owner restoration remains narrower than the complete save envelope. No publication, merge, deployment or release acceptance by this worker.

Independent review pending final signoff.
