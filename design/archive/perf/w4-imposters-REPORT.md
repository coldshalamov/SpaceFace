# Wave-4 Lane Report — Far-field Imposters / Billboards

Lane question: *can distant geometry be replaced with camera-facing quads or octahedral
imposters where visually identical at range?*

Branch: `devin/1790650005-w4-imposters` off `origin/master` (9a30ffc0).

## Verdict

**The existing LOD chain is already the imposter design, and its terminal level is already
populated for every entity class. A runtime billboard/octahedral tier is inadmissible: it
fails the lane's own imperceptibility constraint, and it optimizes a cost the measured
poles do not name.** No code change; this report is the deliverable (the lane's documented
"already optimal" outcome).

The key audit fact: spec §12.4 names the terminal level itself the impostor tier —
`LOD2_BELOW: 45` in `src/render/lod.js` is annotated "LOD2/impostor for distant traffic" —
and lod2 is implemented as *authored simplified geometry*, which is strictly stronger than
a quad on every axis the picture contract cares about.

## Research citations

- **Octahedral imposters** (UE4 Impostor Baker; shaderbits "octahedral impostors";
  wojtekpil/Godot-Octahedral-Impostors; LightBulbBox "Improved Impostor Rendering") —
  pre-bake an atlas of view directions keyed by octahedral-mapping the view vector;
  the draw is 2 tris + an atlas sample per entity. Wins at *hundreds of instances of
  subpixel geometry* (forests/cities). Requires baking fixed lighting into the texture
  and cannot carry live emissive animation without a second animated layer.
- **Runtime/dynamic impostor** (felixmariotto's three.js `Impostor`, mrdoob/three.js PR
  #22043) — renders the object to a small render target at swap time, re-bakes when the
  view angle drifts past `maxAngle`, load-balances bakes via `updateAll()`. Proven for
  mostly-static vegetation; for a flight sim the view yaw drifts continuously so re-bake
  cadence stays high, and each bake re-pays exactly the geometry cost it was avoiding.
- **Plain camera-facing billboards** — cheapest of all but carry no depth (parallax/z-order
  errors vs particles and neighbours), no silhouette under yaw, and one frozen lighting
  state. The classic far-Lod answer for spherical-ish props; wrong for authored ships
  with faction livery.
- **Authored LOD (what this engine ships)** — meshoptimizer weld+simplify with locked
  topological borders (`scripts/build-wholeship-lod.mjs`, `lodSource:
  meshopt-weld-simplify`, error bound 0.005 of mesh radius). A simplified real mesh is an
  imposter that is correct from every direction, keeps the authored material/lighting
  stack, animates, and costs zero runtime bake machinery.

## LOD-chain audit (src/render/)

Selector (`src/render/lod.js`): projected-px of the bounding radius with 25 px hysteresis —
lod0 >120 px, lod1 45–120 px, **lod2 <45 px is the terminal level**.

Per-class terminal (`lod2`) representation — measured off the shipped GLBs:

| Entity class | lod2 representation | Mechanism |
|---|---|---|
| 14 roster/production hulls (wasp/pelican/mule/drifter/hornet/ironback/bastion/atlas/ranger/warden/colossus/leviathan/kestrel/massline) | separate meshopt-simplified GLB: ≤30 % of lod0 tris, ≥1000 tris, sockets 100 % preserved | `installWholeShipLodFamilyController` lazy-composes + swaps the whole file (`wholeShipLodPolicy.js`, `WHOLE_SHIP_LOD_FAMILY_*`) |
| ~22 forge-authored NPC/kit hulls (ashline_*, helios_*, wasp_*_militia/escort/patrol, ore_barge, yard_tug, volatiles_tanker, work boats) | intra-GLB `LOD2_*` primitive buckets, authored per material group | `applyNodeTags` parses `LOD[012]_*` names → `tags.lod`; `installAuthoredLod` shows only the closest bucket; `lodDynamicDetails` (drive fans) hide at lod2 |
| Composite/procedural ships | per-part `spaceface.lod` tags; decals + dynamic details hidden | `installAuthoredLod` + `shipKit.finalizeShip` |
| Stations/planets/fx places | authored body minus greeble/decal/navlight/fan/antenna | `attachStationHlod` / `applyProjectedDetailLod` (`hlod.js`) |
| Asteroid fields (the far-field mass) | 5-variant `InstancedMesh` pools; shard/vein detail merged-static and hidden | `asteroidInstancePool.js` + `lod-selector-guards` test |
| Beyond glass + approach runway | nothing submits; meshes evicted past prefetch+5 s travel | `entityMeshVisibility.js`, `tabletopPolicy.js`, `farActorTable.js` |

Measured lod2 draw weight (visible tris / prims, collision hull excluded):

- family files: wasp 39 484 t → lod2 6 740 t; ranger 27 232 → 4 524; drifter 31 712 → 5 392;
  massline 32 860 → 5 252; leviathan 51 660 → 8 802.
- forge hulls' in-file lod2 buckets: ashline_dart 3 752 t/13 p, helios_span 5 354 t/16 p,
  wasp kits 6 740 t/10 p, yard_tug 6 278 t/16 p, ore_barge 5 366 t/13 p — down from
  23 k–41 k t at lod0.

Draw-call cost at extreme range: most of those prims are *not* per-ship draws — anything
failing `requiresPerShipMesh` (rigid opaque hull/armor/mechanical groups) becomes a
`spacefaceInstanceProxy` slot in a shared `InstancedMesh` chunk keyed by
geometry×material, so the marginal per-ship cost at lod2 is only the dedicated prims
(canopy, nav lights, drive core/plume, secondary hooks) ≈ a handful, minus drive fans
which hide at lod2. The per-frame selector itself is band-retained
(`_appliedLodLevel` gate — `sync-entity-lod-retain` test).

Measured frame, this tree, `probe-frame-solid --headless` flight route ending at a busy
station: **85.2 draw calls/frame, 52.7 program switches/frame, 145 drawables (20
InstancedMesh covering 547 instances), 96 programs** — the whole frame, all ranges. The
far-field slice of that is single-digit per-ship dedicated draws plus the already-shared
instance pools; a quad imposter could not materially move an 85-call frame even if it
removed every far hull.

## Why a terminal imposter tier is inadmissible here

1. **Imperceptibility fails on live state, not pixels.** The far contract keeps
   small-but-authored ships submitted because the speck *is* gameplay signal
   (`entityMeshVisibility.js`: roots outside glass+runway "cannot change a readable
   pixel", everything inside stays). lod2 carries live nav-light blink, drive-plume
   throttle pulse, and damage-state emissive/secondary hiding — all perceivable at
   20–90 px as live-vs-dead dots. A bake freezes them; re-baking at blink/damage cadence
   costs more than the ~handful of draws it saves. Kit hulls are additionally
   livery-frozen by design ("a generic silhouette proxy must not swap bodies", `hlod.js`).
2. **The imperceptible band barely engages.** A quad is provably safe only ≳2× past the
   lod2 switch (≈22 px projected radius). `projectedWidthPx` puts an r≈8 WU ship at ~28 px
   at max manual zoom (330 WU); the band opens only inside the extreme envelopes (combat
   fit 528, gate approach 720, exceptional speed-zoom past ~1000 WU) — a minority of frame
   time on a minority of entities that are already simplified.
3. **It spends on an unmeasured path.** The ranked poles (master plan §A decode runway,
   §E submit tail ≈100 program switches, per-frame literals, shadow-walk) name no far-LOD
   draw cost; PERF_METHODS §1 forbids optimizing off-list. A dynamic imposter *adds* a
   render-target pass + texture memory + a new program to the switch count; an octahedral
   atlas adds texture memory per hull and a custom program — Pole E moves the wrong way.
4. **Adjudication precedent.** PQ-108 "tiny-on-glass LOD" was GATED as quality-adjacent
   pending a projected-px census — the corpus already held this exact class once. The
   quality suite bans the degenerate form outright: `wholeship-lod-quality-all` requires
   lod2 ≥1000 tris "to avoid box/blob collapse" — a 2-tri quad is the collapse that test
   exists to prevent.

Net: the camera-facing-quad technique is the right answer for subpixel instanced masses
(this engine already plays that card — asteroid fields draw through 5-variant
`InstancedMesh` pools, the canonical imposter batching win). For authored ships the
shipped imposter is authored simplification, and the remaining per-ship far draws are a
single-digit count of live-signaling prims a bake cannot preserve.

## Patch

None — documentation only (this file). No runtime, content, or asset change.

## Metrics

- **Golden 47a** (`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs
  test/47a.inputs.json --expect test/47a.telemetry.expected.json --hash --repeat 20
  --reload-at 600`): `sha256 == baselineSha256 ==
  cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`, `deterministic: true`,
  exit 0. Note: the lane prompt's stated baseline `f3583c50…` predates this master tip;
  the tree's stored baseline is `cc941938…` (the same hash the w4-jobsys lane reported
  against its tip) and the run reproduced it exactly.
- **Focused LOD tests**: `node --test` over `lod-selector-guards`, `hlod-projected-detail`,
  `whole-ship-lod-policy`, `perf-submit-lod-archetype`, `sync-entity-lod-retain` — 22/22
  pass on this tree (audited behavior verified, not just read).
- **Probe A/B**: degenerate by construction (doc-only diff — same binary, nothing to
  A/B). One `probe-frame-solid --headless` run was still taken for the census numbers
  above; it emitted all metrics (missing/stuck offenders are decode-runway lane A
  evidence: station 70/60, ship_atlas 54/45, wrecks 71/41 — preexisting admission cost,
  not draw cost) and exited `RESULT: FAIL` on two `[loop] frame error` texture-upload
  page errors (`uploadTexture … reading 'width'`) plus a resource 404 — a headless-shell
  environment artifact present on a tree that differs from master only by this report.

## Zero visible quality change

No code path changed at all; the report asserts only what the current tree already does.
