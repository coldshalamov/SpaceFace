# EXISTING COVERAGE — what SpaceFace already has for wrecks, and what this pack may therefore build

Audit date **2026-08-08**. Written *before* authoring, and adversarially: the job of this document
is to find a reason NOT to build the pack. It found four assets that partly overlap and one system
that fully occupies a size class. Those findings shaped the pack rather than blocking it.

Method: `Grep` over `src/**/*.js` for every asset id and node prefix; GLB envelopes and node lists
measured directly out of the binary glTF JSON chunk (not read off a doc that could be stale).

**Standing caveat — this file was written before the build and never revised after it.** Its mtime is
18:00:03; every one of the pack's 37 GLBs was exported later (20:29:06 → 20:44:46), as was the
authoritative `build-report.json` (20:44:46.563). Nothing below was ever checked against the numbers
that actually shipped. This is not hypothetical: the **8–22 m debris band asserted in §1 is breached by
four of the seven debris pieces**, two of them larger than the `place_debris_chunk` this document says
they were deliberately authored smaller than. The measured table is in
[`INTEGRATION.md`](../INTEGRATION.md) §9. Where this file and `build-report.json` disagree, the report
wins.

---

## 1 · The leased assets — DO NOT MODIFY

These three are live, bound, and out of scope by explicit instruction. Nothing in this pack writes
to their paths, their render packages, their manifests, or their material names.

### `place_landmark_wreck_cathedral.glb` — 704.4 × 328.8 × 531.1 m

The hero wreck landmark. 24 meshes, full LOD0/1/2, `INTERACTION_HangarCavity`.

Bound at: [worldSiteManifests.js:217](../../../../src/data/worldSiteManifests.js:217) plus a
four-stage progression (`dark` → `stabilized` → `opened` → `archived`) at lines 327–330;
[worldSiteAssetBindings.js:85](../../../../src/data/worldSiteAssetBindings.js:85);
[wreckCathedralEvidenceCatalog.js:43](../../../../src/data/wreckCathedralEvidenceCatalog.js:43);
consumed by [shipLedger.js:244](../../../../src/systems/shipLedger.js:244); given bespoke
depth-geometry handling in [partsLibrary.js:1972](../../../../src/render/partsLibrary.js:1972);
shipped as render-package `wreck-cathedral`.

**Verdict: untouchable, and no overlap.** It is a unique 700 m story location with its own quest
progression and evidence catalog. This pack's largest hull is ~180 m. Different size class,
different purpose — a landmark you visit versus wreckage you find.

### `place_dead_hulk.glb` — 65.5 × 14.6 × 12.8 m

18 meshes, LOD0/1/2, sockets `SOCKET_Hazard_Core` and `SOCKET_Salvage_Core`, materials
`Material_Hull` / `_Armor` / `_Glass` / `_Heat` / `_Insulation` / `_Service` / `_Structural`.

Bound at: `DRESSING_RADIUS.place_dead_hulk = 42` ([world.js:162](../../../../src/systems/world.js:162));
spawned at [world.js:1594](../../../../src/systems/world.js:1594) and selected at
[world.js:1550](../../../../src/systems/world.js:1550); used as `landmarkGlb` at
[sectorAnchors.js:74](../../../../src/data/sectorAnchors.js:74) and
[sectorAnchors.js:123](../../../../src/data/sectorAnchors.js:123).

**Verdict: untouchable — and it is the strongest argument FOR this pack.** One anonymous hull is
currently carrying every wreck role in the game. The same 65 m mesh is spawned as *"Dead Hulk"*
(world.js:1596), as *"Throughline Bait Wreck"* (world.js:1556), and as the Ceres ambush bait
(`ceres_ambush_bait_wreck`). It has no class identity — a player cannot say what it used to be,
because it was never anything. That is exactly the gap this pack fills, and it fills it *beside*
the hulk rather than by editing it.

### `place_debris_chunk.glb` — 30.8 × 9.9 × 13.7 m

19 meshes, LOD0/1/2, nodes `Chunk_Spine` / `Chunk_Break_A` / `Chunk_Break_B` / `Chunk_Shred`.

Bound at: `DRESSING_RADIUS.place_debris_chunk = 26` ([world.js:163](../../../../src/systems/world.js:163));
spawned at [world.js:1599](../../../../src/systems/world.js:1599) and
[world.js:1627](../../../../src/systems/world.js:1627); `landmarkGlb` at
[sectorAnchors.js:46](../../../../src/data/sectorAnchors.js:46),
[:75](../../../../src/data/sectorAnchors.js:75) and
[:125](../../../../src/data/sectorAnchors.js:125).

**Verdict: untouchable, partial overlap acknowledged.** Same story as the hulk — it appears as
*"Debris Chunk"*, *"Cathedral Grave Shard"*, *"Drifting Debris"*, a Helios yard marker and a Vesta
ore cache. It occupies the ~30 m generic-debris slot. This pack's **medium debris** pieces are
deliberately authored *smaller* (8–22 m) and, critically, **family-attributed** — a freighter hopper
lid is recognizably off a freighter, which is the one thing `Chunk_Shred` structurally cannot be.

> **The "smaller" half of that verdict did not survive the build.** Four of the seven debris pieces
> shipped outside 8–22 m, and two exceed the 30.8 m recorded above: `deb_ore_freighter_hopper_lid`
> 31.56 m and `deb_ore_freighter_ring_span` 53.25 m — the hopper lid named in this very paragraph
> among them. The **family-attributed** half stands and is the argument that still holds. Measured
> figures: [`INTEGRATION.md`](../INTEGRATION.md) §9.

---

## 2 · The dormant precedent — `scenery_wreck_fragment_v01/v02/v03`

Foundry output from `fleet_breadth_20260720`. Measured:

| File | Envelope (m) | Tris | Nodes |
| --- | --- | --- | --- |
| `scenery_wreck_fragment_v01.glb` | 0.5 × 5.9 × 7.3 | 184 | `hull_rib`, `torn_plating`, `dangling_cables` |
| `scenery_wreck_fragment_v02.glb` | 3.2 × 3.0 × 4.8 | 276 | `combustion_block`, `nozzle`, `manifold_pipes`, `shards` |
| `scenery_wreck_fragment_v03.glb` | 6.1 × 4.1 × 5.1 | 96 | `spars`, `decal_plate`, `brackets` |

**These are NOT leased.** `Grep` for `scenery_wreck_fragment`, `SCN_WRECK_FRAGMENT` and
`fleet_breadth_20260720` across `src/**/*.js` returns **zero matches**. They are unbound authoring
output sitting in the foundry tree — reachable by no loader, referenced by no manifest.

This is the honest overlap in this audit and it deserves naming rather than burying:

- **v01 is literally the first three fragments anyone would author** — a rib, torn plating, hanging
  cable. This pack's shared fragment kit covers the same idea.
- **v02 is an engine-section fragment**, which is the first entry on this pack's ordinary-aftermath
  component list.

Why the pack proceeds anyway, and how it differs:

1. **Scale class is different, and the difference is functional.** The trio is 0.5–7 m at 96–276
   tris — the size of a thing that flickers past. The aftermath component kit targets **8–22 m**,
   sized against the game's own `WRECK_RADIUS = 9` (an ~18 m diameter wreck entity), so a component
   can *replace* a wreck rather than garnish one.
2. **The trio has no state ladder and no drift authoring.** Every piece is a single frozen prop.
   This pack authors state (fresh / cooling / derelict / stripped) and records a drift vector per
   separated piece.
3. **The trio has no sockets.** No salvage point, no hazard point, no black box.
4. **They are dormant, and this pack does not touch them.** If a later lane prefers them, they are
   still there, unmodified. Nothing here shadows their paths or their `KitMat_*` material names.

---

## 3 · The size class that is fully occupied — procedural `buildWreck()`

[visualFactory.js:2887](../../../../src/render/visualFactory.js:2887) builds every runtime
`type: 'wreck'` entity **procedurally in Three.js** — no GLB is involved at any point. It has real
craft in it (reactor cages, ceramic collars, heat-affected radiator panels, service conduits) and it
is driven off `entity.radius`, which [aftermathWrecks.js:23](../../../../src/systems/aftermathWrecks.js:23)
pins at `WRECK_RADIUS = 9`.

**Verdict: occupied, and this pack does not contest it.** No runtime edit, no swap, no manifest row.
The ordinary-aftermath component kit is authored at compatible scale so that it is *available* as a
future replacement candidate for that procedural output — but making that swap is a separate,
consented change, not part of this delivery. See `INTEGRATION.md`.

---

## 4 · The taxonomy that already exists — `wreckClasses.js`

[src/data/wreckClasses.js](../../../../src/data/wreckClasses.js) already defines five wreck classes
with prose, salvage-pool leans and a `restricted` flag: `debris`, `fresh`, `battlefield`, `military`,
`ancient`. [aftermathWrecks.js:99](../../../../src/systems/aftermathWrecks.js:99) maps victims onto
a subset of them at kill time.

**This is a constraint, not an overlap — and obeying it is what makes the pack consumable.** The
pack's state suffixes are authored to map onto these ids rather than inventing a parallel vocabulary.
Note that `military` is a *provenance* fact, not a state (a military wreck can be fresh or ancient),
so it is carried as **hull identity + paint on the corvette family** rather than as a state suffix.
`restricted: true` on that class is why the corvette's stripped variant is authored as evidence of a
crime. Full mapping table lives in `INTEGRATION.md`.

---

## 5 · Conclusion — the gap this pack is allowed to fill

Measured coverage across the wreck size spectrum:

| Size | What exists | Identity? | State ladder? |
| --- | --- | --- | --- |
| ~700 m | Wreck Cathedral (unique landmark) | Yes — bespoke | 4 quest stages |
| **60–200 m** | **nothing with class identity** | — | — |
| ~65 m | `place_dead_hulk` ×1, anonymous, 3 roles | **No** | No |
| ~30 m | `place_debris_chunk` ×1, anonymous, 5 roles | **No** | No |
| ~18 m | procedural `buildWreck()` | No | No |
| **8–22 m** | **no component kit** | — | — |
| 0.5–7 m | 3 dormant foundry fragments | Partial | No |

The pack builds into the two empty rows: **identifiable vessel-class hero wrecks (60–200 m)** with
separated sections and a state ladder, and an **ordinary aftermath component kit (8–22 m)** so a
routine fight can leave believable remains without spawning a monument.

No file listed in §1 is read, written, renamed or re-exported by
`tools/blender/build_wreck_aftermath_pack.py`. All output lands under
`assets/incubator/wreck_aftermath_pack/`. All materials use the `wrk_*` prefix, which collides with
nothing above.
