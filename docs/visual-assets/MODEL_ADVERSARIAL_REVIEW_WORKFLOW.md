<!-- LIFETIME: STABLE -->
# Model adversarial review workflow

Use this for every PQ-050 ship leaf and any other Blender/GLB remaster that cites it.
It exists because agents skip looking, call a gray crop a review, stop after one
pass, and leave old stills in the tree.

Variable: `{SHIP}` = the one body this leaf owns. Never another ship.

This file does not replace `ADVANCED_MODEL_TECHNIQUE_CONTRACT.md`. That file is
what to build. This file is how to look, iterate, and clean up.

## 0. Quality bar (stepped up)

Hitch-plus is the **floor**, not the finish. Close only when `{SHIP}` would not
embarrass a 2026 A-list space game in a store screenshot: manufactured form in
clay, mixed materials that read at play size, openings you can see into, a
silhouette that names the role at 40 px, and no toy/clay/LEGO read.

A factory loft with boxes, even after five “iterations,” has not started.

## 1. What one cycle is

A cycle is **one complete attempt to finish `{SHIP}`**, not a slice of the
technique list.

Each cycle must:

1. Implement **every** mandatory MTX row for this class as if this export will
   ship tonight. Do not save UV or bake or dirt “for a later cycle.”
2. Export the candidate. Record its hash.
3. Capture **three valid full-model stills** (below). Invalid stills mean the
   cycle did not happen.
4. Open each still at original resolution (not a chat thumbnail).
5. Launch **three review subagents**, one per still, with the prompt in §4.
   Each must be told to look for **every obvious defect**, not only named MTX
   rows.
6. Read all three reviews. Implement **every** `revise` item that is real, plus
   anything you can see that they missed.
7. Write `evidence/{SHIP}/cycles/cycle_NN.md` with hash, still paths, subagent
   ids, and what you changed.

Zero-cycle actions (do not increment the counter):

- only moving the camera or lights
- a crop, thumbnail, or zoomed gray plate
- “I reviewed it” without subagent text back
- implementing two MTX rows and calling it a cycle
- spreading the plan across five cycles (cycle 1 = form, cycle 2 = UVs…)
- reusing stills from an older hash

**Required count:** at least **5** complete cycles. Keep going through **10**
if any still loses to Hitch or fails A-list. Stop early only if cycles 5–N
return `keep` from all three subagents **and** clay is not primitives **and**
every mandatory MTX row is `implemented`.

## 2. Three stills — validity (fail closed)

Every cycle produces exactly these three from the **exported GLB** of that
cycle’s hash, 1280×720 or larger:

| File | Camera |
|---|---|
| `cycles/cycle_NN/three_quarter.png` | bow high three-quarter, +X readable |
| `cycles/cycle_NN/starboard.png` | full starboard profile |
| `cycles/cycle_NN/rear.png` | full rear, drives visible |

All three must show **most of the model**:

- every extremity in frame (bow, stern, both sides’ max span, top, keel)
- about 8–15% empty margin
- the ship’s long axis occupies about 55–80% of the image
- not clipped, not inside the hull, not a single plate filling the frame
- not so dark or blown that edges disappear
- no HUD

**Invalid** (cycle does not count; recapture before any review):

- zoomed into a gray hull wall
- only a wing, only a drive, only the canopy
- ship smaller than ~35% of the frame
- previous cycle’s image reused
- Blender viewport screenshot of an unsaved/unexported mesh
- clay-only or beauty-only as a substitute for the three (clay/ORM/normal
  isolation are extra, never a replacement)

A close crop (`bay_interior.png`, `drive_rear.png`, `grazing_close.png`) may
exist **in addition** to the three valids. It never replaces them.

Before calling a subagent, the authoring agent must write one sentence per
still: “I can see bow, stern, wings/span, and the whole height.” If you
cannot, the still is invalid.

## 3. Extra stills (do not replace the three)

Once the three valids exist, also capture for the ledger:

- clay of the same three-quarter camera
- grazing that still shows most of the hull (not a 10 cm patch)
- ORM isolation and normal isolation of the three-quarter
- material ID
- `bay_interior.png` and `drive_rear.png` if those MTX rows are mandatory

## 4. Subagent review prompt (paste this)

Launch three **read-only** reviewers (`explore` or equivalent). Each gets
**one** still path and this prompt. Do not review your own stills in place
of this.

```text
You are reviewing one still of {SHIP} for SpaceFace.

Open the image at {STILL_PATH} with the file reader. If you cannot see
bow, stern, and most of the ship, reply INVALID_FRAMING and stop.

Then list:
1. Every obvious defect a player would notice. Do not wait to be asked
   "was anything obvious?" If you skip an obvious toy/clay/card/box/gray
   plate, the review is a fail.
2. Each mandatory MTX defect visible in this angle
   (docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md).
3. What to build next, concrete Blender actions, not adjectives.
4. Verdict: KEEP | REVISE | REVERT.

Compare against a 2026 A-list ship still, not against "better than last
cycle." Hitch-plus is the floor. Gray tube with plates is REVISE.

Do not praise process, triangle count, or iteration number.
```

A cycle with any `INVALID_FRAMING` is not a cycle. Recapture and rerun
reviewers.

A cycle whose three verdicts are all KEEP but the authoring agent can still
see a primitive stack must ignore KEEP and revise.

## 5. Implement the reviews

After the three reports:

- Implement every REVISE action that names a visible part.
- Implement obvious defects they listed.
- Implement defects you see that they missed.
- Do not bargain (“I’ll do dirt next cycle”). Dirt, holes, wings, glass,
  bake, and materials are all this cycle’s job if they are still wrong.

Then start the next cycle from a new export.

## 6. Cleanup when the leaf is actually finished

Do **not** leave a museum of failed ships.

**Keep** (only these) under `evidence/{SHIP}/`:

- `TECHNIQUE_LEDGER.json`
- `cycles/cycle_NN.md` for the **final** cycle only
- the final cycle’s three valid stills + clay three-quarter
- one Hitch compare (`compare_hitch_three_quarter.png`)
- `CYCLE_LOG.md` (one table: cycle number, hash, three verdicts)

**Delete** before you commit the finished ship:

- `cycles/cycle_01` … `cycle_{NN-1}` image folders
- `evidence/iter07`, `iter08`, `iter09`, `QUALITY_ITER*.md` for this ship
- `.blend1` backups, `.tmp.glb`, unused bake EXRs
- session scratch copies of old stills
- any still whose hash is not the shipped candidate

If a reviewer needs history, git has it. The working tree should show
**one** current model.

Cleanup is part of the leaf. A tree full of old gray crops means the leaf
is not done.

## 7. Campaign rule

Overnight / map-campaign: finish this workflow for `{SHIP}`, clean up, wire
only that ship, commit, then set `{SHIP}` to the next leaf and start cycle 1
again. Do not reuse Hornet stills to “review” Drifter.
