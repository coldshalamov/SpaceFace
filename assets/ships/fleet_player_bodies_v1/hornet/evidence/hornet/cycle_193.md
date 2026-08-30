# Hornet C193 binary, chase-form, and material correction

Counted: yes. C193 is a full production cycle and is `REVISE` pending independent controller-owned
review. It is not accepted, wired, or promoted.

## Frozen identity and live boundary

- Asset: `SF_HORNET_PRODUCTION_V1` / `hornet_production_v1`.
- Live body remains C85, LOD0/1/2 hash
  `FDC3636BFC74FA0204D96AE0CE49A4F1D713AB040C74563CB07037B64EB37682`.
- Runtime interfaces, sockets, collision envelope, and display scale are unchanged.
- No Hitch/Kestrel source or live-map files were changed. C193 is an unpromoted candidate.

## C193 correction intent

C193 fixes the binary and visual defects recorded against C192:

- The map generator now replaces stale packed 1024 images before export. Final GLB inspection sees
  4096x4096, 2048x2048, and 1024x1024 embedded PNGs in LOD0/1/2 respectively; density is derived
  from those embedded dimensions, not the source PNG filenames.
- Main wings use a shorter, thicker closed airfoil section. Aft flap surfaces are separate from the
  main trailing edge, with a real recessed channel between them. A thicker tapered lower load path
  is rooted below the wing carry-through and survives the chase framing.
- The dorsal service opening is a larger recessed cassette with deeper rim/walls, a lifted core,
  header, and shoulder-mounted rooted mounts. Fins are reduced so the cassette reads before the
  heat-exchanger detail.
- The material floor is calmer: lifted blue-steel wing/armor values, reduced UV1 micro response,
  no broad saddle sheets, and no reliance on line or texture contrast for the wing separation.
- Final post-export tangent preparation triangulates after modifier application and calls Blender's
  tangent calculation. The binary report fails closed if a flap, lower-load-path, or service-hose
  primitive lacks `TANGENT`.

## Exact final-binary metrics and bindings

The following values are parsed from the final source GLBs after export. `draws` and
`primitiveSubmits` count visible indexed primitives; the hidden collision primitive is excluded.

| LOD | indexed triangles | hull triangles | visible submits | mesh nodes | embedded map | density | bytes | SHA-256 |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 0 | 46,555 | 33,023 | 65 | 61 | 4096x4096 | 372.0 px/m | 15,239,872 | `C83491BD4CD1C47D7E1BEC3AAE2A48FA77041B087003023F48D65AE9E6247392` |
| 1 | 31,852 | 23,912 | 55 | 53 | 2048x2048 | 186.0 px/m | 6,683,664 | `D75BBF76A89F8B3FF295D5C2D11D3F52DDF4E27EAB2DB02227EAECF4F39DB793` |
| 2 | 18,819 | 12,629 | 44 | 42 | 1024x1024 | 93.0 px/m | 3,324,684 | `23DA89018726B1075B44700CD046518DC1DCCFA58657ABBDE26F579E930E978A` |

The candidate copies are byte-for-byte bound under
`evidence/hornet/cycles/cycle_193/candidates/hornet_production_v1_lod{0,1,2}.glb` and in
`cycle_193.json`. The triangle, hull, and submit ladders are strictly decreasing; all hulls remain
above the 12,000-triangle floor. The final binaries contain only triangle primitives, and every
visible normal-mapped primitive has a tangent attribute (`65/65`, `55/55`, `44/44`).

## Legal chase evidence

All required stills are original 1600x900 captures from the sanctioned runtime-faithful cameras.

| View | Evidence | Use |
|---|---|---|
| Default chase, D=144 | `cycles/cycle_193/play_chase.png` | required form/silhouette view |
| Abeam chase, D=144 | `cycles/cycle_193/play_chase_abeam.png` | required wing/carry-through view |
| Close chase, D=58 | `cycles/cycle_193/play_chase_close.png` | required canopy/material/cassette view |
| Grazing close | `cycles/cycle_193/grazing_close.png` | diagnostic only |
| Drive rear | `cycles/cycle_193/drive_rear.png` | diagnostic only |

The stills are supplied for independent review. They do not constitute self-acceptance.

## Pending independent review slots

The cycle JSON contains exactly three pending slots:

1. `form-and-chase-continuity`
2. `material-and-visible-zones`
3. `technical-lod-and-runtime-admission`

No slot is marked accepted. C85 remains live and no runtime promotion is authorized by this cycle.
