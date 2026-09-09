<!-- LIFETIME: STABLE -->
# Model adversarial review workflow

Use this for every PQ-050 ship leaf and any other Blender/GLB remaster that cites it.
It exists because agents skip looking, call a gray crop a review, stop after one
pass, and leave old stills in the tree.

Variable: `{SHIP}` = the one body this leaf owns. Never another ship.

This file does not replace `ADVANCED_MODEL_TECHNIQUE_CONTRACT.md`. That file is
what to build. This file is how to look, iterate, and clean up.

**Camera law lives in that contract §0.5.** Read it before capturing anything.
The Hornet loop stalled because cycles were spent on seats and cabin kits the
live chase camera cannot see. That class of work does not count.

## 0. Quality bar (stepped up)

Hitch-plus is the **floor**, not the finish. Close only when `{SHIP}` would not
embarrass a 2026 A-list space game **in the actual game view**: a 60° tilted
top-down chase at default 144 WU, ship about 10–16% of frame width. Manufactured
form in clay at that size. Mixed materials that read at that size. Openings that
read as dark wells from above. A silhouette that names the role at 40 px. No
toy/clay/LEGO read.

A factory loft with boxes, even after five “iterations,” has not started.
A walkable interior, orange seat, or cockpit diorama is not the bar.

## 1. What one cycle is

A cycle is **one complete attempt to finish `{SHIP}`**, not a slice of the
technique list.

Each cycle must:

1. Implement **every** mandatory MTX row for this class as if this export will
   ship tonight. Do not save UV or bake or dirt “for a later cycle.” Do not
   spend the cycle on interior furniture.
2. Export the candidate. Record its hash.
3. Capture **three valid chase stills** (below). Invalid stills mean the
   cycle did not happen.
4. Open each still at original resolution (not a chat thumbnail).
5. Launch **three review subagents**, one per still, with the prompt in §4.
   Each must be told to look for **every obvious defect**, not only named MTX
   rows, **at play size**.
6. Read all three reviews. Implement **every** `revise` item that is real, plus
   anything you can see that they missed — if it reads on the chase camera.
7. Write `evidence/{SHIP}/cycles/cycle_NN.md` with hash, still paths, subagent
   ids, and what you changed.

Zero-cycle actions (do not increment the counter):

- only moving the camera or lights
- a crop, thumbnail, zoomed gray plate, or camera inside the hull
- modeling a seat / console / cabin kit
- “I reviewed it” without subagent text back
- implementing two MTX rows and calling it a cycle
- spreading the plan across five cycles (cycle 1 = form, cycle 2 = UVs…)
- reusing stills from an older hash
- using studio three-quarter / starboard / rear as the three stills

**Required count:** at least **5** complete cycles. Keep going through **10**
if any still loses to Hitch or fails A-list **at chase size**. Stop early only
if cycles 5–N return `keep` from all three subagents **and** clay is not
primitives on `play_chase` **and** every mandatory MTX row is `implemented`
with chase-camera proof.

## 2. Three stills — validity (fail closed)

Every cycle produces exactly these three from the **exported GLB** of that
cycle’s hash, 1280×720 or larger, using
`tools/blender/spaceface_chase_camera.py`:

| File | Camera |
|---|---|
| `cycles/cycle_NN/play_chase.png` | Live chase: FOV 50° vertical, tilt 60°, D=144, heading 0 |
| `cycles/cycle_NN/play_chase_abeam.png` | Same camera, heading 90° |
| `cycles/cycle_NN/play_chase_close.png` | Same tilt/FOV, D=58 (tightest legal player zoom) |

All three must show **the ship as the player sees it**:

- the whole ship in frame, not a cabin, not a wing filling the view
- `play_chase` / `play_chase_abeam`: ship ~8–22% of frame width
- `play_chase_close`: ship ~20–42% of frame width
- not clipped, not inside the hull, not a single plate filling the frame
- not so dark or blown that edges disappear
- no HUD

**Invalid** (cycle does not count; recapture before any review):

- zoomed into a gray hull wall
- only a wing, only a drive, only the canopy, only a seat
- `play_chase` with the ship larger than ~40% of frame width (that is a
  beauty shot; the old three-quarter was this failure)
- camera inside the hull or canopy
- previous cycle’s image reused
- Blender viewport screenshot of an unsaved/unexported mesh
- clay-only or beauty-only as a substitute for the three (clay/ORM/normal
  isolation are extra, never a replacement)
- `bay_interior.png`, `three_quarter.png`, `starboard.png`, or `rear.png`
  offered as one of the three

Before calling a subagent, the authoring agent must write one sentence per
still: “This is the chase camera; I can see the whole planform; the ship is
not a close-up.” If you cannot, the still is invalid.

## 3. Extra stills (do not replace the three)

Once the three valids exist, also capture for the ledger:

- clay of the same `play_chase` camera (`clay_play_chase.png`)
- grazing that still shows most of the hull (not a 10 cm patch)
- ORM isolation and normal isolation of the **close chase** camera
- material ID on the close chase camera
- `drive_rear.png` only if MTX-08 is still unreadable on `play_chase_close`

`bay_interior.png` is not required. If you capture it, it is a diagnostic.
It cannot close MTX-03, MTX-04, MTX-07, or MTX-57.

## 4. Subagent review prompt (paste this)

Launch three **read-only** reviewers (`explore` or equivalent). Each gets
**one** still path and this prompt. Do not review your own stills in place
of this.

```text
You are reviewing one still of {SHIP} for SpaceFace.

This game is a 60° tilted top-down chase. The player never walks inside
the ship. Open the image at {STILL_PATH} with the file reader.

If the camera is inside the hull, on a seat, or the ship fills most of
the frame (a beauty close-up), reply INVALID_FRAMING and stop.

If you cannot see the whole ship as a tabletop object, reply
INVALID_FRAMING and stop.

Then list:
1. Every obvious defect a player would notice FROM THIS CHASE VIEW.
   Silhouette, planform, canopy as a dark framed rectangle, drive
   throats as dark wells, wings, paint, toy/clay/card/box/gray plate.
   Do not ask for a seat. Do not praise interior furniture.
   If you skip an obvious toy/clay/card/box/gray plate, the review
   is a fail.
2. Each mandatory MTX defect visible at this play size
   (docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md §0.5
   camera law, then the MTX rows).
3. What to build next, concrete Blender actions, not adjectives.
   Actions that only help a camera inside the hull are invalid.
4. Verdict: KEEP | REVISE | REVERT.

Compare against a 2026 A-list ship at tabletop size, not against
"better than last cycle." Hitch-plus is the floor. Gray tube with
plates is REVISE. An orange seat is not progress.

Do not praise process, triangle count, or iteration number.
```

A cycle with any `INVALID_FRAMING` is not a cycle. Recapture and rerun
reviewers.

A cycle whose three verdicts are all KEEP but the authoring agent can still
see a primitive stack on `play_chase` must ignore KEEP and revise.

## 5. Implement the reviews

After the three reports:

- Implement every REVISE action that names a part **visible at chase size**.
- Implement obvious defects they listed.
- Implement defects you see that they missed, if they read at D=58 or D=144.
- Discard REVISE items that are “model the seat / console / cabin.”
- Do not bargain (“I’ll do dirt next cycle”). Dirt, wells, wings, glass,
  bake, and materials are all this cycle’s job if they are still wrong
  **on the chase camera**.

Then start the next cycle from a new export.

## 6. Cleanup when the leaf is actually finished

Do **not** leave a museum of failed ships.

**Keep** (only these) under `evidence/{SHIP}/`:

- `TECHNIQUE_LEDGER.json`
- `cycles/cycle_NN.md` for the **final** cycle only
- the final cycle’s three chase stills + `clay_play_chase.png`
- one Hitch compare (`compare_hitch_play_chase.png`) shot on the **same**
  chase camera
- `CYCLE_LOG.md` (one table: cycle number, hash, three verdicts)

**Delete** before you commit the finished ship:

- `cycles/cycle_01` … `cycle_{NN-1}` image folders
- `evidence/iter07`, `iter08`, `iter09`, `QUALITY_ITER*.md` for this ship
- `.blend1` backups, `.tmp.glb`, unused bake EXRs
- session scratch copies of old stills
- any still whose hash is not the shipped candidate
- seat / bay_interior crops that were never chase proof

If a reviewer needs history, git has it. The working tree should show
**one** current model.

Cleanup is part of the leaf. A tree full of old gray crops means the leaf
is not done.

## 7. Campaign rule

Overnight / map-campaign: finish this workflow for `{SHIP}`, clean up, wire
only that ship, commit, then set `{SHIP}` to the next leaf and start cycle 1
again. Do not reuse Hornet stills to “review” Drifter. Do not resume Hornet
by modeling more interior.
