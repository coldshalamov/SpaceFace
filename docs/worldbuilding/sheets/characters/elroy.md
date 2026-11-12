# Character Sheet — Elroy (The Unpunished Crime's Evidence)

```yaml
id: npc_elroy
name: Elroy
role: maintenance engineer (chief engineer, maintenance division), Pit Engineering
station_sector: world_pit (S0, the Pit)   # at time of death
faction: unaffiliated (Pit labor)
voice_register: |
  None — Elroy never speaks in the present tense. Elroy exists only in the
  past tense of a report filed six weeks before the player's first contract,
  and in the half-second flicker of a civilian tag at B2.
the_tell: |
  The report. "Noting that the primary atmospheric recycler catalyst grid had
  been decommissioned without authorization and the components had
  disappeared." That is the entire character — a clerical act of honesty that
  became a bounty tag.
private_motive: |
  Unknown. Probably none beyond the report. Elroy is the figure whose
  integrity is *not* load-bearing for the system (unlike Hale) — and is
  therefore expendable to it. Elroy did the honest thing. The system filed
  the honest thing as a sector-interference threat and tagged it.
what_they_do_not_know: |
  Everything. Elroy died not knowing that the report would be re-classified as
  "SECTOR INTERFERENCE — PIRATE THREAT" through Rook's booth, double-billed
  (two clients, one Vale's intermediary), and collected by the player at B2.
  The civilian tag flickers for 0.5 seconds before the kill feed overwrites
  it: BOUNTY COLLECTED.
dostoyevsky_layer:
  theme: crime_without_punishment_system_stolen   # the victim
  expression: |
    Elroy is the unpunished crime's evidence — and the player is the one who
    destroyed the evidence, filed as lawful. The Dosto beat lands here in its
    central form: the punishment that should have come (the player's guilt
    after killing a civilian) is administratively withheld by the kill feed
    overwrite. The absence is the wound. Elroy's name in the Kurtz ledger
    ("COUNTERPARTY — DECEASED (B2)") is the only place the original filing
    survives.
  where_it_lands: B2 (the kill), B7 (the ledger entry)
graffiti:
  - "THEY WERE CARRYING MEDICINE."   # the post-B2 graffiti — what Elroy was carrying was the only evidence the Pit's air was being killed deliberately
canon_refs:
  - ../story/STORY-SPINE-NARRATIVE-OVERLAY.md#b2-first-blood
  - ../story/NPCs-CANONICAL.md#ROOK   # the Elroy double-bill lives in Rook's entry
  - ../story/NPC-ECOLOGY.md#the-structural-reveal   # "Rook double-bills a bounty on the Pit's chief engineer (one Elroy)"
  - ../DOSTOYEVSKY-LAYER.md#crime-without-punishment-system-stolen
appears_in_chapters: [B2, B7]
```

## Notes

- Elroy is the load-bearing off-screen corpse. The player killed him at B2. The player does not learn what they killed until B6 or B7. The Kurtz figure's ledger has Elroy under "COUNTERPARTY — DECEASED (B2)." The "(B2)" refers to the player's second contract, not a sector.
- "THEY WERE CARRYING MEDICINE" is the central Dosto-as-graffiti line — the testimony the system tried to suppress, returning as the only voice that insists on the original filing. The graffiti is the punishment the system withheld.
- The B2 civilian tag (0.5-second flicker before BOUNTY COLLECTED) is the highest-leverage single UI moment in the game for the crime-without-punishment theme. Most players miss it the first time.
