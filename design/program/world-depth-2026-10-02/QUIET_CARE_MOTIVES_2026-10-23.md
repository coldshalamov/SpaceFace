# Count the crates, not the people

Status: source-grounded narrative study plus a reviewed, un-published Hesper bar-readout source candidate. The ordinary Hesper question below is implemented in the candidate; receiving-port radio and physical berth priority remain proposals. No merge, deployment, rendered UI or player-flight acceptance is claimed. Read against public master `3e5ef7a7719a6f637649d594fb6f5110096abb69`; published PR532 and PR531 are separate development dependencies. The labels **Canon**, **Inference**, and **Proposal** are deliberate boundaries.

## The conflict

Nyx and Kepler contain something richer than a kind smuggler facing an evil pirate. Hesper Quill keeps a clinic supplied through the Quiet. Ilsa Greve buys live pods and ransom notes, offering immediate money where families pay late. Both need surviving hulls, carriers, liquidity and access through dangerous territory. Their difference is what they will make collateral.

**Inference:** Hesper builds a practical Quiet institution, not a secret Concord charity. Dependable care makes her network necessary. Ilsa treats immediate payment and keeping an asset alive as evidence that she provides a useful service. Their competing explanations should remain intelligible without making their actions morally equivalent.

## Hesper Quill

**Canon:** Nyx Fence's pharmacist moves only food and medicine, pays less, and never sets up carriers. She withholds recipients' identities when a delivery fails. Her trusted medical route runs Nyx to Cut Refinery, Ceres and Tethys; its terminal reward is ten Quiet standing, described as a debt the Quiet will honor. PR532 opens the existing relationship to clean carriers and protects the no-betrayal promise without granting law immunity.

**Inference:** She wants continuity of supply, not one spectacular charitable delivery. She considers herself decent because entrusted people do not become merchandise. She fears exposing the network through the last visible link. Her obligations arise from accepting freight and promising discretion; no named family debt or tragic incident is established. She conceals recipients, not the existence of her business. She tolerates lower carrier pay, imperfect deliveries and supplying workers whose employers she need not admire. She rationalizes building Quiet power because that power keeps the service available.

The existing partial-delivery policy is useful characterization: surviving eligible goods actually reach the destination market, payment falls with quantity, and the relationship can continue. This does not establish that she endorses theft or knows why anything went missing.

**Proposed voice:** “They signed for the medicine. Good. They can stop there.”

## Ilsa Greve

**Canon:** The Reach note buyer at neighboring Kepler Scar buys ransom notes and live pods, pays a 2.6 multiplier against Hesper's 1.4, and can betray carriers. Her route carries luxury goods and ends with a ransom-share reward. Her dialogue says families pay late while she pays now.

**Inference:** She wants collectible claims. She considers immediate payment more honest than a promise of eventual rescue. She fears the person or paper leaving her control before it pays. No named creditor or personal history is established. She hides coercion inside the language of ordinary financing. She tolerates suffering while the asset retains value. Her rationale is that someone has to advance the money while a family negotiates.

**Proposal:** Ilsa thinks Hesper misunderstands cash flow: care cannot run on thanks. Hesper thinks Ilsa misunderstands the purpose of keeping someone alive. Their shared dependence is on the regional logistics economy, not an invented private transaction. Do not claim they have personally traded prisoners, financed one another, or held a meeting.

**Proposed voice:** “Your pharmacist pays less. Somebody covers the rest.”

## Ossa of the Cut Run

**Canon:** Hyperion's named Mule hauler carries ordinary ore to the refinery. Hyperion's claim crews have a standing fuel-cell shortage. Its livelihood is extraction and intake under thin protection. The same refinery is Hesper's first trusted medical destination.

**Inference:** Ossa wants a load delivered and another workable shift. She considers herself decent because she carries what others worked to extract. She fears being the delay that wastes a shift. Her obligations to crews and counterparties follow from her work, not an invented personal debt. Nothing establishes a hidden crime or secret. She tolerates Collective percentages and procedures because buyers, equipment and protection matter.

The established Lung Run makes the institution's contradiction explicit: its DMC tender branch returns rescued crews to intake ownership, while its Quiet branch removes indenture records. This does not prove Ossa is indentured or knows those crews. She can resent a medical carrier going first while still needing medicine herself.

**Proposed voice:** “Medicine first. My ore still weighs the same.”

## Nineola Hush

**Canon:** Nyx's named Kestrel courier, HUSH-CARGO, carries sealed freight without papers. Quiet faction mechanics include selling used routes.

**Inference:** She wants transport completed without making its pattern useful to somebody else. She considers discretion a professional virtue. She fears a recognizable route becoming another broker's product. She owes the current delivery, not an established lifelong loyalty to Hesper. She hides transport context and tolerates ambiguity about what she carries. Not asking questions can protect recipients; it can also protect her from knowing whom she helps.

**Boundary:** Nineola is not the existing `nyx_fence_runner` activity actor. That actor is a separate smuggler/hauler on a short cache-to-berth loop. Neither has an established clinic-cargo transfer. Do not merge the identities or declare all her work humanitarian.

## Immediately actionable proposal: Count the crates, not the people

The first allocated increment uses Hesper's ordinary bar question only, on PR532. Receiving-port broadcasts are a subsequent hook, not part of this implementation: do not create a dependency across unmerged PR531 and PR532. Both proposed surfaces interpret the same actual accepted shipment and current market state. No new mission, patient simulation, morality score, benefit allocation, inventory, or persistent ledger.

At Nyx, add the optional question “Did the supplies arrive?” Its answer names the latest provable clinic delivery's accepted quantity and destination. Hesper then distinguishes the counted goods from the people she will not name. At the receiving port, a low-priority intake notice reports the same accepted quantity in its own institutional register. Current market stock changes the remainder of the notice. Subsequent actual deliveries and trades therefore change what the player hears, without pretending the broadcast caused those transactions.

Three ordinary visits reveal the tension:

1. Before a proven delivery, Hesper offers a practical account of the work, not a fabricated patient success.
2. After a real complete or partial shipment, intake counts the actual units received. Hesper values what arrived and declines to turn recipients into an audit trail.
3. On a later visit, the remembered delivery remains historical while the stock report is explicitly current. If the market has sold out again, do not declare the earlier delivery useless or falsely blame the player. The need is recurring; a completed job is not permanent salvation.

**Proposed lines, contingent on actual facts:**

- Hesper: “Cut Refinery signed for 3 units of medicine. That part has a receipt. The people do not.”
- Intake: “Medical intake: 3 units accepted on the Nyx run. Current market stock: 11.”
- Hesper, stock later unavailable: “The receipt still says it arrived. I have no current stock count.”
- Receiving port when its existing market API reports sold out: “The Nyx lot was accepted. Medical stock is sold out again.”

Wording must not imply that a particular doctor, patient, clinic room, priority queue, recovery or death is simulated. No refusal of existing lawful stock accounting is implied. Keep the faction disagreement about the meaning and limits of records, not an invented dispute over nonexistent personal-data fields.

### Data contract

The durable mission receipt preserves `sourceOfferId`, `missionId`, `source`, origin and destination station, `outcome` and `at_s`. Its history is capped at ten receipts. Hesper's ordinary offer IDs are `eco_station_nyx_march_<epoch>_deniable`; trusted route offer IDs are `fenceroute_fence_hesper_quill_<1..3>`.

Join a validated completed receipt to `state.economy.committedIntents['freight:mission-delivery:' + missionId]`. The committed receipt identifies station, commodity, positive accepted quantity and `source: 'mission_delivery'`. Confirm the result, identity, commodity and destination match. Read this structure directly; calling an `ensure` helper would mutate state.

Use exact provenance, never a title substring. Validate the route's expected origin/destination and permitted source. Ordinary clinic freight may be food or medicine; route legs are medicine. Reject inconsistent, future, malformed or mismatched facts. A later unsuccessful clinic receipt must not be disguised as a later success by blindly choosing an older completed one.

Original requested quantity is not retained in the durable mission receipt. Report the accepted quantity, not an invented X/Y fraction or “full” status. Do not parse prose to recover quantities. When relevant receipts age out, detailed retrospective claims must disappear or fall back to Hesper's existing general relationship state. This is recent, save-backed memory, not a lifetime history promise.

The market's existing sold-out API uses stock below two units, but this first increment does not add sold-out broadcast logic. Avoid treating a static equilibrium/reference shortfall as a modeled count of untreated people. The implemented dialogue reports only the numeric current stock. The static baseEq comparison selects a character line internally; it does not describe past typical stock, current clinical demand or an emergency. Below-reference medicine prompts “I need regular carriers, not heroes.” Food prompts “Food does not stay delivered. People eat.” At/above-reference stock prompts “Good. The names stay with me.” Missing current stock says “I can verify the arrival. I do not have a current stock count.”

### Exact proposed scope

- New `src/data/clinicFreightReadout.js`: pure provenance join and conditional text projection.
- `src/ui/station/fenceContact.js`: Hesper-only question and reply, preserving PR532's clean-carrier behavior and all other fences.
- Future only, not allocated: `src/systems/stationBroadcast.js` receiving-port readout inside existing ambient cadence, combat/onboarding/voice gates and queued-line validity recheck, preserving PR531's Rhea projection.
- Focused test(s) and this human-readable design record.

The first implementation's existing runtime write is only `src/ui/station/fenceContact.js`; the projection and focused test are new files. No `fenceDesk`, `economyContracts`, `stationBroadcast`, `npcJobsRuntime`, `traffic`, `missions`, `economy`, save schema, graphics or actor-roster writes. Root approval and exact source composition remain required before implementation.

PR532 was reread at 2026-10-23 09:47 UTC: open/draft head `91beaf85f50ba401319bc0727faf1ec5ad715ad9`, base `93706e9ff07563af29461ea4b4d65486b710ee7d`. Its source blobs are fenceContact `8a984be0d74999c59140614fb8dc35305a5c4c6f`, fenceDesk `f2abda766369ff5e84e22c3d6286d03f1f2b6e7c`, and economyContracts `9102a76bb36c58e409cec0ebf92896b7255b7240`. Preserve the last two unchanged. Publication must recheck the head rather than assume it has remained still.

## Future coordinated option: Medicine First

At Cut Refinery, a live medical delivery could receive temporary approach courtesy when medical stock is low: eligible competing freight physically yields, its real job clock pauses, and the original worker resumes afterward. An empty trusted player would not get VIP priority. This would express scarce logistics directly.

This option is not the immediate implementation. Its necessary `npcJobsRuntime` seam overlaps active owners. The presentation-only `laneErrands` module cannot truthfully substitute for delayed economic work. No owner consent or integration is claimed. Keep it for an explicitly coordinated continuation.

## Evidence

- [Fence roster, routes and dialogue](https://github.com/coldshalamov/SpaceFace/blob/3e5ef7a7719a6f637649d594fb6f5110096abb69/src/data/fences.js)
- [Faction histories](https://github.com/coldshalamov/SpaceFace/blob/3e5ef7a7719a6f637649d594fb6f5110096abb69/docs/worldbuilding/orgs/factions-CANONICAL.md)
- [Named lane workers](https://github.com/coldshalamov/SpaceFace/blob/3e5ef7a7719a6f637649d594fb6f5110096abb69/src/data/laneContacts.js)
- [West geography and local industry](https://github.com/coldshalamov/SpaceFace/blob/3e5ef7a7719a6f637649d594fb6f5110096abb69/src/data/frontierRegions/west.js)
- [Activity actors](https://github.com/coldshalamov/SpaceFace/blob/3e5ef7a7719a6f637649d594fb6f5110096abb69/src/data/sectorActivityPockets.js)
- [Lung Run](https://github.com/coldshalamov/SpaceFace/blob/3e5ef7a7719a6f637649d594fb6f5110096abb69/src/data/missions.js)
- [Mission settlement and receipt shape](https://github.com/coldshalamov/SpaceFace/blob/3e5ef7a7719a6f637649d594fb6f5110096abb69/src/systems/missions.js)
- [Real market acceptance](https://github.com/coldshalamov/SpaceFace/blob/3e5ef7a7719a6f637649d594fb6f5110096abb69/src/systems/economy.js)
- [Published clinic work, PR532](https://github.com/coldshalamov/SpaceFace/pull/532)
- [Published state-backed radio work, PR531](https://github.com/coldshalamov/SpaceFace/pull/531)

Research and this document do not establish native flight, rendered presentation, fun, performance, deployment, or whole-sector completion.

## Reviewed candidate evidence (2026-10-23 09:56 UTC)

The ordinary generated Hesper contact now includes `clinic_freight_report`, labeled “Did the supplies arrive?” The ordinary bar reply dispatcher reaches the read-only projection. All existing contact access and work choices are preserved. No second state writer was introduced.

An initial actual-contact baseline test on PR532 failed because the choice was absent (0/1); the candidate first passed 1/1. The expanded focused suite passes 39/39 and an independent reviewer reran it successfully. It covers actual clinic acceptance and settlement, partial freight, all three trusted route legs, ordinary bar reply dispatch, production economy stock writes, actual Save/Continue, ten-receipt aging, other fences, strict source/receipt/result matching, malformed evidence and no mutation. Travel/docking/time are fixture inputs, not native flight. The comparison does not claim the entire new suite was red at baseline.

The existing clinic suite passes 15/15, fence suite 33/33 and no-betrayal suite 10/10 against the candidate. These are 97 distinct checks including the new 39; reviewer repeats are not added to that count. No aggregate suite or excluded anvil receiver test was run.

Review found and resolved an initially unbounded receipt-array scan and inventory prose that overstated baseEq as observed usual stock. The final helper reads only the first ten canonical newest-first receipts; an out-of-window record cannot revive a delivery. It picks the latest chronological clinic-looking record inside that window, rejects invalid/future times or tied/contradictory evidence, and never falls back past a newer contradictory clinic record. Spoken inventory comparisons were removed.

Reviewed Git blob identities:
- `src/data/clinicFreightReadout.js`: `b6ef7c4851f9c51e8d5adc9b8d46a05187fc09ee`.
- `src/ui/station/fenceContact.js`: `61e9267dd8a64f0c0fbd7b931de3358a127dcd70`.
- `test/nyx-clinic-freight-readout.test.mjs`: `fcc71baa86b2bdd4960aa51929f02d3aa15a3dbb`.

Qualification uses the prior PR532 source composition based on public 93706e9 plus its published three-module clinic delta. A read-only ESM loader rejects every existing source module not matching the prior qualified effective-module manifest; only the two intended candidate source paths override that manifest. This is exercised ESM source qualification, not an unrestricted filesystem or native-dependency audit. Current-master qualification and publication remain the publisher's separate work.
