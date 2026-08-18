<!-- LIFETIME: DURABLE -->
# NPC Work Fleet — design record (PQ-045.npc-identity)

Four occupational whole-ships re-authored from the `npc_activity_pack` donor
silhouettes, giving four traffic presentation roles distinct hulls on the default
route. Donor boundary: the independent review (2026-08-08) keeps the pack as
source-only donors; this family re-authors form and material zones and authors
the LODs the donors lacked. Nothing is copied from donor geometry.

## Role map

| Family | Traffic `presentationRole` | Ship def (stats) | Label | Where it appears |
|---|---|---|---|---|
| `ore_barge` | `ore_carrier` (NEW) | `ship_ironback` | Ore Barge | ambient mix; boosted in declared mining/refinery sectors |
| `repair_tender` | `tender` | `ship_drifter` | Repair Tender | ambient mix + Ceres refinery cast slot |
| `salvage_cutter` | `salvor` | `ship_pelican` | Salvage Cutter | ambient mix + Ceres cathedral cast slot |
| `survey_pin` | `surveyor` | `ship_ranger` | Survey Rig | ambient mix + Ceres seam cast slot |
| `rescue_lifter` | `rescue` (existing) | `ship_drifter` | Rescue Craft | ambient mix; replaces the unmarked Drifter stand-in |
| `volatiles_tanker` | `tanker` (NEW) | `ship_atlas` | Volatiles Tanker | ambient mix; boosted in mining/refinery. Never `hauler`. |
| `prospector_skiff` | `prospector` (NEW) | `ship_pelican` | Prospector Skiff | ambient mix; boosted on rock sectors. Never `miner`. |
| `scrap_sweeper` | `sweeper` (NEW) | `ship_pelican` | Scrap Sweeper | rare ambient civic cleanup |
| `yard_tug` | `tug` (NEW) | `ship_mule` | Yard Tug | high-security apron traffic |
| `inspection_cutter` | enemy `customs_cutter` | `ship_hornet` stats | Customs Cutter | hostile presentation map only; patrol stays Wasp |
| `apron_shuttle` | `shuttle` (NEW) | `ship_drifter` | Apron Shuttle | short berth-to-site people boat. Not `express`. |

`customs_cutter` is deliberately excluded (its id collides with a live hostile
encounter archetype). The ore barge is NOT wired under `hauler`: `hauler` is the
accepted `helios_span`, and a barge row under `hauler` would replace it in every
sector.

## Silhouette commitments (from the fiction dossier)

- **Ore Barge** — 44 m open-topped bulk carrier: six ore baskets in two rows of
  three with ore mounds loaded proud, bow-pivot loading boom (a shovel, never a
  drill), armor over the forward third, flood masts aimed into the baskets,
  small drives on a short spine.
- **Repair Tender** — broad flat-flanked freighter frame, more workshop than
  ship: port plate rack with six skins clamped like books, starboard bow weld
  boom with lamp-petal head, dorsal umbilical drum + soft-dock collar, ventral
  crew rails, four corner lamps, white do-not-push bar across the cold drive.
- **Salvage Cutter** — patched freighter grey with mismatched plates and one
  bright unpainted replacement; hooded amber umbrella lamps aimed DOWN on
  articulated arms; hydraulic plate-shears on the starboard bow knuckle parked
  jaw-open; tether reels at both hips; open-backed scrap cradle aft; chained
  drum stack on the dorsal spine.
- **Survey Pin** — slender 22 m hull, dorsal sensor truss half its length, two
  array paddles spread like moth wings, range-mast triangle at the tail, cold
  boom pin crabbing 90° off the nose, one cold-blue strip, external gel drums.

## Material bill (classified substances; no DCC defaults)

Canonical house roles, response-identical to the accepted Helios civilian fleet
so faction palette tinting, ORM packing, canopy classification and damage reads
behave identically:

- `Material_Hull` — painted structural alloy (dielectric coat; rough ~0.68,
  metal 0.0; panel-seam/fastener dirt only, no whole-surface clay mottling).
- `Material_Mechanical` — brushed graphite machinery alloy (metal ~0.97,
  rough ~0.14; directional brush, localized aft heat band).
- `Material_Cyan` — matte signal composite, cold emissive (survey instruments,
  tender weld lens, drive cores).
- `Material_Warm` — oxidized service amber, warm emissive (ore mounds, work
  lamps, patch plates, tether rims, gel drums).
- `Material_Glass` — physical canopy glass (runtime canopy contract).

Maps: deterministic role-classified procedural PBR (baseColor/ORM/normal),
1024² for hull/mechanical, 512² for accents; ORM R carries the AO bake, bound
to the occlusion slot at publish. LODs: LOD0 authored, LOD1 0.42 / LOD2 0.18
decimate with close-only detail dropped — LOD1 keeps the load path and material
boundaries, LOD2 keeps the macro identity.

## Gate status

Evidence-ready only. Whole-asset G1/G2/G4 and independent G7 remain OPEN; see
`PROVENANCE.json` and the unit receipt.
