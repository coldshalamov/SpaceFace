# Character Sheet — Slate

```yaml
id: npc_slate
name: Slate
role: hull welder, Pit shipyard
station_sector: world_pit (S0, the Pit shipyard)
faction: unaffiliated (Pit labor)
voice_register: working — shipyard shorthand; "This'll hold till the next gate."
the_tell: "The torch cuts the same seam twice, the second pass narrower."
private_motive: |
  Runs a side business in bad welds — not for the skim, but for the
  *inventory*. Every ship Slate patches twice is a ship Slate knows the
  failure point of, kept in a private list the way a card counter keeps the
  deck. The list is Slate's retirement: one day the right ship comes through
  with the right owner and the right insurance, and the second pass is the
  thing that turns a repair job into a salvage claim.
what_they_do_not_know: |
  The right ship has not come through. The list grows. Slate has become a man
  who knows exactly how every hull in the sector will break and is waiting,
  with the patience of a man who has nothing else, for the one break that
  pays. Also: the double-pass narrow weld collapses Shaft 7's hopper, burying
  the stripped vault so nobody goes looking for what the legal transfer
  already moved — Slate never knows which patch Voss will file over.
dostoyevsky_layer:
  theme: crime_without_punishment_system_stolen
  expression: |
    The list of failure points is a retirement plan that is also a waiting
    murder, filed as inventory. None of it illegal. The system stamps the
    weld, accepts the second pass, and moves the ship along. The punishment
    Slate should accrue (for the ships that fail at the first pressure spike)
    is filed as wear. The collapse of Shaft 7's hopper is filed as geology.
  where_it_lands: B3 (the shipyard at the Pit, the ship named VARIANCE ADJUSTMENT nearby)
graffiti:
  - "THE WELD KNOWS WHO CUT IT TWICE."
canon_refs:
  - ../story/NPCs-CANONICAL.md#SLATE
  - ../story/NPC-ECOLOGY.md#the-graph
  - ../story/ATMOSPHERIC-ECONOMY.md#4-npc-dialog-atmospheric-jargon   # Slate dialog sample
  - ../DOSTOYEVSKY-LAYER.md#crime-without-punishment-system-stolen
appears_in_chapters: [B3]
```

## Notes

- Slate's atmospheric-economy dialog sample is canonical for the "I just weld steel, I don't grow air" deflection — the holy-fool-adjacent refusal that is *not* Hale's, because Slate's hands are on the torch. The deflection is structurally identical; the moral position is not.
- Slate + Voss are the cell-block pair (`NPC-ECOLOGY.md` — "three years in the same cell block"). The timing between a Slate patch and a Voss filing is the non-coordination that coordinates.
