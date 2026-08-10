<!-- LIFETIME: ACTIVE_CANDIDATE -->
# Material-truth preflight — PQ-045.wreck-dressing (seven selected assets)

```yaml
packet: PQ-045.wreck-dressing
preparedAt: 2026-08-10
tier: C/D place dressing (grouped repeated manufactured families allowed)
scope: seven ledger-selected wreck_aftermath_pack assets composed into two Ceres place slots
componentReferenceDecision: not_needed
allSupportedViewZonesClassified: false   # whole-asset G1/G2/G4 remain open; this is preflight only
```

Authority: `.grok/skills/spaceface-blender-material-truth/SKILL.md`, ledger
`BINDING_REVIEW_AND_SELECTION_LEDGER.md` §4.3, fiction
`design/fiction/THE_LONG_AFTERMATH.md`.

## Slot composition

| Slot | Place asset | Selected ingredients |
|---|---|---|
| `ceres_ambush_bait_wreck` | `place_ceres_bait_wreck` | `wreck_liner_bow`, `wreck_liner_boatbay`, `wreck_ore_freighter_hopper`, `aft_armor_slab` |
| `ceres_cathedral_grave_shard` | `place_ceres_grave_shard` | `deb_ore_freighter_hopper_lid`, `deb_liner_hull_panel`, `frag_grating_sheet` |

No other pack GLB is promoted. Three unbuilt hull families stay unbuilt.
`place_landmark_wreck_cathedral` is foreign-owned and untouched.

## Fiction-development agreement (shared)

Ceres is an industrial belt. These pieces are **class-identifiable aftermath**, not anonymous
blobs: a pressure-liner passenger section used as ambush bait on the Throughline, and freighter /
liner scrap dressed around the Cathedral grave field. Rupture is causal and directional — scorch
and torn edges face the break, not random grunge. Exposed frame steel and painted armor shell are
different substances; salvage tears leave brighter raw edge than long vacuum weathering.

## Material bill (grouped manufactured families — Tier C/D)

| Material | Fiction substance | Manufacture / finish | Wear logic | Forbidden reads |
|---|---|---|---|---|
| `Material_Hull` | Coated pressure / freight shell | Rolled plate, dielectric paint (liner bone / freight ochre) | Chalking, micrometeor pits, paint loss at edges | Plastic, rubber, leather, uniform plasticine |
| `Material_Armor` | Replaceable ballistic / belt plate | Hardened alloy, darker, semi-metallic | Scorch bloom only on rupture-facing faces | Soft clay bevels, glowing edges |
| `Material_Structural` | Load frame, ribs, grating bars | Bare structural steel, brushed metallic | Oxide, fretting at joints, clean shear at break | Painted as hull, flat grey blob |
| `Material_Insulation` | Exposed pressure/thermal blanket | Fibrous non-metal, matte | Frayed layers at tear lips only | Shiny metal, tile noise as substitute for tear geometry |
| `Material_Service` | Cable trays, deck grate, trunks | Polymer jacket / open grate steel | Severed ends, dust matte, no live emissive promise on derelict | Neon cable glow, runway of lamps |
| `Material_Glass` | Shattered liner glazing | Cold dielectric, rough fracture | Dead, non-emissive, high roughness | Intact glossy glass, emissive windows |
| `Material_Heat` | Heat-affected rupture / scorch | Oxidized metal + carbon | Directional from causal break axis | Random soot stamps, salmon emissive wash |

## Per-asset zone register (supported ordinary-camera zones)

Supported review cameras: three-quarter approach, rupture close, silhouette far (LOD2).

### 1. `wreck_ore_freighter_hopper` — open ore hopper trunk fragment

| Zone | Class | Notes |
|---|---|---|
| Hopper shell / paint | billed | Freight ochre dielectric shell |
| Ring frame / ribs | billed | Structural steel; open bore must remain readable |
| Torn break lips | billed | Insulation + heat; rupture faces the severed trunk axis |
| Loose chute / grate | billed | Service / structural |
| Cable break lugs | billed | Service polymer, severed |

### 2. `deb_ore_freighter_hopper_lid` — detached hopper lid plate

| Zone | Class | Notes |
|---|---|---|
| Lid plate / paint | billed | Freight ochre skin |
| Frame rim | billed | Structural |
| Scorch / torn edge | billed | Heat + insulation; scorch follows lid separation direction |

### 3. `wreck_liner_bow` — passenger liner bow pressure vessel

| Zone | Class | Notes |
|---|---|---|
| Bone-white hull skin | billed | Liner paint dielectric |
| Broken glazing | billed | Dead glass |
| Scorch / petal tear | billed | Outward decompression grammar; heat faces breach |
| Frame at break | billed | Structural |

### 4. `wreck_liner_boatbay` — boat bay / hangar collar section

| Zone | Class | Notes |
|---|---|---|
| Bay shell / deck grate | billed | Service + hull |
| Frame / collar | billed | Structural |
| Cable / torn edge | billed | Service + insulation |
| Residual heat | billed | Localized only at severed utilities |

### 5. `deb_liner_hull_panel` — hull panel debris

| Zone | Class | Notes |
|---|---|---|
| Bone panel face | billed | Liner paint |
| Frame backside | billed | Structural |
| Glass fragment | billed | Dead glass |
| Tear edge | billed | Insulation |

### 6. `aft_armor_slab` — aftermath armor slab component

| Zone | Class | Notes |
|---|---|---|
| Armor face | billed | Dark armor alloy |
| Frame backing | billed | Structural |
| Scorch face | billed | Heat on impact/rupture side only |
| Dust matte | billed | Service / dust on sheltered faces |

### 7. `frag_grating_sheet` — deck grating fragment (instanced in grave)

| Zone | Class | Notes |
|---|---|---|
| Grate bars | billed | Structural / service grate |
| Sheet body | billed | Frame steel |
| Dust / tear | billed | Non-metallic dust + torn ends |

## Shape-grammar failures to repair during author-down

1. **1,891 unmerged authoring primitives** → merge by material role per asset (and per LOD).
2. **No LODs** → author LOD0/1/2 with strictly reducing triangle counts; LOD2 keeps macro identity only.
3. **Untextured material colours** → real basecolor / normal / ORM maps per role; no flat normal,
   no scalar-metallic-in-a-texture, no per-object unit-square UV renormalization.
4. **No instancing** → instance repeated `frag_grating_sheet` debris in the grave composition.
5. **Collision** → recompute box / compound-box proxies; do not seal authored cavities with a single
   oversized AABB on pieces that retain an open read.

## Working scene and gates

| Item | Path / status |
|---|---|
| Working builder | `tools/blender/author_ceres_wreck_dressing.py` |
| Maps | `assets/incubator/wreck_aftermath_pack/maps/` |
| Authored-down per asset | `assets/incubator/wreck_aftermath_pack/authored_down/` |
| Place candidates | `assets/ships/parts/places/place_ceres_bait_wreck.glb`, `place_ceres_grave_shard.glb` |
| G0 structural | claimed by builder report (mesh merge, LOD reduce, textures present) |
| G1/G2/G4 whole-asset visual | **open** — needs human art verdict on exact candidate hash |
| G7 independent review | **open** |

## Residuals accepted at preflight

- Source pack geometry remains blockout-dense in construction logic; this unit authors down
  submission cost and surfaces materials, it does not rebuild the three unbuilt hull families or
  re-author every meso joint as Tier A hero work.
- Emissive vent/arc marks from the pack are **not** promoted as live VFX; dead heat is map-only.
- Byte-reproducibility of Blender export is toolchain-pinned but not dual-build proven in this unit.
