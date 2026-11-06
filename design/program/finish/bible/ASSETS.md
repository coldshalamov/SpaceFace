<!-- LIFETIME: ACTIVE_PROGRAM -->
# ASSETS — process every asset for looks and speed

**Owner, 2026-11-06:** "the assets might have a 3D model built of pieces and maybe some pieces have
parts inside the ship that are never visible but we're still rendering them, or something stuck to the
ship where we're rendering the inside of both parts where they connect … maybe there's large-scale
processing that can happen on all the assets that could improve the graphics stylistically and also
improve the performance."

Yes. ~2,576 GLB files (≈ 1,651 under ship assets) were authored by many agents over months, mostly
assembled from parts. That almost always means: hidden interior geometry, overlapping faces at joints,
many small meshes and materials per ship (draw calls), inconsistent texel density and value, uneven
LODs. A **scripted asset refinery** fixes this in bulk, once, and then runs on every new asset.

**Hard rules (from `assets/ships/AGENTS.md` and the Forge):**
- Never hand-edit a GLB. Authored sources stay untouched. The refinery is a **pipeline stage**
  between authored source and release (`release/release_manifest.json`, render packages), so it's
  re-runnable and reversible.
- Ship bodies still publish through the Forge route (`tools/blender/forge/publish.mjs`); the refinery
  plugs into it.
- KIT sockets, hooks, attachment points, collision proxies and part identities (`parts_manifest.json`,
  `src/render/partsLibrary.js` maps) must survive every stage. A stage that loses a socket fails.

---

## 1. The refinery stages

Each stage: **what it does · tool · what it must preserve · how it's checked.**

### A1 — Hidden geometry removal
- **Does:** removes faces never visible from any supported camera: interiors, faces buried inside
  other parts, back faces of parts flush against a hull, internal "stub" geometry left from modelling.
- **Tool:** a **visibility bake** — render (or ray-cast) each asset from a sphere of ~200 viewpoints at
  the closest supported camera distance (hangar / ship sheet) and the gameplay camera; mark faces hit
  by any ray; delete faces never hit (with a 1-face safety margin around hit regions). Blender
  headless (`bpy` + BVH ray casts) or a Node tool on three.js raycasts.
- **Preserves:** silhouette, sockets, anything visible after a part breaks off (KIT K6 — parts that
  can be removed expose their own mount faces: mark those as "reveal faces" and keep them).
- **Check:** pixel diff (SSIM ≥ 0.995) at 12 viewpoints at hangar zoom and gameplay zoom; triangle
  count before/after recorded.

### A2 — Joint cleanup
- **Does:** where two parts overlap, removes the overlapping inner faces of both (coplanar or
  interpenetrating within tolerance) and welds seams so lighting doesn't show a crack.
- **Tool:** Blender headless boolean-free approach: detect faces of part A inside part B's closed
  volume (winding/ray-parity test) and delete; weld vertices within 0.5 mm-equivalent on seams.
- **Check:** SSIM as A1; no new holes (a rendered "light leak" test from inside-out).

### A3 — Merge by material, keep what swaps
- **Does:** merges all static parts of a ship that share a material into one mesh → a ship goes from
  dozens of draws to a handful. **Swappable KIT parts (weapons, drives, kit plates) stay separate**,
  and breakable parts stay separate.
- **Tool:** `gltf-transform` (`join`, `flatten`, `dedup`, `prune`, `weld`, `instance`) in Node.
- **Preserves:** socket nodes, hook nodes, part identities needed by KIT and breakage.
- **Check:** draw calls per ship before/after in the render; E10 dashboard shows render-submit time
  drop on the busy routes.

### A4 — Materials and trim sheets
- **Does:** collapses per-part materials into a small set of **shared family materials with trim
  sheets** (the hull painter's palette): painted metal, bare metal, glass/lights, emissive strip,
  scrap. Faction look comes from KIT K5 livery parameters, not separate textures.
- **Check:** materials per ship ≤ 4 (+ emissive); program count (shader variants) drops; look
  unchanged or improved (golden frames, LOOK §6).

### A5 — LOD chain
- **Does:** generates LOD1/LOD2 (and an impostor for very far) for every ship and prop with
  silhouette-preserving simplification; uses the existing exact-tier policy (whole-ship LOD work in
  flight — coordinate).
- **Tool:** `gltf-transform simplify` (meshoptimizer) with silhouette/attribute weights; impostor
  bake in Blender.
- **Check:** LOD pop invisible at the switch distance (a capture flying past each LOD boundary).

### A6 — Textures
- **Does:** KTX2/Basis compression everywhere (partly done), mip chains, consistent texel density per
  class (hero ships > NPC > props), normal/AO bake from any high-detail source so merged low-poly keeps
  its detail.
- **Check:** VRAM per sector before/after; no visible blur at hangar zoom.

### A7 — Emissive pass (style)
- **Does:** adds or strengthens **light strips, windows, running lights and engine cores** on every
  asset per LOOK §4.3 — the luminous look comes from many authored lights. Uses the existing lit
  identity trims (13 hulls done) as the model; extends to every hull, station module and Hotspot part.
- **Check:** golden frames: ≥ 20 distinct light sources in a busy screenshot; R8 ≥ 4.

### A8 — Value and colour pass (style)
- **Does:** lifts albedo values that fall below LOOK §3 (no near-black hulls), unifies saturation per
  faction (WORLD §2), corrects outliers that break the art direction (master plan X1).
- **Check:** the look-values probe; the squint test; vision review.

### A9 — Scale normalisation
- **Does:** checks every asset's real-world scale against its class (a shuttle is smaller than a
  hauler, a container fits a rack); fixes outliers.
- **Check:** a scale lineup screenshot reviewed for plausibility.

### A10 — Collision proxies
- **Does:** generates simple convex collision proxies per part (V-HACD or hand-tuned capsules) so
  physics uses cheap shapes that match the visible silhouette; breakable parts get their own.
- **Check:** proxy overlay capture; contact tests (no ghost collisions, no tunnelling).

### A11 — Style punch-up (optional per asset)
- **Does:** for hulls that read weakly at gameplay zoom: exaggerate the silhouette (bigger engines,
  stronger prow, wider stance), add greeble density at the edges where light catches, add panel lines.
  Done in each hull's Forge script, so it's reproducible.
- **Check:** SHIPS lineup — R5 ≥ 4 for every hull.

## 2. The asset census and dashboard

Before any processing: a **census** (one JSON + contact sheets) of every GLB: triangles, meshes,
materials, draw calls when rendered, textures and VRAM, hidden-face percentage (from A1's bake), LODs
present, sockets present, used-in-game (yes/no — unused assets go to the razor, master plan Q4).
The census reruns after each stage; the dashboard shows the totals per sector and per ship class.

## 3. Workflow (parallel)

1. Lead (KIT lane or a dedicated ASSETS lead) builds the census and stages A1–A3 as scripts with
   their checks, proves them on 5 ships, and records before/after.
2. Batch workers run the stages over asset batches (20 at a time) and attach their checks; **vision
   batch workers** (KIT §6 prompt, REVIEW mode) score the before/after contact sheets.
3. The lead integrates batches through the publish route, regenerates manifests, and measures the
   busy routes on the E10 dashboard (draw calls, render-submit time, VRAM, frame time).
4. Style stages (A7, A8, A11) follow the art direction once the owner has approved it (master plan X1).

## 4. Done

- [ ] Census complete; every used asset processed through A1–A6 with checks recorded.
- [ ] Draw calls per ship ≤ 8 for NPCs, ≤ 16 for hero/player ships (excluding swappable KIT parts).
- [ ] Busy-route render-submit time and VRAM measurably lower on the laptop (before/after on E10).
- [ ] SSIM ≥ 0.995 for perf stages (no unintended look change); style stages approved via golden frames.
- [ ] Every hull passes the SHIPS lineup (R5 ≥ 4).
- [ ] The refinery runs automatically on every newly published asset.
