<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-173.03 — The report and the translator: one real cycle, end to end

```text
DONE  PQ-173.03 — one real cycle of the Fun Convergence Loop ran end to end on a real change (the rope) and produced the one-page owner report, with a critic that saw both before and after.
WHAT I FOUND     The loop's pieces existed but had never been chained on a real change; the first attempt showed the report calling a real fix a regression because a bar that moved by two hundred-thousandths was judged by the wrong clause of a two-clause target.
WHAT I CHANGED   The diff learned a noise floor and to read a clause's own met state first; the report accepts one plain-words sentence for what changed; and the whole loop was run on the rope unit: measure before, change the guts, measure after, photograph both at the shipping camera, grade both with a model that did not make the change, render the page.
WHAT YOU WILL FEEL   Nothing new from this unit itself; what you get is the page: design/program/roadmap/receipts/fun-loop/cycles/2026-09-05-rope/OWNER-REPORT.md, which says in plain words what was found, what changed, what you will feel, the numbers, the pictures, and what to fix next.
THE NUMBERS      the rope's stretch at a hard swing | 16.3 % | 5.0 % | under 10 %   ·   the critic's good answers on the swing | 5 of 9 | 5 of 9 | 7 of 9   ·   verdict | KEEP
THE FRAMES       before/after contact sheets under manifests/crucible/rope-before-31829d1a and manifests/crucible/57a31390-dirty-57d83eea (rope_swing, seed 4242), 44 and 52 frames with the line live
NEXT             PQ-137.11 the player is never knocked around
```

## The cycle, step by step (the law's §3)

| step | what ran | result |
|---|---|---|
| PLAY (headless) | `measure-fun-loop --verbs --scenarios=feel.rope_swing_release --seeds=4242` on an unmodified clone of the head, then on this tree | two summaries, same harness digest, same seed |
| MEASURE | B7 clauses printed in player units | stretch 0.163 → 0.050; line held both; tangential speed kept 1.000 both |
| JUDGE | the `rope_swing` tape (latch the nearest rock on the Massline, swing under forward, let go) captured at the shipping camera on both trees; Gemini graded both strips, sixteen frames each | before 5/9, after 5/9; both name the same next fundamental |
| NAME | from the critic's question 10 | "after letting go of the rope below cruise, the hands-off settle spends the swing's speed to a near halt" |
| FIX | PQ-137.07 (the guts: load-scaled line stiffness, break by load rating) | landed in this run |
| COMPARE | `buildMeasureDiff` on the two summaries | KEEP: the one bar that moved moved toward its target; nothing regressed beyond the noise floor |
| REPORT | `report-fun-loop.mjs --before --after --before-critic --after-critic --changed` | the owner page, jargon-linted |

## The translator, used once

The critic's verdict on the after-strip (a stranger's words): *"the ship fails to keep earned speed,
braking to a near-halt at 2.90 WU/s after rope release with hands off instead of coasting."* Through
`design/program/TRANSLATOR_CHECKLIST.md`:

1. **Reproduce it.** `rope_swing` seed 4242 at the shipping camera: released at ~40 WU/s, zero
   within two seconds hands-off (the after-strip's speed trace). Same on the before-strip.
2. **Name the fundamental** (§A format):
   - Rule in the live code: `src/core/flight/propulsionKernel.js` — `reactionAssistAcceleration`,
     the hands-off settle below the governed cap.
   - What it does: below `combatSpeed` the assist brakes a hands-off ship toward rest at the
     nimble regime's stop horizon; the over-cap blend (PQ-137.00) only lets go above the cap, so a
     rope release below cruise is spent like a coast-to-stop.
   - Effect on the fantasy: you swing, let go, and stop.
   - Vision sentence broken: "If I swing well, slingshot well, fly well, I EARN speed and I KEEP it."
   - Bar it should move: B1 — "≥ 99 % of exit speed 10 s later, hands off" — today measured only
     for exits above the cap; the clause below the cap is the gap.
   - Status: OPEN → unassigned (a product question first: should letting go below cruise drift or
     settle? Default: physics-earned speed is tagged and kept at any speed; thrust-made speed
     settles).
3. **The bar in player units:** "let go of the rope at any speed and, hands off, you still have
   nine tenths of it five seconds later."
4. **Never answer with content.** No new enemies, no new weapon; a tag and a rule.

## Defects found and fixed on the way

- The diff judged every value row of a multi-clause bar by the target's FIRST clause, so a
  2e-5 rise in "speed kept" under a target that begins "stretch < 10 %" read as a regression and
  reverted a real fix. `diffDirection` now reads a row's own met state first and has a noise floor
  (`DIFF_NOISE_ABS` 1e-3 / `DIFF_NOISE_REL` 0.5 %). Pinned in `test/fun-measurer.test.mjs`.
- The report could not say what was changed (the data cannot know it). `--changed "<sentence>"`
  prepends one plain-words sentence; the page is still linted.

## What is honest about the critic's numbers

Both rope verdicts were graded with the model's workspace holding the tree the strip came from.
The PQ-173.02 receipt records why that is not "from frames alone" and what the frames-only mode
does about it; the KEEP verdict here rests on the measured bar, and the critic's role in this
cycle is question 10 (the next fundamental), which both strips agreed on.
