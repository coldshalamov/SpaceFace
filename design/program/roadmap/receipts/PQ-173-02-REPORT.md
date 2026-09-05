<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-173.02 — The critic (a model that did not make the change reads the frames)

```text
DONE  PQ-173.02 — a model that did not make the change graded frames of a build carrying the September rules and named the governor brake and the NPC cap; the terrain-helm finding was not singled out (one fundamental per verdict, and the cap dominated the shove pictures), which is recorded, not claimed.
WHAT I FOUND     Nothing the critic had been handed could be graded: every strip anyone had captured ran under the normal-speed floor, and the shove tape never hit anything because the cursor pointed at an empty corner of the glass.
WHAT I CHANGED   The photographer costs a third of what it did (every third frame is encoded, the text sweep runs only when the overlay changed), each strip now says where it ran slow and what the pilot's hands did, two tapes put the ship through the exact motions the September audit named, and the critic can be told which finding a strip was captured to expose and says whether it saw it.
WHAT YOU WILL FEEL   Nothing changes in the game from this unit. What changes is that "does it feel right" now has a second opinion from a model that can see and did not write the code, and that opinion is refused unless the pictures were taken at normal speed with the ship actually drawn.
THE NUMBERS      findings reproduced on the rules-restored build | 2 of 3 (governor brake, NPC cap; terrain helm not singled out) · strips admitted at normal speed | 5 (0.63–0.79) · photographer cost, every-frame vs every-third | 0.51 vs 0.85 of real time · critic wall time per strip | 2–9 min
THE FRAMES       manifests/crucible/audit-rules-restored-31829d1a/{earned_speed,shove_light}-physics_toolkit-s4242/contact-sheet.png, and the live build's under manifests/crucible/57a31390-dirty-57d83eea/
NEXT             PQ-173.03 the report and the translator
```

## What was in the way (measured, 2026-09-05)

Four strips existed when this unit started. All four failed admission on the normal-speed floor
(0.26–0.45 of real time), including two on the hardware GPU. One boot with the game standing still
measured where the time went, simTime over wall clock:

| stage | real time |
|---|---|
| nobody watching | 0.78–0.90 |
| the in-page recorder | 0.82 (free) |
| the debugger attached, no screencast | 0.67–0.76 |
| screencast encoding every compositor frame | **0.51** (18 encoded frames a second) |
| screencast encoding every third frame | 0.85 (5 a second) |
| the once-a-second text sweep over the overlay | **0.63** |

Encoding every frame was the single biggest cost, and the strip retains at most 8 fps, so two thirds
of that work bought pictures the retention mask threw away. The overlay sweep walked every text
node with `getComputedStyle` once a second and cost fifteen points; it is now gated on a DOM
mutation outside the roots the stylesheet already hides (the hidden HUD keeps writing its readouts
every frame, which had defeated a naive observer).

## What the harness now records that it did not

- `realtimeStages` — settled / after recorder / before screencast / during / after, so a slow strip
  is diagnosed rather than recaptured blind.
- `realtimeSegments` — real time per five wall-clock seconds, and `wallS` on every frame. This is
  how the pre-fix build's earned-speed strip was shown to be a five-second stall (frames jump from
  wall second 7 to 13) between segments at full speed, not slow motion.
- `inputEvents` — every tape step stamped with the sim time it landed, in a pilot's words ("boost
  released"), shown to the critic as what was asked of the ship, never what the ship did.
- `screencastEveryNthFrame` and `deliveredFps` — the cadence used and the cadence the compositor
  actually delivered, so a moment window's real frame rate is a number.
- moments carry `with=` (what the ship met: `asteroid`, `ship`, `structure`) and the player's own
  shots landing (`projectile:hit`, player-owned only) are moments, so the critic gets a
  before/at/after triplet around a shove.

## The tapes

- `earned_speed`: forward, boost past the cap, boost released with forward still held, hands off,
  then a deliberate brake. The three regimes of audit findings A1/A2.
- `shove_light`: the cursor kept on the nearest live hostile (real pointer moves every poll) while
  the concussion cannon fires in bursts and the nose sweeps. Findings A4/A5.

## The critic's new switches

- `--expect-fundamental <key|regex>`: `governor_brake`, `npc_clamp`, `terrain_helm` (or any-of,
  comma-separated) match the mechanism in a viewer's words or the rule's own name; an accepted
  verdict that names something else exits 3 and records `reproduction.reproduced: false`.
- `--repo-dir <tree>`: the model runs in the tree the strip was photographed from, with the strip's
  directory added to its workspace, so a critic that reads code reads the rules the frames show.
  `agy` also gets the harness's timeout handed down (its own print timeout was five minutes).

## The pre-fix build, honestly

The literal pre-fix commit (`cdfd05ff`, the parent of the 2026-09-03 fix) was checked out sparsely
with the current harness overlaid and captured three times for the earned-speed tape and once for
the shove tape. It runs the boost run with a reproducible multi-second stall and the fight at a
fifth of real time on this machine, so none of its strips can pass the floor (0.58, 0.43, 0.33;
shove 0.21). Those manifests are kept under `manifests/crucible/audit-prefix-cdfd05ff/` as the
record; their speed traces show the findings plainly (boost to 245, braked to 168 within a second
with forward held, dead stop within two seconds of hands-off) but the harness refuses them, and
that refusal is correct.

The admissible pre-fix evidence is a controlled variant: the live head with exactly the three rules
restored — the governor's reverse-thrust floor above the cap, the assist that never lets go, the
NPC cap that truncates given momentum, and terrain that never takes the helm — captured under
`manifests/crucible/audit-rules-restored-31829d1a/`. Same performance as the live build, only the
rules differ, which is the cleaner experiment.

## Results

Critic: Gemini 3.8 Flash High through `agy`, sixteen frames per strip chosen before/at/after the
biggest moments the ship was in plus an even spread; the model runs in the tree the strip came
from. Verdicts under `receipts/fun-loop/critic/`.

| strip | build | real time | expected | the critic's fundamental (its words) | reproduced |
|---|---|---|---|---|---|
| `earned_speed` s4242 | rules restored (`audit-rules-restored-31829d1a`) | 0.734 | `governor_brake` | "applySpeedGovernor overspeed brake — brakes the ship when speed exceeds combatSpeed while holding forward throttle instead of coasting", frame 51 | **yes** (5/9 good answers) |
| `earned_speed` s4242 | live (`31829d1a`, earlier harness) | 0.669 | none (contrast) | "speed governor overspeed brake in assisted flight — brakes the ship when speed exceeds combatSpeed while holding forward throttle instead of coasting", frame 64 | (named the same rule on the live build) |
| `shove_light` s4242 | rules restored (27 shots fired, press through the screencast's session) | 0.726 | `npc_clamp`, `terrain_helm` | "_clampSpeed — truncates NPC velocity to 1.15x maxSpeed each tick, deleting given momentum and shove impulses", breaks "Light ships are ammunition.", frame 56 | **yes: `npc_clamp`** (6/9 good answers; q3 saw hostiles meeting rocks, q6 saw the shoved ships stay targets) |

### Frames only, and what it exposed about the critic

The done-when says "from frames alone", so a `--frames-only` mode was added: the model runs in an
empty directory with nothing but the strip added to its workspace, is told it has no source and no
design documents, and may write "unknown" for the file. Regrading the same strips that way:

| strip | mode | fundamental | note |
|---|---|---|---|
| rules restored `shove_light` | repo in workspace | `_clampSpeed`, 1.15x, "Light ships are ammunition." | reproduced `npc_clamp` |
| rules restored `shove_light` | frames only | **byte-identical** to the row above, file name and constant included | not independent evidence |
| rules restored `shove_light` | frames only, new project | **byte-identical** again, 109 s | the memory is not per project |
| live `shove_light` | repo in workspace | `_clampSpeed` (the fixed rule, named on the fixed build) | the audit prose primed it |
| live `shove_light` | frames only | "unknown" file, but still "_clampSpeed NPC velocity clamp"; 3/9 | remembered the name |
| rules restored `earned_speed` (recaptured, 0.63) | frames only, new project | "Speed governor overspeed auto-braking", file **unknown**, "bleeds off earned speed above the thruster cap while holding forward or coasting, actively braking the ship down to cruise"; 2/9 | a new strip, no remembered answer: **reproduced `governor_brake` from the pictures and the tape** |
| rules restored `shove_light` (recaptured, 0.80, 28 shots) | **Kimi K3, frames only** (a fresh process, a different vendor, the strip's folder as its whole world) | "The shove cannon applies no visible knockback displacement: shoved light ships stay parked in their swarm slots ... light ships never fly as thrown mass", file **unknown**, breaks "Light ships are ammunition."; 6/9 | **the A4 symptom, from the pictures, with no file name** — the matcher had only known the engineering words and was widened to the observable (`stays parked`, `never fly as thrown`) with Kimi's sentence pinned in the test |

The Gemini route (`agy`) carries memory across conversations and projects. Two verdicts on one
strip, minutes apart, one with the whole repository in its workspace and one with nothing but the
pictures, came back byte-identical — including a source path and a numeric constant the second
run could not have seen. A verdict from that route is therefore a verdict from a model that has
read this repository's own audit (`design/FEEL_CONTRACT.md` §A names `_clampSpeed` and 1.15x in as
many words) and remembers it. That does not make its pictures wrong — the answers that cite frames
are checked against the frames it was shown — but it does mean "reproduced from frames alone" can
only be claimed for a model with no such memory, which is why the Kimi frames-only row exists and
why the receipt says which rows are which.

What the frames do show, on both builds, is that a shoved light ship does not fly: on the
rules-restored build because the cap deletes the momentum; on the live build because the shove's
impulse is small (audit A8, `PQ-137.05`, still open). A critic cannot tell those two apart from
pictures, and it should not be asked to: the reproduction of A4 is the rule named on the build that
has it.

**The contrast strip is the finding worth reading.** On the live build the same tape produces the
same picture: boost carries the ship to 120, boost ends, and the ship is pulled back to 82 within
a second with forward still held; hands off, it stops dead in a second. The rule that does that
today is not the retired governor brake but PQ-137.03b's planar-speed cap, which bounds
control-made speed through the physics owner's thrust-only clamp — legal under FEEL_CONTRACT §D
("a speed cap bounds a body's own drive"), and indistinguishable, to a stranger watching, from the
confiscation the audit named. A boost-based tape therefore cannot tell the two rules apart, and a
physics-earned tape (a slingshot on the rope kit, or a shove taken) is what would. That goes to the
owner in the PQ-173.03 report as a product question with a default, not as a defect.
