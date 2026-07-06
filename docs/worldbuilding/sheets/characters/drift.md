# Character Sheet — Drift

```yaml
id: npc_drift
name: Drift
role: ore-ledger clerk, Meridian Exchange
station_sector: world_ceres (S2–S3, Meridian Exchange)
faction: faction_dmc   # Drift Miners Collective — note the name collision (see Notes)
voice_register: working — ledgers and excuses in the same flat tone
the_tell: "The ledger page turns before the scale settles."
private_motive: |
  Tells himself the moisture-loss entries are the cost of doing business in a
  system that underpays him, and the subsidiary code is the pension the
  exchange never funded. Paying it back, in his head, for sixteen years. The
  principal has never decreased.
what_they_do_not_know: |
  "The interest is the thing Drift doesn't call interest, because calling it
  interest would make him Kessler, and Drift is not Kessler." He will retire
  on the moisture loss. The moisture loss will retire him. These are the same
  sentence and Drift has not noticed. Also: the sub-tonne losses Kessler feeds
  him are the runoff of the Pit's air theft — Drift balances the Meridian
  Exchange ledger against them.
dostoyevsky_layer:
  theme: ressentiment_underground_man   # the denial register
  expression: |
    The Underground Man as a clerk who has reclassified his spite as a pension.
    The private arithmetic against the world — but gentled, denied, dressed as
    probity. He is Kessler with the honesty removed and the dignity intact.
  where_it_lands: B1 (the ledger that won't balance), B6 (the principal that never decreases)
graffiti:
  - "THE VEIN PAYS THE MAN WHO WEIGHS IT."
  - "(unattributed, lower, later): THE INTEREST IS WHAT HE DOESN'T CALL INTEREST."
canon_refs:
  - ../story/NPCs-CANONICAL.md#DRIFT
  - ../story/NPC-ECOLOGY.md#the-graph
  - ../story/ATMOSPHERIC-ECONOMY.md#4-npc-dialog-atmospheric-jargon   # Drift dialog sample
  - ../DOSTOYEVSKY-LAYER.md#ressentiment-underground-man
appears_in_chapters: [B1, B6]
```

## Notes

- **Name collision to watch:** the *character* Drift and the *faction* Drift Miners Collective share a name in canon. The character Drift works for the Meridian Exchange (MTS-adjacent), not the Drift Miners Collective. Treat them as separate entities. The faction sheet is `factions/drift.md`; this is the character.
- Drift's atmospheric-economy dialog sample (ATMOSPHERIC-ECONOMY.md §4) is the canonical voice: *"Vale's ledger showed a 0.4t discrepancy in the Silt allocation for Sector 4. I wrote it down as shipping loss. The exchange doesn't audit losses under a ton. But the air in Sector 4 is heavy this week. You can feel it in the calves when you walk the stairs."*
