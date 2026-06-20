**SPACEFACE — STORY SPINE: NARRATIVE OVERLAY**

The mechanic spec (07-missions-contracts-story-spine.md) defines what happens at each beat. This document defines what it means — the graffiti that appears, the HUD behavior, the Vale contact, the moral weight.

Read alongside the mechanic spec. Do not replace it.

---

**B0: COLD START**

Mechanic: mine 10u Veldspar, deliver to home station.

Narrative: This is Contract 47-A. The player doesn't know that yet. They know the weight on accept (12.4t) and they know the weight on delivery (0kg) and the HUD never reconciles the difference. Payment withheld. Board still lists 47-A as open.

Graffiti at home station airlock: THEY KNEW THE MASS. (First appearance.)

What the player learns mechanically: how to mine. What the player learns narratively: the weight that gets logged is not the weight that gets paid. The HUD calls it "STABLE LOAD" until it doesn't.

HUD behavior: Phase 1. The "STABLE LOAD" line stays on screen after the cargo is gone. The player can toggle it off. The line stays.

Vale: name appears in the contract authorization line. REF 44-C. The player almost certainly doesn't read the authorization line.

---

**B1: HONEST WORK**

Mechanic: carry 12u to neighbor station, cargo delivered.

Narrative: The cargo is described as "INDUSTRIAL COMPONENTS." The delivery manifests at the destination as "SURPLUS REDISTRIBUTION — STANDARD." The category changed in transit. Nobody flags it. This is normal.

Graffiti at destination airlock: REDISTRIBUTED TO THE HIGHEST BIDDER. (This is Contract 04 text, appearing as ambient graffiti before the player takes that contract. The first instance of the graffiti knowing things the player hasn't done yet.)

What the player learns: cargo descriptions are descriptive until they aren't. Also: the gap between "industrial components" and "surplus redistribution" is the price the middleman charged for changing the name.

HUD behavior: Phase 1. Manifest self-corrects silently. No notification.

Vale: no contact this beat.

---

**B2: FIRST BLOOD**

Mechanic: eliminate one weak pirate.

Narrative: The pirate's ship is tagged "UNKNOWN" before the kill. After the kill, it tags "BOUNTY COLLECTED." There's a third tag that appears briefly — "CIVILIAN VESSEL — REGISTERED" — and then disappears as the kill feed updates. The log shows only "BOUNTY COLLECTED."

The target is not a pirate. The target is one Elroy, Maintenance Division, Pit Engineering. He filed a report six weeks before the player's first contract, noting that the primary atmospheric recycler catalyst grid had been decommissioned without authorization and the components were missing. The report was bounty-tagged by Rook as "PIRATE THREAT — SECTOR INTERFERENCE." The tag was double-billed (two clients, Rook's standard). The player took the job because it was on the board. Elroy was carrying the report. The graffiti says: THEY WERE CARRYING MEDICINE. What Elroy was carrying was the only evidence that the Pit's recyclers were being killed deliberately. The player is the reason the Pit's lower decks never found out what happened to the air.

What the player learns: nothing, at B2. The civilian tag flickers for 0.5 seconds. The graffiti appears after. Most players don't connect it until B6 or the Ashfall Reach encounter. The Kurtz figure's ledger has Elroy's name under "COUNTERPARTY — DECEASED." The player's name is in the same ledger. The same column. A different row.

HUD behavior: Phase 1. The civilian tag appears for 0.5 seconds before the kill feed overwrites it. Intentional. The player may not catch it the first time.

Vale: no contact this beat.

---

**B3: BIGGER BOAT**

Mechanic: purchase a tier-2 hull.

Narrative: The shipyard at any tier-2 station has a ship with a specific name visible on the hull if the player looks: "VARIANCE ADJUSTMENT." This is Kessler's terminology. The ship is not important. The name is the tell. Someone who worked the scales named this ship before they sold it.

Comms popup mid-beat: "Your recent work has been noted. The board will have something appropriate for your current capacity." No sender name. The header, if checked: Concord Relay 3, forwarded through four stations, one of which is Gate 3. *(Director Vale.)*

Graffiti at shipyard: THE WELD KNOWS WHO CUT IT TWICE. *(This is Slate's line. The player is buying a ship here. The graffiti is a warning about who repaired it last.)*

What the player learns: not stated. The player can connect the dots later. The shipyard graffiti, the ship named "VARIANCE ADJUSTMENT," and the anonymous comms popup are all simultaneous. The player is probably just buying a ship.

HUD behavior: Phase 1. Nothing anomalous.

Vale: the comms popup. The player can trace it to Vale if they check the header. Most don't.

---

**B4: PICK A SIDE (BRANCH)**

Mechanic: accept one of three faction intro contracts, setting story.branch.

Narrative: All three faction intro contracts route through the same clearing station. The clearing station's administrator field shows "V. Director, acting." The three contracts are: (Traders Guild) a bulk trade that routes through a Meridian-adjacent ledger; (Patrol Authority) a patrol_clear that generates a report filed under Hale's gate jurisdiction; (Free Captains) a smuggling run that Mira's freight system processes on the back end. The player chooses a side. All three sides run through the same administrator.

Graffiti at the clearing station: EVERY MAN PAYS TWICE. FIRST IN FLESH. THEN IN COIN. *(This is MTS faction graffiti, appearing here as ambient — appropriate because the clearing station is MTS-adjacent, and because both lines apply to every side of the B4 choice.)*

What the player learns: the factions are distinct. The system they operate in is not.

HUD behavior: Phase 1. No anomalies. The branch choice sets the story.branch flag cleanly.

Vale: the clearing station administrator field. If the player reads it, this is the second Vale sighting. The name "V. Director, acting" is designed to be parseable if you're looking for it.

---

**B5: PROVING GROUND**

Mechanic: complete the branch-specific 3-mission chain.

Narrative: One mission in the chain has a target vessel with a registry anomaly: last registered owner is "VALE HOLDINGS LLC." The mission brief doesn't mention this. The salvage manifest, accessible post-mission, shows the cargo: "ADMINISTRATIVE RECORDS — 3 YEARS / SEALED." The player delivered those records without knowing what they were. The records are now in the manifest history of the player's ship.

Comms popup: [CHANNEL UNAVAILABLE] — SENDER BLOCKED. *(The blocked sender is the player's own transponder, from a message sent 14 cycles prior. The channel it was sent on was the Reach black-market comms. The channel has been closed by Concord sweep. The player's message is now in a Concord sweep log.)*

Graffiti at the mission chain's final destination: THE WALLS WERE NEVER THE REAL PRISON. *(The Quiet faction graffiti. Appearing here because the player has just discovered that their comms are being logged and their cargo has administrator records in it. The Quiet's line lands differently now.)*

What the player learns: they have been in more stories than they knew about. The "ADMINISTRATIVE RECORDS" cargo is the first concrete thread of the Vale network that the player is now carrying in their own manifest history.

HUD behavior: Phase 2 begins. The manifest self-correction (from "INDUSTRIAL COMPONENTS" to "ADMINISTRATIVE RECORDS — 3 YEARS / SEALED") happens silently. The player's manifest history shows only the final description.

Vale: the "VALE HOLDINGS LLC" registry. Third sighting. The pattern is now visible if the player has been tracking the references.

---

**B6: EMPIRE SEED**

Mechanic: deploy first passive asset.

Narrative: The passive asset (mining drone, NPC trader, or outpost plot) begins generating income. The income is real. The first deposit arrives with a note in the transaction record: "REMITTANCE FROM ASSET DEPLOYMENT / CLEARED: VALE HOLDINGS LLC." The player's asset income is being processed through Vale's clearing system. This was always the case. The player just started generating enough income for the line to appear in their ledger.

Comms popup: CONTRACT 47-A — PAYMENT PENDING. PLEASE ADVISE AVAILABILITY. *(This is the first run. The payment amount is correct. If the player accepts: they are added to the Vale roster, which appears in the Ashfall Reach ledger. If the player declines: nothing changes. The income from their passive asset continues to clear through Vale's system regardless.)*

Graffiti on the player's own bulkhead (first appearance of this): THEY KNEW THE MASS. *(Written in the player's own hand while they slept. The callback to B0. The player has been carrying this since the first run. The graffiti knows. The player is beginning to know.)*

What the player learns: the system was always going to route the player's success through Vale's clearing system. Deploying the passive asset didn't create this relationship. It made it visible.

HUD behavior: Phase 2. The "CLEARED: VALE HOLDINGS LLC" note in the ledger should be in the secondary log — visible if the player opens the full transaction record, not visible in the summary.

Vale: the income clearing note. Fourth sighting. Also: the CONTRACT 47-A payment comms popup. Fifth sighting, first direct contact offer.

---

**B7: THE DEEP REACH**

Mechanic: reach Ashfall Reach and make the endgame choice.

Narrative: The Kurtz figure's ledger. Director Vale as a line item under BENEFICIARY. The player's own callsign in the ledger, in the COUNTERPARTY column, filed six weeks before their first contract — under the transponder ID that the ship carried before they bought it. They are already in the record. They were in it before they arrived.

The four choices (Clean Uniform, Same Silence, Only Honest Option, The Ledger Continues) are not presented as a menu. They are three available contracts on three separate board entries, the graffiti-only option C, and the staying-at-the-desk option D (available only if the player is holding the ledger and declines to leave).

Graffiti on the player's bulkhead (reappears, same hand): THEY KNEW THE MASS. THEY ALWAYS KNEW THE MASS.

The Kurtz figure's last line: "The count never ends. You know that. That's why you're here."

The comms when the player engages the jump drive from Ashfall Reach (regardless of destination): one last popup, no sender, no channel ID, just: "Good work. Keep it clean." *(Vale's only direct line. The one the player may have heard in B5 at the Trusted station. Repeated here at the end because the ending, regardless of which one the player chose, is the kind of work Vale calls good.)* 

Timing note: this popup fires the moment the jump drive begins charging — before the "JUMP WITHOUT DESTINATION? Yes / No" prompt appears for Choice C. The player reads "Good work. Keep it clean." and then decides whether to jump. If they choose no, Vale's approval sits on their comms log. If they choose yes, it's the last received message before the reactor fails. The system approved the work regardless.

What the player learns: the only thing that determines whether Vale says "good work" is whether the work got done. The moral content of the work is not relevant to the assessment.

HUD behavior: Phase 3. The final contract entry: "CONTRACT 47-A: STATUS: PENDING." This entry cannot be closed. It is there when the game resets to sandbox. It is there in the next playthrough if the player loads the same save. The first job is still pending. The payment is still withheld.

---

**The through-line:**

B0: the weight doesn't match. Payment withheld. The graffiti appears.
B1–B6: the weight never matches. The graffiti accumulates. The HUD learns to stop correcting.
B7: the weight is whatever the log says it is. The graffiti says it was always this way.

The player has been running Contract 47-A since the beginning. Every job after it was Contract 47-A under different reference numbers. The graffiti knew this. The HUD eventually stopped pretending otherwise.

"CARGO: STABLE." The mass is whatever the manifest says it is. The manifest says whatever the administrator signed off on. The administrator is Director Vale. Vale calls it good work.

The count never ends. Only the counters change.
