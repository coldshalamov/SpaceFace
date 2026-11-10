# Lane furniture — construction repair preflight (Tier C family)

Family of six Helios corridor marks. This pass repairs floating parts and
unrooted joints named by the 2026-08-18 still panel. It is not a texture pass
and not a whole-asset G1/G2/G4 close.

- **Fiction:** `design/fiction/LANE_FURNITURE.md`
- **Builder:** `tools/blender/build_lane_furniture.py`
- **Source / live slot:** `assets/places/lane_furniture/source/` and `assets/ships/parts/places/`
- **Supported views:** three-quarter, starboard, rear at play-size framing
- **componentReferenceDecision:** `not_needed` — defects are missing joins, not a trapped component vocabulary
- **Visible-zone register (grouped family):**
  - billed: vane-to-mast join, tally tong arms, ash cut-end/plate/cage, claim streamer hang, locker four-longeron lattice and drum hoops, whistle basket ring
  - retained_reviewed: role-named untextured shells (paint / alloy / bare steel / plate / lens)
  - blocked: none this pass
- **Forbidden reads:** levitating bricks, cardboard fins with no root, crate-on-ladder locker, LEGO tokens in mid-air
- **2026-08-18 construction-repair panel (exact wired bytes):**
  - A: WIRE `place_lane_pin`, `place_cold_locker`; CHECKPOINT the other four (LEGO feet / scatter)
  - B: WIRE_ALL (no floats)
  - C: WIRE_ALL (no floats)
  - Synthesis: admit only the unanimous pair. Tally / claim / ash / whistle stay released on disk.
  - Wired release SHA-256: lane pin `c94e53f749dfd743d8cf9dd069936d5ce0aa2ee244251c54ab0e222d7d7a3a45`; cold locker `fcc05abb5d27ada70146cef9aeab5af23d179253a610da8f38af842473f84d25`
- **Gates:** G1/G2/G4 remain OPEN for the whole family. A selector admit is not a closed surfacing pass.

## 2026-09-06 construction/material repair — CANDIDATE, unexported, unreviewed

Authored in `tools/blender/build_lane_furniture.py` only. **No GLB, manifest, release artifact or
render was produced or updated by this pass.** The existing binaries and hashes above remain the
2026-08-18 build; this record is a candidate description, not acceptance.

Scope: the four held IDs plus the two wired family members, with no runtime or asset writes.

| Held ID | Repair class | What was authored |
|---|---|---|
| `place_tally_post` | structural join | Perimeter deck frame with eight inset grate bars, a ballast sill under the raised deck, and a cut-and-replaced crumpled corner. |
| `place_claim_mark` | structural join | Caller-sized embed plug, welded collar, and overlapping bite tabs keep the mark rooted to its flange. |
| `place_ash_pin` | structural join | Bolted plate with a transverse spar backing bar, cut melt, wired tokens, rooted cage with hollow torus rings, and terminated ballast chain. |
| `place_whistle` | structural join | Endpoint-seated boot, rooted paddle and plaque fasteners, plus an open basket with torus rim, round bars, and gather struts. |

Family-wide, both cameras and both wired assets included:

- **role-specific material response.** Painted shell, identity plate and soot/scorch are dielectric;
  structural alloy and bare steel remain metallic with distinct roughness. Base colours and lens
  emission stay unchanged.
- **manufactured edge break.** `box()` adds one small angle-limited bevel segment, clamped to a
  quarter of the part's thinnest dimension; shading policy is unchanged.

## 2026-09-06 surfacing — image-backed PBR authored in source, NOT yet exported

The controller's review of the four candidate stills found flat role paint: painted shafts reading
as timber, a plain black drum, and alloy without credible microsurface. Scalar roles were the cause —
one roughness value over a whole part has no incident at any distance. The builder now authors real
image data per role rather than colour constants.

- **Images.** `role_images()` generates 256 px `baseColor` (sRGB), packed `orm`
  (R=occlusion, G=roughness, B=metallic, Non-Color) and tangent-space `normal` (Non-Color, green-up)
  datablocks, writes them with `foreach_set`, and **packs them in memory**. No external image file is
  written. Values come from an integer hash and a wrapping value-noise lattice, so runs are
  byte-deterministic and no `random` call exists.
- **Substance separation is structural, not a recolour.** Structural alloy carries wide rolled
  streaks along one axis; bare steel carries tight grinding marks across the other, so the two metals
  differ by microsurface rather than grey value. Painted shell **loses its coating to bare metal**
  at wear patches — a per-texel switch to `metallic=1.0` with substrate colour, which is the specific
  feature that stops a coated shaft reading as timber. Identity plate carries a stencil band and
  glove polish. Scorch is dry and granular with no grain direction. The signal lens stays optical:
  baseColor and ORM only, no normal map, and its existing emission is untouched.
- **UVs.** `project_uvs()` box-projects from world position at a fixed `UV_PER_M`, run after every
  bevel and boolean and before the family scale. Chosen over `smart_project` so texel density is a
  property of the material rather than of the part it landed on. `export_texcoords` is now `True`;
  it was `False`, which would have made any texture inert.
- **Idempotency.** Materials and images are keyed by role name and reused; `reset_scene()` clears
  datablocks between assets, so each asset re-authors identical buffers and nothing accumulates.

Status and open items:

- **componentReferenceDecision:** unchanged — `not_needed`.
- **Surfacing state:** `surfaced_candidate` **in source only**. The six on-disk GLBs, the release
  binaries and every hash recorded above are still the 2026-08-18 untextured build; this pass ran no
  Blender, no export and no render. The release manifest's per-asset `textureProfiles` block
  therefore remains inaccurate for the current binaries, and the parts manifest's `sha256=` short
  hashes remain pre-repair. A rebuild is required before any of that changes.
- **Exporter limitation, unresolved.** Base colour and the packed metallic/roughness pair export
  through ordinary Principled links. **Occlusion does not**: the glTF exporter only emits an
  `occlusionTexture` via a `glTF Material Output` node group with an `Occlusion` input, built through
  a version-dependent interface API. `_occlusion_group()` attempts it and logs a fallback if the API
  differs. If that fallback fires, the ORM red channel is still authored truthfully but is not bound
  to an exported `occlusionTexture`. Which path a build took is only knowable from the build log.
- **Unmeasured:** triangle, byte and draw cost of the edge break, the added joins, and now the
  embedded PNGs — three images per role, embedded per GLB, against current files of 20–140 KB. This
  is expected to be the dominant size change and no build has measured it. Budgets stay hypotheses.
- **Unverified:** texel density, grain scale and wear placement have not been seen on a render. They
  are authored intent until a still exists.
- **Attachment repairs included.** The whistle paddle now has a lid stanchion, and its plaque has a
  drum-side standoff with two fasteners.
- **Gates:** G1, G2 and G4 remain **OPEN** for all six, including the wired pair. Closing any of them
  needs a rebuild, a matched-distance whole-asset still set at supported play framing, and a review
  record bound to the exact candidate hash. No such evidence exists for this candidate, and the
  eighteen stills the 2026-08-18 panel cites are not present in the repository.

## 2026-09-06 build — the surfacing exported BLACK, twice, and why

The pass above was authored but never built. Built, it produced four assets that rendered as black
silhouettes with only the emissive lens visible. Every embedded PNG in every GLB was a **473-byte
solid black 128×128** — baseColor, ORM and normal, six roles, four assets. Nothing in the build log
said so. It took reading channel extrema back out of the exported GLB to see it at all, which is the
lesson worth keeping: a green build and a written material bill are not evidence that a texture
exists.

Two separate faults, both silent:

1. **`bpy.data.images.new()` yields a `GENERATED` image.** Writing `pixels` and calling `pack()`
   raises nothing, but a generated image is re-derived from its `generated_color` fill when it is
   encoded, so the authored buffer is dropped. Fixed by writing the buffer to a scratch PNG once and
   loading that file back as an ordinary `FILE` image, which packs its exact bytes. The scratch file
   is deleted immediately, so no image file is added to the tree.
2. **Assigning `colorspace_settings` AFTER writing pixels re-derives the buffer.** This was the
   real one, and it survived the first fix. Setting `Non-Color`/`sRGB` on a generated image discards
   every texel written before it. The colorspace is now set **before** `foreach_set`. Verified on
   disk: an authored 0.9/0.5/0.2 comes back as 230/128/51.

## 2026-09-06 surfacing review — the four held IDs

Wear was then far too heavy to be service history: oxide covered ~38 % of every alloy face at a
near-black value, and ~26 % of every painted face was stripped to bare metal, so a maintained post
read as a rusted wreck. Thresholds are now restrained — patina and coating loss are each roughly a
tenth of a surface, and the oxide/rust values were lifted off black.

Measured on the exported binaries, not asserted:

| Asset | Release bytes | Release SHA-256 |
|---|---:|---|
| `place_tally_post` | 369,280 | `01a1f7c504a75246…` |
| `place_claim_mark` | 360,072 | `1773faa4efd5bcd4…` |
| `place_ash_pin` | 286,932 | `576767a220b7620c…` |
| `place_whistle` | 393,224 | `4fa6fa9e0283093e…` |

Every material in all four carries a bound `baseColorTexture`, `metallicRoughnessTexture` **and
`occlusionTexture`** (the ORM-red export path the earlier record flagged as version-dependent did
work in Blender 5.1.2), plus `TEXCOORD_0`. Normal maps are bound on every role except the signal
lens, which is optical and correctly has none. Twelve to seventeen images per asset, none black.

Cost, previously unmeasured and now measured: release bytes rise from 22.9–41.5 KB to 286.9–393.2 KB
per asset. That is the embedded PNG set and it is the dominant size change, as expected. The release
build also reports `quantize: Skipping TEXCOORD_0; out of [0,1] range` — correct behaviour for
world-projected tiling UVs, which must not be clamped to one tile.

**Reviewer note, four assets, builder review framing.** Substance separation now reads: the painted
shell is a warm dielectric coat with sparse wear, structural alloy carries rolled streaks, bare steel
reads as a distinctly lighter ground metal (clearest on the claim mark's identity plate), the
stencilled plate and the matte scorch are each their own material. The specific recorded defects —
"painted shafts reading as timber", "a plain black drum", "alloy without credible microsurface" — are
closed at this framing. For calibration, the already-accepted `place_lane_pin` re-rendered by the
same harness is equally dark and carries no microsurface at all, so the low key here is the review
lighting rather than the assets.

**Still open, and stated rather than closed.** G1/G2/G4 remain **OPEN** for all six. This is a
builder-side review at one framing per asset; it is not the matched-distance whole-asset still set at
supported play framing, and it is not an independent hash-bound review. The four IDs stay **held off
the live place selector** — `test/unused-model-live-wire.test.mjs` still guards that, and the wired
pair's binaries and hashes are deliberately untouched by this pass (`--only` covered the four held
IDs alone).
