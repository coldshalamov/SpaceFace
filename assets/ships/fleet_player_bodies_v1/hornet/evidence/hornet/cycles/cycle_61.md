# Hornet cycle 61 — thickened loft, pocket wells

**Counted:** yes. Full-job attempt: form, UV, bake, surface, LOD, three valid stills, three subagent reviews.

**LOD0 sha256:** `53A4617724A8281197…`

| LOD | Hull triangles | Total | Bytes |
|---:|---:|---:|---:|
| 0 | 7,454 | 40,434 | 21.0 MB |
| 1 | 7,454 | 34,626 | 9.2 MB |
| 2 | 7,454 | 32,434 | 8.3 MB |

Hull triangles fell from 13,591 (and from C59's 21,966). Skipping `inset_large_faces` dumped the panel density. Packet floor fails even if the silhouette closed.

## Framing (author)

- `three_quarter.png`: I can see bow, stern, wings/span, and the whole height. 1015×408.
- `starboard.png`: I can see bow, stern, full length, top and keel. 1202×241.
- `rear.png`: I can see both bells, bow, span, top and keel. 1181×675.

## What changed from 60

Paper loft densified (`mul=3`), solidified 10 cm inward, then Exact-boolean pockets (canopy, avionics, radiator) on the thick shell. Face-delete and inset skipped. Framed greenhouse over the cockpit tub. Wing root thickened and started at the skin. WingBlend sheets removed. Bells: open bottle with wall thickness, no mouth coin, small inboard back wall, collar bolts. Lights softened. Hull paint darkened so midtones hold.

Build-time `Pressure_Hull` after cuts: **1 shell, 0 boundary**. Joined hull-material kit in the GLB still reports many shells because wings and houses share the hull material.

## Machine numbers

```
starboard   1202 x 241  (4.99:1)  enclosed 10 / 3.23%  dark/mid/hot 49.9 / 39.4 / 10.7
three_qtr   1015 x 408  (2.49:1)  enclosed 34 / 4.4%   44.6 / 23.8 / 31.7
rear        1181 x 675  (1.75:1)  enclosed 28 / 14.79% 25.8 / 38.2 / 36.1
```

Starboard enclosed dropped from 21.7% to 3.23%. Rear enclosed rose: looking into the hollow interior from astern (largest hole 18903 px).

## Reviews

Subagents: `c7232ed0` three-quarter, `7de69abf` starboard, `d2f1d56b` rear.

| Angle | Verdict | Headline |
|---|---|---|
| three-quarter | **REVISE** | Gray faceted dart with holes and boxes. Card wings, cone drive, canopy is a dark box. |
| starboard | **REVERT** | Not a hull. Enclosed % dropped because the bow emptied, not because holes filled. |
| rear | **REVISE** | Apertures are throats, not caps. Paper cups on a holed transom. Gray tube with plates. |

### Three-quarter (REVISE)

Player-obvious: clay, background through the body, big triangles, card wings, glued boxes, canopy tent, punched slots, cone drive, blown belly.

Build next: one manifold shell, Exact wells with 4–12 cm rims, lofted wing with fillet, greenhouse over a tub, spun bottle with collar.

### Starboard (REVERT)

Player-obvious: empty nose, faceted mid lump, white cards on the spine, paper keel, hollow cones, no cockpit. The 3.23% enclosed figure is not a hull — occupancy spilled out the missing bow.

Build next: delete the cards. Loft 6–8 different stations so the side view is a continuous filled profile from tip to transom. Then wells, wings, drive.

### Rear (REVISE)

Apertures: **throats, not caps.** Mouth coins are gone. Left bell is a dark bore. Bells still paper; 19k px window through the drive house.

Build next: transom bulkhead. Thicker spun bells. Stations. Real wells. Delete floating starboard pieces.

## Author extras the reviewers did not have to find

- Hull triangle dump (7,454 vs 21,966) is from skipping inset on the thick shell. Restore inset with depth well under the 10 cm wall.
- Dark hull paint plus leftover key light made the bow vanish into the studio gray.
- Build-time hull was 1 shell before join; that did not survive the rear camera looking into the hollow interior.

## Not claimed

Not wired. Hitch still wins.
