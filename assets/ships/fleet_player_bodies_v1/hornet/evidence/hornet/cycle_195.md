# Hornet C195 whole-hull articulation revision

Counted: yes. C195 is a bounded production revision from the exact clean C194 checkpoint.
It is not runtime-wired, independently accepted, or promoted.

Base commit: `62c07fc9ca545be7b5026ba718d99739c096db77` (clean before C195 authoring).

## Frozen identity and live boundary

- Asset: `SF_HORNET_PRODUCTION_V1` / `hornet_production_v1`.
- The live body remains the C85 release body. No runtime manifest, parts-library, Hitch/Kestrel,
  or runtime files were changed.
- Existing sockets, collision envelope, +X forward convention, display scale, and LOD slots are
  unchanged.
- Candidate GLBs are byte-bound under
  `evidence/hornet/cycles/cycle_195/candidates/hornet_production_v1_lod{0,1,2}.glb`.

## C195 correction intent

C194 made the wing-root and radiator mechanisms readable but left the pressure shell broad beside
the live Hitch. C195 changes the approach from isolated feature garnish to four connected,
shadow-catching manufactured zones:

- Nose/canopy service shoulders: paired thick hull-panel plates follow the cockpit opening and
  terminate before the spine; paired dark access breaks provide a real recessed seam.
- Central spine/shoulder load paths: a raised spine crown and paired mechanical shoulder rails
  bridge the cockpit service zone to the aft houses; the close/default LODs add only two structural
  ribs at the major break.
- Wing-root/underside mechanism: paired thick torque-box plates overlap the accepted C194 root
  fairing and lower load path; a recessed hinge plate makes the carry-through read as one formed
  mechanism rather than a card wing.
- Aft drive service: paired tapered service plates root the drive houses into the shell and leave
  the accepted twin ceramic throats open; restrained band plates catch the aft transition.

All added pieces are real folded-sheet volume using existing authored material roles. There is no
uniform grid, decal noise, random greeble scatter, or quality/texture cut. The C194 framed canopy,
thick wing roots, separated flap/channel, recessed radiator cassette/header/root mounts, and twin
drive identity are retained.

## Player-view review

All player-facing stills are original 1600x900 renders from the sanctioned chase camera. D=144 is
the legal default distance; D=58 is the legal close distance. `grazing_close` and `drive_rear` are
diagnostic continuity views, not alternate player camera claims.

| View | Evidence | Read |
|---|---|---|
| Default chase, D=144 | `cycles/cycle_195/play_chase.png` | Twin-drive interceptor silhouette, framed canopy, wing carry-through, and the four-zone break pattern remain identifiable at play size. |
| Abeam chase, D=144 | `cycles/cycle_195/play_chase_abeam.png` | The shoulders and thick root/underside structures retain depth from the side-on legal view. |
| Close chase, D=58 | `cycles/cycle_195/play_chase_close.png` | Nose service break, spine rails/ribs, wing torque/hinge, and aft service plates read as layered construction rather than one flat shell. |
| Close clay, D=58 | `cycles/cycle_195/clay_play_chase_close.png` | The major breaks survive without material contrast, decals, or texture patterning. |
| Diagnostic close/rear | `cycles/cycle_195/grazing_close.png`, `cycles/cycle_195/drive_rear.png` | Thickness, overlaps, aft service transitions, and open twin throats are present; these views are not used to inflate player-view acceptance. |

The exact same-resolution live Hitch source is preserved at
`assets/ships/kestrel_borrowed_time_v4/evidence/hitch/cycles/compare_gameplay/kestrel_live_v9.png`.
Pixel-preserving composites are recorded at:

- `cycles/cycle_195/hitch_compare_d144.png` — C195 default D=144 beside the live Hitch gameplay
  still (both source panels are 1600x900).
- `cycles/cycle_195/hitch_compare_d58_vs_live_d144.png` — C195 close D=58 beside the same live
  Hitch D=144 baseline. The right panel is explicitly not mislabeled as a D=58 Hitch capture;
  no exact live Hitch D=58 counterpart is present in the checked-in reference set.

The whole-hull read is materially better than C194: the broad uninterrupted center has a coherent
nose-to-drive articulation rhythm, and the new plates are thick enough to cast their own breaks.
The accepted interceptor silhouette, canopy, twin drive throats, wing-root load paths, and
radiator assembly hold. At D=58 the four zones are unmistakable; at D=144 the primary zones stay
legible without becoming a noisy texture pattern.

Whole-asset verdict: **REVISE** for the strict live-Hitch floor. C195 is a keep-worthy structural
delta over C194, but the live Hitch still wins the whole-frame side-by-side on fine mechanical
density, small service hardware, and value variation across the aft and dorsal surfaces. The
remaining gap is player-visible and not explained by missing tangents, culling, or package failure.
This candidate is therefore retained for the next deliberate art pass and is not promoted.

## Exact final-binary metrics

Values below were parsed from the final source GLBs and matched against the copied candidate GLBs.
`visible submits` and `mesh nodes` exclude the hidden collision primitive. All visible primitives
are indexed triangle lists.

| LOD | indexed triangles | hull triangles | visible submits | mesh nodes | map | density | bytes | SHA-256 |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 0 | 49,863 | 33,205 | 85 | 81 | 4096x4096 | 372.0 px/m | 15,674,048 | `2535209301C301E6DCCC3249C53FE412EC78B443F4855681E3939DF62BA34C2C` |
| 1 | 35,136 | 24,062 | 75 | 73 | 2048x2048 | 186.0 px/m | 7,099,624 | `6F2AF616695219C414FC87D85597849509099DE05901AFA45E329A84CCF8C21C` |
| 2 | 21,295 | 12,735 | 56 | 54 | 1024x1024 | 93.0 px/m | 3,595,616 | `7A9EAB3CEA36222CBDA5B1B115098FCC81353F050D3B886863C994D839878091` |

The ladder is strictly reducing and every hull remains above the 12,000-triangle technical floor.
The final direct audit found `TANGENT` on every visible primitive (85/85, 75/75, 56/56). The
normal-mapped subsets are 55/45/36, with zero missing tangents. C195 LOD2 intentionally omits the
existing flap/hinge/rib/band detail under the established LOD policy while retaining the major
wing torque, spine, nose, and drive service zones.

Embedded PNG dimensions are exactly 4096x4096, 2048x2048, and 1024x1024. Candidate copies have the
same byte size and SHA-256 as the source GLBs.

## Warning and validation disposition

- Blender 5.1.2 completed the deterministic C195 build; canopy, both drive wells, and radiator
  well all reported `hit`.
- The prior `Mesh LOD0_Hull_Mesh is not valid` / `LOD2_Hull_Mesh is not valid` warnings remain
  eliminated by final mesh validation after triangulation. No invalid-mesh warning appeared in the
  C195 build output.
- Blender still emits its known “More than one shader node tex image used for a texture” advisory
  for authored materials that intentionally carry separate base-color, normal, and
  metallic-roughness images. Direct GLB inspection confirms matching role/channel bindings and
  the expected map ladder; no wrong sampler fallback was found. This advisory is documented, not
  hidden.
- `tools/foundry/validate_foundry_glb.mjs` passes all three candidates. Its LOD0 warnings are the
  expected 4096-map-over-2048 advisory; LOD1 and LOD2 have zero warnings. Direct binary checks have
  zero primitive, index-mode, image-dimension, or tangent errors.
- `tools/art/validate_gltf_assets.mjs` could not start because the configured external Khronos
  module is absent (`C:\Users\93rob\AppData\Local\Temp\spaceface-gltf-validator\node_modules\gltf-validator`,
  `MODULE_NOT_FOUND`). This is the single environment validation gap; no Khronos zero-issue claim
  is made.

## Verification and review boundary

- `python -m py_compile tools/blender/build_hornet_form_c186.py`: pass.
- Deterministic Blender C195 export and original-resolution chase still capture: pass.
- Exact hashes, byte sizes, embedded map dimensions, indexed metrics, node presence, and tangent
  coverage: pass.
- `npm run --silent check:asset-pipeline-contract`: pass (15 ok, 0 fail).
- `npm run --silent check:render-package-pilots`: pass (223 production packages).
- `npm run --silent check:render-package-coverage`: pass (223 production assets packaged; 3 explicit
  development-only assets excluded).
- Whole-asset G1/G2/G4 and runtime admission remain controller-owned gates. C85 remains live; no
  promotion is authorized by this cycle.
