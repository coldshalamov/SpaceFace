# Hornet cycle 62 — filled bow, transom bulkhead, thick-shell inset

**Counted:** yes. Full-job attempt: form, UV, bake, surface, LOD, three valid stills, three subagent reviews.

**LOD0 sha256:** `D07162C1E5482B18…`

| LOD | Hull triangles | Total | Bytes |
|---:|---:|---:|---:|
| 0 | 40,297 | 73,677 | 27.0 MB |

Hull triangles rose above C59's 21,966. Inset on the thick shell restored density. It also opened the cage again: starboard enclosed 29.91%.

## Framing (author)

- `three_quarter.png`: I can see bow, stern, wings/span, and the whole height. 1015×412.
- `starboard.png`: I can see bow, stern, full length, top and keel. 1202×250.
- `rear.png`: I can see both bells, bow, span, top and keel. 1168×682.

## What changed from 61

Nose stations fattened so the bow fills the profile. Hull paint lightened, coat dropped. Transom and aft bulkheads added. Inset on the *thick* shell (depth 1.2 cm vs 10 cm wall). Pocket cutters slightly smaller. Greenhouse larger. Bells thicker with more segments. Wing root thicker. Fill-heavy lighting, exposure 0.95. Tile banks cut from 5 to 3.

Build-time hull: 2 shells / 0 boundary after solidify and inset; 2 shells / 14 boundary after pocket cuts. Recalc after cuts merged 10,358 vertices.

## Machine numbers

```
starboard   1202 x 250  (4.81:1)  enclosed 49 / 29.91%  dark/mid/hot 57.6 / 41.0 / 1.5
three_qtr   1015 x 412  (2.46:1)  enclosed 46 / 22.95%  27.4 / 65.6 / 7.0
rear        1168 x 682  (1.71:1)  enclosed 46 / 12.65%  32.6 / 33.1 / 34.2
```

Three-quarter midtones landed near the A-list split. Enclosed daylight got worse than C61 because the pocket cutters still reach past the inner wall.

## Reviews

Subagents: `ed4f93dc` three-quarter, `a9bdcb28` starboard, `12bb95b4` rear.

| Angle | Verdict | Headline |
|---|---|---|
| three-quarter | **REVISE** | Gray tube with a plate grid. Colander hull. Card wings. Box cockpit. |
| starboard | **REVISE** | Bow occupies space now. Still a gray tube with plates and a hollow tail. |
| rear | **REVISE** | Throats, not caps. Transom bulkheads replaced the giant window. Still paper cups on a box. |

No REVERT this cycle. Keep the fat nose and the bulkheads. Throw away inset-as-hull and deep pocket cutters.

### Three-quarter (REVISE)

See-through colander (~23%). Plate lattice is the hull. Card wings. Dorsal brick. Clay is the same primitive stack.

Build next: closed loft, shallow wells that do not punch the inner wall, greenhouse, lofted wings, stop using plates as the watertight body.

### Starboard (REVISE)

Bow finally occupies space — do not go back to an empty nose. Belly and aft still see-through. Card wing. No readable engine from the side.

### Rear (REVISE)

Apertures are throats. Bulkheads helped. Hull still a rectangular tube. Card wings. One taupe.

## Author extras

Inset depth on a 10 cm wall plus 24 cm cutters punched both skins. Recalc after cuts merged 10k verts. Next: thickness-only grooves, 6 cm pockets, no aggressive merge.

## Not claimed

Not wired. Hitch still wins.
