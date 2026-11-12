<!-- LIFETIME: CAMPAIGN -->
# Q3 - The taste gate

One rubric and one short review for every visible change. The point is not to hire a critic; it is
to stop a change that is technically green and visibly worse from landing.

## When this gate applies

Any change a player can see or hear: a screen, HUD line, VFX, model, animation, camera, sound,
lighting, or a new player-facing word. Pure engine, data, test and documentation changes do not need
it. A change behind a flag that the ordinary route cannot reach is not exempt - either reach it or
do not claim it.

## Before the review

1. **Same picture.** Capture the changed surface before and after at the gameplay camera, same
   seed, route, time of day, sector and viewport. The Browser pane must be visible for live
   captures; hidden panes are not evidence.
2. **Walk it.** Exercise every control the change touches. For a screen, use
   `node scripts/ui-bench.mjs --walk` where it applies and open every PNG.
3. **Name the claim.** One sentence: what should the player now understand, feel or do that they
   could not before? If the sentence is "it looks nicer", the change is not ready.
4. **Budget.** State the words on screen, the flash/particle size, and the frame cost. A change that
   breaks a written budget is not a taste question; it is a defect.

## The five axes (score 1-5 each)

| Axis | 1 | 3 | 5 |
|---|---|---|---|
| **Readable** | the player cannot tell what changed or what to do | readable after a beat | the picture answers the question without a label |
| **Coherent** | a different product's art/voice | mostly one product, one borrowed element | every element belongs to SpaceFace's one language |
| **Alive** | static, dead, or a screen-wide flash | some motion or reaction | the world reacts with weight, and the reaction is legible |
| **Responsive** | the input feels late or mushy | acceptable | the input and the picture agree frame to frame |
| **Earned** | the moment is unearned, a placeholder, or a lie | it happens, but the reason is thin | the moment is the consequence of something the player did |

**Pass:** all five at 4 or 5, and no axis below 3. A single 2 is a fail even if the average is high.
A 5 on "Alive" never buys a 2 on "Readable".

## The never list

- No fade, blur, screen-wide flash, or raised budget used to hide pop-in, a missing asset, or a
  slow frame.
- No sentence that restates a name ("The Vector Reaction Drive reacts to vectors").
- No second vocabulary for a number the game already names (Agility vs Handling vs Speed).
- No placeholder shipped as content ("Lorum", "TBD", "nothing has tuned them").
- No control that looks interactive and does nothing.
- No new lore to explain a system that should be readable from the world.
- No "it will look better once the art lands" as an acceptance argument.

## The reviewer

One independent reviewer who did not make the change. Give them the claim, the before/after pair,
the relevant taste bar (SWARM README §4, X1 `STYLE_BIBLE.md`, P1 blind comprehension check, or the
X4 `AUDIO_BRIEF.md`) and the five axes. They must:

1. Score each axis with one sentence of evidence.
2. Name the single worst thing in the picture/sound.
3. Say `SHIP` or `NOT YET`, and if `NOT YET`, the smallest fix.
4. Not review their own work, not review a source-text diff, and not accept a description in place
   of the picture.

File material defects to the owning lane with the capture. Fix findings before landing; do not
restart the whole review for a one-line fix that does not change the claim.

## Evidence

Store the pair and the review in the campaign folder:

```
design/program/finish/campaigns/<ID>/evidence/<date>-<surface>-before.png
design/program/finish/campaigns/<ID>/evidence/<date>-<surface>-after.png
design/program/finish/campaigns/<ID>/evidence/<date>-<surface>-review.md
```

The review names the reviewer, the claim, the five scores, the verdict and the fix. A green unit test
is not a substitute for this file.
