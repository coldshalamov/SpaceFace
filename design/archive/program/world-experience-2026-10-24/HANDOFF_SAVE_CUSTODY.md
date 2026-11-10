# Handoff: saved custody and ordinary collection

Baseline: PR568 clear-launch head `b7483b10139be75170258638c97c1aa714645a08`. Prior packets remain unchanged. The only production edit corrects the exported primaryLine to describe two hulls holding off the lane; the runtime alert and telegraph already used honest holding language. No save, cargo, economy, physics, AI or director behavior changes were needed.

## Actual API proof
The new regression is part of the existing handoff-stationkeeping-native.test.mjs gate. It installs the real save, cargo, economy and mining systems alongside the actual authored director, mule_trader/Kestrel factories, production controllers and native physics.

At6.10s, before remaining NPC delivery, the original pod4 is bonded to player1 with2 stolen-goods units. The actual economy consumer raises credits from0 to60. The regression calls save.serialize('quick'), JSON-stringifies the full checksummed envelope into a RAM implementation of the real sf.save.quick slot, then calls save.load('quick'). This is actual validation/restoration, not a projected entity copy or a fabricated save:loaded event.

Continue reconstructs a new entity object with the same saved pod ID4, ownerId1, amount2, bondedBy and committedTo. The original jettisoned-pod factory already marks it persistent. The unfinished director scene is abandoned: live encounters and terminal receipts are empty. No successful contact receipt is invented and no NPC continuation is pretended.

Ordinary mining pickup at39.50s reports pickupId4, collectorId1, acceptedAmount2, rejectedAmount0. Credits remain60; cargo contains exactly2 units of the bonded commodity. A separate abandoned narcotics pod5 was also collected, so the regression attributes the bonded collection by original ID, not merely aggregate inventory.

After120 more native ticks, the test saves again AFTER collection and loads that new slot. Pod4 is absent from both the serialized persistent list and restored world. Cargo and credits remain unchanged, and another120 ticks do not repeat the pickup or reward. Loading an older pre-collection slot would legitimately rewind the timeline; the test does not misclassify that behavior as duplication.

[Measured boundary evidence](handoff-save-custody-evidence.json) records acceptance, Continue, the exact pickup receipt, post-pickup state and post-pickup Continue.

## Results and limits
- 64 focused plus legacy tests pass, including the authored-copy assertion.
- All 13 native tests pass together, including the new actual Save/Continue regression and the existing 12 cases, checking fixture integration as well as the selected boundary.
-The public saveSystem/cargo/economy/lootShards/mining owner blobs are verified at the baseline commit. Runner reconstructs25 explicitly supplied sources and1019 historical archive dependencies in RAM, with a local localization fallback. FlightV3 remains archival. This is not an exact complete current-tree runtime.
-The RAM slot implements localStorage's ordinary key/value contract; it does not qualify browser storage quota, shared-store synchronization, Continue-menu rendering, or live camera.
-Actual60-credit balance is qualified here. The +2 reputation event remains covered by prior tests, not a reputation-balance persistence assertion.
-Forced authored admission, seed357 and this ordinary brake/hold route are bounded evidence, not whole-game acceptance. No post-adoption pose writes or manual inventory mutations are used.
