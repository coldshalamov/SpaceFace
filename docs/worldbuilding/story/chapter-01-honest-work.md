# Chapter 01 — Honest Work (B1)

> **Beat theme:** `the_punishment_that_doesnt_come`. The cargo re-categorizes mid-transit; nobody flags it. The system's first mercy is the disease. (The Dosto inversion in miniature.)
> **HUD phase:** 1 (Protective). The manifest self-corrects silently. No notification.

---

## THE CONTRACT

The next contract on the Pit's board is already visible before the player has cleared the airlock from the first one. The board does not wait. The board never waits.

```
BOARD: ROUTINE ALLOY RUN — TYCHO.
HUD: CONTRACT ACCEPTED. CARGO: INDUSTRIAL COMPONENTS. MASS 12.0T.
```

Twelve tonnes this time. Not twelve-point-four. The number is different. The number is always different. The category is the same.

The player loads the cargo at the Pit's dock. The dock log timestamps the load. The crate seals are Concord ALA — the same seal authority as the first run. The player does not check the seal authority. The player checks the destination and the pay and the mass and undocks. This is what a courier does.

## IN-TRANSIT — THE RE-CATEGORIZATION

The transit to the neighbor station is short. Midway through, the manifest updates. The player does not see the update happen. The player sees only the current version.

```
MANIFEST [accept]:    SLOT01 INDUSTRIAL COMPONENTS 12000KG
MANIFEST [mid-transit, current]: SLOT01 SURPLUS REDISTRIBUTION — STANDARD 12000KG
```

The category changed in transit. INDUSTRIAL COMPONENTS became SURPLUS REDISTRIBUTION — STANDARD. The mass did not change. The seal did not change. The destination did not change. The category is the only field that moved, and it moved silently, and the HUD shows only the new value, and there is no log of the change.

The player, if they are paying very close attention, may notice. The HUD does not notify them. The HUD has never notified anyone. This is normal. This is what manifests do. The category field is descriptive — it describes the cargo for the destination's customs system. The customs system reads the current category. The customs system does not read the prior category. The prior category is in no log. The prior category did not happen, in the sense the system uses the word.

The cargo arrives. The destination logs it as SURPLUS REDISTRIBUTION — STANDARD. The original manifest is gone. The current manifest is the only manifest. The system has one version of events. The version is consistent.

```
HUD: DOCKING SEQUENCE. TYCHO RELAY.
HUD: AIRLOCK CYCLE COMPLETE.
HUD: CONTRACT CLOSED. PAYMENT: 340 CR.
```

The payment clears. The number is correct. The contract is marked closed and the board agrees it is closed, which is a courtesy the first contract did not receive.

## THE GRAFFITI THAT KNOWS

The graffiti at the Tycho airlock was not there when the player arrived. It is there when the player steps back through after payment.

```
GRAFFITI: REDISTRIBUTED TO THE HIGHEST BIDDER.
```

This is ambient graffiti. The player has not taken a contract called SURPLUS REDISTRIBUTION. The player has taken a contract called ROUTINE ALLOY RUN whose cargo was re-categorized mid-transit as SURPLUS REDISTRIBUTION — STANDARD. The graffiti uses the short form. The graffiti knows the category the cargo became. The graffiti knew before the player did.

This is the first instance of the graffiti knowing things the player hasn't done — or, more precisely, knowing the version of what the player did that the system filed, not the version the player remembers. The player remembers ROUTINE ALLOY RUN. The system filed SURPLUS REDISTRIBUTION. The graffiti reads the system's filing, not the player's memory.

## THE WEIGHT VARIANCE (ambient)

Tycho Relay's comms carry a low-grade migraine of popups. One of them, on a random cycle:

```
COMMS: TYCHO RELAY — WEIGHT VARIANCE NOTICE: SHIPMENT 47-A UNDER REVIEW. CONTACT KESSLER.
```

47-A is the first contract. The one marked CLOSED on the HUD and OPEN on the board, with PAYMENT WITHHELD. It is under review. It has been under review for twenty-two cycles. Contact Kessler has never resolved anything. The notice is ambient. The player may not connect it to their own run. Their run was not labeled 47-A in any text they read — the 47-A designation was in the contract's internal authorization line, which most players do not open.

The player can go to the Tycho scale and watch the weigher work. The weigher's thumb sits on the seal twice before the scan clears. The manifest logs before the scan clears. Later there will be a variance adjustment. The player does not know to look for it.

## THE MERCY THAT IS THE DISEASE

The player has now run two contracts. The first one withheld payment and the second one paid correctly and the difference between them is nothing the player did. The system withheld on the first and paid on the second according to a schedule the player did not set. The player was a courier in both. The system's treatment of the courier is independent of the courier.

The re-categorization mid-transit is the system's first mercy, and it is the disease. The cargo became what the destination needed it to be. The player did not have to lie. The player did not have to know. The system filed the correct category on the player's behalf, and the player's hands are clean, and the player's hands are clean because the system took the filing off them. The punishment that should come — the friction of having carried something other than what the manifest said — does not come. The HUD smoothed it. The player is innocent. The innocence is the problem.

This is the Dosto inversion the whole game is built on. The horror of crime is the psychological aftermath. The system is designed to prevent the aftermath. It files the crime as lawful, the cargo as standard, the killing as a bounty collected. The criminal never gets the collapse that would let them stop. The criminal keeps running contracts, innocent by every standard the system hands them, and the air in the Pit keeps getting worse, and the two facts are filed under the same code.

## THE AMBIENT ANOMALY (the plant)

There is one more popup at Tycho, on a slow cycle, that the player will likely never connect to anything:

```
COMMS: [CONCORD INTELLIGENCE — INTERNAL] FILE 44-C / BIOLOGICAL
       STATUS: UNRESOLVED. REVIEW CYCLE: CONTINUING.
       ASSESSMENT AUTHOR: ALDISS, R. / READING ROOM.
```

The popup is on a Concord Intelligence internal channel. The popup should not be on a civilian comms receiver. The popup is on the civilian receiver because the ATMO TOKEN brokerage's transfer-metadata encoding leaks these internal status lines into any civilian channel that routes through the Quiet's relay — which Tycho's does. The leak is the mole's channel. The player who reads the popup sees a name (ALDISS, R.), a room (READING ROOM), and a status (UNRESOLVED). The name means nothing. The room means nothing. The status means nothing. The popup is noise.

The player who reaches B7 and reads the ledger can come back to this popup — it is in the comms log, timestamped — and recognize the name and the room. The popup was the mole's signature, leaking through the channel the mole was using, into the civilian comms of the bait the mole's channel was flagging. The operation was always visible to the player who knew what to look at. The operation depended on the player not knowing what to look at. Both facts are filed under the same popup.

---

### Sheet wiring

| type | id | role in chapter |
|------|----|-----------------|
| character | `pc_wren` | protagonist |
| character | `npc_kessler` | the Tycho weigher (ambient; thumb on the seal) |
| world | `world_pit` | departure |
| world | `world_tethys` | Tycho Relay arrival; the variance notice |
| chapter-beat | B1 | honest-work; the-punishment-that-doesnt-come |

**Graffiti introduced:** `REDISTRIBUTED TO THE HIGHEST BIDDER.` (ambient; also canonical as Contract 04's graffiti — appears here *before* the player takes Contract 04, the first instance of the graffiti knowing)
**Manifests introduced:** the re-categorization `INDUSTRIAL COMPONENTS` → `SURPLUS REDISTRIBUTION — STANDARD`
**Comms introduced:** `TYCHO RELAY — WEIGHT VARIANCE NOTICE: SHIPMENT 47-A UNDER REVIEW. CONTACT KESSLER.`
**Dosto beat:** `the_punishment_that_doesnt_come` → `crime_without_punishment_system_stolen`. The re-categorization is the system filing the crime (misdescribed cargo) as lawful (standard redistribution) on the player's behalf. The player's innocence is the problem.

---

> **Canon refs:** `STORY-SPINE-NARRATIVE-OVERLAY.md#B1`, `COMMS-MICRO-POPUPS.md` (Tycho variance popup), `DOSTOYEVSKY-LAYER.md#crime-without-punishment-system-stolen`.
