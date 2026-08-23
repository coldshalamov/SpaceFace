# Surgical form ladder — state at adoption, 2026-08-22

Read this before opening any `form_v*` folder. The ladder is not monotonic and its **last
version is the worst one**.

## Do not resume from v10

`hornet_chase_form_v10.glb` does not render as a ship. At chase it is **three detached
fragments** floating apart — a hollow rectangular frame, a pale winged blob, and an
unattached stack of light and dark slabs — against a near-white value that barely separates
from the backdrop. There is no connected hull. `chase_report.json` says `"ok": true`, which
means the render succeeded, not that the subject is intact; nothing in this lane checks
connectivity, so the report cannot tell you this.

## The ladder lost mass and then lost the ship

| Version | LOD0 triangles | State at chase |
|---|---|---|
| v1 | 7,484 | connected |
| v2 | 8,220 | connected |
| v3 | 7,076 | connected |
| v4 | 7,088 | connected (file declares `REVISION = "chase_form_v5"` — filename and output disagree) |
| v5 | 7,088 | connected |
| v6 | 7,116 | connected |
| v7 | **7,376** | **connected — peak of the ladder** |
| v8 | 3,932 | connected, but construction thinning |
| v9 | 3,882 | — |
| v10 | 3,418 | **disassembled** |

v7 → v10 cuts **54%** of the triangles. `PQ-050.md` is explicit: *"Do not pass a cost gate by
deleting authored construction."* That is what happened here, and the same mistake already
cost this packet once — C56 hit nearly every gate number and was REVERTed because it paid for
new mass by deleting 77% of the hull.

## v7 is the candidate worth continuing from

At close, v7 has what the production body (C184) still lacks and the reviews keep asking for:
**two real drive throats** — dark circular bores set in a raised housing, with rim and interior,
not the ~9x9 px flat black blobs on the production hull — and a **recessed canopy tub** rather
than a painted lozenge. Its wings show loft. v8 replaced the tub with a large flat black
rectangle in a bright frame (a picture frame, i.e. the sticker defect returning) and thinned
the aft detail to two ellipses.

If the surgical line is resumed, resume at **v7** and carry its throats and canopy tub across.
Do not re-derive from v10.

## Context this exploration was built under

`MATERIAL_TRUTH_PREFLIGHT.json` in this folder freezes identity (root, assetId, sockets,
collision) and re-authors form only, against four named live defects at chase: 5% frame at
D=144 against a 15-16% contract, dark 1.5% / mid 98.5%, canopy stamp, and card wings with a
closed-box transom. Note `"allSupportedViewZonesClassified": false` — the preflight is itself
incomplete.

None of this is wired. `assets/ships/parts/wholeships/hornet_production_v1.glb` (cycle 85)
remains the live game body.
