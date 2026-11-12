# After the welders: first provisioning and a later return

## Why this belongs here

Book 4's Free branch builds a real homestead, not merely a completed contract row. The existing Frontier owner already keeps that settlement, records traffic, asks for supplies after neglect, accepts physical supply pods and pays the carrier. The previous receiving scene explained assembly; this increment makes the change from **building it** to **keeping it supplied** readable at that same place.

Only the completed mission-bound Barn homestead receives this scene. Its larger 200-WU receiving ring replaces the earlier 130-WU construction guide through the two helpers' independent validity rules. The settlement's existing generated name identifies the speaker. A nearby undocked pilot hears that the welders have left, that the modules are not supplies, and that a marked Homestead Supplies pod's center must enter the larger ring. This is the existing owner's acceptance rule, not a new requirement to release, stop or dock. The warning about the solid hull remains explicit.

The welcome checks for actual nearby supply pods. An adopted ordinary site may have its previously seeded stores; a fresh mission-only site may not. The copy never invents nearby cargo or mints supplies. When no stores are present, provisioning remains a later opportunity rather than a fabricated immediate quest.

The ring shows **deliveries recorded**, not stock: `rec.supplies` is cumulative and does not diminish when time passes. A supply delivery after the player's first visit earns a local acknowledgment based on the authoritative ledger. On a later visit, a currently stranded settlement asks for supplies even if its cumulative delivery count is positive. This gives the original homestead an ongoing practical purpose and makes elapsed-time consequence legible without creating another economy or mission writer.

## Source and ownership

- `src/systems/faction_frontier.js`: additive import/hook after `_tickHomesteads`, plus survival early-return cleanup alongside the previous Barn guide. Prior receiving integration is preserved.
- `src/missions/homesteadProvisionContact.js`: validates the completed attempt, full live homestead record, mission/site, sector and matching generation. Uses the existing `_steadEnt` identity owner. Marker is nonphysical, untetherable and nonpersistent. Mode/sector/frame loss and identity changes remove it.
- One-shot welcome/receipt/stranded memory rides the existing serialized homestead record. Malformed primitive/array memory is normalized. Narration is local; an authoritative delivery may occur before the pilot returns, so its response is explicitly historical rather than claiming the player just handed it over.
- No module, pod, payment, reputation, objective, clock or physical-body writer is added. Existing `_tickHomesteads` alone consumes supply pods and issues the tier-dependent reward; no fixed fee is promised.

## Verification

```sh
node --test test/homestead-provision-contact.test.mjs test/barn-receiving-contact.test.mjs test/frontier-barn-mission.test.mjs test/faction-frontier-expansion.test.mjs test/w534-books-3-4.test.mjs
```

**55/55 pass**, including six new tests. Log: `/tmp/provision-combined.log`.

The fixture accepts the actual Free-branch board offer after the prior branch-intro fact, seats its six real modules through the raising owner and completes the real Barn mission before testing the new scene. New tests cover:

- 200-WU guide and no fabricated nearby stores; actual nearby stores get the conditional instruction.
- Real supply-owner boundary: 201 WU remains outside; 200 WU consumes the pod, increments the record and pays through the actual economy owner exactly once. Guide/contact emit no extra payment.
- An arbitrary building module and forged supply-delivered event cannot create receipt narration or increase the readout.
- After a real delivery, advancing 301 seconds opens the real supply request; returning pilot gets the request while the ledger still correctly reports one prior delivery.
- Docking, generation mismatch, mode and sector cleanup; actual Frontier serialize/deserialize retains one-shot memory.
- Destroying the actual frame lets the owner mark its record gone and removes the guide, with no reward or repeated contact; malformed contact memory is safely normalized.

**Limits:** new tests intentionally position module/pod fixtures and advance simulated time. They are owner-route tests, not ordinary pilot input, native towing or rendered screenshots. The existing neighboring native Barn test uses fixture forces and does not prove a new pilot-controlled provision journey. Full browser Continue, contact readability amidst other messages, live traffic/combat and the complete Book 3-to-Book 4-to-provision journey remain acceptance work. No new screenshot/render is claimed.

## Restoration and open goals

Fresh fetched remote basis remains `39887a0186bea79eed4c8648fa34a4eb6c4e461e`. Exact four-path scope: the two source files above, `test/homestead-provision-contact.test.mjs`, and this report. Baseline owner snapshot `/tmp/faction_frontier.before-provision-contact.js` SHA-256 `f531eaee48fde9c84481f6e3d52a516daeb69ee7b45d8242c8b1f43228feeabd` includes the prior reviewed Barn receiving increment. Restore this delta on that baseline, not clean remote; record the prior `barnReceivingContact.js` dependency and shared mission/economy/save/data dependencies. No held files, models or other candidates changed.

SF-LIVING-WORLD / SF-SECTOR-COHERENCE: the raised place now offers an understandable recurring visit and consequence, but native/visual acceptance is open. SF-GAME / SF-WORLD-DIRECTION remain open across the other branch routes and larger game. Next executable acceptance is an ordinary input supply tow into the visible ring, then a later return after a real supply request, with save/continue between visits. Locally implemented and tested, not published, merged, deployed or user-accepted.
