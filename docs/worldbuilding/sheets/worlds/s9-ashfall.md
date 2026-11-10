# World Sheet — S9 Ashfall Reach

```yaml
id: world_ashfall
story_band: S9
canon_place: Ashfall Reach (endgame)
data_sector_id: sector_ashfall_reach
primary_faction: faction_vael   # cosmetic in data; canon = unclaimed/derelict (see notes)
air_smell_line: "Pit air at the end of the river. Hydraulic fluid over something organic the undersized scrubbers can't clear. Recognition, not discovery."
temperature: 14°C   # the temperature of being alive in the Pit
spectrum: low; reserve atmosphere only
maintenance_cycle: sparse old survey graffiti; the Kurtz figure doesn't write on walls, they write in the ledger
signature_landmark: Ash Cache (station_ashcache / place_station_blackmarket) + Boss Arena Signal (poi_boss) + Ancient Vault (poi_vault)
placement_id: place_station_blackmarket
dostoyevsky_layer:
  theme: the_double met + the_grand_inquisitor_variant
  expression: |
    Ashfall is the furthest point from the core, and it smells like the Pit.
    The recognition is supposed to land wrong: the darkness at the end of the
    river isn't alien, it's home. Past the Iron Maw dreadnought (the system's
    last enforcement), the Kurtz figure is the player's possible future double
    — the version who found out and chose to count instead of act. The Grand
    Inquisitor variant: the man who imprisoned the truth out of compassion
    for the people who'd have to live differently once they knew.
  where_it_lands: B7 (the only chapter; the five Choices)
canon_refs:
  - ../../story/SECTOR-GRADIENT.md#s9-ashfall-reach
  - ../../story/ENDGAME-B7-REDESIGN.md#the-kurtz-figure-ashfall-reach
  - ../../story/PLACE-IDENTITY-GAP-FILL.md#s9-ashfall-reach
  - ../../../../design/world-identity/sectors/sector_ashfall_reach.md
  - ../../../../design/world-identity/STORY_SECTOR_MAP.md#s9-reconciliation-story-mechanics   # boss-reconciliation note
appears_in_chapters: [B7]
```

## The reconciliation (story ↔ mechanics)

The live boss content and the B7 narrative are **both retained and staged sequentially** (per owner decision, iteration-04):

1. **The Iron Maw dreadnought** (`poi_boss`, spawns via `world.js:_spawnBossIfDue`, CI-gated) guards the sector's approach as the system's last enforcement. Mechanical gate. Spawns once per entry, stays defeated once killed.
2. **Past the dreadnought**, the Kurtz figure's derelict administrative station. 14°C. Pit smell. The wall chart. The ledger.
3. **The Ancient Vault** (`poi_vault`, hidden) is re-skinned in narrative as the Kurtz figure's sealed records cache — the takeable cargo is the ledger (`PERSONAL EFFECTS — 1 UNIT / 0.4t`), not legendary loot.
4. **The Wormhole Threshold** (Choice C jump-without-destination prompt) — not a normal gate.

`faction_vael` is retained in `src/data/sectors.js` as cosmetic-only (no Vael spawn logic keys off it for this sector's derelict). See `design/world-identity/STORY_SECTOR_MAP.md` "S9 reconciliation" note for the full staged-content breakdown.

## Notes

Ashfall Reach is the end of the river. The journey from Helios (light, warm) to Ashfall (dark, cold, Pit-smelling) is structurally identical to Marlow's journey inward — but the recognition is not horror at the unknown, it's recognition of the already-known. The furthest point from the core is structurally identical to home. The player arrives at the end and breathes the air they left behind.

The wormhole Veil→Ashfall is one-way and tech-gated (`tech:tech_long_range_survey`). Ashfall is reached late. The Kurtz figure's station can be *scanned* in the outer reaches ("SCAVENGER — UNKNOWN" / "DERELICT — LONG-FORM TRANSMISSION") but cannot be *docked* until the Iron Maw is defeated — the boss is the gate.
