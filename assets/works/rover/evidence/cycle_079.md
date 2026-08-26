# Works rover cycle 79 — candidate, not accepted, not self-graded

Cycle 78 was rejected REVISE ×3 and named "not a cycle" — 1.0% of pixels moved at `works_top`,
~220 px at `works_edge`, and **zero visible change** at `works_site`. This cycle is not a parameter
nudge. Every one of the eight named failures was worked at its cause, and the numbers below are the
measured result, not a claim about it.

**No verdict is recorded here.** Not KEEP. G1/G2/G4 stay open. The controller and independent
reviewers decide; this file is the record of what was built and what it measures.

---

## Hashes and determinism

Built twice from a cleared sidecar. **`determinism MATCH`**: all three GLB hashes identical across
the pair, and the hashes inside `cycle_079.json` equal the bytes on disk.

| file | sha256 |
|---|---|
| `rover_lod0.glb` | `BF4B6BE87C1B155B1159826E013998834007587E606EA55B26184FF00DB277FE` |
| `rover_lod1.glb` | `72724C74DCDDAA705DB34E65F209459DB79FB483D6EB82C8236A0482D66CD9F8` |
| `rover_lod2.glb` | `1900B4A71E29F4C6B025C8CF64183AA296670B40FFCB59FDB35A18BD953A41BB` |

Sidecar: `evidence/cycle_079_hash_sidecar.json`. Receipt: `evidence/cycle_079.json`.

---

## The numeric gate cycle 78 set for cycle 79

Measured on a **38 px site crop cut at origin (941, 521)** — the exact offset cycle 78's site
reviewer cut theirs at, so the two crops are directly comparable.

| row | floor | cycle 78 | cycle 79 | |
|---|---|---|---|---|
| dark bucket | ≥ 20% | **0.8%** | **21.2%** | PASS |
| light + accent | ≤ 35% | **63.8%** | **10.3%** | PASS |
| max / median luminance | ≥ 4 | **2.34** | **4.49** | PASS |
| accent hue vs body hue | > 5° | shares the body hue family | **13.34°** (accent 43.97°, body 30.63°) | PASS |

Lit rover: 165 px. Luminance min / median / max **15.85 / 37.34 / 167.56**. Buckets
dark 0.2121 · mid 0.6848 · light 0.0485 · accent 0.0545.

**Exact definitions**, because the reviewer set the floors without publishing them
(`site_report()` in the builder):

- *lit rover* = the role-ID pass `works_site_mask.png` above luma 0.02. Not "everything bright in the
  frame" — the site frame now has a mine in it.
- buckets are taken **relative to the lit rover's maximum luminance**: dark < 0.15·max, mid
  0.15–0.35·max, light ≥ 0.35·max.
- *accent* = the `livery` role, carved out of the bucket counts and reported separately, which is why
  light + accent is one row rather than two.
- hue separation is a circular mean of accent hue against body hue, and is **only reported as a
  number when at least 8 accent pixels exist**; below that it fails closed with a note.

**That definition was validated against cycle 78's own crop before being used here.** Run on
`cycle_078/review_1to1/works_site_1to1.png` it returns 484 lit px, min/median/max 15.0 / 53.2 /
124.4 and max/median 2.34 — the reviewer reported 484, 15.0 / 53.2 / 124.4 and 2.34. The bucket
split comes back 0.8 / 35.3 / 63.8 against their 1.0 / 36.8 / 60.7.

**One forensic correction to cycle 78's site reading.** Those 484 "lit rover pixels" were a
**22 × 22 square, and the square was the 2.4 wu works pad**, not the rover — which is 16 × 14 px at
this register. That is why the still "separates into a SQUARE". Cycle 79 measures the rover through
a role pass instead, so the pad can no longer be graded as the machine.

The 8-accent-pixel floor exists because a hue median over a handful of pixels is noise: run the
looser heuristic accent on cycle 78's crop and it returns a 10.9° "separation" from five pixels — a
pass on a cycle its own reviewer failed on that exact row.

---

## The eight named repairs

**1 · Tracks are the darkest and widest planform mass.**
Belts moved to y 0.505–0.845 with the body pulled in to half-width 0.46, so there is a real dark gap
between deck edge and belt and the belts own the outline (`TRACK_OUTERMOST` 0.985 / 0.992 textured,
1.000 / 1.000 clay). Belt albedo went neutral dark (B/R 1.08 against cycle 78's ochre 0.30) and the
belts now measure a **median of 14.6 at `works_top` against a mine ground of 45.0** — below every
major body surface. The cross-cleats are the substantive fix: cycle 78 rotated its pads by
(outward-normal − 90°), which laid every "grouser" *along* the direction of travel, which is the
measured reason the belt top was an unbroken plane and the tread survived only as a dashed line on
the inboard edge. Rotating by the normal lays them across the belt; 18 per side, 0.048 wu proud.
A segmented steel rail runs the **outboard** face only — samples a worn-steel band of the track tile,
so the catch is a real abraded link edge, not a bright ring round the stadium. One driven sprocket
with teeth aft, one idler with a tensioner forward, so the two ends stop being mirrored loaves.

**2 · Deck/tub desaturated and below the mine ground value.**
Cycle 78's deck was the brightest large surface in every view (R97–98 against ground 72–77). It is
now plate-band steel with a neutral-cool albedo: **median 43.4 against a ground median of 45.0.**
That is below, with 1.6 levels of margin — quoted as a pair rather than described as "clearly below".
The flat plateau is gone: six overlapping plate courses with gaps, a bolted service hatch, side
walls, transverse track-frame beams, and a raised coaming course. The body stays narrower than the
tracks by 0.045 wu of daylight per side.

**3 · The windshield is a hole, not a painted square.**
Cycle 78 measured R1 G1 B5, square corners, no rim. Cycle 79 cuts a real aperture through a roof
**slab** (0.058 wu of shell thickness visible from directly above) *and* through the cab house
beneath it, 0.014 wu smaller all round so the house's top face lands as a rebate the pane sits in.
One steel mullion crosses the opening. Glass is **dark but not zero: median 20.4**, inside the 12–25
band the review asked for, against a cab house at 28.5 and a deck at 43.4. `CAB_PANE` passes in
**both** textured (0.0231) and clay (0.0259) — it reads as an opening without its textures.
A second window is cut through the cab's front wall with the pane set back behind it.

The first attempt at this shipped a pane that measured **zero** glass pixels, because `center_loft`
builds a closed solid and the cab's own lid was still under the roof hole. A second attempt was
caught by an added assertion: `boolean_cut_box` swallows its own failure and prints, so a silently
skipped aperture is exactly how a "recess" becomes a painted square. Every boolean in this builder
now fails the build if the mesh did not change.

**4 · The hopper well is untouched.**
`HopperFloor`, the four walls, the four chamfers, the transom, the tailgate and `hopper_fill_0..4`
are byte-for-byte the cycle-78 code, on the unchanged `rubble` role. No steel lip ring. No steel well
walls. No boom cap. Verified visually against cycle 78's still at the same crop: dark interior, lit
near and side walls, ribbed floor, chamfered rim, dark far edge — all four present.

Its contrast **improved**, and not by touching it. Cycle 78's reviewer said the well "collapses
toward a dark brown rectangle on a pale plate because the rim is the same cream deck material as its
surround — a contrast problem in the surround, not a form problem in the well." The surround is now
mid steel: the well interior measures a median of 10.8 against a deck at 43.4, a **4.0 : 1** ratio
against roughly 2.3 : 1 in cycle 78 (their published deck 97–98, well 30–55).

**5 · The boom read is rebuilt.**
The arm stays the dark warm chevron weldment. The spine is no longer one dead-straight pipe at 4× the
arm's brightness: it is five tapered segments with bolted joints between them and a **return leg at
each end** dropping into the arm, in machined-band steel, so it reads by its shadow and its
silhouette bump rather than by being white. The bit now separates: head and collar carry the dark
sooted role (median ~28), and only the cutter and its point sample the tool-steel tile and its heat
band — `bit` median **129.6**, the second brightest thing on the machine and the only bright part of
the bit. `BOOM_OFFSET` 0.1972 against the 0.15 floor, from 0.1466 (a fail) in cycle 78.

**6 · The scar plate.**
First, a correction: the "blank near-white rectangle ~7 × 42 px at sum 228" cycle 78's edge reviewer
graded as the scar plate **was the aft tailgate** (`hopper_lid`, steel). The scar plate sits on the
−Y flank, and `works_edge` offsets the object along +X, which projects that flank at **zero area** —
the plate was never on camera. Both are fixed. The tailgate is dark plate steel with three ribs and
bolts. The scar plate is now a **canted rock guard sloping down and outboard over the starboard
belt** at 45°, which gives it real plan area at `works_top` and an unoccluded face at the flank
camera; it carries a 0.006 chamfer, a six-bolt course, a heat blister, and a **0.128 wu gas breach
punched through the plate** ringed by six torn petals in bare bright metal. It is sooted steel, and
it is the darkest large plate on that flank rather than the brightest.

Two earlier placements were measured and rejected: hung at the deck edge it sat behind the track from
every oblique, and canted the other way its lit face turned away from the works key (N·L −0.14) and
it rendered black.

**7 · Safety yellow as livery, not a light.**
`#ffd23f` at 46% value — hue and saturation are scale-invariant, so it is still exactly the brief's
paint (`LIVERY_HUE` 46.73 in the 44–54 range, `LIVERY_SAT` 0.7398 ≥ 0.70). At full value it rendered
a **median of 196.8** against a ground of 45; it now renders **89.3**, and the brightest object on the
machine is the beacon at 212. Yellow is the brightest *paint*, not the brightest *object*.
Placement: two bolted kick-plates at different stations port and starboard, one transom bar, a cab
grab rail and the cab brow — five separated pieces, **5.2% of the silhouette**, nothing closing a
figure. `LIVERY_SAT_RENDERED` 0.9861 against a 0.30 floor (0.0153 in cycle 78, where the paint was
blown out toward white).

The first attempt this cycle ran the coaming right round the hopper mouth and produced a closed
glowing rectangle — the luminous outline the brief bans and the framed-pane read cycle 77 removed the
steel lip ring for. That is why the yellow is where it is.

**8 · `works_site` is a mine now.**
Cycle 78's site frame was 99.98% of 1920×1080 at luminance ≤ 12, maximum 9 outside the rover box: its
reviewer's verdict was that no site verdict was possible from it, this cycle or the next. The site
camera dollies to 223 wu and frames 222 × 125 wu, so the 2.4 wu works pad is invisible at that
register. A mine is now built at render time — after export, so it cannot touch a GLB hash, and from
the builder's own hash so it is reproducible: a 320 × 205 wu floor with four octaves of interpolated
relief, three benches whose toes wander ±22 wu so the step is a rock face and not a ruled line,
slope-shaded bench faces, a spoil berm, a graded haul road, ten muck heaps raised out of the floor,
52 irregular rock blocks, and a compacted working floor the rover stands in contact with.
**The works key casts again** (`use_shadow` was False): the rover throws a contact shadow instead of
reading as a decal on the pad, and the benches, berm and muck read as form from straight above.

`works_beside_flight.png` is now cut from the **site** view — a 320 px native crop centred on the
rover beside a 320 px native crop of the flight courier, no resampling on either side. Cycle 78 put
the `works_top` crop there, so the comparison was never made for the site camera at all.

**A ninth still was added:** `works_edge_flank.png`, the object parked toward +X +Y so the aft wall,
the starboard flank, its scar plate and the starboard belt's outer lip all read. `works_edge` itself
is **unchanged** at edge_dir (1, 0), so the cycle-to-cycle pixel diff still works.

---

## Measured value ladder at `works_top`

Silhouette median 25.7, maximum 219.4 (max/median 8.5). Mine ground 45.0.

| surface | role | median | share |
|---|---|---|---|
| hopper interior | rubble | 10.8 | 8.0% |
| **track belts** | track | **14.6** | **37.1%** |
| cab glass | glass | 20.4 | 2.3% |
| chevron plates / boom arm | chevron | 25.5 | 8.5% |
| cab house, side walls, bit body, scar plate | scar | 28.5 | 12.3% |
| **deck / tub** | steel | **43.4** | 26.0% |
| *(mine ground)* | — | *45.0* | — |
| safety-yellow livery | livery | 89.3 | 5.1% |
| bit working tip | bit | 129.6 | 0.3% |
| beacon lens | lamp | 212.1 | 0.4% |

---

## Every other recorded row

`texturedPass` **true** (was false). `clayHolds` **true** (was false) — the clay reads belts with
cleats and lips, a deep chamfered cavity, a raised house with a recessed pane, and a segmented boom,
not lozenge + lozenge + plate + box + wedge + stick. `sitePass` **true**. `cycle3Pass` **false**, on
the three rows below.

| row | value | floor | |
|---|---|---|---|
| `YELLOW_MINORITY` | 0.0519 | ≤ 0.45 | PASS |
| `TRACK_BAND` | 0.3747 | ≥ 0.16 | PASS |
| `TRACK_OUTERMOST_PORT` / `STARBOARD` | 0.9850 / 0.9916 | ≥ 0.80 | PASS |
| `WELL_HOLE` | 0.0745 | ≥ 0.04 | PASS |
| `CAB_PANE` | 0.0231 textured, 0.0259 clay | ≥ 0.02 | PASS |
| `BOOM_REACH` | 0.3077 | ≥ 0.10 | PASS |
| `BOOM_OFFSET` | 0.1972 | ≥ 0.15 | PASS *(0.1466 fail in c78)* |
| `TRACK_SEPARATION_PORT` / `STARBOARD` | 32.61 / 31.04 | ≥ 18 | PASS *(new)* |
| `LIVERY_SAT_RENDERED` | 0.9861 | ≥ 0.30 | PASS *(0.0153 fail in c78)* |
| `HAS_MASS` | 0.9176 | ≥ 0.72 | PASS |
| `WELL_IS_A_HOLE` | 0.4668 | ≥ 0.24 | PASS |
| `CAB_IS_RAISED` | 0.2967 | ≥ 0.28 | PASS *(−0.1339 fail in c78)* |
| `WELL_CAB_DIFFER` | +0.4668 / −0.2967 | opposite | PASS *(fail in c78)* |
| `TREAD_PADS_PORT` / `STARBOARD` | 21 / 21 | ≥ 14 | PASS |
| `TRACK_ENDS_ROUND_PORT` / `STARBOARD` | 0.1007 / 0.1713 | ≥ 0.06 | PASS |
| `NORMAL_RELIEF` / `_LIVERY` | 0.2468 / 0.2445 | ≥ 0.040 / 0.030 | PASS |
| `CLAY_SHADING` | 53.66 | ≥ 14 | PASS |
| `LIVERY_HUE` / `LIVERY_SAT` | 46.73 / 0.7398 | 44–54 / ≥ 0.70 | PASS |
| `BIT_NOT_PINK` | 35.73 | outside 330–25 | PASS |
| `EDGE_SHOWS_WALL` | 1.1667 | ≥ 1.10 | PASS |
| **`TRACK_CONTRAST_PORT` / `STARBOARD`** | **−10.55 / −36.97** | ≥ 18 | **FAIL — see below** |
| **`ONE_BODY`** | **0.3482** | ≥ 0.90 | **FAIL — see below** |

### Two rows whose subject moved. Neither floor or operator was edited.

**`TRACK_CONTRAST_*` is signed, and it wants the belts BRIGHTER than the pad by 18 levels.** Cycle
79's first named requirement is that the belts are the darkest mass on the machine, so this row now
fails by construction and is driven further negative on purpose. It was **already failing in cycle 78
at −26.99 / −23.78** — this is not a regression introduced here. The row is left exactly as cycle 3
wrote it rather than rewritten to suit this cycle. `TRACK_SEPARATION_*` is added alongside it,
unsigned, measuring what that row was actually protecting: the belts must not disappear into the pad,
in either direction. Its reference is the frame's pad median, pinned before its first publication,
because with the key casting again the 8 px band immediately outboard of a belt is that belt's own
contact shadow and "track minus its own shadow" measures nothing.

**`ONE_BODY` measures the largest connected *livery* component**, because in cycle 3 the deck was
painted livery. The deck is now dark steel and the livery is five separated bolted plates, so the row
reports 0.35. Satisfying it would require running a continuous yellow ring round the deck perimeter —
which is the luminous outline the brief bans by name, and which this cycle built once and deleted.
Its subject moved; it is not evidence about the deck being one body.

---

## Budgets, envelope, hooks

| | LOD0 | LOD1 | LOD2 |
|---|---|---|---|
| triangles | **11,846** / 18,000 | **2,778** / 4,000 | **1,974** / 2,000 |
| bytes | 12,882,424 / 14,680,064 | 3,189,428 / 5,242,880 | 973,328 / 2,097,152 |
| draws | 21 | 21 | 21 |
| bbox wu | 1.9056 × 1.727 × 1.02 | 1.9065 × 1.727 × 1.02 | 1.9013 × 1.727 × 1.02 |

Cycle 78 was **19,768 triangles against an 18,000 budget** and only printed a warning. LOD0 is under
budget by construction this cycle, with the named features kept: the reductions came from
consolidating six cylinders per track end into a sprocket and an idler, cutting 22 hex bolts to a
placed set at real interfaces, one bevel segment on the large lofts, and replacing 32 longitudinal
pads with 36 cross-cleats.

Envelope target 1.87 × 1.76 × 0.99, tolerance ±5%: **+1.9% / −1.9% / +3.0%**.
All **13 semantic hooks present in all three LODs**, root node `rover` at scene root, LOD meshes
named `LOD{n}_Merged_Material_*` with no cross-LOD leakage, one atlas material and three authored
maps (basecolor / ORM / normal) per LOD, nine PNGs and no strays. No DCC-default material survives:
every role tile is authored, and `steel` and `track` carry a v-banded value ladder inside one tile so
no surface can inherit a neighbouring band by accident — anything that does not choose a band falls
to an explicit role default.

---

## Stills

```
evidence/cycle_079/works_top.png              evidence/cycle_079/works_top_1to1.png
evidence/cycle_079/works_edge.png             evidence/cycle_079/review_1to1/works_edge_1to1.png
evidence/cycle_079/works_edge_flank.png       evidence/cycle_079/review_1to1/works_edge_flank_1to1.png
evidence/cycle_079/works_site.png             evidence/cycle_079/review_1to1/works_site_1to1.png
evidence/cycle_079/works_top_clay.png         evidence/cycle_079/works_top_clay_1to1.png
evidence/cycle_079/works_beside_flight.png
evidence/cycle_079/works_top_mask.png  works_edge_mask.png  works_site_mask.png
evidence/cycle_079/works_edge_flank_mask.png  works_top_depth.png
evidence/cycle_079/planform_report.json       evidence/cycle_079/texture_report.json
```

`review_1to1/works_site_1to1.png` is the 38 px gate crop, at origin (941, 521).

---

## Remaining material risks

1. **The role-ID pass changed method this cycle, and rows that read a role mask are not directly
   comparable to cycle 78.** The mask and depth passes were being rendered at 32 TAA samples like a
   beauty frame, so every pixel on a silhouette edge or a small part carried a *blend* of two role
   colours and the nearest-colour classifier assigned it to whichever role the blend landed near.
   Measured: only 3,799 of 7,325 `works_top` silhouette pixels were an exact role colour, and at the
   site register only **24 of 226**. An ID pass takes one sample; it now does. Consequences to expect
   when diffing rows: `TRACK_ENDS_ROUND_*` moved 0.48 / 0.64 → 0.10 / 0.17, the `bit` mask went
   187 px → 21 px, and the `glass`, `lamp` and `scar` masks were previously ~1% pure. None of those
   movements are the picture changing.
2. **`SITE_ACCENT_HUE_SEPARATION` has one pixel of margin** — 9 accent px against the 8 px floor this
   builder imposes before it will report a hue median. It is the row most likely to flip if anything
   downstream moves the livery.
3. **Deck 43.4 against ground 45.0 is 1.6 levels of margin.** It satisfies "below the mine ground
   value" literally; a reviewer eyeballing it may fairly call the two equal.
4. **The site set is scene dressing for one camera.** It is built after export from the builder's own
   hash, renders only into `works_site.png`, and cannot reach a GLB. It is evidence lighting, not an
   authored mine asset, and nothing else in the game sees it.
5. **The beside-flight sheet is now fail-closed.** It raises rather than warning when
   `.devshots/asteroid-works/04-flight-relay-courier.png` is missing. `.devshots/` is gitignored, so
   a rebuild on a clean checkout will hard-fail at the end of the run — after the GLBs are written.
   That is deliberate (a half-empty comparison sheet is worse than none) but it is a behaviour change.
6. **Bench crests still stairstep by a pixel or two** on the site floor grid. Legible as mining form;
   not clean rock.
7. **The belt albedo is below the material bill's `#3a3530`.** The bill gives that swatch *and* calls
   the belt "darkest mass"; at the works key the swatch renders above the deck, so this cycle honours
   the role and records the deviation rather than the hex.
8. **Nothing here was wired or published.** No release manifest, no parts manifest, no render package,
   no runtime source. The live route is still `makeRover`.

## What could not be run here, and why

The sparse checkout for this packet carries `assets/works/rover/**`, `tools/blender/`, the visual-asset
docs and `package.json` — but no `scripts/`, `src/`, `test/` or `node_modules`. **No repository npm
check can execute in this worktree**, including `check:playable`, `check:asteroid-theater` and every
`check:asset*` script; their files are not present. Nothing in this packet's write set can reach the
running game — no runtime module, no manifest, no release row — so there is no game-behaviour surface
for those checks to cover.

In their place, a focused structural validation was run directly against the exported GLB bytes:
glTF version, scene root `rover`, `LOD{n}_Merged_Material_*` naming with no cross-LOD leakage, all 13
hooks, triangle mode, per-LOD triangle and byte budgets, one atlas material, three authored maps per
LOD, and the nine-PNG texture set with no strays. **PASS on all three LODs.** `git diff --check` is
clean, and the diff touches only `tools/blender/build_works_rover_mtx.py` and `assets/works/rover/**`.

Occupancy is not KEEP. Not accepted. Not wired. Hitch untouched.
