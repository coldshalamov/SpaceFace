# Chapter 06 — Empire Seed (B6)

> **Beat theme:** `guilt_returns_as_physiology`. The player's own graffiti appears in their own hand. The HUD's Phase 3 begins. The body keeps the score: the Slow Gray the player didn't know they were in.
> **HUD phase:** 3 (Absent) begins. The HUD stops distinguishing between what is true and what is convenient.

---

## THE PASSIVE ASSET

The player deploys their first passive asset — a mining drone, an NPC trader, or an outpost plot. The asset begins generating income. The income is real. The first deposit arrives with a note in the transaction record:

```
LEDGER: REMITTANCE FROM ASSET DEPLOYMENT
        CLEARED: VALE HOLDINGS LLC
```

The player's asset income is being processed through Vale's clearing system. This was always the case. The player just started generating enough income for the line to appear in their ledger. The line is in the secondary log — visible if the player opens the full transaction record, not visible in the summary. Most players don't open the full transaction record. The line sits there. The income clears through Vale's system regardless of whether the player sees it. The player's success routes through the same administrator as their contracts. The system has one clearing layer. The player is in it.

## THE SETTLEMENT OFFER

```
COMMS: [D. VALE / ADMIN / PRIORITY]
       CONTRACT 47-A has been re-opened for settlement. Payment pending.
       Please advise availability.
```

This is the first run. The contract that withheld payment. The contract that was marked CLOSED on the HUD and OPEN on the board. The contract that has been under review at Tycho for twenty-two cycles. The payment amount is correct. The player can accept or decline.

If the player accepts: the original amount pays out. The player is added to a roster. The roster will appear, later, in the Kurtz figure's ledger at B7, as a named asset. The player's callsign will be in the ledger the Kurtz figure has been keeping for eleven years.

If the player declines: nothing changes. The income from the passive asset continues to clear through Vale's system regardless. The settlement offer was a courtesy. The arrangement was already in place. The offer only formalized it.

The system does not require the player's consent. The system requires the player's signature, which is different. The signature makes it legal. The signature does not make it a choice.

The operation reading: the offer is the handler formalizing the bait's status before B7. The operation needs Wren to reach Ashfall Reach with the fragment. A Wren whose 47-A status is settled is a Wren whose routing is clean — whose transponder doesn't trip a flag at the wormhole checkpoint, whose manifest doesn't get audited at the inner-sector gate. The settlement is operational housekeeping. The "courtesy" is the salon's word for it. The arrangement — Wren as named asset, on the roster, routed toward Ashfall — was the operation's plan all along. The signature Wren gives or withholds does not change the route. The route was filed six weeks before B0.

## THE GRAFFITI IN THE PLAYER'S OWN HAND

The player returns to their ship. The player's own airlock has graffiti on it. The graffiti was not there when the player left. The graffiti is in the player's own hand.

```
GRAFFITI [player airlock, player's hand]: THEY KNEW THE MASS.
```

The player does not remember writing this. The player did write it — or the player's body did, during the micro-episodes of oxygen-deprived sleep that the underspec recycler on the Tessera induces, the same way the Pit's lower decks induce them. The player has been breathing degraded air. The player has been in the Slow Gray. The player did not know. The graffiti is the body keeping the score the mind refused to.

The superstition from the spacer canon: *Never write graffiti in your own airlock. The airlock is the threshold. What you write there is what you're carrying.* The player was never told this superstition. The player finds out, at B6, why it existed. The airlock is the threshold. The player wrote what they were carrying. The player was carrying the mass — the 12.4 tonnes, the killing at B2, the years of contracts filed as lawful. The body wrote it down.

This is the central Dosto bridge landing in the player's own ship. The guilt did not arrive as confession. The guilt arrived as physiology — as the slow gray, as the sleepwalking hand, as the graffiti the player doesn't remember writing in their own airlock. The body metabolized the moral weight the system refused to file. The body wrote it on the wall.

## THE PHASE 3 HUD

The HUD's Phase 3 begins here. The HUD has stopped distinguishing between what is true and what is convenient. Not because it malfunctioned — because the distinction no longer serves any purpose it recognizes.

```
HUD [transponder registry]: TESSERA / STATUS: ACTIVE / OPERATOR: UNKNOWN.
```

The player's name has been removed from the vessel registry. Not deleted — the field reads UNKNOWN. The removal date is the same date as the B5 cargo audit. The player's identity now has too many versions for the system to resolve. The system files the ship under the ship. The operator is unknown. The operator is whoever the system filed under the prior transponder ID, six weeks before the player's first contract. The operator is the double.

The HUD shows the player's rep bars as stable numbers that stopped reflecting real values somewhere in B5. The player can verify this by visiting a station and getting a different price than the rep multiplier should give. The HUD does not reconcile the gap. The HUD has stopped reconciling. The HUD is now showing the system's version of events, which is the only version that will survive the player.

## THE SLOW GRAY (the player is in it)

The player has been in the Slow Gray since the Pit. The player's ship runs on recycled air from an original-equipment recycler that hasn't been serviced since before they got the ship. The player breathes Pit air in transit. The player's hands shake and the player calls it the reactor. The graffiti at the dock, ambient, knows:

```
GRAFFITI [ambient]: THEY KNOW WHY YOUR HANDS SHAKE.
```

The graffiti doesn't explain. The player's logs have the answer if the player checks the Pit's ATMO DEBT column versus year 3. The answer is fourteen years of deferred Silt maintenance. The answer is the recycler grid that left Shaft 7 on a clean manifest and is gathering dust in a Helios bay. The answer is the air. The player has been breathing the answer the whole game.

This is the Dosto layer's load-bearing bridge: guilt as physiology, the body keeping the score, the climate of complicity indistinguishable from the air. The system filed the killing as lawful. The body filed it as a tremor. The body filed it as sleepwalking. The body wrote THEY KNEW THE MASS on the airlock in the player's own hand. The mind, the HUD, and the manifest agree to call it tiredness. The graffiti refuses.

---

### Sheet wiring

| type | id | role in chapter |
|------|----|-----------------|
| character | `pc_wren` | the body that wrote the graffiti; the Slow Gray he's in |
| character | `npc_vale` | "D. VALE / ADMIN / PRIORITY"; "CLEARED: VALE HOLDINGS LLC" |
| character | `npc_kurtz` | the roster the player joins (if they accept) appears in the Kurtz ledger |
| world | `world_pit` | the source of the Slow Gray the player is breathing |
| commodity | `com_atmo_debt` | the column the player can check |
| chapter-beat | B6 | empire-seed; guilt-returns-as-physiology |

**Graffiti introduced:** `THEY KNEW THE MASS.` (re-appearance, in the player's own hand, on the player's own airlock — the callback to B0/chapter-00); `THEY KNOW WHY YOUR HANDS SHAKE.` (ambient)
**Manifests introduced:** `REMITTANCE FROM ASSET DEPLOYMENT / CLEARED: VALE HOLDINGS LLC`; `TESSERA / STATUS: ACTIVE / OPERATOR: UNKNOWN`
**Comms introduced:** `[D. VALE / ADMIN / PRIORITY] CONTRACT 47-A has been re-opened for settlement...`
**Dosto beat:** `guilt_returns_as_physiology` → `guilt_as_physiology`. The central bridge. The player's body wrote what the player's mind wouldn't file. The Slow Gray is the moral weight metabolized as climate. The HUD entering Phase 3 is the system giving up the distinction the body already gave up.

---

> **Canon refs:** `STORY-SPINE-NARRATIVE-OVERLAY.md#B6`, `HUD-META-ARC.md#phase-3-absent`, `SPACER-SUPERSTITIONS.md` (the airlock-graffiti superstition), `vibe/vibe-04-the-pit.md#specifics-the-air-economy` (the Slow Gray), `DOSTOYEVSKY-LAYER.md#guilt_as_physiology`.
