# Character Sheet — The Kurtz Figure (The Witness)

```yaml
id: npc_kurtz
name: the Kurtz figure   # no name in canon; "a former Concord administrator"
role: off-grid record-keeper, derelict administrative station in Ashfall Reach
station_sector: world_ashfall (S9, behind the Iron Maw dreadnought)
faction: unaffiliated (Concord database lists status as "DECEASED — SECTOR INCIDENT")
voice_register: |
  Quiet, flat, eleven years of talking to no one on a working comms unit. Not
  raving. Not a villain. Two canonical lines: "I know what you're carrying. I
  knew before you got here. The mass is always the same. Only the manifest
  changes." And: "The count never ends. You know that. That's why you're here."
the_tell: |
  The wall above the desk: a hand-labeled chart of twenty years of atmospheric
  maintenance budget allocations, sector by sector, cross-referenced with
  faction holdings. The column marked "THE PIT" has no entries after year 3.
private_motive: |
  None active. They don't want anything. They're not asking to be rescued.
  Eleven years ago they found the complete ledger of the system's fraud and
  chose to *count* it instead of publish it, act on it, or burn it. They have
  been living inside that choice.
what_they_do_not_know: |
  Nothing — and the Dosto layer's deepening (`§III`) makes this the tragedy:
  the Kurtz figure chose the wrong mercy. The truth would require forty
  thousand people to do something about it; doing something about it would
  cost more than the truth is worth; so the truth went into a ledger instead
  of into the air. They have discovered, across eleven years of counting,
  that knowing was the one thing that changed nothing.
dostoyevsky_layer:
  theme: the_double + the_grand_inquisitor_variant
  expression: |
    The Kurtz figure is the player's possible future double — the version who
    found out and chose to count instead of act. The Grand Inquisitor variant
    (DOSTOYEVSKY-LAYER.md §III): the man who imprisoned the truth out of
    compassion for the people who'd have to act on it. The wrong mercy. The
    Inquisitor's compassion-argument made flesh, and discovered, across
    eleven years, to be the one choice that changed nothing.
  where_it_lands: B7 (the only chapter; the encounter past the Iron Maw)
graffiti: []   # "They don't write on walls. They write in the ledger."
canon_refs:
  - ../story/ENDGAME-B7-REDESIGN.md#the-kurtz-figure-ashfall-reach   # authoritative
  - ../story/STORY-STRUCTURE.md#b7-the-deep-reach
  - ../DOSTOYEVSKY-LAYER.md#iii-two-figures-deepened
appears_in_chapters: [B7]
```

## Quick facts

- 11 years off-grid. The station runs on sealed tanks and a patched recycler that took eleven years to get right. 14°C. Smells of hydraulic fluid over something organic the undersized scrubbers can't clear — the smell of the Pit's lower decks.
- The furthest point from the core is structurally identical to home. The player arrives at the end of the river and breathes the air they left behind.
- Holds: the complete ledger of every cargo transaction falsified in Sectors 1–6 over twenty years. Every Kessler weight, every Mira reroute, every Hale clearance. Handwritten, cross-referenced, with names attached.
- The player's callsign is in the ledger under COUNTERPARTY, six weeks before the player's first contract, filed under the ship's prior transponder ID.
- The ledger is a cargo item if taken: `PERSONAL EFFECTS — 1 UNIT / 0.4t`. Cannot be used as a weapon. Not leverage. Not admissible. The mass never changes, even if jettisoned.
