<!-- LIFETIME: ASSET_EVIDENCE -->
# PQ-193.03 — exact shipped-file chase verification (buoy / beacon / pin / Hitch reference)

Leaf done-when: *same-slot replace; a stranger can name the job at 144 WU; not a tube-plus-ring
next to Hitch.* This record binds fresh stills to the exact shipped source GLBs, not candidates.

Rendered 2026-09-11 with `tools/blender/render_glb_chase_stills.py` on Blender 5.1.2
(`ec6e62d40fa9`), legal cameras only: `play_chase` (D=144), `play_chase_abeam` (D=144),
`play_chase_close` (D=58), plus clay at both distances. Hitch reference:
`assets/ships/parts/wholeships/kestrel.glb` at the same cameras (11.8% frame width at D=144 —
matches the documented starter occupancy band).

## Exact candidates (SHA-256 of the reviewed source GLB)

| Object | Source GLB | SHA-256 | Bytes | LOD0 tris |
|---|---|---|---|---|
| Nav buoy | `parts/places/place_nav_buoy.glb` | `edcfd2779a4248c32d71a3f8984644be8fadbeedac9493e13d869955ad9e0780` | 430,492 | 1876 |
| Lane beacon | `parts/places/place_lane_beacon.glb` | `28f3d7466845bdde94b155d4c1ab3622830db6b1b8a30fcea0bc902523470836` | 3,817,260 | 1488 |
| Cargo pod | `parts/pods/pod_cargo_container.glb` | `27691f904e7e13586fc6c5e2d3f937a8668f8e3243f934d5ca3612be28aff940` | 372,488 | 3976 |
| Lane pin (context) | `parts/places/place_lane_pin.glb` | `c620c4e690e1fe574d7caf3ad777b0f440a14916badc9091851f0bdb7f731196` | 50,704 | 584 |
| Hitch reference | `parts/wholeships/kestrel.glb` | reference only — Hitch frozen | — | 37,952 |

## Reads at the legal cameras

- **Nav buoy** — wide bezelled lantern drum with four glazed pane facets under a dark overhanging
  cap, orange hazard collar, warm-bone mast, gold-anodized tilted radiator wings, cruciform
  stabilizer cage at the keel. The pane/mast emission carries at D=144; at D=58 the head→neck→
  collar→cage profile is unambiguous. Same authored object the 2026-09-10 material-truth review
  passed whole-asset (`assets/ships/m5_navigation_infrastructure/reports/material_truth_v2/`).
- **Lane beacon** — L-gantry: square plinth with clevis feet, thick painted mast with a cyan hook
  lamp at the tip, twin separated rails reaching to an outbound pod with a recessed circular well.
  At D=144 the L silhouette and signal point read; at D=58 the truss arm shows real separation
  (backdrop visible between rails). Not a post-plus-cube.
- **Cargo pod** — closed ISO can: sealed lid above the side ribs, one offset recessed hatch well,
  raised ID plate, waist stripe, corner castings, door-end bar, eight roof bolts. At D=144 a pale
  freight box; at D=58 the lid + hatch + castings name it "cargo". The open-top fence read is gone.
- **Lane pin** (context only — leaf `.11` family) — mast with cap lamp, chevron housing + lit lens,
  X-vane pair, ballast drum on four braced feet. Already manufactured; no work needed here.

## Same-slot contract verified

- `SOCKET_Structure_Core` present in buoy and beacon; `MOUNT_Child` present in the pod.
- `COLLISION_HULL` empties intact on buoy and beacon.
- Roots unchanged: `SF_M4_HELIOS_NAV_SPIRE_ROOT`, `SF_M4_HELIOS_GANTRY_ROOT`, `pod_cargo_container`.
- Envelopes match the frozen preflight values (buoy 2.975×15.3×2.8 m; beacon 10.85×14.5×3.5 m;
  pod 5.21×2.425×3.0 m). No filename, selector, or `partsLibrary.js` change.

## Release / package parity

- `release_manifest.json` `sourceSha256`/`releaseSha256` match disk for all three.
- `render-packages/{nav-buoy,lane-beacon,pod-cargo-container,lane-pin}` recompiled against current
  `pilots.json`; `--check --only=` on the four keys is fresh. (`apron-shuttle` staleness elsewhere
  in the full check is foreign pre-existing work.)
- `parts_manifest.json`: buoy row restored `triangleMetric: "lod0"` (its `tris: 1876` is the
  documented LOD0 count; the 9/10 promotion dropped the field, producing the only leaf-asset FAIL).

## Verdict

KEEP — all three leaf objects read as manufactured hardware at the supported cameras, same game
as Hitch (mixed materials, wells, rooted construction), none a tube-plus-ring. `place_lane_pin`
fails `check-parts-manifest` on texture/bounds fields belonging to the leaf `.11` lane-furniture
row; pre-existing and intentionally untextured source — out of this leaf's named scope.
