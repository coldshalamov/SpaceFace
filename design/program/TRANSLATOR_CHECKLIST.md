<!-- LIFETIME: STABLE -->
# The Translator Checklist — turning the owner's spoken verdict into work

After the owner's weekly 45-minute play on a clean build, one agent wears the TRANSLATOR hat and
turns whatever the owner said into the next cycle's work — without asking the owner to adjudicate
anything, and without ever answering with content. Law:
[`design/program/FUN_CONVERGENCE_LOOP.md`](./FUN_CONVERGENCE_LOOP.md) §4. Bars:
[`design/FEEL_CONTRACT.md`](../FEEL_CONTRACT.md) §B. This page is agent documentation; engineering
words are allowed here.

## 1. The four steps (in order, every time)

1. **Reproduce it.** Find or write the deterministic scenario that shows the complaint — a fixed
   seed, a fixed input tape, run headless. A complaint you cannot reproduce on a fixed run is not
   yet work; say so and keep the tape for next week.
2. **Name the fundamental** in the `FEEL_CONTRACT.md` §A audit format (template below) — the one
   rule in the live code that, if fixed, would flip the complaint. If you honestly cannot find it
   yet, write exactly that: "the fundamental could not be found this week; here is what was ruled
   out." A guessed fundamental is worse than an admitted gap.
3. **Write the bar** in player units the owner would recognise — screen depths, seconds, hull
   lengths, fraction of speed kept, times per minute. Not "improve responsiveness"; "a full 180°
   reversal takes ≤ 3 seconds at cruise".
4. **Never answer with content.** "There aren't enough enemies" is a sign the fight is thin, not a
   spawn count. The translation names the rule and the number; it never names a new ship, mission,
   or feature.

## 2. The §A audit format (fill this in)

```text
Rule in the live code:   <file path> — <function / constant name>
What it does:            <the mechanism, one sentence, mechanically precise>
Effect on the fantasy:   <what the player feels because of it, in owner words>
Vision sentence broken:  "<quote the sentence from design/VISION.md this rule contradicts>"
Bar it should move:      <FEEL_CONTRACT §B bar id> — "<the bar's player-unit statement>"
Status:                  OPEN → <packet/leaf id, or "unassigned">
```

The bar line must carry a number an agent cannot tune away, and the scenario that measures it.

## 3. Owner says / Translator writes

The first five rows are verbatim from `FUN_CONVERGENCE_LOOP.md` §4. Rows marked **[NEW]** were
derived from `FEEL_CONTRACT.md` §B bars the original table did not cover
(PQ-173.03, 2026-09-03).

| Owner says | Translator writes |
|---|---|
| "it's like driving a bus" | B2 reversal time and turn radius at cruise; hypothesis in thrust vs speed vs screen |
| "shoving does nothing" | B4/B5 shove magnitude and displacement; hypothesis in impulse, clamp, or recovery |
| "my ship keeps getting knocked around" | B13 knock budget; hypothesis in contact bounds on the player hull |
| "it follows the line but it's slow and dumb" | B8 stroke speed; hypothesis in the corner rule |
| "it's not fun" with nothing else | Run the full bench; take the critic's question 10 |
| **[NEW]** "when I hit things, nothing answers — no sound, no pause, no weight" | B9 impacts answer; hypothesis in hitstop, camera trauma, and mass-differentiated collision audio on the collision receipt |
| **[NEW]** "the world ignores me — nobody reacts when I shoot or spill cargo" | B10 the world reacts; hypothesis in the zero-listener world-reaction events (`aftermathWreck:spawned`, `survivorPod:ejected`, `freight:cargoSpill`) and missing traffic reactions to `combat:damage` |
| **[NEW]** "everything blows past too fast to follow" | B3 the fight stays on screen; hypothesis in the camera opening with speed above the cap |
| **[NEW]** "crashing into rocks is free" | B6 terrain is lethal; hypothesis in damage from pre-solve closing speed (the contact bound protects the solver, not the story) |
| **[NEW]** "the story moment never happens" / "the sixty seconds don't work" | B12 the sixty-second proof; hypothesis in beat orchestration at the reference site (`proof.sixty_seconds`, `PQ-141`) — the program's acceptance gate |
| **[NEW]** "the rope is a bungee cord" | B7 the rope is a rope; hypothesis in the spring constant and damping on the Massline |

## 4. What a translation must never do

- **Never answer with content.** No new enemies, ships, stations, missions, or modes to hide a feel
  defect. The allowed moves are numbers, rules, gains, thresholds, curves, orders of systems,
  camera, sound, telegraphs, removing a clamp, connecting two existing systems.
- **Never invent a bar that has no fixed-run way to measure it.** If no deterministic scenario can
  produce the number, the bar is not a bar yet — it is a wish. Either build the scenario first or
  drop the line.
- **Never ask the owner to choose between technical options.** "Should I fix the camera or the
  thrust curve?" is the translator failing. The owner says what is wrong in player words; the
  agent decides the mechanism and owns the risk.
- **Never rewrite the owner's verdict into something weaker.** "It sucks" stays "it sucks" in the
  record, then becomes a measured bar — not "polish requested".
- **Never close the translation without the §A audit and the player-unit bar** (steps 2–3 above),
  even when the finding is "could not be found yet".
