# Deep-field background: rendering and art direction

## What this game needs

SpaceFace is a position-following, non-yaw-following space sandbox. Its ordinary camera is 144 WU,
60 degrees above the XZ play plane, with a 50-degree vertical FOV (`src/render/camera.js`). The
background must communicate travel and scale without turning the flight path into a luminous fog
wall or another field of combat cues. A photograph glued to the camera would remove clipping but
also remove spatial continuity. A new volumetric raymarch would spend the frame budget on the least
interactive part of the image. Neither is the intended solution here.

The composition is a hierarchy: near-black negative space; small, deep stars; sparse, region-owned
celestial landmarks and authored dust structures; fractured, opaque mid-distance matter; then the
ship, interactable bodies and high-energy effects. Region variation already has an authority in
`src/data/sectorVisualProfiles.js` and `src/render/deepFieldStructureRecipes.js`. Keep that authority.
Do not build a second palette registry or replace deliberately empty regional recipes with noise.

## What changed

### Clip-proof sky, not a larger plane

The old composite is a finite XZ plane. Its perspective edge/far-plane intersection can become a
straight or wedge-shaped boundary in the background. Increasing its dimensions is not a general
solution. `deepFieldPresentation.js` replaces only its carrier with a full-viewport triangle.

The vertex shader reconstructs a world direction from the camera's inverse projection and rotation.
The fragment shader intersects that direction with the original three conceptual layer depths and
uses the original repeats, offsets, tints, alpha and additive composition. Translation is subtracted
before ray evaluation; the floating-origin bridge retains responsibility for global procedural
membership versus frame-local drawing. Horizon/upward rays resolve to the void rather than dividing
by zero or sampling a reversed plane. The material still depth-tests, never writes depth, and keeps
the existing background group order. Camera movement, zoom, aspect and roll need no extra plane rebuild
for coverage; existing resize work for the stars and composition is retained.

### Solid silhouettes and correct moving light

All three debris bands previously cloned one sphere-derived shape compressed to 0.38 on Y. Their GPU
spin changed positions but not normals. That is a concrete lighting defect and a plausible contributor
to the reported hollow, grey half-dome appearance; it is not a claim that every reported artifact has
been reproduced.

`deepFieldDesign.js` defines two asymmetric closed solids as intersections of fracture planes: a
broken block and a sheared splinter. Both are sampled on the same 80-triangle topology. A static
instance attribute chooses the corresponding position AND independently computed normal. Both forms
occur in the low-tier prefix as well as the full count. There is no per-frame geometry morphing,
new draw call, physics body, or instance-matrix upload.

The normal is selected and rotated **before** Three.js applies the instance inverse scale and normal
matrix. The position is selected **before** the existing wrap, edge shrink and spin. The existing
shared authored rock maps, lighting, opaque depth writing and reduced-motion/quality controls remain.

### Finish variation and planetary shadows

Core, belt, fringe and anomaly classes have explicit roughness, metalness and normal-strength finishes
in `DEEP_FIELD_FINISHES`. They interpolate with the existing 1.5-second palette transition. Geometry
and membership do not change when a palette changes. Palette lookup accepts serialized copies by
`nebulaTint`, as the existing sky does. Unknown palettes have a deterministic core finish.

Planet bake art, rings, positions, sizes and cache ownership stay with SpaceBackground. The upgrade
reduces the artificial blue-grey night-side floor and the unlit interior atmospheric rim. Sunlit
surface detail is preserved; dark hemispheres should read as convex silhouettes rather than plastic
bowls. These are art-direction adjustments, not a claim of a physically complete scattering model.

## Runtime integration

The existing ordinary browser/Electron path imports `parallaxLayers.js`, which installs
`spaceBackgroundFrameCoordinates.js` before constructing SpaceBackground. That same explicit boundary
now calls `installDeepFieldPresentation(SpaceBackground)` once. The upgrade wraps only three factories
and the debug stats method; it does not add an update loop, background scene or second state owner.

The large existing SpaceBackground implementation retains baked-resource lifecycle, cached planets,
star/flaring controls, velocity-language integration, region transitions and context restoration.
This narrow installer avoids rewriting those contracts in the same change. Do not stack further
unrelated prototype adapters here. A later owner may fold the factories directly into SpaceBackground
while preserving the tests and deleting the installer in the same commit.

`parallaxLayers.js` calls the new geometry/material helpers directly. Its matrix initialization,
three batches, counts, wrap-cell sizing, edge admission, clocks and origin logic are unchanged.

## Cost contract

| Resource/work | Previous | Candidate |
| --- | ---: | ---: |
| High-tier L0 RGBA8 mip chain | 22,369,620 bytes | 5,460 bytes |
| Mid-tier L0 RGBA8 mip chain | 5,592,404 bytes | 5,460 bytes |
| Low-tier L0 RGBA8 mip chain | 1,398,100 bytes | 5,460 bytes |
| Clear-sector composite texture reads | 3 | 1 |
| Sky-carrier triangles | 2 | 1 |
| Opaque debris batches | 3 | 3 |
| Full-tier debris instances | 1,576 | 1,576 |
| Triangles per debris instance | 80 | 80 |
| Steady-frame instance-matrix uploads | 0 | 0 |

L0 contains a constant near-black floor and sub-LSB dither, not nebula/star artwork. Its allocation
changes from 512–2048 square to 32 square. No authored art, L1/L2 bake size, planet resolution or star
count is downscaled. Disabled nebula layers are skipped by a uniform branch; enabled layers retain
their original blend math. The two extra vertex attributes and one static selector add 23,584 GPU
attribute bytes across the three full bands, excluding driver metadata. They add vertex work, so this
is a trade, not a claim that every GPU instruction decreased.

The byte figures are exact RGBA8 mip-chain arithmetic, not a VRAM profiler reading. No total-game FPS
improvement follows automatically. Measure GPU time and frame-time tails on the target hardware.
`SF.bg.stats()` adds `skyCarrierTriangles`, `voidTextureBytes`, `clearSectorTextureReads` and a
presentation version. `clearSectorTextureReads` describes the zero-opacity path, not every region.

## Extending regions without making the renderer heavier

1. Select the region's existing visual profile. Author a clear hierarchy: one landmark, where the
   ship's flight path remains quiet, and which secondary structure supplies depth. Keep identity and
   placement in the sector/profile/recipe files, not renderer conditionals.
2. Edit the corresponding recipe's explicit control points, widths, colors, anchor and parallax.
   Existing intentionally empty recipes remain empty unless a new visible art change is reviewed.
   New finish classes must be defined in the sector palette authority and `DEEP_FIELD_FINISHES`.
3. Reuse the composite, the two debris silhouettes and the shared surface maps. More colors and
   seeds do not need more draws. New silhouettes require a vertex-attribute budget review: current
   standard mapped, instanced, spinning debris consumes thirteen vertex attribute locations before
   any optional extra UV/tangent inputs. Do not assume every device has spare locations.
4. Capture default, closest, farthest, ultrawide, portrait, low-quality, reduced-motion, movement and
   origin-rebase cases. Compare the same camera, lighting and exposure. A beautiful inspection crop
   does not substitute for the flight camera. Count draws and matrix uploads, inspect shader errors,
   and test repeated resize/sector changes/context restoration before approving a new recipe.

The star/hero coordinate field and existing discrete debris wrap-cell rescaling are not redesigned
here. Their current far-coordinate precision and zoom-reflow limits should not be described as fixed
by the fullscreen carrier. This change addresses the finite composite edge and debris form/lighting.

## Validation

```sh
node --test test/deep-field-design.test.mjs test/deep-field-renderer.test.mjs
node scripts/check-parallax-layers.mjs
node test/deep-field-browser.mjs .devshots/deep-field-component
```

The first test file is renderer-independent and runs without Three.js. The second uses the actual
Three.js geometry and real parallax module. The browser probe compiles and renders the actual
SpaceBackground/parallax components, canonical region profiles and shipped chase camera, captures
four regions plus extreme aspect ratios, and exercises movement without matrix uploads.

The component probe deliberately uses fixed neutral lighting, no authored rock-map preload, no world
assets, no HUD and no game post stack. Its images are **component evidence**, not full-game/browser /
Electron acceptance or final artistic approval. The existing `capture-space-background-acceptance.mjs`
currently forces zoom 92; do not call that the current default 144-WU camera without updating its
capture configuration. Full canonical game/Electron captures and target-hardware timings remain
separate gates. No acceptance ledger or golden gameplay outcome is changed by this PR.
