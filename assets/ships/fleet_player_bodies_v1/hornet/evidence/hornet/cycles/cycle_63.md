# Hornet cycle 63 — shallow pockets, groove inset

**Counted:** yes. Full-job attempt: form, UV, bake, surface, LOD, three valid stills, three subagent reviews.

**LOD0 sha256:** `1CCC4E8108656F73…`

| LOD | Hull triangles | Total | Bytes |
|---:|---:|---:|---:|
| 0 | 13,050 | 46,430 | 22.0 MB |

Hull triangles fell from 40,297. Groove-only inset did not keep C62 density. Packet floor fails.

## Framing (author)

- `three_quarter.png`: I can see bow, stern, wings/span, and the whole height. 1015×410.
- `starboard.png`: I can see bow, stern, full length, top and keel. 1202×249.
- `rear.png`: I can see both bells, bow, span, top and keel. 1183×682.

## What changed from 62

Inset depth set to 0 (grooves, not punches). Pocket cutters shortened so they stay in the outer 10 cm wall. Recalc/merge after cuts skipped. Fat nose and bulkheads kept.

Build-time hull after cuts: **2 shells, 7 boundary**.

## Machine numbers

```
starboard   1202 x 249  (4.83:1)  enclosed 36 / 7.04%   dark/mid/hot 54.8 / 44.2 / 1.0
three_qtr   1015 x 410  (2.48:1)  enclosed 15 / 1.74%   42.9 / 53.8 / 3.2
rear        1183 x 682  (1.73:1)  enclosed 24 / 6.08%   8.9 / 30.5 / 60.6
```

Three-quarter enclosed dropped from 23% to 1.74%. Rear still blows out (60.6% hot).

## Reviews

Subagents pending at write.

| Angle | Verdict | Headline |
|---|---|---|
| three-quarter | pending | |
| starboard | pending | |
| rear | pending | |

## Author next

1. Restore hull triangles without punching: subdivide the thick shell once, or inset with depth 0 and more faces (lower min_area).
2. Kill remaining starboard hole (~4908 px).
3. Rear lighting: less blow; keep fill from the back.
4. Wings still cards. Canopy still a brick.

## Not claimed

Not wired. Hitch still wins.
