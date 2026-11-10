<!-- LIFETIME: CAMPAIGN -->
# X1 asset census — what breaks the style bible

Measured from the working tree on 2026-11-06 against [`STYLE_BIBLE.md`](./STYLE_BIBLE.md). Counts
are live-tree numbers, not doc claims. "Breaks" means the asset cannot pass §1 (one medium per
depth band), §3 (three values / manufactured surfaces), or §4 (scale module) as it ships today.

Rows B1–B3 are **re-finished, pending capture**: the finish is in the live tree and the focused
checks are green, but the disposition stays pending until the X1 lineup is re-shot at 1600×1000 and
the owner approves it.

## A. Assets that break the bible

| # | Asset class | Where | What it is (measured) | Why it breaks | Disposition |
|---|---|---|---|---|---|
| B1 | **Arena furniture — four law rooms** | `src/render/lawArenaDressing.js` | **3 shared primitives only**: `BoxGeometry(1,1,1)`, `CylinderGeometry(1,1,1,20)`, `TorusGeometry(1,.09,8,28)`; 9 flat `MeshStandardMaterial`s, no texture, no chamfer, no panel, no lamp on most movers. Dresses Lagrange, Cinder, Cryo, Storm (+ Mill/Hive boss dressing). **0 arena/kit GLBs in 423 release rows.** | One value (dark ↔ mid), sharp untextured boxes, no manufactured detail; reads as greybox beside a 10–40 k-tri hull | **Re-finished, pending capture** — machined box geometry + three values + hazard band + lamps in `arenaFinish.js`; the law bank plate is now a 9-mesh deck (channel, two clamp rails, working-edge hazard band, top-edge lamp housing + lamp, skirt) |
| B2 | **Foundry bank plate surface** | `src/render/foundryBankSurface.js` | Hand-authored slab, 8 flat vertex colours; palette **0x292824–0x605e57** (whole prop lives in the dark third of the value range); one 0x987b49 mark | No light primary, no lit point; under the foundry mood it collapses to a flat tan/grey block | **Re-finished, pending capture** — one vertex-coloured deck (light panels, two mid clamp rails, dark recessed channel, dashed working-edge safety band, lamp-housing lens). Painted trim, not meshes: the picture stays exactly inside the collision slab and the batch keeps one specimen |
| B3 | **Foundry toys (gate / furnace / shutter / block)** | `src/render/visualFactory.js:2932–2981` | `BoxGeometry` / `CylinderGeometry` with flat colours `0x2c2926`, `0x3a2418`; mouth is a `MeshBasicMaterial` 0x6a3014 | Same as B1: no three-value structure, one flat dark tone | **Re-finished, pending capture** — machined box + arena materials; the furnace mouth is its lit point, gate/block carry one work lamp, and the room-solid cap stays two meshes |
| B4 | **Procedural payload canister** | `src/render/visualFactory.js:7230–7303` (`buildPayload`) | `CylinderGeometry(0.42,0.48,1.25,10)` + 2 torus collars + octahedron transponder | A primitive stands in for cargo a player handles constantly; six authored pod GLBs already exist | **Replace (X2)** — mount `pod_cargo_container` / `place_cargo_pod_*`; keep the procedural body as load-failure fallback |
| B5 | **Procedural station body (fallback / non-archetype)** | `src/render/visualFactory.js:3426–3560` (`buildStation`) | Cylinder core + 8 greeble cylinders + 2 torus rings + extruded spars + box windows, flat palette | A second station language beside 7 authored archetypes + 14 faction kits | **Keep as fallback;** promote any live station still on it to an authored archetype (X2 census per sector) |
| B6 | **Procedural asteroid fallback** | `src/render/visualFactory.js:2499–2560` (`buildAsteroid`) | Displaced icosphere + family textures | Detail density far below the authored rock family | **Keep as load-failure fallback only;** no live arena should rely on it |
| B7 | **Two ship detail tiers** | `partsLibrary.js` `WHOLE_SHIP_FILE_BY_DEF_ID` (15 whole hulls) vs `HULL_FILE_BY_DEF_ID` (10 modular hulls) | Two different construction systems for the same 15 player defs | A modular hull and a Forge hull can appear side by side with different panel language | **Audit (X2)** — confirm every live player def resolves to a whole-ship; modular map is fallback only |

## A.1 Plate-face value finding

**2026-11-06, independent review.** At the 144 WU gameplay camera the foundry bank plate's top face
had no dark share: 0x9ba3ab / 0x8e969e panels, 0.02-unit seams and a 0x5a6168 hatch collapsed to one
white card under the key. The fix bakes a dark recessed centre channel, two mid clamp rails, dark end
margins and a dashed working-edge safety band into the single vertex-coloured surface. No second
draw: the plate remains one mesh exactly inside its 96 × 33.8 × 4.16 WU collision slab, so the
picture can no longer outgrow the solid.

## B. Assets that comply (keep)

| # | Asset class | Where | Measured | Why it passes |
|---|---|---|---|---|
| K1 | Sky painted planets | `paintedPlanets.js` + `spaceBackground.js` | 10 looks from 4 PNGs (≈5.5 MB); sprite + injected terminator; parallax 0.055; hero depth 12; one hero resident | SKY band: illustrated plate, authored terminator, recedes, never in the play plane. Enforce the 34%-screen and no-occlusion gates |
| K2 | Tethys Anvil play planet | `planetSiteVisual.js` | `IcosahedronGeometry(1,5)` = 20,480 tris; radius 700 WU; baked 1024×512 albedo; terminator + rim + additive limb | FAR/PLAY band: the template for every flyable planet |
| K3 | Forge ships | `tools/blender/forge/fleet.json` | 201 entries (15 player, 65 NPC, 121 place); 10–40 k tris LOD0; ≈10 draws; 1.72 × radius | PLAY band: the reference bar |
| K4 | Rock family | `assets/ships/release/parts/places/place_rock_*` | 24 authored GLBs (8 substances × 3 sizes); 123–516 KB; `stone` finish with strata/veins/rime/crystal/junk signatures | PLAY band: authored, three-value, silhouette differs by size. Recheck value under `forge_heat` (candidate re-grade only) |
| K5 | Cargo / container props | `place_cargo_pod_standard/hazmat/breached`, `place_container_rack*`, `place_ore_bulk_container` | 6 authored GLBs in the release manifest; pod radius ≈ 6–7 WU | PLAY band, correct module |
| K6 | Station archetypes / faction kits | `place_station_*`, `var_station_kit_*` | 7 archetypes + 14 kits + 3 trade-hub overlays | PLAY band, authored |
| K7 | Landmarks / wrecks / aftermath | `place_landmark_*`, `place_aftermath_*` | 4 landmarks + 6 aftermath bodies | PLAY band, authored |

## C. Scale census

| Body | Drawn size | Ship-length multiple (ship = 1.72 × 14 ≈ 24 WU for a Kestrel) | Verdict |
|---|---|---|---|
| Kestrel / Wasp hull | ≈ 24 WU | 1.0 | reference |
| Cargo pod | radius 6–7 WU (≈ 13–14 WU long) | 0.55 | correct cargo module |
| Rock pebble / boulder / monolith | radius 9 / 18 / 30 WU (diameter 18 / 36 / 60) | 0.75 / 1.5 / 2.5 | correct geology ladder |
| Foundry bank plate | `halfWidth 48` → ≈ 96 WU wide | 4.0 | room-scale architecture; **correct size, wrong read** (B2) |
| Foundry shutter | half-length 60 → 120 WU | 5.0 | room-scale; correct |
| Sky hero (Helios Saturn) | `frac 0.32` of screen height at depth 12 | — | SKY band; correct |
| Tethys Anvil | radius 700 WU | 29 | FAR band; correct |

**Found:** no prop is wrongly *sized* except relative to its detail. The "voxel crate" read comes
from B1–B3's missing value structure, not from scale. The bible therefore forbids a flat single-value
prop at any size, and the fix is finish, not scale.

## D. Enumerated counts (for a later full sweep)

- Release manifest: **423 assets** — places 227, wholeships 151, hulls 10, greebles 7, engines 6,
  fins 6, weapons 6, pods 4, cockpits 3, gear 2, ship-reference 1.
- Render-package pilots: **422 rows** — place 227, hull 139, pod 26, greeble 7, engine 6, fin 6,
  weapon 6, cockpit 3, gear 2.
- Planets in the manifest: **0** — every planet is procedural or painted.
- Arena kit GLBs: **0**.
- Source place GLBs: **136**; release place GLBs: **206**.

A full per-file sweep of the 423 release rows is X2 work; this census covers every class that
appears in the X1 lineup frame.
