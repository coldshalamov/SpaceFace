# Deep-field background: rendering and extension guide

## Art direction

SpaceFace uses a position-following, non-yaw-following chase camera: ordinarily 144 WU, 60 degrees
above XZ, with a 50-degree vertical FOV (`src/render/camera.js`). The background needs scale and
travel cues without covering combat with a luminous fog wall. A camera-locked photograph loses
spatial continuity; a volumetric raymarch spends the frame on its least interactive pixels.

The hierarchy is near-black negative space, remote stellar formations, individual stars, sparse
celestial landmarks, opaque fractured matter, then the ship and high-energy gameplay effects.
The flight corridor stays relatively quiet. Existing sector profiles and deep-field recipes retain
authority over celestial objects; this change adds no simulation objects or new lore.

## Implementation

### Sky coverage

`deepFieldDesign.js` contains the full-viewport triangle shaders. The old finite XZ carrier could
expose an edge or far-plane intersection under the chase camera. The replacement reconstructs a
world direction from inverse projection and camera rotation, intersects the original conceptual
layer depths, and preserves their UV repeats, offsets, tints and blend math. It cannot expose a
world-space carrier edge. Horizon/upward rays resolve to the void rather than divide by zero.
The carrier depth-tests, never writes depth, and retains the existing background ordering.

Clear sectors sample L0 only. Enabled nebula layers keep their original composition. The L0 texture
contains a near-constant black floor and sub-LSB dither, not nebula or star artwork: its allocation
is now 32 square rather than 512–2048 square. L1/L2, planet resolution and existing star counts remain.

### Fractured debris and planetary shadows

The old debris cloned one sphere-derived shape flattened to 0.38 on Y. Its GPU spin rotated positions
but not normals. That is a lighting defect and a plausible contributor to the reported gray half-domes,
not proof that every reported artifact was reproduced.

`projectDebrisVertex` defines two closed asymmetric fracture-plane solids: a block and a sheared
splinter. Both use the same 80-triangle topology. Static attributes choose the matching position AND
independently computed normal. Selection precedes the existing wrap/shrink/spin; normal rotation
precedes Three's instance inverse scale and normal matrix. Both forms occur in low-quality prefixes.

Shared rock maps, three opaque batches, original counts, frame-origin continuity and matrix buffers
remain. Roughness, metalness and normal strength vary through the existing 1.5-second palette
transition, without morphing or respawning rocks. Serialized palettes resolve by `nebulaTint`.
Planet bake changes reduce the artificial blue-gray night-side floor and unlit atmospheric rim;
sunlit detail, rings, placement, sizes and cache ownership remain unchanged.

### Resolved stellar formations

The first actual GPU component captures repaired the debris but still looked like rocks over an
empty sky. The second iteration adds a remote stellar scale in `deepFieldStars.js`:

| Existing recipe ID | Stellar composition |
| --- | --- |
| `helios_orbital_void` | Restrained edge-on spiral opposite the ringed planet |
| `belt_broken_dust_lane` | Amber stellar river |
| `fringe_tidal_filament` | More open blue spiral |
| `anomaly_electromagnetic_scar` | Divided blue stellar stream |
| `core_trade_constellation` | Populous warm-white spiral seen nearly face-on (the DEFAULT_STRUCTURE fallback and the core-class sectors) |
| `galactic_spur` | One wide, gently tilted galactic band across the top of the glass |

These are art extrapolations, not new named places. The shape comes from thousands of individual
stars following explicit spiral/stream trajectories with seeded membership, not large soft cards,
fog, noise textures or an animated density field. The existing sky-only `bg-l3-stars` exception in
`SOFT_CARD_INVENTORY.json` names the new source. Points stay at sky depth and at most 4.5 pixels.

Six interleaved static populations (one per authored deep-field recipe, so no region's sky is
silently dark) share one geometry, material and draw. High tier shows 8,192 stars in the active
formation; mid shows 4,096; low shows 2,048. Regional changes crossfade population weights, never
morph star positions. Inactive populations are clipped before rasterization. The six banks occupy
1,572,864 attribute bytes. Quality changes adjust draw ranges, not buffers. Per-draw work is six
weight/phase updates (float uniform arrays indexed by the star's family), not a per-star loop. Phase
is reduced in JS doubles before upload. A recipe with no formation sets the draw range to zero, so a
dark sky submits no vertices. `rebuildDeepFieldStars` runs on every `_buildLayers` (first bake,
sector bakes, every resize): unchanged placement inputs return the existing record untouched; a
changed aspect/tier/camera height refills the same typed arrays and material in place — no
allocation, no shader recompile, crossfade weights preserved — so a window drag cannot feed the GC
wall. Only a missing camera retires the layer.

### Runtime wiring and ownership

The ordinary renderer imports `parallaxLayers.js`, which installs the existing frame-coordinate
bridge before constructing SpaceBackground. That boundary calls `installDeepFieldPresentation` once.
The installer wraps three factories and debug stats; it creates no second scene or simulation/update
owner. The stellar layer lives in the existing background root. Its per-draw callback updates only
uniforms and a draw range. The bridge marks its temporary global projection scope so a resize cannot
add the frame origin twice. The original SpaceBackground retains its resource lifecycle and controls.

Do not stack unrelated prototype adapters here. A future owner can fold these factories into
SpaceBackground and delete the installer in the same change, keeping the regression tests.

## Cost contract

| Resource/work | Previous | Candidate |
| --- | ---: | ---: |
| High-tier L0 RGBA8 mip chain | 22,369,620 bytes | 5,460 bytes |
| Mid-tier L0 mip chain | 5,592,404 bytes | 5,460 bytes |
| Low-tier L0 mip chain | 1,398,100 bytes | 5,460 bytes |
| Clear-sector composite texture reads | 3 | 1 |
| Sky-carrier triangles | 2 | 1 |
| Stellar-formation draws / attribute bytes | 0 / 0 | 1 / 1,048,576 |
| Opaque debris draws / instances / triangles each | 3 / 1,576 / 80 | unchanged |
| Steady-frame instance or stellar-position uploads | 0 | 0 |

The two extra debris vertex attributes and static selector add 23,584 bytes across the three bands.
After these and the stellar banks, modeled high-tier net storage savings are 21,292,000 bytes (about
20.3 MiB), excluding unchanged resources and driver metadata. These are allocation arithmetic, not
VRAM-profiler results. The new stellar layer adds a draw and vertex work; it is not a free effect.
No total-game FPS claim follows from these numbers. Measure frame tails and GPU time on target hardware.

`SF.bg.stats()` adds the carrier triangle count, void bytes, clear-path texture reads and the stellar
formation name, population and bytes. The clear-path read count is not a claim about every region.

## Extending a region

1. Select its existing `sectorVisualProfiles.js` profile and `deepFieldStructureRecipes.js` recipe.
   Keep identity and celestial placement there, not in renderer conditionals. Preserve deliberately
   empty phenomenon recipes unless an explicit new art change is reviewed.
2. For stellar composition, edit `STELLAR_FORMATIONS`, keyed to that same deep-field recipe ID.
   Anchor, span, inclination, cool/warm hue, intensity and parallax are data. Keep stars at sky depth
   and leave the flight corridor readable. The bank count follows the table (float uniform arrays,
   no vec4 ceiling); adding a recipe means adding its formation row here, and the stars test fails
   until every recipe in `deepFieldStructureRecipes.js` has one. Each bank costs 262,144 bytes.
3. Reuse the composite, two debris solids and shared rock maps. More colors do not require new draws.
   A new debris silhouette needs a vertex-attribute budget review: spinning mapped instancing already
   uses thirteen locations before optional additional UV/tangent inputs.
4. Capture default/close/far, ultrawide/portrait, low tier, motion-reduced, moving and origin-rebased
   views with matched camera/light/exposure. Inspect geometry, occlusion, shader errors and transitions;
   count draws and buffer updates. Test repeated resize, tier/sector changes and context restoration.

Existing debris wrap-cell zoom reflow and distant star/hero precision limits are not redesigned here.
The fullscreen carrier fixes the finite composite edge, not every possible popping defect.

## Validation and evidence scope

```sh
node --test test/deep-field-design.test.mjs test/deep-field-renderer.test.mjs test/deep-field-stars.test.mjs
node scripts/check-parallax-layers.mjs
node test/deep-field-browser.mjs .devshots/deep-field-component
```

The first suite is renderer-independent. The other suites use the real Three.js geometry/materials,
shader integration, regional transitions, quality prefixes, static buffers, rebases and disposal.
The browser probe compiles/renders the actual background and parallax components at the shipped chase
camera, captures four regions and extreme aspect ratios, and exercises movement, rebase and low tier.
The dedicated CI workflow uploads screenshots and a JSON report for the exact commit it checks.

This is component evidence with fixed neutral lighting, no authored rock-map preload, no world assets,
HUD or game post stack. It is not full-game/Electron acceptance or target-hardware timing. The existing
`capture-space-background-acceptance.mjs` forces zoom 92; do not call that the current default 144-WU
view without changing its capture configuration. No acceptance ledger or golden sim outcome is changed.
