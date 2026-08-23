# Works rover cycle 78 — REVISE / REVISE / REVISE

**Counted:** yes, but see "Not a cycle" below. lod0 hash `3E57337271EC4105EA36F4499E37FA6F3667299BBFE3E06250BB8017D0D0F826`
**Stills:** `evidence/cycle_078/works_top.png`, `works_edge.png`, `works_site.png` plus 1:1 crops.
**Framing:** valid works cameras. Whole rover in frame on all three.

**Reviewers (terminal, original resolution, 2026-08-22 — run at adoption; the cycle was built,
rendered and hash-sealed at 19:19–19:25 and then abandoned before its review step):**

| Still | Agent | File | Verdict |
|---|---|---|---|
| works_top 1:1 | opus5-top | `reviews/opus5_top.txt` | REVISE |
| works_edge 1:1 | opus5-edge | `reviews/opus5_edge.txt` | REVISE |
| works_site 1:1 | opus5-site | `reviews/opus5_site.txt` | REVISE |

## Not a cycle — three independent pixel diffs say so

All three reviewers diffed C78 against C77 without being asked to agree, and all three landed in the
same place:

| View | Delta vs C77 |
|---|---|
| works_top | **1,031 of 102,400 px = 1.0%.** Mean delta 7.9 summed RGB. One visible change: the boom spine got brighter (x173–210, y176–179). |
| works_edge | **~220 px** past a rounding step, all in one strip on the right. The white boom stick got ~2 px longer and shifted outboard; the dark pane grew ~1 px. |
| works_site | **Zero visible change.** Both crops carry exactly 484 lit pixels, identical luminance min/median/max (15.0 / 53.2 / 124.4), identical value buckets to within 2 px. The whole difference is an 11×22 sub-box with max per-channel delta 7/255. |

That is the BOOM_OFFSET nudge and nothing else. Every defect C77's reviewers named is still on camera:
tan card body, black-rectangle hopper mouth from the top, yellow bar not a visor line, absent steel
lip. Section 0 anti-gaming names this exactly — iterations with the same stills defect. The one thing
that did move traded "spine too faint to see" for a hard white pinstripe, which is the
continuous-luminous-outline read the brief bans by name, relocated to a different part.

**REVERT is wrong**, and all three said so for the same reason: C77 is the same picture, so there is
nothing to go back to. A legible wrong line is recoverable; an invisible one was not.

## What they named

**The value ladder is inverted, and that is the root note.** The deck/tub is the *brightest* large
surface in every view — top reads a 28-pixel constant plateau at R97–98 against ground 72–77; edge
reads sum 244 against a pad at 169. The bill puts safety-yellow livery there and calls the tracks the
darkest mass; measured, the tracks sit *lighter* than the boom, the well, the well floor and the
glass. At site the whole machine is 60.7% light + 36.8% mid + **1.0% dark**, max/median 2.34.

**The tracks have no outer lip, and the bead is on the wrong edge.** Vertical profiles across both
belts show the value only ever *drops* crossing the outer edge — nothing rises above ground value
along the straight run. The one light-catching line runs the *inner*, deck-side edge, so it reads as a
stitched seam. In clay the tracks are two featureless lozenges: every bit of belt structure lives in
the surface, not the form.

**The windshield is a painted square; the hopper is a real hole.** Same asset, same cycle, opposite
verdicts on MTX-03 — and the contrast between them is the single most useful thing in the bundle. The
hopper shows a lit near wall, side walls, a ribbed floor and a chamfered rim; in clay it has a dark
floor at depth. The windshield measures R1 G1 B5, flat, square-cornered, no rim thickness. **Protect
the hopper. Do not touch it.**

**The scar plate fails in the one view the material bill nominated for it.** The bill says "Flank,
readable at works_edge". What is on the flank is a blank near-white rectangle ~7×42 px at sum 228 —
the second-brightest large surface on the vehicle — with no soot, no gas-breach chip, no bolts, no
bevel, square corners, zero texture. Either that IS the scar plate and it is value-inverted from
sooted steel, or the scar plate is absent and an unrelated blank plate occupies its place. Both fail
the same row.

**The boom relationship is inverted.** The brief asks for a *darker* boom with a raised steel spine.
The boom is dark (sum 62–75) and the spine is *white* (sum 283–309) — a 4× jump, dead straight, no
taper, no end return, desaturated gray-white in an all-warm frame. It is a stripe painted on a card.
The bit is the same white, so it does not separate as a forged body and its "bright tip" carries no
information.

**Two structural notes about the evidence itself, not the mesh:**
- **There is no mine on camera in `works_site`.** 99.98% of the frame sits at luminance ≤12; outside
  the 22×22 rover box the maximum anywhere is 9. No rock face, no bench, no muck pile, no berm, no
  contact shadow, no horizon. The still cannot answer "working machine in a mine vs toy on a texture"
  in the machine's favour, because there is no mine to be parked in. **As shot, no site verdict is
  possible next cycle either** — light the site and put the rover in contact with something, then
  re-cut the 1:1 at the same offset so cycles stay comparable.
- **`works_beside_flight.png` places the TOP 1:1 beside the flight ship, not the site one**, so the
  "does it hold up beside the real game" comparison was never made for the site camera. In that frame
  the courier reads as a manufactured ship with panel breaks, dark wells and coloured accents; the
  rover beside it reads as a tan card.

## Standing rulings from C77, all honoured this cycle and still in force

Keep the dark hopper interior. No steel lip ring on the hopper. Do not steel the well walls. Do not
put the boom cap back. (The track outer lip the reviewers ask for is a *different* part from the
hopper lip ring C77 banned.)

## Numeric gate for cycle 79

Re-measure on the same 38 px site crop and require **dark bucket ≥ 20%**, **light+accent ≤ 35%**,
**max/median luminance ≥ 4**, and **accent hue separated from body hue by more than 5°**. Without a
gate the next cycle can be another zero-delta and nobody will notice — which is precisely what
happened here.

Highest-leverage three, in order: darken the belts below everything else; desaturate the tub and drop
it below ground value; move the tracks outboard so they are the widest points in plan and the deck
stops sitting on top of them.

## Recorded metrics, unchanged by this review

`planform.pass` false, `texturedPass` false, `clayHolds` false, `cycle3Pass` false.
`BOOM_OFFSET` 0.1466 against a 0.15 floor. LOD0 19,768 tris against an 18,000 budget; byte budgets
all pass.

Occupancy is not KEEP. Not accepted. Not wired. Hitch untouched.
