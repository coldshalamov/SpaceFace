# M4 Ashline Ship Family — Design Direction

**Packet:** `M4-ASHLINE-HOSTILE-VISUAL-FAMILY-001`
**Status:** production family — canonical source/release and live hostile wiring
**Authority:** `design/production/01_BUILD_PROGRAM.md` M4 fighter/interceptor + miner/hauler families; M5 thirteen-ship role lattice prep; SPEC3-F9 exporter contract; `design/spec2/00_MASTER_TASTE.md`

## Family identity

**Ashline** is the Crimson Reach frontier combat workline: oxidized gunmetal hull plates, recessed panel seams, sodium-red threat rails, amber service marks, and dark mechanical guts. Hard-surface, chamfered edges, no razor corners, no baked engine plumes (runtime owns VFX).

Shared factional language across all three roles:

| Token | Role |
|---|---|
| `Material_Hull` | Primary plate / armor body |
| `Material_Mechanical` | Struts, housings, dark guts |
| `Material_Cyan` | Stable semantic accent slot; authored sodium-red threat rails, drive core, nav seams |
| `Material_Warm` | Hazard chevrons, cargo bay marks |
| `Material_Glass` | Canopy / viewport |

Socket contract (stable bare names, same as K0 production):

- `SOCKET_Weapon_Front`, `SOCKET_Mining_Front`, `SOCKET_Engine_Main`, `SOCKET_Trail_Main`
- `SOCKET_Utility_Dorsal`, `SOCKET_Cargo_Ventral`, `SOCKET_Camera_Focus`
- `SOCKET_RCS_Port`, `SOCKET_RCS_Starboard`

Axes: forward `+X`, up `+Y`, starboard `+Z`, units metres.

## Three roles — distinct silhouettes

Readability targets: **&lt;45 px**, **~120 px**, and **close**. Family kinship must survive small scale; role identity must still be legible at mid scale.

### 1. Ashline Dart — flyby interceptor

- **Silhouette:** needle forebody, twin swept canards, tight twin rear nozzles, low profile.
- **Read at &lt;45px:** thin arrow + dual aft thrust dots.
- **Role cues:** speed-forward mass, minimal cargo volume, weapon-forward bias.
- **Candidate IDs:** `SF_WHOLESHIP_ASHLINE_DART` / `wholeship_ashline_dart`

### 2. Ashline Maul — heavy brawler

- **Silhouette:** armored central slab, twin casemates, breach prow, broadside batteries.
- **Read at &lt;45px:** wide crossbar + blunt prow + short thruster block.
- **Role cues:** armor bulk, slow pursuit mass, paired lateral gun banks.
- **Candidate IDs:** `SF_WHOLESHIP_ASHLINE_LODE` / `wholeship_ashline_lode`

### 3. Ashline Hook — tether-control raider

- **Silhouette:** asymmetric capture boom + ventral bay + exposed transverse spool + dorsal utility mast.
- **Read at &lt;45px:** offset hook arm + belly mass + single aft block.
- **Role cues:** harpoon-forward asymmetry, visible spool, working-raider utility hardware.
- **Candidate IDs:** `SF_WHOLESHIP_ASHLINE_RIG` / `wholeship_ashline_rig`

## Optimization policy (quality-preserving)

Maximum visible quality. Optimize structurally, not by arbitrary detail caps:

1. **Semantic materials** — batch by material role (Hull / Mechanical / Cyan / Warm / Glass).
2. **LOD0 / LOD1 / LOD2** — close detail → mid merge → far silhouette; drop close-only decals on LOD1+.
3. **Meshopt / KTX2** — release-candidate finalize path (gltf-transform) on candidates only.
4. **Tangents** — real MikkTSpace; no constant filler prims.
5. **Sockets + collision + damage roles** — bare sockets, `COLLISION_HULL` helper, separate drive/gun/mining hooks where animated/damageable.
6. **No plume meshes** — runtime VFX.

## Promotion rules

- Master authoring and evidence stay under `assets/ships/m4_ashline/**`.
- Canonical copies use unique `wholeships/ashline_*.glb` paths and never overwrite Kestrel, Pelican, Wasp, or Helios assets.
- Live selection uses authoritative hostile `lootTableId` values; gameplay stats and doctrine data remain untouched.

## Reproducible build

```text
blender --background --python tools/blender/build_m4_ashline_family.py --
node tools/art/finalize_m4_ashline_candidate.mjs
node scripts/check-m4-ashline-family.mjs
```
