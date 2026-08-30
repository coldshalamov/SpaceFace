# Hornet C194 structural-read revision

Counted: yes. C194 is a bounded production revision of the C193 candidate. It is not
runtime-wired, accepted, or promoted.

## Frozen identity and live boundary

- Asset: `SF_HORNET_PRODUCTION_V1` / `hornet_production_v1`.
- Live body remains the C85 release body; no live manifest, parts-library, Hitch/Kestrel, or
  runtime files were changed.
- Existing sockets, collision envelope, +X forward convention, display scale, and LOD slots are
  unchanged.
- Candidate GLBs are byte-bound under
  `evidence/hornet/cycles/cycle_194/candidates/hornet_production_v1_lod{0,1,2}.glb`.

## C194 correction intent

C193 had the correct construction ingredients but they still blended at player size. C194 makes
the requested structures carry their own depth and material role:

- Wing root fairings are deeper four-station carry-through volumes in the mechanical role.
- Each wing has a formed lower load path, a separate dark flap, and a wide recessed flap channel;
  the primary wing silhouette and canard identity remain unchanged.
- The dorsal radiator well is larger and deeper, with a restrained five-wall cassette, dark floor,
  lifted core, header, header-feed hose, and two sloped rooted mount plates. It reads as serviceable
  hardware before the fins.
- C194 retains the quiet blue-steel/teal palette and adds contrast only to the changed structural
  zones. No decal noise, texture-density cut, or runtime quality fallback was added.
- The final authored mesh is passed through `Mesh.validate(clean_customdata=True)` after the last
  triangulation. This removes the prior Blender LOD0/LOD2 invalid-mesh exporter warning before
  tangent generation.

## Player-view review

All stills are original 1600x900 renders from the sanctioned builder cameras:

| View | Evidence | Read |
|---|---|---|
| Default chase, D=144 | `cycles/cycle_194/play_chase.png` | Interceptor silhouette, framed canopy, twin drive throats, and darker carry-through read at play scale. |
| Abeam chase, D=144 | `cycles/cycle_194/play_chase_abeam.png` | Paired wing roots and lower load paths remain visible instead of collapsing to one card edge. |
| Close chase, D=58 | `cycles/cycle_194/play_chase_close.png` | Separated flap/channel, mechanical root depth, and framed radiator/core/mount assembly are legible. |
| Close clay, D=58 | `cycles/cycle_194/clay_play_chase_close.png` | The recesses and thickness survive without material contrast or decals. |
| Drive rear / grazing close | `cycles/cycle_194/drive_rear.png`, `cycles/cycle_194/grazing_close.png` | Diagnostic continuity views; twin ceramic throats and canopy opening remain intact. |

The C194 delta is materially clearer than C193 at D=144/D=58 and removes the original
card-wing/flat-cassette failure. Whole-asset visual verdict remains **REVISE** for the Hitch floor:
the Hornet now communicates its requested wing and radiator mechanisms, but its broad pressure
shell still has materially less surface articulation and contrast than the live Hitch reference.
That is a player-visible quality gap, not a technical failure of the C194 structures. C194 is
therefore retained as a useful candidate revision but is not a self-acceptance or promotion claim.

## Exact final-binary metrics

Values below are parsed from the final candidate copies after the C194 export. `draws` and
`primitiveSubmits` exclude the hidden collision primitive and count visible indexed primitives.

| LOD | indexed triangles | hull triangles | visible submits | mesh nodes | map | density | bytes | SHA-256 |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 0 | 48,315 | 33,205 | 68 | 64 | 4096x4096 | 372.0 px/m | 15,391,960 | `0E5B82D2C2EF2CD4F75CAC6EF5955CA6B3DC21D7A152B57E030CC6256964677D` |
| 1 | 33,588 | 24,062 | 58 | 56 | 2048x2048 | 186.0 px/m | 6,817,500 | `EC1578328924CF6BB20FD8F76B9F4577A5D66A2DE7595E803222460069B83B7E` |
| 2 | 20,515 | 12,735 | 47 | 45 | 1024x1024 | 93.0 px/m | 3,453,076 | `6E317745FBCC2088E15DA1D753C7AB235BC937C2ECF7B456E05B301C1D530C17` |

The ladder is strictly reducing and every hull remains above the 12,000-triangle floor. The
binary audit found only indexed triangle primitives, with `TANGENT` on every visible primitive
(68/68, 58/58, 47/47); the normal-mapped subset was 46/36/27 and had no missing tangents. The
LOD2 flap remains intentionally omitted by the existing LOD policy, while its root/load-path and
radiator construction stay present.

## Warning and validation disposition

- Blender 5.1.2 completed the deterministic build; canopy, both drive wells, and the radiator
  well all reported `hit`.
- The prior `Mesh LOD0_Hull_Mesh is not valid` / `LOD2_Hull_Mesh is not valid` messages no longer
  appear after final mesh validation. The build reports the two repaired final hull meshes before
  export.
- Blender still emits its known “More than one shader node tex image used for a texture” advisory
  for materials that intentionally have separate base-color, normal, and metallic-roughness
  images. Direct GLB inspection proves each role is bound to its matching embedded image and
  glTF slot (`baseColorTexture`, `normalTexture`, `metallicRoughnessTexture`) at the expected
  ladder size; no sampler fell back to a wrong role in the exported binary. This is retained as a
  documented exporter advisory, not hidden.
- `tools/foundry/validate_foundry_glb.mjs` passes all three candidate GLBs. Its 27 LOD0 warnings
  are the expected 4096-map-over-2048 advisory; LOD1 and LOD2 have zero warnings. The direct
  binary audit has zero index, primitive, image-dimension, or tangent errors.
- The repository Khronos wrapper could not run in this sparse worktree because its configured
  external `gltf-validator` module is absent (`MODULE_NOT_FOUND`). No Khronos zero-issue claim is
  made; this dependency boundary is explicitly reported for controller-side rerun.

## Verification and review boundary

- `python -m py_compile tools/blender/build_hornet_form_c186.py`: pass.
- Deterministic Blender C194 export and original-resolution still capture: pass.
- Exact hashes, byte sizes, embedded map dimensions, indexed metrics, node presence, and tangent
  coverage: pass.
- Whole-asset G1/G2/G4 and runtime admission remain controller-owned gates. C85 remains live; no
  promotion is authorized by this cycle.
