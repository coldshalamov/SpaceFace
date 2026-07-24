# Chapter 00 — Cold Start (B0)

> **Beat theme:** `crime_before_the_criminal`. The player is already in the ledger before they act. The crime happened in year 3; the player is the latest courier. Guilt as a pre-existing condition.
> **HUD phase:** 1 (Protective). The HUD's lies read as malfunctions.

---

## PRE-FLIGHT (helios prime docking bay, before the first contract)

The cargo is already on the ship.

This is the part most players will skip. The hold has one crate in it before the player accepts anything. The manifest was loaded at dock. The dock log shows it was loaded six hours before the player stepped into the cockpit. The transponder ID on the loading ticket is the Tessera's — but the loading ticket was filed under a transponder ID the Tessera had *before* the player owned it. The system filed the cargo against the ship, not the pilot. The ship has been in the system longer than the pilot has.

```
MANIFEST: SLOT01 TITANIUM ALLOY 12400KG    [pre-loaded]
MANIFEST: SLOT99 UNCLASSIFIED COMPOSITE — 3.1 KG    [PERSONAL EFFECTS — DO NOT TRANSFER]
HUD: DEPARTURE CLEARED.
HUD: CONTRACT 47-A ACCEPTED. ALLOY RUN. MASS 12.4T.
```

The second manifest line is the fragment. It has been at the bottom of the list for six months, since the job that paid fifteen percent over market. It cannot be sold, jettisoned, or scanned. The game treats it as part of the ship. The player has stopped seeing it. It weighs 3.1 kilograms and it has been there for six months.

The first manifest line is the contract. The crate was on the dock before the player agreed to haul it. The player agreed to haul it because it was already on the ship and the alternative was unloading it, and unloading sealed Concord cargo under REG 44-C is the kind of thing that gets you flagged at the next gate. The player is a courier. The cargo was placed for the courier. The contract formalized an arrangement the loading bay had already made.

```
COMMS: [CONCORD LOGISTICS — DEPARTURE ACK] TESSERA / CONTRACT 47-A / ALLOY RUN / CLEAR.
```

The authorization line, if the player opens the full contract text (most don't), reads:

```
CONTRACT 47-A — AUTHORIZATION
APPROVED: VALE, D. / MID-SECTOR ADMIN / REF 44-C
```

The name means nothing to the player yet. The code means nothing. The line is in the document because the line is in every document. The player closes the contract text and undocks.

## IN-TRANSIT

Nothing happens. The transit is clean. The escorts the brief mentioned are on the manifest and then they are not on the manifest. The kill feed updates late. The player does not yet know to read the kill feed for what it overwrites, only for what it prints.

```
HUD: WAYPOINT 01.
KILLFEED: ESCORT-02 ELIMINATED.
KILLFEED: ESCORT-01 ELIMINATED.
KILLFEED: CARGO DRONE 03 LOST.
KILLFEED: UNKNOWN VESSEL DEPARTED.
HUD: RETURN VECTOR SET.
```

The HUD calls the cargo STABLE LOAD. The line stays on screen after the cargo is gone. The player can toggle it off. The line stays. This is a bug, or a feature, or a provision of REG 44-C. The HUD does not distinguish.

## ARRIVAL (the pit)

```
HUD: DOCKING SEQUENCE. THE PIT.
MANIFEST: SLOT01 TITANIUM ALLOY 00000KG.
HUD: AIRLOCK CYCLE COMPLETE.
GRAFFITI: THEY KNEW THE MASS.
HUD: CONTRACT 47-A CLOSED.
HUD: PAYMENT WITHHELD.
HUD: NEW CONTRACTS AVAILABLE.
```

The weight is gone. The manifest says zero. The contract is marked closed. The payment is withheld. The board still lists 47-A as open. The three statuses do not reconcile. The HUD does not reconcile them. The HUD has never reconciled them. This is the system's resting state.

The graffiti is on the inside of the airlock door, in the same stencil font the station uses for intake numbers. One line. It is not signed. It is not explained. It is simply there when the player steps through.

The HUD never updates the STABLE LOAD line. Three cycles later it reads STABLE LIE. The player did not change it. The maintenance log did not change it. The line changed itself, the way lines change in this system — not by edit, but by the original filing finally being honored.

## THE COLD START

The player has not done anything yet. The player has run one contract — the contract that was placed on their ship before they accepted it, filed against their ship's prior identity, authorized by a name they did not read, carrying weight that disappeared between waypoints, paid for with a withholding. The player is already in the ledger. They were in it before they stepped into the cockpit.

The crate in the hold — the one labeled UNCLASSIFIED COMPOSITE — 3.1 KG — sits where it has always sat. It will sit there for the entire game. It is the second fragment. It is the reason Wren started looking again, six months ago, when a job went wrong and something he hadn't seen since he was twelve was sitting in the cargo hold wrapped in packing foam and mislabeled as industrial composite. The player does not know this yet. The player may never know this. The crate is inventory the game treats as part of the ship.

The mass is 12.4 tonnes. The mass was always going to be 12.4 tonnes. The crime happened in year 3. The player is the latest courier. The graffiti knew.

## THE DOCKMASTER'S MATH (the argument that doesn't need a body)

The Helios dockmaster who took the berth fee did not look up. The fee was posted. The fee was paid. The transaction occupied the dockmaster for the length of time it takes a man to stamp a chit and slide it back. The dockmaster has stamped eight thousand chits this cycle. The dockmaster will stamp eight thousand more. The dockmaster is not a villain. The dockmaster is arithmetic.

What the dockmaster knows: berth fees fund the maintenance fund, the maintenance fund funds the recycler service, the recycler service funds the air. The Pit's berth fees fund the Pit's air. The Pit's berth fees have funded the Pit's air every cycle for nineteen years. The Pit's air has been poison for fourteen. The dockmaster has processed nineteen years of berth fees for the Pit's air and the air is gone and the fee cleared both times — the fee that was paid and the air that didn't arrive. The two line items do not reconcile. The dockmaster does not reconcile them. The dockmaster stamps the chit. The chit is the reconciliation. The chit says the fee cleared and the air is funded and the column balances and the column has balanced for nineteen years and the Pit's lower decks have breathed chalk for fourteen. The math works. The math has always worked. The math is why the air is gone.

The player is not asked to understand this at B0. The player is asked to pay the berth fee. The player pays the berth fee. The chit is stamped. The dockmaster does not look up. The argument was made in 19 years of chits and it doesn't need the player's comprehension to close. It closes the way it closes every cycle. The math is sound. The math is the disease.

---

### Sheet wiring (entities this chapter touches)

| type | id | role in chapter |
|------|----|-----------------|
| character | `pc_wren` | protagonist; the crate in the hold is his reason |
| character | `npc_vale` | authorization line (Vale, D. / REF 44-C) — first sighting |
| world | `world_helios` | departure |
| world | `world_pit` | arrival; the graffiti |
| commodity | `com_refined_slurry` | the 12.4t was the recycler grid pre-loaded with Silt (player doesn't know) |
| commodity | `com_atmo_debt` | the trap manufactured in year 3 (player doesn't know) |
| chapter-beat | B0 | cold-start; crime-before-the-criminal |

**Graffiti introduced:** `THEY KNEW THE MASS.` (first appearance)
**Manifests introduced:** `SLOT01 TITANIUM ALLOY 12400KG` → `00000KG`; `SLOT99 UNCLASSIFIED COMPOSITE — 3.1 KG [PERSONAL EFFECTS]`
**Comms introduced:** `[CONCORD LOGISTICS — DEPARTURE ACK]`; the Vale authorization line
**Dosto beat:** `crime_before_the_criminal` → `guilt_as_physiology`. The player is already implicated before they act. The STABLE LOAD line that won't clear is the body keeping the score — the first instance of a HUD line that persists past its useful life, the system's refusal to let the cargo be gone.

---

## THE SECOND READING (Le Carré layer — not on first playthrough)

There is a forwarding chain on the departure acknowledgment that doesn't quite make sense. The player who opens the full comms header (almost no one) finds the ack routed through a station that has no reason to be on a Concord Logistics departure chain. The station is a Listening Post designator. The designator means nothing to the player. The designator is the operation's signature.

```
COMMS HEADER [full, if opened]:
  CONCORD LOGISTICS — DEPARTURE ACK
  ROUTE: TESSERA → [CONCORD LP-7] → GATE 3 → DESTINATION
  AUTH: VALE, D. / MID-SECTOR ADMIN / REF 44-C
  CO-AUTH: [FIELD REDACTED — REF 44-C]
```

The `CO-AUTH: [FIELD REDACTED]` line is on every Concord Logistics authorization. The player has been seeing it the whole game. The redaction is standard. The redaction is also the operation. The co-author is the Reading Room. The departure ack was filed before the player accepted the contract because the operation needed the cargo on the ship before the civilian contract was signed — the operation's controlled leak had to be in civilian logistics *before* the civilian courier existed, so that the mole's channel would flag the cargo's movement as a leak rather than as a deployment. The player is not just pre-filed in the ledger. The player is pre-cast in the operation.

This reading does not invalidate the civilian reading. The cargo was still pre-loaded. The crime still happened in year 3. The player is still the latest courier. The second reading adds: the latest courier was selected, the cargo was placed, the departure was authorized by a co-author whose field is redacted. The player who reaches B7 and reads the ledger can come back to this header and read it differently. The player who doesn't has the first reading intact. Both are true. The operation depends on both being true.

---

> **Canon refs:** `STORY-SPINE-NARRATIVE-OVERLAY.md#B0`, `STORY-STRUCTURE.md#thread-b-beats` (B0–B1), `chapter-01-CANONICAL.md` (the existing first-run script this builds on), `DOSTOYEVSKY-LAYER.md#guilt_as_physiology`, `LECARRE-LAYER.md#controlled-leak-and-the-honey-trap`, `LECARRE-LAYER.md#iii-the-drummer-girl-thread-staged-reveal`.
