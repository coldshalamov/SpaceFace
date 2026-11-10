<!-- LIFETIME: RECEIPT -->
# PQ-130.03 This asteroid's rock — in full 3D — receipt

**State:** done (2026-08-21). **Law:** design law §2.1 (as amended), §2.7, §3.5, §4; playfield §3 (flatten/flat-fill/neon row).

## Context
The first theater build flattened the blocks into tiles under a perpendicular ortho camera; the owner's
verdict: "you literally gutted all the 3d and made a cartoon." The original beveled geometry was restored
(`23f0a07c`) and this leaf rebuilt the scene language to the flight game's own 3D bar.

## What shipped (src/render/asteroidInteriorPreview.js, src/ui/asteroid/asteroidRenderer3d.js)
- **Rock = the flight asteroids' rock.** Cell materials built from `rockSurfaceLibrary` (authored
  basecolor + normal + packed ORM, wired as `visualFactory.astMaterial` does); tints are solved linear
  multipliers over the authored albedo. One continuous world-planar projection (rotated 31°, one repeat per
  4.3 cells) so the cut face is one body of stone, not wallpaper; cavity walls keep a local unwrap via a
  per-vertex facet attribute; degenerate bevel UVs fixed (they smeared a painted stripe around every cell);
  baked per-vertex contact darkening (pad 1.0 → groove 0.14 → wall 0.17); smooth pad normals (the old
  four-triangle fan wore a hard X-crease). Survey/fog tint branch deleted; depth gradient warm-bore /
  cool-space; ±5% tint variance with low-frequency strata.
- **Measured:** matrix pad L* 46.8 (`#7f6c56`) vs law L* 45.5; basalt L* 27.5 (`#4a3f37`) vs law 26.5;
  14 L* separation. Starting point was L* 59 tan.
- **Camera:** `PerspectiveCamera` fov 31°, optical axis perpendicular to the cut plane — rows/columns stay
  straight and cells square on the plane; bevels, cavity walls, rover and machines gain real depth.
  Registers keep their half-extent contract (`dist = halfH / tan(fov/2) + ROCK_FACE`): work ≈ 39 wu,
  site ≈ 223 wu; 180ms detent dollies; `pickCell` intersects the pad plane.
- **Light:** warm key `0xffdcbc` @ 9.4 raking from below-left (castShadow, normalBias 0.08); rim `0x9db8f0`
  @ 1.2 from above; warm fill @ 1.3 from the opposite quadrant (key:fill ≈ 5:1); hemisphere sky
  `0x8fa6cf` / ground `0x7a5636`; a `0x39d0ff` panel baked into the PMREM environment (every metal was
  reflecting neon teal) removed.
- **Objects:** every emissive ring/bar/halo gone; machines rebuilt as PBR hardware on a shared chamfered
  plinth (collars, counterweights, fins, rails; fabricator progress as a gantry head); rover safety-yellow
  `#ffd23f` + `#161008` chevrons, lit cab, real headlamp spotlight, steel bit heating `#9a6f4a` →
  `#ff6242` off `drillTemp`; conduits as armoured runs; fixed 3-PointLight pool for machine lamps (no
  per-placement shader recompiles).
- **From .02:** bore damage persists (crack stages in three instanced pools keyed off `hp/maxHp`, seeded on
  entry; `restoreDigBlock` deleted); `bite` reads as a heavier strike than grind.
- **Authored GLBs evaluated and rejected for this leaf:** claim-outpost/station buildings are 23k–171k
  tris for a 2.2-unit cell; `place_drill_platform` (4.4k) is KTX2+meshopt and would need a second
  transcoder runtime on this screen's private context. Procedural objects meet the bar; sharing the flight
  renderer's context is the clean route to authored props (future).

## Evidence
- Stills at 1920×1080 reviewed by the orchestrator: `.devshots/asteroid-works/03-site-running.png`
  (rock with depth, warm-lit shaft, metal machines, yellow rover, derrick against stars),
  `05-site-register.png` (whole body as a carved solid in the starfield; aliasing streaks gone).
- `npm run check:asteroid-theater`: passes (96.3% / 94.4%, 8 words). `npm run check:playable`: 14/14.
- `check:baseline` 8/12 at exit: the four 47a sim/determinism links fail from another lane's uncommitted
  AI/physics files; none of this leaf's files are in `sf-sim.mjs`'s 281-module import graph.

## Known, recorded for later leaves
- Plateau/crust transition is abrupt (cool crust vs warm bore) — `.04`.
- Faint light risers where lift variants meet on a horizontal joint; texture repeat findable at site zoom.
- Cold-start path keeps the cavity-floor fallback until the surface library resolves.
- Four lights added (3 point + hemisphere); no frame-budget gate run — watch in `PQ-129` terms.
