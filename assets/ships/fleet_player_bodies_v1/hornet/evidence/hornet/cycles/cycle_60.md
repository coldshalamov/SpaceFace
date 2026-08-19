# Hornet cycle 60 — no Exact hull boolean

**Counted:** yes. Full-job attempt: form, UV, bake, surface, LOD, three valid stills, three subagent reviews.

**LOD0 sha256:** `3F6A8F87E954CFE2…`

| LOD | Hull triangles | Total | Bytes |
|---:|---:|---:|---:|
| 0 | 13,591 | 40,639 | 21.3 MB |
| 1 | 13,591 | 34,831 | 9.4 MB |
| 2 | 13,591 | 32,639 | 8.5 MB |

Hull triangles fell from 21,966. That breaks the packet floor. Do not treat this as an improvement on C59.

## Framing (author)

- `three_quarter.png`: I can see bow, stern, wings/span, and the whole height. 1014×397.
- `starboard.png`: I can see bow, stern, full length, top and keel. 1181×234.
- `rear.png`: I can see both bells, bow, span, top and keel. 1138×657.

## What changed from 59

Exact hull booleans removed. Wells opened by deleting dorsal/flank faces and lining with five-wall tubs. Bells lengthened; vane root blocks added. Fill light raised. Hull albedo lightened. Wing underside rib removed.

## Machine numbers

```
starboard   1181 x 234  (5.05:1)  enclosed 15 / 21.7%  dark/mid/hot 52.9 / 38.3 / 8.8
three_qtr   1014 x 397  (2.55:1)  enclosed 26 / 5.9%   54.9 / 21.1 / 24.0
rear        1138 x 657  (1.73:1)  enclosed 11 / 2.9%   46.5 / 26.8 / 26.6
```

`Pressure_Hull_Mesh`: **26 shells, OPEN, 29 boundary edges.** Face-delete made the openings real; it did not restore one body. `inset_large_faces` on a zero-thickness loft punches the skin.

Largest starboard hole 8318 px — see-through at mid body.

## Reviews

Subagents: `0702eb9e` three-quarter, `4a77b994` starboard, `6a744b05` rear.

| Angle | Verdict | Headline |
|---|---|---|
| three-quarter | **REVISE** | Player still is a punched cage. Clay is a gray tube with a card wing. |
| starboard | **REVERT** | Same plate-cage class as cycle 59. Restore a solid hull. Do not iterate this mesh. |
| rear | **REVISE** | Apertures still caps, not throats. Hull broken. Floating plates. |

### Three-quarter (REVISE)

Player-obvious: see-through midship and bow; black holes with white shards; paper card wing; cone drive; no cockpit; one gray plastic; missile silhouette.

Build next: stop inset and face-delete on the paper loft. One manifold shell from different station rings. Solidify. Boolean wells only after that, with 4–12 cm rims and tubs that fill the profile. Lofted wing with thick root. Spun bottle with a real throat. Unique paint vs metal vs glass.

### Starboard (REVERT)

Player-obvious: 21.7% backdrop through the body; empty bow; lattice mid hull; cones on sticks; hairline spikes; 5:1 broken stick.

Build next: discard this mesh. Restore C54-class closed hull with C59 raised stations. Solidify 8–12 cm. Then Exact-boolean canopy and radiator. Plates sit on the shell.

### Rear (REVISE)

Apertures: longer bottles than C59, still lids — vane fan on a flat circular terminator. No inner walls receding into a chamber.

Build next: one watertight loft first. Delete the coin plugs. Boolean the throat so the rear camera sees lip → wall → cavity → back wall. Solid vanes. Collar as a separate ceramic ring. Wing mass from astern.

## Author extras the reviewers did not have to find

- Hull triangle dump (38%) is a packet fail even if form had been closed.
- Harsh studio lighting is turning every loft facet into black/white tiles. Soften lights next pass.
- Sockets stay on the hull. Do not undo the re-seat.

## Not claimed

Not wired. Hitch still wins.
