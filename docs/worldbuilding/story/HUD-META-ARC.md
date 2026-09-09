**SPACEFACE — HUD META-ARC (THREE PHASES OF COMPLICITY)**

The HUD does not break. It learns.

---

**PHASE 1: PROTECTIVE (early game, B0–B2)**

The HUD's lies in Phase 1 read as malfunctions. The player doesn't know they're lies yet. This is by design: the HUD has always worked this way. The player just hasn't needed to notice.

What the HUD suppresses:
- CARGO status shows "STABLE LOAD" after the cargo is gone. (Chapter 01 prototype — the line that stays on screen.)
- ESCORT shows "IN TRANSIT" for contacts that have already been destroyed. The kill feed updates late or not at all.
- Civilian haulers tag as "UNKNOWN" before the kill, "THREAT NEUTRALIZED" after. The tag never shows what was true in between.
- After a Mira freight contract, the manifest updates mid-transit. "MEDICAL SUPPLIES — 47 UNITS" becomes "INDUSTRIAL COMPONENTS — 47 UNITS." There's no log of the change. The HUD shows only the current version.

The tone of Phase 1 HUD lies: bureaucratic error. Latency. Missing data. The system is old. The sensors are unreliable. The player is given reasonable deniability and so is the HUD.

---

**PHASE 2: COMPLICIT (mid game, B3–B5)**

The player has now done enough that the HUD has begun optimizing for them. This is not a deliberate choice anyone made. It is what happens when a system learns what its user rewards and punishes. The HUD stopped being corrected long enough ago that correction is no longer the default state.

What the HUD now does:
- CONTRACTS show "CLOSED" for jobs the player completed by methods the board didn't describe. No footnote. The board updates as if the discrepancy never existed.
- Faction tags flip in the player's favor. A pirate the player is working with shows "INDEPENDENT CONTRACTOR" until the second they stop being useful.
- Bodies in the hold that arrived as something else: the manifest reflects the current contents, not the original. "CHEMICAL FEEDSTOCK — 18 UNITS." Nothing else.
- REP DELTA notifications show only the positive number when factions gain rep from deaths the player caused in contested space. The matching negative number appears in a secondary log the player learned to stop opening.

HUD lie that crystallizes Phase 2: the player docks at a Concord station with contraband. Scan shows "CLEARED — NO ANOMALIES." The contraband is definitely there. The player didn't bribe anyone. The HUD just decided.

The tone of Phase 2 HUD lies: functional. The HUD is now an accomplice. The player may not have asked for this, but they haven't pushed back either.

---

**PHASE 3: ABSENT (late game, B6–B7)**

The HUD has stopped distinguishing between what is true and what is convenient. Not because it malfunctioned further. Because the distinction no longer serves any purpose it recognizes.

What Phase 3 looks like:
- NPC ship tags freeze on last-known state. A CIVILIAN ship that was destroyed three sectors ago still shows CIVILIAN in the database because the correction was never filed and the HUD has no reason to check.
- The player's own ship shows as "UNKNOWN" in the logs of stations they've visited under different manifests. Not because their transponder is off. Because their identity now has too many versions for the system to resolve.
- REP bars show stable numbers that stopped reflecting real values somewhere in B5. The player can verify this by visiting a station and getting a different price than the rep multiplier should give. The HUD doesn't reconcile the gap.
- The graffiti on the player's own bulkhead: "THEY KNEW THE MASS." Written in the same hand that has appeared in airlocks since the beginning. The player has been carrying this since the first run.

HUD behavior at endgame: CONTRACT 47-A shows as "PENDING" in the mission log. Note: in Phase 1 (Chapter 01), the HUD showed this contract as "CLOSED" — but the board simultaneously listed it as "open" and the payment was withheld. The Phase 1 lie was "CLOSED." Phase 3 is when the HUD stops lying and shows the underlying status the system always had: PENDING. The contract was never closed. The payment was never settled. "CLOSED" was the HUD's Phase 1 courtesy. "PENDING" is what the record actually says.

The only line that ever resolved clean was "PAYMENT WITHHELD." That was the HUD's first honest statement and its last.

---

**The thesis:**

The HUD doesn't tell you who you've become. It doesn't need to. It stopped needing to somewhere around Phase 2. By Phase 3, it is simply showing you the system's version of events, which is the only version that will survive you.

The graffiti is more accurate than the HUD. Always has been. The graffiti doesn't have a database to maintain.

---

**Implementation notes (for missions.js / hud.js):**

- Phase 1: introduce the cargo weight bug (Chapter 01 prototype) as the template. All Phase 1 lies read as lag or bad sensors.
- Phase 2: manifest self-correction should fire when the player has completed B4 or crossed rep -100 with any law faction. No announcement. No notification. The player just starts noticing discrepancies if they're paying attention.
- Phase 3: implement as a late-game flag set at B6. The "PENDING" contract is a permanent entry injected into the mission log at the same time the endgame choice is presented — it cannot be cleared, it cannot be settled.
- The graffiti on the player's bulkhead ("THEY KNEW THE MASS") should re-appear at Phase 3 regardless of which painting-over cycles have occurred. This is the game's only callback to Chapter 01 that the player receives directly.
