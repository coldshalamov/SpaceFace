# Hornet cycle 56 — every gate number hit

**Counted:** yes.

| LOD | Hull triangles | Total | Draws |
|---|---:|---:|---:|
| 0 | 4,951 | 43,155 | 11 |
| 1 | 4,560 | 42,332 | 11 |
| 2 | 4,560 | 27,996 | 11 |

Hull triangles fell from 21,240 to 4,951 — a 77% loss. Above the 800 floor, but consistent with the
builder's own note that "the canopy boolean tore the loft".

## The gate, verified independently

Cycle 54's three reviewers set a numeric gate. Measured with
`node scripts/measure-ship-still.mjs`, not taken from the builder's report:

| Measure | cycle 54 | required | cycle 56 | |
|---|---:|---:|---:|:--|
| Silhouette height, px | 157 | ≥ 240 | **244** | met |
| Silhouette width, px | 1019 | ≤ 1050 | **1041** | met |
| Length : height | 6.49 : 1 | ~4 : 1 | **4.27 : 1** | met |
| Drive bell diameter, px | ~50 | ≥ 95 | **125** | met |
| Openings with rims | 0 | ≥ 3 | **3** | met |
| Bore vs casing | 82 / 73 — a cap | bore darker | **15 / 61 — a throat** | met |
| Value split dark/mid/hot | 4.9 / 91.5 / 3.7 | ~15 / 60 / 8 | **10.8 / 84.5 / 4.7** | closer |
| Enclosed daylight, starboard | 0 regions | hold at 0 | **1 region, 23 px** | held |
| Sockets on the hull | 11/11 | 11/11 | **11/11** | held |

**Every number improved. Several by a lot.**

## And the ship got worse to look at

That is the finding of this cycle, and it is worth more than the ship.

- **The canopy is a black tent beside an open black crate.** The gate asked for an opening with a
  rim; it got one, and what sits on it is a faceted black pyramid. "Opening with a rim" was
  satisfied by a shape nobody would call a cockpit.
- **The drive is a flat washer with a small hole.** Bell diameter ≥95 px: met, at 125. Bore darker
  than casing: met, at 15 against 61. But the vanes are gone, and the face is one flat mid-grey
  disc. Both drive metrics were satisfied by a shape that defeats what they were for.
- **Panel detail flattened.** Cycle 54's scribed plate seams are largely gone, replaced by large
  blank facets. Nothing in the gate protected them.
- **Faceting artefacts** on the belly and wing, and loose slivers near the wing root — consistent
  with the 77% hull-triangle loss.

The builder's own closing list agrees, unprompted: "the canopy is a black tent, not glass-and-frame
you can read… the drive is a washer with a hole; the vanes are lost in the small bore… the canopy
boolean tore the loft — clay is ragged there… next to Hitch it is still a smooth dart."

## What this cycle actually taught

**A numeric gate is necessary and not sufficient, and this is the proof.** Eight measures moved the
right way and the result is a worse ship. Two of them — "an opening with a rim" and "a bore darker
than its casing" — were satisfied by a black tent and a washer.

This is the repository's own recurring failure mode, arriving in a gate *I* set: a measure that
encodes a proxy rather than the thing, and is then optimised against. The correction is not to
abandon numbers — the numbers caught the rod, the cage and the cap when opinion alone had not in 52
cycles — but to pair every metric with the defect it exists to prevent, and to add a standing rule
that no cycle may regress a previously-passing visual read to win a number.

## Not claimed

Not wired. No mandatory MTX row marked implemented. Cycle 54's candidate remains recoverable at
commit `a7a41d90` and is the better ship as a whole despite failing the gate.
