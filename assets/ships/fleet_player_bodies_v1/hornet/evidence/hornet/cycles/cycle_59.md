# Hornet cycle 59 — raised shell, Exact booleans

**Counted:** yes. Full-job attempt: form, UV, bake, surface, LOD, three valid stills, three subagent reviews.

**LOD0 sha256:** `0CF068318AEAE3B4…`

| LOD | Hull triangles | Total | Bytes |
|---:|---:|---:|---:|
| 0 | 21,966 | 47,070 | 22.3 MB |
| 1 | 21,966 | 41,262 | 10.5 MB |
| 2 | 21,966 | 39,070 | 9.6 MB |

Hull triangles did not fall from C54 (21,240). Texture ladder 1024/512/512 unchanged.

## Framing (author)

Recapture after first cameras were too far. All three stills 1600×900 from this hash.

- `three_quarter.png`: I can see bow, stern, wings/span, and the whole height. Silhouette 1014×394 (63% of width).
- `starboard.png`: I can see bow, stern, full length, top and keel. Silhouette 1154×230 (72% of width).
- `rear.png`: I can see both bells, bow in the distance, span, top and keel. Silhouette 1087×625 (68% of width).

## What this pass built

C54 closed loft kept as one body. Stations raised so mid section is ~1.8× C54 (profile 5.02:1 vs 6.49:1). Three Exact booleans (canopy, avionics, radiator) plus five-wall tubs and a low glass shell. Twin spun bells with a dark plug and tapered vanes; stacked `add_manufactured_drive` removed. Dorsal slab kit and hoop seams removed. Sockets follow the hull (gun 0.32 u behind the nose).

## Machine numbers (same cameras)

```
starboard   1154 x 230  (5.02:1)  enclosed 19 / 20.1%  dark/mid/hot 56.8 / 36.1 / 7.1
three_qtr   1014 x 394  (2.57:1)  enclosed 36 / 13.2%  54.9 / 20.3 / 24.8
rear        1087 x 625  (1.74:1)  enclosed 20 / 3.6%   44.0 / 33.4 / 22.6
```

C54 starboard was 6.49:1, 0 enclosed, 4.9% dark. Height moved the right way. Enclosed daylight and darkness did not.

`measure-hull-shell-closure` on LOD0: `Pressure_Hull_Mesh` is **26 watertight shells**. The Exact booleans shredded the loft into islands. That is the cage returning by a different door.

## Reviews

Subagents: `025031f1` starboard, `6641d04c` rear, `f4dedf81` three-quarter.

| Angle | Verdict | Headline |
|---|---|---|
| starboard | **REVERT** | Not a ship — gray skeleton of floating plates. Restore the last closed loft. Do not garnish this cage. |
| rear | **REVISE** | Gray tube with plates. Bells are washers/caps. Vanes have no roots. Starboard floaters. |
| three-quarter | **REVISE** | See below. |

### Starboard (REVERT)

Player-obvious: missing skin, gray plate, bow shards, mid wing as dark boxes, stern scrap with no engine, no cockpit, holes that are gaps not bays, needle massing.

Build next: discard this visible hull; loft a watertight shell from 6–8 different stations; then Exact-boolean canopy and radiator only after the clay is closed; wings as lofted sections unioned into the chine; spun bottle drive.

### Rear (REVISE)

Player-obvious: toy chrome, floating starboard plates, white inverted face, engine mouths as coins, card vanes, transom as a postage stamp, no wing mass from astern, LEGO stack.

Build next: move the throat plug **0.4 m inboard** of the mouth; hub sockets before vanes; solid vanes with three sections; collar as a ceramic part; grow the house out of the hull; lofted wings with a flap slot; stop using inset grids as armor.

### Three-quarter

Framing valid. Defects that match the other two: closed-looking paint from this angle still sits on a shredded shell (13% enclosed background); canopy does not read as glass over a tub; wings still cards; value split crushed (55% dark / 25% blown).

Concrete next: same as starboard — restore one watertight loft, then open wells by deleting dorsal faces and lining them, not Exact-boolean on the whole hull.

## Author extras the reviewers did not have to find

- Sockets are on the hull this time. Do not undo the re-seat.
- Do not repeat C56: no black tent, no washer-for-diameter, no 77% triangle dump.
- Openings next cycle: bmesh face-delete + five-wall liner, then confirm `Pressure_Hull_Mesh` is **1 shell** before any still.

## Not claimed

Not wired. No MTX row marked implemented. Hitch still wins. A-list not met.
