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
| **LAZY** | Nobody played it. The path follower "followed the path" at walking speed and passed its own tracking test. | The test measured the wrong thing; the feature was never watched at the shipping camera. | **Frames.** A capture at the shipping camera, at normal speed, graded by a critic that can see, plus the owner's weekly hands-on. |

"Make it better" has no operational meaning by itself. This loop gives it one: **run the bench,
find the lowest bar or the worst frame, name the fundamental, change one thing, measure, keep or
revert, report in plain words.** Repeat until the bars stop moving or the owner says so.

## 1. The one prompt

The owner types one of these and nothing else:

```text
MAKE IT BETTER                 (default scope: combat and flight feel in the Crucible)
MAKE IT BETTER adventure       (the 60-second proof scenario at the reference site)
MAKE IT BETTER <verb>          (rope | shove | wells | draw-path | terrain | cargo | sound | first-ten-minutes)
```

The agent reads `FUN_CONVERGENCE_GOAL.txt` and runs §3. **If the bench does not exist yet (`PQ-173` not done), the first cycle builds it — `--next` hands that unit out first — and the loop starts on the next cycle.** It does not ask the owner to adjudicate
technical risk, does not add content, and does not stop after one leaf. It stops when §6 says stop.

## 2. Two laws that order everything

**Crucible first.** Combat and flight feel converge in the Crucible bench (a bounded, seeded arena
with a known loadout) and are ported to adventure by inheriting the numbers, never by copying
systems. The owner's reasoning: *"if you get the crucible mode to be optimally fun, then it would
make the goals for adventure combat more obvious."* Adventure work on feel that has not first passed
the Crucible bench is out of order.

**Fixed seeds or it did not happen.** Every claim in this loop is made on a deterministic scenario
with a fixed seed and a fixed input tape. The sim is deterministic (60 Hz fixed step, `state.rng`);
the Crucible plans the same wave from the same seed; the lab replays a tape to the hash. Randomness in
a bench stalled development once before, when agents could not reproduce what they were tuning. A
result without a seed is an anecdote.

## 3. The loop (one cycle)

One cycle is one hypothesis, bounded to about an hour of agent time. Roles are hats, not people; one
agent may wear several, but the CRITIC must be a vision-capable model that did not make the change.

```text
PLAY ──> MEASURE ──> JUDGE ──> NAME THE FUNDAMENTAL ──> FIX THE GUTS ──> COMPARE ──> REPORT
 ^                                                                                     |
 └──────────────────────── keep or revert; next lowest bar ────────────────────────────┘
```

### 3.1 PLAY — run the bench, headless and headed

Until `PQ-173` lands, "run the bench" means: run the scenarios and captures named below by hand (they exist), print the numbers you can, and record the gaps as `PQ-173` leaves. Do not fake a bench that is not there.

The bench is fixed and small so results compare across days:

| Bench | What runs | Seeds | Instrument |
|---|---|---|---|
| **Crucible feel bench** | Swarm ruleset, three arenas × three loadouts (starter, physics kit with the shove weapon, rope kit), first three waves | 3 fixed seeds each | `scripts/check-crucible-route.mjs` pattern (real browser, fixed seed), `tools/agentic/scenarios.json` `swarm-12`, `duel-1v1`, `mixed-wing` |
| **Flight bench** | Slalom, reversal, accel/brake, collision recovery | fixed | `flight-slalom`, `flight-reversal`, `flight-accel-brake`, `collision-recovery` scenarios; Motion Lab |
| **Adventure proof** | The 60-second proof at the reference site (`PQ-141`) | 5 seeds | `proof.sixty_seconds` when it exists; `scripts/capture-gameplay-60s.mjs` for frames |
| **Verb benches** | One scenario per verb: rope swing/release, shove, well, draw-path stroke, terrain slam, cargo spill | fixed | the `feel.*` scenarios (`PQ-137.10`) |

Headless runs print numbers. Headed runs (real browser, shipping camera, normal speed, HUD text off
for the critic) produce **frame strips**: 4 frames per second, 8 around impacts, 8 seconds before
and 12 after each moment, aligned to tick and simTime (the observatory capture contract in
`design/production/04_GAMEPLAY_OBSERVATORY.md` §3).

### 3.2 MEASURE — print every bar and the fun metrics

Every bar in `FEEL_CONTRACT.md` §B that the bench can reach, plus these per-run metrics, all in
player units:

- **verbs used per minute** (distinct: thrust, brake, boost, latch, reel, release, throw, shove,
  well, stroke) — a fun run uses ≥ 4;
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

The measurer writes one JSON and one Markdown table per run under
`design/program/roadmap/receipts/fun-loop/<date>-<bench>-<seed>.md`.

### 3.3 JUDGE — the critic looks, with a fixed rubric

A vision-capable model that did not make the change reads the frame strips and the metrics and
answers ten yes/no questions, each with the frame index that proves the answer. Prose without a frame
is not a verdict.

1. Can I tell what the player did from the frames alone?
2. Did the world answer within a third of a second (motion, light, or sound receipt)?
3. Did something the player did not directly touch change because of it?
4. Would the vision's sentence for this verb be true here? (quote the sentence)
5. Is the ship a controllable mass (turns inside the screen, stops when braked, keeps earned speed)?
6. Are the light ships ammunition here, or targets?
7. Is anything on screen a glowing sphere standing in for a designed event?
8. Did anyone flee, choose, or arrive because of the violence?
9. Would a stranger tell a "so then" story about these twelve seconds?
10. What is the ONE fundamental that, if fixed, would flip the most "no" answers? Name the rule, the
    file, what it does, and the vision sentence it breaks — the format of `FEEL_CONTRACT.md` §A.

The count of "yes" answers is a coverage score, never the verdict. The verdict has three parts
(audit 2026-09-05, `PQ-173.04` makes the tool print them): **blockers** — a bad stand-in (question
5), an unreachable route, a wrong control label, lost or duplicated value, an unreadable decisive
threat, a broken save, a performance regression — any one fails the bench regardless of the count;
**intent result** — did the evidence show the improvement this cycle claimed, and which tradeoff was
deliberately spent; **play judgment** — what the player can now perceive, decide and execute that they
could not before, and what would falsify it. Until `PQ-173.04` lands, seven or more "yes" with no
blocker is the working pass. The critic's answer to question 10 is the next cycle's hypothesis. The
critic never proposes content.

### 3.4 NAME THE FUNDAMENTAL — one hypothesis

From the lowest bar and the critic's question 10, the implementer writes one line:

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

The change ships with a test whose assertion message quotes the vision sentence it serves.

### 3.6 COMPARE — keep or revert

Re-run the same bench, same seeds. Keep only if: the bar the hypothesis named moved toward its
target, no bar regressed beyond the noise floor except a tradeoff the cycle declared BEFORE the run
(and no hard bar — B13, the rulings, the refusals — ever), the critic raised no blocker, and `npm run
check:baseline` is green. Ties revert. Not every design metric is monotone; a cycle is judged on the
bargain it named, never on every bar moving at once (audit 2026-09-05). Two failed cycles on the same causal model falsify the model
(`CENTRAL_BRAIN.md` §6.5).

### 3.7 REPORT — one page, in the owner's words

Every cycle ends with a report a non-coder can use, and it is the only thing the owner reads:

```text
WHAT I FOUND     one sentence naming the fundamental in plain words
WHAT I CHANGED   one sentence, no file names
WHAT YOU WILL FEEL   two sentences: what is different when you play, and what still is not
THE NUMBERS      one small table: bar | before | after | target
THE FRAMES       the before/after strip (two rows of six frames)
NEXT             the next lowest bar
```

## 4. The owner's part, and the translator

The owner plays for 45 minutes once a week on a clean build and says whatever they say. That is the
only human step in the pipeline. An agent (the TRANSLATOR hat) turns the verdict into work without
asking the owner to adjudicate anything:

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
| "it's not fun" with nothing else | Run the full bench; take the critic's question 10 |

The step-by-step checklist for wearing that hat, with the audit template and more verdict->bar
examples: [`TRANSLATOR_CHECKLIST.md`](./TRANSLATOR_CHECKLIST.md).

## 5. The fleet (who does what, all agents)

Development is fully agentic. Nothing here needs a human except the owner's weekly play.

| Hat | Needs | Model class (per `CANONICAL_BUILD_MAP.md` §14) |
|---|---|---|
| Implementer | code, tests, the bench | Grok / Codex / Opus-class |
| Measurer | scripts, JSON | any |
| Critic | **vision**, did not make the change | Fable/Opus, Gemini, Kimi (never GLM — no vision) |
| Brainstorm partner | the vision + numbers | Gemini, Kimi (prompts inline; graded, never obeyed) |
| Reviewer | read-only diff review | Codex xhigh |
| Translator | the owner's words + the bars | Fable/Opus-class |
| Voice, sound, art | generated media pipelines (`design/production/09`), directed synthetic voice, Blender, imagegen | per `docs/visual-assets/README.md`; no recorded actors are assumed anywhere |

## 6. Stop conditions

Stop a session (not just a cycle) when one of these is true, and say which:

- every bar the bench can reach is met and the critic passes all benches → report and hand to the
  owner's weekly play;
- the bars stopped moving across three cycles with three different causal models → escalate to the
  owner with the three falsified models in plain words;
- the fundamental needs a shared-change (registry order, save schema, a foreign live hunk) →
  `BLOCKED` with the exact request;
- the owner said stop.

Never stop because a check is green. Green is the floor, not the verdict.

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
