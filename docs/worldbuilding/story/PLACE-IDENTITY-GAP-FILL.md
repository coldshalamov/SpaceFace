# Place Identity — Story Gap Fill (renderable landmarks)

Companion to `SECTOR-GRADIENT.md`. Canon gradient prose is unchanged; this doc names **what players should see**
at fixed anchors and why it matters narratively. Data IDs cite `design/world-identity/STORY_SECTOR_MAP.md`.

## City districts (approach readability)

Each sector band carries a **city silhouette** readable before the HUD names the station — Eve-style place memory.
Concept refs: `assets/concept/cities/concept_<slug>_city.jpg` indexed in `assets/concept/index.json`.

| Sector | City read | Narrative beat |
|--------|-----------|----------------|
| Helios Prime | Cyan ring-tower cluster, maintained window grids | Wealth that looks maintained because it is |
| Ceres Belt | Amber stack skyline, slag-lit lower decks | Ore money stacked vertically |
| Tethys Junction | Customs bastion + trade ring at lane crossing | Tycho Relay toll geometry |
| Vesta Forge | Forge cranes and radiator fins | Industrial ring hazard signage |
| Pallas Drift | Asymmetric scrap terraces (Hollow Station) | Graffiti layers as maintenance calendar |
| Io Reach | Weathered spine + contested cruiser wreck | Jurisdiction argued in silhouette |
| Charon Expanse | Cinder stacks in cold light | Rook market warmth vs spectrum |
| Skerris Deep | Container scrap hive | Pirate haven air-canister economy |
| Veil Nebula | Glass dome on maintained base | Vael hospitality dissonance |
| Ashfall Reach | Sealed-tank ledger architecture | Pit-smell recognition at the river end |

## S1 — Helios Prime (`sector_helios_prime`)

**Memorial Array** (`poi_memorial`, `place_station_billboard`): A lattice monument the maintenance crews keep lit even when graffiti elsewhere is painted over in 48 hours. It is the one place inner-sector grief is allowed to stay visible — licensed mourning.

**Helios Trade Ring** (`station_helios`, `place_station_trade_hub`): Pristine ring-and-tower silhouette. The corruption is invisible because the surfaces are maintained. Contracts signed here look legitimate because the architecture says they are.

## S2–S3 — Ceres Belt (`sector_ceres_belt`)

**Abandoned Driller** (`poi_driller`, `place_dead_hulk`): A rig that ran until the weight-variance review ate its payroll. Belt players recognize the silhouette before they read the manifest — ore extraction stopped, bureaucracy didn't.

**Meridian Refinery Stack** (`station_ceres`, `place_station_refinery`): Slag glow and triple stacks. The air smells adequate; the paperwork smells permanent.

## S2–S3 — Tethys Junction / Tycho Relay (`sector_tethys_junction`)

**Tycho Customs Bastion** (`station_customs`, `place_station_military`): Angular dish-and-bastion read at gate approach. MTS and Concord both claim the contracts board; the station claims the toll lane.

## S2–S3 — Vesta Forge (`sector_vesta_forge`)

**Forge Foundry** (`station_forge`, `place_station_fab`): Crane arm and forge glow. Module craft happens here under slag-radiation signage everyone learns to ignore.

## S4–S5 — Pallas Drift / Hollow Station (`sector_pallas_drift`)

**Smuggler Den** (`station_smuggler`, `place_station_blackmarket`): Asymmetric scrap cluster. Graffiti layers are the maintenance schedule. Voss's half-measures smell like sodium light and welded-on hope.

## S4–S5 — Io Reach / Bourse (`sector_io_reach`)

**Reach Trade Spine** (`station_reach`, `place_station_trade_hub`): Weathered hub at a contested junction. The cruiser wreck (`poi_cruiser`) is the landmark that tells you jurisdiction is negotiable here.

## S6–S7 — Charon Expanse / Cinder (`sector_charon_expanse`)

**Cinder Refinery** (`station_expanse`, `place_station_refinery`): Industrial warmth in cold spectrum lighting. Rook's bounty board is the only market that admits what "legitimate" means this far out.

## S6–S7 — Skerris Deep (`sector_sker_haven`)

**Skerris Black Market** (`station_sker`, `place_station_blackmarket`): Pirate haven silhouette — container scrap and stolen plates. Air canisters sold alongside everything else; nobody asks the secondary-market question.

## S8 — Veil Expanse (`sector_veil_nebula`)

**Veil Research Dome** (`station_veil`, `place_station_research`): Glass observatory on a maintained base. HUD marks OUTSIDER; the air is the best in the outer sectors. Dissonance is the point.

**Anomaly Signal** (`poi_anomaly`, `place_asteroid_seamed`): Sector-center seamed asteroid — the nebula heart readable from any gate bearing.

## S9 — Ashfall Reach (`sector_ashfall_reach`)

**Ash Cache** (`station_ashcache`, `place_station_blackmarket`): Kurtz ledger station on sealed tanks. The air is Pit air at the end of the river — recognition, not discovery.