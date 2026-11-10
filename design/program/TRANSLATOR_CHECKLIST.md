<!-- LIFETIME: STABLE -->
# The Translator Checklist — turning the owner's spoken verdict into work

When the owner supplies gameplay feedback, one agent wears the TRANSLATOR hat and turns it into
the next bounded outcome — without asking the owner to adjudicate technical details or supplying
content to hide a feel defect. No weekly play session, recording or human verdict is required. Law:
[`design/program/FUN_CONVERGENCE_LOOP.md`](./FUN_CONVERGENCE_LOOP.md) §4. Bars:
[`design/FEEL_CONTRACT.md`](../FEEL_CONTRACT.md) §B. This page is agent documentation; engineering
words are allowed here. Follow [`build_map.md` §1.9](../../build_map.md#19-agentic-production--short-learning-loops-complete-outcomes)
for proportional checks and the existing work/review surfaces.

## 1. Translate the selected complaint

1. **Inspect and reproduce the relevant behavior.** Start from the live owner and existing evidence;
   select the narrowest fixture/scenario or real interaction that observes the complaint and its
   relevant denial/recovery edge. Use a fixed seed and input tape for simulation comparisons.
   If it is not reproduced, retain that uncertainty and investigate the load-bearing workflow;
   do not postpone work until a weekly play session or build a universal harness.
2. **Name the fundamental** in the `FEEL_CONTRACT.md` §A audit format (template below) — the one
   rule in the live code that, if fixed, would flip the complaint. If you honestly cannot find it
   yet, record what remains unknown and the next narrow check that could change the fix. A guessed
   cause is not an established one; a report of uncertainty does not fulfill an assigned repair.
3. **Write the bar** in player units the owner would recognise — screen depths, seconds, hull
   lengths, fraction of speed kept, times per minute. Not "improve responsiveness"; "a full 180°
   reversal takes ≤ 3 seconds at cruise". For a denial, cancellation or recovery complaint, a
   behavioral invariant may be the direct check. Select only affected metrics; counts cannot
   establish fun or visual/audio character. Inspect the rendered picture or hear the sound when
   that is the claim.
4. **Never answer with content.** "There aren't enough enemies" is a sign the fight is thin, not a
   spawn count. The translation names the rule and the number; it never names a new ship, mission,
   or feature.

## 2. The compact causal format

```text
Rule in the live code:   <file path> — <function / constant name>
What it does:            <the mechanism, one sentence, mechanically precise>
Effect on the fantasy:   <what the player feels because of it, in owner words>
Vision sentence broken:  "<quote the sentence from design/VISION.md this rule contradicts>"
Bar it should move:      <FEEL_CONTRACT §B bar id> — "<the bar's player-unit statement>"
Status:                  OPEN → <packet/leaf id, or "unassigned">
```

Use this format in the existing assignment when it clarifies the causal change; no standalone audit
or report artifact is required. A tuning bar names its player-unit number and relevant existing
scenario. A lifecycle claim names its falsifying invariant. Preserve hard contracts; do not replace
them with a conveniently weaker bar.

## 3. Owner says / Translator writes

The first five rows follow `FUN_CONVERGENCE_LOOP.md` §4. Rows marked **[NEW]** were derived from
`FEEL_CONTRACT.md` §B bars the original table did not cover (PQ-173.03, 2026-09-03). These are
example hypotheses, not current diagnoses: reconcile their named gaps against the live owner.

| Owner says | Translator writes |
|---|---|
| "it's like driving a bus" | B2 reversal time and turn radius at cruise; hypothesis in thrust vs speed vs screen |
| "shoving does nothing" | B4/B5 shove magnitude and displacement; hypothesis in impulse, clamp, or recovery |
| "my ship keeps getting knocked around" | B13 knock budget; hypothesis in contact bounds on the player hull |
| "it follows the line but it's slow and dumb" | B8 stroke speed; hypothesis in the corner rule |
| "it's not fun" with nothing else | Inspect one affected play sequence, select its largest causal gap, and directly check one improvement; use independent product critique when judgment is load-bearing |
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
- **Never claim a check observes what it does not.** Use the relevant existing fixture or route;
  if an essential readout is missing, build only the narrow capability needed for this claim.
  A focused number cannot establish an unobserved route or appearance. A missing generic bench
  does not require dropping a real defect or postponing its production repair.
- **Never ask the owner to choose between technical options.** "Should I fix the camera or the
  thrust curve?" is the translator failing. The owner says what is wrong in player words; the
  agent decides the mechanism and owns the risk.
- **Never rewrite the owner's verdict into something weaker.** "It sucks" stays "it sucks" in the
  record, then becomes a measured bar — not "polish requested".
- **Never substitute translation for the outcome.** Keep one causal hypothesis and its cheapest
  meaningful direct check in the existing work surface, then implement and repair material
  failures. New regression tests need recurrence/boundary risk; baseline checks need affected
  coverage. Review a coherent high-risk/cross-system/subjective slice once with a combined product/
  engineering critic, then recheck repaired boundaries rather than repeating full benches or audits.
