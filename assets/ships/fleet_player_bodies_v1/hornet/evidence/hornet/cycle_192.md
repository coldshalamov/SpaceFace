# Hornet C192 form, material, and LOD correction

Counted: yes. This is a full production cycle, not a camera-only recapture. The candidate is
`REVISE` pending independent controller-owned review; it is not accepted, wired, or promoted.

## Frozen identity and live boundary

- Asset: `SF_HORNET_PRODUCTION_V1` / `hornet_production_v1`.
- Live body remains C85, LOD0/1/2 hash
  `FDC3636BFC74FA0204D96AE0CE49A4F1D713AB040C74563CB07037B64EB37682`.
- Runtime interfaces, sockets, collision envelope, and display scale are unchanged.
- No Hitch/Kestrel source or live-map files were changed. C192 is an unpromoted candidate.

## C192 intent and result

C192 addresses the causal defects recorded against C191 rather than adding garnish:

- Wing sections are closed airfoil lofts with a deeper inboard/root carry-through, a lower
  load-bearing path, and a trailing flap separated by a recessed slot. The load path and fairing
  use hull/hull-panel values so the wings belong to the pressure shell instead of reading as dark
  cards.
- The dorsal service feature is a recessed cassette with a structural rim, visible floor/walls,
  a metallic radiator core, header, rooted mounts, and a reduced number of fins. It is not a black
  comb floating on the skin.
- C191's broad dark saddle sheets are omitted. The pressure-shell, panel, wing, mechanical, and
  frame roles now carry a restrained cool steel value hierarchy; hard white engine-frame contrast
  is removed without adding decorative greebles.
- The map ladder is 4096/2048/1024 for LOD0/1/2. The 11.01 m authored length gives measured LOD0
  density of `4096 / 11.01 = 372.0 px/m`, inside MTX-17's 256–512 px/m LOD0 band. Lower LOD
  densities are intentionally reduced with the LOD ladder.
- The report's `draws` field is primitive-submit count, not mesh-node count. `meshNodes` is retained
  separately for auditability.

## Exact candidate bindings

| LOD | triangles | hull triangles | primitive submits (`draws`) | mesh nodes | map | bytes | SHA-256 |
|---:|---:|---:|---:|---:|---:|---:|---|
| 0 | 46,568 | 32,992 | 67 | 63 | 4096 | 16,565,940 | `13E2654ECC037417E1E659AC0DCD1BDEADDB81F6C9984A5DC0DB1400D80D1883` |
| 1 | 31,896 | 24,020 | 58 | 54 | 2048 | 13,435,180 | `62A6B836732998C41093AEF5598C3546E3B251016BB6058416B257A3D8D24C20` |
| 2 | 19,008 | 12,634 | 47 | 43 | 1024 | 10,591,072 | `B5DEEC289B4AB0CC865B9B84A859B4C43451F8CC04B498EC239889BB77702BEA` |

Candidate GLBs are copied byte-for-byte into:

`evidence/hornet/cycles/cycle_192/candidates/hornet_production_v1_lod{0,1,2}.glb`

The cycle JSON binds each path, byte count, and hash. The ladder is strictly reducing for total
triangles, hull triangles, and primitive submits; every hull remains above the 12,000-triangle
technical floor. All exported primitives are triangle mode and the authored root/feature names
are checked by the focused structural probe.

## Legal chase evidence

| View | Evidence | Use |
|---|---|---|
| Default chase, D=144 | `cycles/cycle_192/play_chase.png` | required form/silhouette view |
| Abeam chase, D=144 | `cycles/cycle_192/play_chase_abeam.png` | required wing/carry-through view |
| Close chase, D=58 | `cycles/cycle_192/play_chase_close.png` | required canopy/material/service detail view |
| Grazing close | `cycles/cycle_192/grazing_close.png` | diagnostic only |
| Drive rear | `cycles/cycle_192/drive_rear.png` | diagnostic only; not a legal acceptance angle |

The legal captures show the revised closed wing sections, chase-visible carry-through, framed
canopy, twin drives, and dorsal cassette. Formal whole-asset judgment remains `REVISE` until the
independent review is complete; these stills are evidence, not self-acceptance.

## Pending independent review slots

The cycle JSON contains exactly three pending slots:

1. `form-and-chase-continuity`
2. `material-and-visible-zones`
3. `technical-lod-and-runtime-admission`

No slot is marked accepted. C85 remains live and no runtime promotion is authorized by this cycle.
