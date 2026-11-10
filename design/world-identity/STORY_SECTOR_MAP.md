# Story ↔ Sector Data Reconciliation

Maps narrative sector bands (`SECTOR-GRADIENT.md`) to simulation IDs (`src/data/sectors.js`).
**Does not modify canonical story documents** — this table is the bridge layer only.

| Story band | Story place names (canon) | `sector_id` | Data `name` | Primary faction | Notes |
|------------|---------------------------|-------------|-------------|-----------------|-------|
| S0 | The Pit (labor colony origin) | — | — | — | Player backstory; tutorial plays in Helios, not a separate sim sector |
| S1 | Helios Prime (clean core) | `sector_helios_prime` | Helios Prime | `faction_scn` | Tutorial home; Vale / Logistics Oversight offices |
| S2–S3 | Tycho Relay | `sector_tethys_junction` | Tethys Junction | `faction_mts` | Contracts board, Kessler/Drift jobs, MTS vs Concord visible |
| S2–S3 | Meridian Exchange (industrial) | `sector_ceres_belt` | Ceres Belt | `faction_dmc` | Ore refining band; "weight variance under review" |
| S2–S3 | Forge industrial ring | `sector_vesta_forge` | Vesta Forge | `faction_dmc` | Module craft, slag radiation hazard |
| S4–S5 | Hollow Station | `sector_pallas_drift` | Pallas Drift | `faction_mts` | Voss territory; layered graffiti; Smuggler Den |
| S4–S5 | Bourse / contested lanes | `sector_io_reach` | Io Reach | `faction_free` | Gate 5 jurisdiction overlap; Reach vs Concord |
| S6–S7 | Cinder | `sector_charon_expanse` | Charon Expanse | `faction_dmc` | Rook; bounty board; pressurized air secondary market |
| S6–S7 | Skerris Deep | `sector_sker_haven` | Sker Haven | `faction_reach` | Pirate haven; gate-camped |
| S8 | Veil Expanse (Vael space) | `sector_veil_nebula` | Veil Nebula | `faction_free` / Vael | Best air in outer sectors; anomaly nebula |
| S9 | Ashfall Reach (endgame) | `sector_ashfall_reach` | Ashfall Reach | `faction_vael` | Pit-smell air; Kurtz ledger; boss arena |

> **S9 reconciliation (story ↔ mechanics).** The live boss content and the B7 narrative are both
> retained and staged sequentially: the **Iron Maw dreadnought** (`poi_boss`, spawns via
> `world.js:_spawnBossIfDue`, CI-gated) guards the sector's approach as the system's last
> enforcement; **past the dreadnought**, the player reaches the Kurtz figure's derelict
> administrative station and the wormhole threshold (Choice C). The existing `poi_vault`
> ("Ancient Vault") is re-skinned in the narrative as the Kurtz figure's sealed records cache —
> the takeable cargo is the ledger ("PERSONAL EFFECTS — 1 UNIT / 0.4t"), not legendary loot.
> `faction_vael` is retained in data as cosmetic-only (no Vael spawn logic keys off it for this
> sector's derelict). See `docs/worldbuilding/story/ENDGAME-B7-REDESIGN.md` §"Cross-reference notes"
> for the full staged-content breakdown.

## Name mismatches (intentional)

| Story name | Why data name differs |
|------------|----------------------|
| Tycho Relay | `sector_tethys_junction` — junction hub predates story rename; keep ID for saves |
| Hollow Station | `sector_pallas_drift` — drift market is the hollowed-out station fantasy |
| Skerris Deep | `sector_sker_haven` — haven ID locked in economy/mission refs |
| Cinder | `sector_charon_expanse` — expanse refinery is the Cinder industrial beat |

## Gradient ↔ palette class

| Band | Palette class | MASTER_TASTE mood |
|------|---------------|-------------------|
| S1 | `core` | Cyan/steel, maintained surfaces, licensed signage only |
| S2–S3 | `core` / `belt` | Yellow-white fluorescents slipping; rust/amber belt |
| S4–S5 | `fringe` | Sodium-red contested; graffiti layers |
| S6–S7 | `belt` / `fringe` | Functional wrong-lighting; air-canister economy |
| S8 | `anomaly` | Violet/green Vael hospitality dissonance |
| S9 | `anomaly` | Pit-temperature thin air; sparse old survey graffiti |