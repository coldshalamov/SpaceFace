# Chapter 04 — Pick a Side (B4, branch)

> **Beat theme:** `grand_inquisitor_ui`. Three doors, same administrator. The illusion of factional moral difference. (The Brothers Karamazov's "all permitted vs all responsible" refracted as a UI.)
> **HUD phase:** 1 (Protective). No anomalies. The branch choice sets `story.branch` cleanly.

---

## THE CLEARING STATION

The player has rep and credits enough to pick a side. The three faction intro contracts — Traders Guild (MTS), Patrol Authority (Concord), Free Captains (Reach-adjacent) — all route through the same clearing station. The station is in the contested band. The station is neutral on the map. The station is not neutral in its records.

The player docks. The contracts board shows three entries. The three entries are the three doors. The player picks one. The branch is set. The game's middle act begins.

```
BOARD [Traders Guild]:    BULK TRADE RUN — CLEARING STATION ROUTE.
BOARD [Patrol Authority]: PATROL CLEAR — GATE JURISDICTION.
BOARD [Free Captains]:    SEALED FREIGHT — DISCREET ROUTE.
```

The three contracts are different. The three contracts run through the same administrator. The player does not see the administrator. The player sees the board. The board is the UI.

## THE ADMINISTRATOR FIELD (the Grand Inquisitor door)

The clearing station's records, if the player opens them (almost no one opens station records), show the administrator field. The field reads:

```
STATION RECORDS — CLEARING STATION
ADMINISTRATOR: V. DIRECTOR, ACTING
GOVERNANCE: REF 44-C
```

V. Director. Acting. The field is filed under REF 44-C — the same code that governs Hale's customs infractions, Vale's contract authorizations, and the atmospheric viability scoring. The field is parseable, if the player is looking for it. This is the second Vale sighting (third, if the player counted the B3 comms popup). The name "V. Director, acting" is designed to be parseable. The design is that it is parseable and that almost no one parses it.

The three doors all run through the same administrator. The player who picks the Traders Guild runs through V. Director. The player who picks Patrol Authority runs through V. Director. The player who picks Free Captains runs through V. Director. The three factions are distinct. The system they operate in is not. The choice is real. The choice changes the contracts the player can take and the rep the player gains. The choice does not change the administrator.

## THE THREE CONTRACTS UNDERNEATH

The three contracts, beneath the board text, route through three different nodes of the eight-NPC ecology. The player does not see this. The player sees the board text. The player picks a door. The door opens onto a different part of the same machine.

- **Traders Guild** routes through a Meridian-adjacent ledger. Drift's territory. The bulk trade runs through the exchange where the moisture-loss entries are filed.
- **Patrol Authority** generates a patrol_clear report filed under Hale's gate jurisdiction. Gate 3. The same gate. The same scanner. The same second fine.
- **Free Captains** is a smuggling run that Mira's freight system processes on the back end. Bourse. The same code-swap. The same seal that was never yours.

The player picks a side. The side is a door. The door opens onto the same administrator. The administrator is filed under the same code. The code is the same code that runs through every corrupt transaction in the sector like a thread through a needle.

## THE GRAFFITI

The graffiti at the clearing station is MTS faction graffiti, appearing as ambient — appropriate because the clearing station is MTS-adjacent, and because the line applies to every side of the B4 choice.

```
GRAFFITI: EVERY MAN PAYS TWICE. FIRST IN FLESH. THEN IN COIN.
```

The line applies to the Traders Guild contract (coin first, flesh second). The line applies to the Patrol Authority contract (flesh first — the patrol clears a lane by removing bodies, then files the coin). The line applies to the Free Captains contract (flesh and coin indistinguishable; the smuggler's body and the smuggler's cut are the same ledger entry). The player picks a door. The graffiti applies regardless.

## THE GRAND INQUISITOR UI

The Dosto beat here is the structure of the choice itself. The Brothers Karamazov's "all permitted vs all responsible" — the Inquisitor's argument that people would be happier without the unbearable freedom of moral choice — refracted as a contracts board UI. The board offers three doors. The three doors are all the same door. The choice is real (the gameplay changes). The choice is also a mercy (the player does not have to choose *whether* to participate; the player participates by picking). The system has arranged things so that the moral question — *do you participate in this* — is never asked. The system asks only *how*. The how is three doors. The player picks how. The whether was settled at B0, when the cargo was loaded on the ship before the player accepted it.

The Inquisitor's compassion-argument, made UI: the truth (all three doors open onto the same administrator) would require the player to refuse all three, and refusing all three is not an option at B4. Refusing all three becomes an option only at B7, in the form of Choice E, and only after the player has declined four other options. The system does not offer the refusal at B4. The system offers the refusal only after the player has spent thirty hours becoming the kind of operator the system files under a callsign.

The player picks a side. The side is a door. The door is the system's mercy. The mercy is the disease.

---

### Sheet wiring

| type | id | role in chapter |
|------|----|-----------------|
| character | `pc_wren` | the picker |
| character | `npc_vale` | "V. Director, acting" — the administrator behind all three doors |
| character | `npc_drift` | Traders Guild routes through his ledger (player doesn't see) |
| character | `npc_hale` | Patrol Authority files through his gate (player doesn't see) |
| character | `npc_mira` | Free Captains runs through her freight system (player doesn't see) |
| faction | `faction_mts` | Traders Guild door |
| faction | `faction_scn` | Patrol Authority door |
| faction | `faction_reach` | Free Captains door |
| world | `world_io` | clearing station in the contested band |
| chapter-beat | B4 | pick-a-side; grand-inquisitor-ui |

**Graffiti introduced:** `EVERY MAN PAYS TWICE. FIRST IN FLESH. THEN IN COIN.` (MTS faction graffiti, ambient here)
**Manifests introduced:** the `V. DIRECTOR, ACTING / REF 44-C` station record
**Comms introduced:** none (the choice is the board)
**Dosto beat:** `grand_inquisitor_ui` → `the_double`. Three doors, one administrator. The choice is real (gameplay) and a mercy (the whether is never asked). The Inquisitor's compassion-argument as a contracts UI: the unbearable freedom is the freedom to refuse, which the system does not offer until B7.

---

> **Canon refs:** `STORY-SPINE-NARRATIVE-OVERLAY.md#B4`, `ANTAGONIST-THE-ADMINISTRATOR.md#b4-pick-a-side`, `orgs/factions-CANONICAL.md#Meridian Trade Syndicate`, `DOSTOYEVSKY-LAYER.md#the-double`, `DOSTOYEVSKY-LAYER.md#iii-two-figures-deepened` (the Grand Inquisitor variant).
