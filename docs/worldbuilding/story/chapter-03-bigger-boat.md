# Chapter 03 — Bigger Boat (B3)

> **Beat theme:** `the_double_appears`. The ship named VARIANCE ADJUSTMENT; the comms popup from Vale. The player begins to see themselves in the system's version of them.
> **HUD phase:** 1 (Protective). No anomalies. The branch choice sets `story.branch` cleanly.

---

## THE SHIPYARD

The player has credits. The player needs a bigger ship. This is the work — the cargo outgrew the hold, the bounties outgrew the hull, the next tier of contract requires the next tier of vessel. The Pit's shipyard is where the player goes. The shipyard is where Slate welds the double-pass seams. The player does not know about the double-pass seams. The player knows the shipyard is where ships are.

The shipyard has a ship on the berth with a name visible on the hull, if the player looks. Most players don't look at hull names. The name is:

```
HULL REG: TESSERA-VARIANT / NAME: "VARIANCE ADJUSTMENT" / PRIOR OWNERS: 3
```

Variance Adjustment. The name means nothing to the player. The name is Kessler's terminology — the variance adjustment is the line item Kessler files when the scale's thumb has done its work. Someone who worked the scales named this ship before they sold it. The ship has been through three owners. The transponder ID is a palimpsest. A rechristening stub in the hull registry shows the ship was renamed after a variance Kessler couldn't file.

The player does not buy this ship specifically — the player buys *a* tier-2 hull. But this ship is in the berth. This ship is the one the player walks past on the way to the purchase. The name is the tell, for the player who is already reading tells. The player is not yet reading tells. The player is buying a ship.

## THE COMMS POPUP

Mid-purchase, a comms popup slides in. The popup is not addressed to the player by name. The popup arrives on a shared channel. The popup is for the player anyway.

```
COMMS: [CONCORD RELAY 3 — FORWARDED ×4 STATIONS]
       "Your recent work has been noted. The board will have something
        appropriate for your current capacity."
```

No sender name. The header, if the player opens it (most don't), shows the message forwarded through four intermediate stations. One of the forwarding stations is Gate 3 — where Hale works customs. The message arrived the cycle after the player's first bounty. The cycle after B2. The cycle after the kill the system filed as BOUNTY COLLECTED.

The civilian reading: the message is from Director Vale. The second Vale sighting (the first was the authorization line on Contract 47-A). The pattern — Concord Relay 3, four forwards, one of them Gate 3 — is parseable, if the player is keeping a file. The system called the work good.

The operation reading: the message is from the Reading Room, forwarded *through* Vale's relay to look like Vale. "Your recent work has been noted" is the operation's first acknowledgment that the bait is working. *Noted* is the salon's word; the message is the handler's progress report, routed through Vale's relay to look like Vale.

## THE GRAFFITI

The graffiti at the shipyard was not there when the player arrived. It is there when the player walks back to the dock with the new ship's registration.

```
GRAFFITI: THE WELD KNOWS WHO CUT IT TWICE.
```

This is Slate's line. The player is buying a ship from a shipyard where Slate works. The graffiti is a warning about who repaired the hull last. The player is buying a hull someone repaired. The weld is in the hull. The weld knows. The player does not know to look at the weld.

## THE DOUBLE

The player is, for the first time, holding three things at once:

1. A new ship, bigger, capable of work the old hull couldn't carry. The ship has a history. The transponder ID is a palimpsest of prior owners. The player is the latest name on a ship that has had too many names to remember.
2. A comms popup, from a system that noted the player's recent work. The work was a killing filed as a bounty. The system called it good.
3. A piece of graffiti, at the place the player bought the ship, about a weld that knows who cut it twice.

The three things are simultaneous. The player is probably just buying a ship. The player is also, without knowing it, beginning to see themselves in the system's version of them. The system filed the killing as good work and sent a note. The system filed the player as the kind of operator who does this work. The system is correct. The player is that kind of operator now. The player became that kind of operator at B2, when the civilian tag flickered and the kill feed overwrote it and the payment cleared.

## THE WELDER'S INVENTORY (idiolect over the sound of consequence)

Slate is welding a patch on a hull two berths down while the player signs the purchase. Slate welds the way Slate talks: two passes, the second one narrower. The player can hear the torch through the bulkhead. Slate does not stop welding to talk. Slate talks over the torch, to nobody in particular, because the torch is Slate's constant and the talking is what Slate does to keep the inventory straight in his head.

"Variance Adjustment. Yeah. Kessler's word. He named it, I welded it, Rask bought it, Rask flew it into a cargo door at Tycho, Bima bought the wreck, I welded it again — second pass, narrower, same seam — and now it's yours. Congratulations. You're the fourth. The seam'll hold to the third pressure spike. It always holds to the third. The fourth is where it goes. Nobody's ever gotten to the fourth on a double-pass because nobody's ever pushed a second-pass hull that hard, but you look like you push things, so I'm telling you now: third spike, you're golden. Fourth spike, you come back, and I weld it again, second pass, narrower, and you pay me for the patch and the berth and I put it in the column and the column knows where every hull in this yard is going to fail and I've been building that column for twenty years and the column has never been wrong. The column's not a threat. The column's a retirement plan. Every hull I patch twice is a hull I know the failure point of. That's not sabotage. That's metallurgy. Metallurgy is patient. So am I."

The player is buying a ship from a man who knows exactly when the ship will break and who is waiting, with the patience of a man who has nothing else, for the right break to pay for the berth he's been quoting other people for twenty years. The right ship has not come through. The list grows. The failure points accumulate. The player's new ship is one more row in a column. Slate's column is a confession filed in weld-pass widths, and the retirement it's buying him does not exist, and the patience is real, and the torch keeps cutting the same seam twice, second pass narrower, the way it always has. One entry in the column is dated year 3. Same hand. Same seam.

The double is the self the system has on file. The player is walking around in the same body the system is filing under a callsign. The two are not yet distinguishable.

---

### Sheet wiring

| type | id | role in chapter |
|------|----|-----------------|
| character | `pc_wren` | the buyer |
| character | `npc_slate` | the shipyard welder (ambient; the double-pass seam) |
| character | `npc_kessler` | the ship name "VARIANCE ADJUSTMENT" is his terminology |
| character | `npc_vale` | the comms popup (second sighting) |
| character | `npc_hale` | the popup forwarded through Gate 3 where Hale works |
| world | `world_pit` | the shipyard |
| chapter-beat | B3 | bigger-boat; the-double-appears |

**Graffiti introduced:** `THE WELD KNOWS WHO CUT IT TWICE.` (Slate's line)
**Manifests introduced:** the `VARIANCE ADJUSTMENT` hull registration (the ship the player walks past)
**Comms introduced:** `[CONCORD RELAY 3 — FORWARDED ×4] "Your recent work has been noted..."` (Vale)
**Dosto beat:** `the_double_appears` → `the_double`. The system files the player as the kind of operator who does B2's work. The comms popup is the first time the system speaks to the player about the player. The ship's palimpsest transponder is the structural foreshadow: the player is the latest name on an identity the system has been filing longer than the player has owned it.

---

> **Canon refs:** `STORY-SPINE-NARRATIVE-OVERLAY.md#B3`, `NPCs-CANONICAL.md#SLATE`, `ANTAGONIST-THE-ADMINISTRATOR.md#b3-bigger-boat` (the comms popup), `DOSTOYEVSKY-LAYER.md#the-double`.
