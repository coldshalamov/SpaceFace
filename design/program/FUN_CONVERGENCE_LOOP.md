<!-- LIFETIME: STABLE -->
# The Fun Convergence Loop — how "make it better" becomes work agents can do

**Status: ACTIVE EXECUTION LAW for every feel, combat, and "is it fun" task. Admitted by the owner's
direction of 2026-09-03.** Operator prompt: [`FUN_CONVERGENCE_GOAL.txt`](./FUN_CONVERGENCE_GOAL.txt).
Bars: [`design/FEEL_CONTRACT.md`](../FEEL_CONTRACT.md). Product intent:
[`design/VISION.md`](../VISION.md). Manager and anti-loop law: [`CENTRAL_BRAIN.md`](./CENTRAL_BRAIN.md)
(this loop is its feel-specific instance; it does not replace the queue, the packets, or `NOW.md`).

## 0. The problem this loop exists to end

The owner's words, 2026-09-03: *"every point I had made in prompting development had been
'technically' satisfied, but the game sucked, where it was built it was either thin or misconfigured
and lazy/dumb. I don't know what else to prompt but 'make it better'."*

That is a precise diagnosis of an agentic failure mode, and it has three faces. Every agent working
on feel must be able to name which one it is fighting:

| Face | What it looks like | How it slips past a check | The proof that catches it |
|---|---|---|---|
| **THIN** | The feature exists and does one thing once. A shove moves a ship one hull length. A spill spawns pods nobody wants. | "See, it shoves." The test asserts existence, not consequence. | **Consequence count.** An action that does not produce at least two further things (a motion, a reaction, a receipt someone else consumes) is thin. |
| **MISCONFIGURED** | The system is right and the numbers are wrong. Thrust vs speed vs screen made the ship a bus. A governor braked earned speed. | The number was never written down as a bar, so nothing failed. | **A bar in player units** (screen depths, seconds, hull lengths, fraction kept) with the before and after number. |
| **LAZY** | The relevant behavior was never exercised. The path follower "followed the path" at walking speed and passed its own tracking test. | The test measured the wrong thing; a visual claim was never inspected at the shipping camera. | **Direct evidence for the changed claim plus the live owner.** Print the affected bar and read its rule; inspect the rendered surface for appearance. A stored strip is optional and is never a universal close gate. |

"Make it better" has no operational meaning by itself. This loop gives it one: **select a finite
player outcome, inspect the affected behavior, name the causal problem, change it, directly check
the result, and report in plain words.** Iterate on material failures inside that outcome. Stop
when it works and required direct verification passes; confidence-only reviews and unrelated
improvements do not prolong the assignment.

## 1. The one prompt

The owner types one of these and nothing else:

```text
MAKE IT BETTER                 (default scope: combat and flight feel in the Crucible)
MAKE IT BETTER adventure       (the 60-second proof scenario at the reference site)
MAKE IT BETTER <verb>          (rope | shove | wells | draw-path | terrain | cargo | sound | first-ten-minutes)
```

The agent reads `FUN_CONVERGENCE_GOAL.txt` and runs §3. Select the relevant existing scenario or
fixture before proposing tooling. Build a missing bench capability under its existing `PQ-173`
owner only when it is the narrowest way to answer the current claim; an absent universal bench
does not postpone a production repair. It does not ask the owner to adjudicate technical risk
or add content to hide a feel defect. It completes the requested scope and stops when §6 says stop.

## 2. Two laws that order everything

**Crucible first for shared combat feel.** Tune shared combat/flight mechanics in the relevant
bounded seeded Crucible scenario, then check the affected Adventure connection; inherit the same
rules rather than copying systems. The owner's reasoning: *"if you get the crucible mode to be
optimally fun, then it would make the goals for adventure combat more obvious."* This is a
development surface, not a full Crucible battery before every Adventure onboarding, job, shop or
recovery repair. Reuse unchanged shared-mechanic results.

**Reproducible comparisons.** Simulation/tuning comparisons use a deterministic scenario with a
fixed seed and, where input is involved, a fixed input tape. The sim is deterministic (60 Hz fixed step, `state.rng`);
the Crucible plans the same wave from the same seed; the lab replays a tape to the hash. Randomness in
a bench stalled development once before, when agents could not reproduce what they were tuning. A
simulation result without its relevant configuration/seed cannot support a before/after claim.
For a nonrandom lifecycle or presentation fix, use the focused counterexample that observes it;
do not add an all-seed battery to a claim independent of randomness.

## 3. The loop (one cycle)

One cycle addresses one causal hypothesis within the selected outcome. Roles are hats, not
mandatory stages or people. The implementer checks its work. A coherent cross-system, high-risk
or subjective slice receives one independent combined product and engineering critique; it does
not receive a fresh critic plus a separate reviewer after each edit. Appearance judgments need a
reviewer who can inspect the actual rendered picture.

```text
SELECT OUTCOME → NAME CAUSE → FIX → DIRECT CHECK → CRITIQUE WHEN LOAD-BEARING → COMMIT/REPORT
                                ↑ material finding inside this outcome ↓
                                └──────────── repair and recheck ───────┘
```

### 3.1 PLAY — select the affected scenario, headless first

Inspect the selected live owner and current evidence, then run the smallest existing fixture or
scenario that observes the changed claim and its relevant failure/recovery boundary. Do not fake
missing instrumentation or turn every gap into a new harness. Boot the real route when entry,
earning/reachability, rendering or shell behavior is the claim. Only a session-shape question
that focused fixtures cannot express needs one capped ordinary-route window.

These are available scenario families and milestone coverage, not a battery for every cycle:

| Bench | What runs | Seeds | Instrument |
|---|---|---|---|
| **Crucible feel bench** | Swarm ruleset, three arenas × three loadouts (starter, physics kit with the shove weapon, rope kit), first three waves | 3 fixed seeds each | `scripts/check-crucible-route.mjs` pattern (real browser, fixed seed), `tools/agentic/scenarios.json` `swarm-12`, `duel-1v1`, `mixed-wing` |
| **Flight bench** | Slalom, reversal, accel/brake, collision recovery | fixed | `flight-slalom`, `flight-reversal`, `flight-accel-brake`, `collision-recovery` scenarios; Motion Lab |
| **Adventure proof** | The 60-second proof at the reference site (`PQ-141`) | 5 seeds for the complete milestone; affected cases for a repair | `proof.sixty_seconds` when it exists; inspect the rendered route when appearance is the claim |
| **Verb benches** | One scenario per verb: rope swing/release, shove, well, draw-path stroke, terrain slam, cargo spill | fixed | the `feel.*` scenarios (`PQ-137.10`) |

Headless runs establish the behavior they exercise; their numbers do not certify fun or visual
legibility. Inspect the changed rendered surface for an appearance claim, with a scoped in-session
still if useful. A capture needs a named immediate consumer and a decision or repair; no unattended
strips or archives. A missing GPU or capture timeout leaves that appearance claim unproven without
holding verified production work hostage. Human play supplies optional feedback, never a gate.

### 3.2 MEASURE — print the affected bars and useful readouts

Select the affected `FEEL_CONTRACT.md` §B bars and the readouts that can falsify the declared
hypothesis or expose its significant tradeoff. These existing metrics remain available in player
units; do not collect all of them for every cue, tuning parameter or lifecycle edit:

- **verbs used per minute** (distinct: thrust, brake, boost, latch, reel, release, throw, shove,
  well, stroke) — combat opportunity target ≥ 4; this is not a measure of human fun;
- **consequences per player action** (motions, reactions, receipts caused within 3 s) — thin is < 2;
- **time to first consequence** after an action — instant is ≤ 0.3 s;
- **moments per minute** (the `PQ-146` moment detector; until it exists, collateral events ≥ 2
  bodies) — dead is < 1;
- **nothing-happened seconds** (no player input change and no world event for > 4 s) — a fight
  should have none; this ceiling belongs to combat benches only — travel, docking and industry have
  their own pacing envelopes (`PQ-149` writes them; contrast is the point of a quiet stretch);
- **deaths by cause**, and whether each was telegraphed ≥ 0.5 s ahead;
- **knock budget on the player** (contact-sourced velocity changes on the player hull per minute and
  the largest as a fraction of cruise) — bar B13.

Consequence-count targets apply to physical gameplay features. Controls, confirmations, selection,
braking and instruments should do their one job well; they do not need extra reactions for a score.

Record candidate revision, relevant seed/configuration, command and result compactly for the
integrated slice. Reuse the scenario's ordinary output; no JSON-plus-Markdown receipt per run is
required. Report only observed metrics, without converting event counts into a fun verdict.

### 3.3 JUDGE — one combined critique of the changed result

The implementer compares the declared outcome with its direct evidence and causal owner. For a
coherent cross-system, high-risk or subjective slice, one independent agent examines that same
work for both product and engineering failures: intent, reachability, feedback, denied/interrupted
actions, value conservation, persistence, determinism and supported accessibility as applicable.
Fix material defects, then recheck their changed boundary. A fresh general audit or confidence-only
agreement is not another phase. A behavior number supports its measured fact; an appearance verdict
requires the picture, an audio-character verdict requires hearing it, and none establishes human fun.

**Optional frame-strip instrument.** The generated rubric below is the format contract for an
explicitly selected frame-strip critique. Its ten questions and blocker fields apply only when
that instrument has claim-relevant frames/run facts to consume; they do not require creating a
strip, using another reviewer, or grading every bench. Without evidence of a boundary, record it
as unobserved rather than clear. Preserve this generated block through its source/check when the
instrument itself is changed; ordinary production cycles use the proportional critique above.

<!-- critic-rubric:begin (generated from scripts/lib/critic/rubric.mjs — do not edit by hand) -->
A vision-capable model that did not make the change reads the frame strips and the metrics and
answers ten yes/no questions, each with the frame index that proves the answer. Prose without a
frame is not a verdict.

1. Can I tell what the player did from the frames alone?
2. Did the world answer within a third of a second (motion, light, or a visible receipt)?
3. Did something the player did not directly touch change because of it?
4. Would the vision's sentence for this verb be true here? (quote the sentence)
5. Is the ship a controllable mass (turns inside the screen, stops when braked, keeps earned speed)?
6. Are the light ships ammunition here, rather than only targets?
7. Is anything on screen a glowing sphere standing in for a designed event? (the good answer is
   "no")
8. Did anyone flee, choose, or arrive because of the violence?
9. Would a stranger tell a "so then" story about these twelve seconds?
10. What is the ONE fundamental that, if fixed, would flip the most "no" answers? Name the rule, the
    file, what it does, and the vision sentence it breaks — the format of `FEEL_CONTRACT.md` §A.

The count of "yes" answers is a coverage score, never the verdict. The verdict has three independent
parts (audit 2026-09-05, `PQ-173.04`), and the tool prints each of them:

- **Blockers** — seven, each answered separately with a boolean whose polarity is always the same
  (`blocked: true` means blocked) and an evidence field: a frame the critic was shown, or a receipt
  in the run facts where the definition allows one. Any one blocker fails the bench regardless of
  the count.
  - `visual_stand_in` — a bad visual stand-in (question 7); a frame is required when raised. A
    camera-facing glow, soft disc, sphere or particle cloud is doing the job of a designed object or
    event. Tiny background stars at sky depth are the only exception; anything the ship can fly past
    is not a star.
  - `unreachable_route` — an unreachable default route; a frame or a receipt when raised. What the
    strip shows cannot be reached on the default route without a flag, a URL parameter or a debug
    key (the run facts name the route the strip was photographed on).
  - `wrong_control_label` — a wrong control label; a frame is required when raised. A label visible
    in the frames names a key or an action that the pictures or the input tape show is not what
    happens.
  - `value_lost_or_duplicated` — lost or duplicated value; a frame or a receipt when raised.
    Credits, cargo, loot, a claim or a ship appears twice or disappears without a cause the frames
    show.
  - `unreadable_decisive_threat` — an unreadable decisive threat; a frame is required when raised.
    The threat that decided the outcome (the shot, the ram, the wall, the wave) was not readable at
    the shipping camera before it landed.
  - `broken_save` — a broken save; a frame or a receipt when raised. A save-and-reload inside the
    run changed a position, an owner, a count or an outcome. If the run had no save boundary, the
    blocker is clear and the evidence says so.
  - `performance_regression` — a performance regression; a frame or a receipt when raised. The strip
    stutters, repeats frames, or a stretch of it ran below the normal-speed floor (the run-health
    facts say where and how far).
- **Intent result** — the one-line hypothesis the cycle declared (§3.4, handed to the tool with
  `--intent`), whether the frames support it (a boolean, with the frames that show it holding or
  failing), and which tradeoff was actually spent against the one the cycle declared before the run
  (§3.6, `--tradeoff`). A strip graded with no declared claim records no intent result; the critic
  never invents one.
- **Play judgment** — what the player can now perceive that they could not before; what the player
  can now decide that they could not before; what the player can now execute that they could not
  before; where friction remains; what observation would falsify the candidate. Written for someone
  who does not read code. It is not a sum of adjectives and not an event counter.

A verdict passes only with no blocker and, when a claim was declared, with the frames supporting it;
a verdict with one blocker fails however many good answers it counted. The owner report renders the
three parts in plain words. The critic's answer to question 10 is the next cycle's hypothesis. The
critic never proposes content.

This block is generated from `scripts/lib/critic/rubric.mjs` by `node
scripts/generate-critic-rubric-doc.mjs` and checked against it by `test/fun-critic.test.mjs`; change
the rubric, not this text.
<!-- critic-rubric:end -->

### 3.4 NAME THE FUNDAMENTAL — one hypothesis

From the selected failure, affected bar and any material critique finding, the implementer writes
one line:

> *When X happens, rule R in file F does Y, which breaks vision sentence S; changing R to R' should
> move bar B from n to m.*

If the line cannot be written, the cycle is reconnaissance and stops at the 20 % budget
(`CENTRAL_BRAIN.md` §6.1). Two hypotheses at once is not allowed.

### 3.5 FIX THE GUTS — the allowed and forbidden moves

Allowed: numbers, rules, listeners, gains, thresholds, curves, orders of systems, camera, sound,
telegraphs, removing a clamp, connecting two existing systems.

Forbidden as a fix for feel (each has been tried here and each made it worse):

- adding content (more enemies, ships, stations, missions) to hide a feel defect;
- adding drag, damping, or a velocity clamp on given momentum;
- hidden gyros, transform writes, or instant counter-thrust for NPCs;
- camera shake or particle showcases in place of the event;
- HP inflation or level scaling;
- a second architecture, mode, or flag path for the fix;
- changing a test or a golden to make the bar pass (a golden moves only with the causal record in
  `docs/COMMON_BUGS.md` §8/§10d).

Use the affected existing checks and add a focused regression when recurrence or a meaningful
boundary warrants it. The assertion should express the player behavior, not mirror the code.
Reversible low-impact edits do not require a new test merely to create evidence volume.

### 3.6 COMPARE — keep or revert

Re-run the selected affected fixture/scenario on the same configuration and relevant seeds. Keep
only if the hypothesis's claimed behavior improves or the demonstrated defect is fixed, and no
checked material boundary regresses except a declared permissible tradeoff (never a hard bar —
B13, the rulings, the refusals). Run `npm run check:baseline` when the change could plausibly break
its covered contracts; broad checks are not automatic for each leaf. Do not wait on a critic strip.
An equivalent numeric result may still contain a verified recovery/readability repair; unsupported
extra tuning is removed. Not every design metric is monotone; a cycle is judged
on the bargain it named, never on every bar moving at once (audit 2026-09-05). Two failed cycles
on the same causal model falsify the model (`CENTRAL_BRAIN.md` §6.5).

### 3.7 REPORT — the completed slice, in the owner's words

Report the integrated outcome and any material limitation compactly; intermediate measurements
stay in the working output. A non-coder should understand what changed and what was actually checked:

```text
WHAT I FOUND     one sentence naming the fundamental in plain words
WHAT I CHANGED   one sentence, no file names
WHAT YOU WILL FEEL   two sentences: what is different when you play, and what still is not
THE NUMBERS      one small table: bar | before | after | target
REMAINING        material unfinished work inside the requested scope, if any
```

## 4. Optional owner feedback, and the translator

When the owner supplies gameplay feedback, an agent (the TRANSLATOR hat) turns it into work without
asking the owner to adjudicate technical details. No weekly session, recording, completion rate,
retention percentage or owner verdict is required. The loop advances on observed failures and
agent-found gaps; human absence is never an execution gate (owner 2026-10-04 — AGENTS.md §4):

1. **Reproduce it.** Find or write the deterministic scenario that shows the complaint.
2. **Name the fundamental** in the §A audit format, or say honestly that it could not be found yet.
3. **Write the bar** in player units the owner would recognise ("a shove should throw a light ship
   a full screen"; "my own ship should never get knocked around by a bump").
4. **Never answer with content.** "There aren't enough enemies" is a sign the fight is thin, not a
   spawn count.

Verdict examples and their translations:

| Owner says | Translator writes |
|---|---|
| "it's like driving a bus" | B2 reversal time and turn radius at cruise; hypothesis in thrust vs speed vs screen |
| "shoving does nothing" | B4/B5 shove magnitude and displacement; hypothesis in impulse, clamp, or recovery |
| "my ship keeps getting knocked around" | B13 knock budget; hypothesis in contact bounds on the player hull |
| "it follows the line but it's slow and dumb" | B8 stroke speed; hypothesis in the corner rule |
| "it's not fun" with nothing else | Inspect one affected play sequence, select its largest causal gap, and directly check one improvement; use independent product critique when judgment is load-bearing |

The step-by-step checklist for wearing that hat, with the audit template and more verdict->bar
examples: [`TRANSLATOR_CHECKLIST.md`](./TRANSLATOR_CHECKLIST.md).

## 5. The fleet (who does what, all agents)

Development is fully agentic. The owner may contribute feedback; no role requires a human session.

| Hat | Needs | Model class (per `build_map.md` §14) |
|---|---|---|
| Implementer | code, tests, the bench | Grok / Codex / Opus-class |
| Measurer | scripts, JSON | any |
| Combined product/engineering critic | independent for a coherent cross-system, high-risk or subjective slice; vision when judging appearance | capable of inspecting the actual evidence; one review covers both perspectives |
| Brainstorm partner | the vision + numbers | Gemini, Kimi (prompts inline; graded, never obeyed) |
| Translator | the owner's words + the bars | Fable/Opus-class |
| Voice, sound, art | generated media pipelines (`design/production/09`), directed synthetic voice, Blender, imagegen | per `docs/visual-assets/README.md`; no recorded actors are assumed anywhere |

## 6. Stop conditions

Complete the requested finite outcome and stop when its direct verification passes and no
unresolved defect materially changes that outcome or significant risk. A broader lane/milestone
request retains its substantive bars; a selected repair does not inherit every bench as a gate.
The owner may also stop the work explicitly. During an unfinished assignment:

- an attempted model is falsified: change the approach only when a named unresolved material gap
  justifies it; continue resolving that gap without manufacturing three models or asking for a
  human play session;
- exact foreign dirty paths are needed: preserve them and coordinate their continuation; proceed
  with disjoint work in the authorized scope. A shared registry/save change is work, not a generic
  `BLOCKED` label or an excuse to redesign unrelated systems.

A green proxy alone does not finish a broken outcome. Once the outcome exists and the required
direct check passes, do not prolong it for corroboration, an all-bench verdict or a fresh reviewer.

## 7. Owner rulings recorded 2026-09-03 (plain words, binding)

- **No multiplayer. No walking around. No ship interiors.**
- **Keep the top-down view.** The ships tumble in 3D on screen; the flying stays on the plane.
- **Random or procedural content is neither wanted nor banned.** What is banned is anything agents
  cannot test: every bench uses fixed seeds.
- **Wingmen stay small.** The Z wheel that already exists is enough; no bigger fleet layer. The
  "fleet command" wording the owner sees on the regular UI is a candidate for the surface passes.
- **The owner's own ship is never knocked around.** Bumps and scrapes must not shove or spin the
  player's hull; only a deliberate big event may, and it must be legible. Bar B13.
- **Enemies do not become damage sponges** and hits do not scale with levels; mass and momentum
  decide. (This is what "HP sponge" meant; the owner never needed the term.)
- **Loot rarity is allowed** if it ever earns its place; a crafting grind is simply not a goal.
- **No dialogue trees. One linear story that builds.** Branching and "replay value" are not goals.
  The endings that already exist stay; no new branch work.
- **Camera shake is not a fix** and never was the point; the problems are fundamental.
- **The Crucible comes first** for combat feel; crossover with adventure is optional, not a goal.
- **Everything is made by agents.** Voice is directed synthetic voice; no recorded actors are assumed.
- **Five launch languages** stands as the default until said otherwise.
