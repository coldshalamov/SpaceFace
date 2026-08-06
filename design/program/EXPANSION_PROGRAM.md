<!-- LIFETIME: DURABLE -->
# SpaceFace Expansion Program — operating guidelines for the long autonomous build

Goal: raise SpaceFace to A-list 2026 parity in **graphics, animation, VFX, variety and world density**,
and make the universe feel populated, purposeful and specific rather than sparse and repetitive.

This document is the standing brief. Read it fully before acting. It encodes what a previous graphics
lane proved by measurement, so the same weeks are not spent twice.

---

## 1. The single most important prior result

A previous lane ran **twelve controlled experiments** trying to raise the independent reviewer's score
on the primary scene. Every one held p95 at 16.80 ms. **Nine consecutive experiments returned exactly
2.25/5 with byte-identical per-axis scores.**

| # | attempt | layer | result |
|---|---|---|---|
| 1-2 | shader roughness breakup; albedo value zones | renderer | no change (n=5 each) |
| 3-5 | nebulaOpacity; rim x2; ambient x4 | renderer | none, or darker |
| 6 | chase zoom 72 -> 46 | renderer | **visibly much better**, score identical |
| 7 | envMapIntensity on solid roles | renderer | no change (kept — physically correct) |
| 8-10 | AO bake into 10 ORMs; per-role repaint; both + roughness re-target | asset | no change |
| 11-12 | authored deep-field ribbons; authored deep-field structures | asset | no change |

A control settles the interpretation: a **real EVE Online frame scored through the same harness gets
4s and 3.63 overall**. The grader discriminates between games, not between our variants.

> **Conclusion, treat as established: our frames sit solidly inside the "2" band and no single dial or
> single-asset change crosses it.** Do not spend days re-running single-lever tuning. Parity comes from
> ACCUMULATED authored detail, effect craft, scene population and art direction moving together.

**The most actionable observation in the whole program:** in the asteroid-field frame, the *asteroids
read as rock* — varied surface, believable light, real silhouette — while the *ship beside them reads
as flat plastic*. Same renderer, same lights, same frame. **The engine is not the limit. The rocks are
simply better authored than the ship.** Start there and treat it as the template for "good enough".

---

## 2. The production loop

Run this loop continuously. Each pass should end with something committed and measured.

1. **Research (grok).** Pull reference screenshots of 2020s space games, and Blender/three.js technique
   guides. Feed technique findings into the build step, not just the art step.
2. **Worldbuild (grok, separate thread).** Write encyclopedic, obsessive detail for the thing being
   built — who made it, why it looks worn where it's worn, what the markings mean, who crews it, what
   it does at 3am. Aim for a Wookieepedia-depth entry. Depth here is what produces variety later:
   two ships described in detail diverge naturally; two ships described vaguely converge into "same".
3. **Concept art (codex image gen).** Turn the description into concept art. This is the visual target.
4. **Build (Blender + code).** Model, texture, animate, or implement to match the concept.
5. **Adversarial review (codex, `gpt-5.6-sol`, max).** Compare against BOTH the concept art and the
   professional reference frames. Demand specifics, not vibes.
6. **Iterate** until the reviewer stops finding substantive faults, then commit and move on.

Keep the loop's artifacts: description -> concept -> asset -> review. That chain is the provenance and
makes any later regression debuggable.

---

## 3. What "more" actually means here

The game is sparse and repetitive. Fixing that is mostly **content architecture**, not shaders:

* **NPC behaviour.** NPCs should be visibly *doing jobs* — hauling, mining, surveying, patrolling,
  repairing, docking, scavenging, escorting, refuelling, arguing over a claim. An NPC with an errand
  reads as alive; an NPC holding station reads as a prop.
* **Professions and factions.** More roles, each with its own silhouette, loadout, paint, routine and
  reason to be where it is.
* **Encounters.** More event types, and events that interrupt each other. Variety comes from
  combinations, so prefer several small composable events over one big scripted one.
* **Object and structure types.** More classes of station, wreck, buoy, platform, habitat, rig.
* **Reactions.** Objects and NPCs should respond to the player and to each other — flinch, scatter,
  hail, flee, investigate, call for help.
* **Animation.** Moving parts, deploy/stow states, docking sequences, machinery that runs.

Every one of these multiplies with the others. Ten ship types x six professions x eight events is a
different game from three x one x two.

---

## 4. Consistency and story

The expanded universe must fit the existing one. Before authoring anything new, read the existing
design docs and the in-game copy for tone. Names, markings, factions and hardware should feel like they
came from the same world. When you invent, invent *downward* into detail that supports what exists —
not sideways into a different game.

Write the fiction down as you go. A thing with a written reason to exist gets built better than a thing
with a slot to fill.

---

## 5. Measurement discipline — traps that already cost real time

These are all real failures from the prior lane. Each cost hours.

* **Score a known-good subject through your own grader before trusting it.** The prior pass condition
  ("every axis >= 4") was *unreachable*: a genuine AAA frame failed it, because a cinematic screenshot
  has no HUD and scored 1 on `ui_integration`. Calibrate against measured reference performance.
* **Gate your reference set for scene-type validity.** 2 of 5 "deep-flight" references were
  in-atmosphere planet scenes. A vacuum frame cannot win a *background* comparison against a sky and a
  ground. `scripts/gfx-validate-references.mjs` does this; run it on every scene you score.
* **Never compare against a stale baseline.** An archived frame showed a fake 80.3% -> 73.0% win; a
  same-session baseline showed 73.4% -> 73.0% = noise. Re-capture the baseline in the same session.
* **Match resolution.** Captures default to 1262x648; archived rounds are 1920x1080. HUD occupies a
  different *fraction* of each, so frame statistics are not comparable across them. Pass
  `--width/--height` explicitly whenever a number will be quoted.
* **Pick metrics that cannot be gamed by a global offset.** "Dead black %" measured the black floor,
  not content — a flat +0.02 luma lift moves it 84% -> 0.2% while adding nothing. Prefer
  `structFrac` (fraction of 16x16 tiles with luma stdev > 0.01) in `scripts/gfx-frame-stats.mjs`.
* **Read tool reports; never trust `ok: true`.** A batch reported 20/20 success while 4 assets had
  silently matched no texture at all. Any transform must fail loudly when it wrote nothing.
* **Resolve textures from the MATERIAL GRAPH, not filenames.** Name-matching failed both ways: it
  counted normal maps as ORMs ("n-ORM-al" contains "orm") *and* missed real ones named
  `*_wear_mask_1k`. One asset reported stdev 0 when its true value was 0.2011.
* **Verify a claim about a function by reading it.** "The env map is a bake of the black scene" was
  wrong and produced a whole false causal chain — `createSpaceReflectionEnvironment` builds a studio
  rig with emissive cards at radiance 4.2/2.4/1.15.
* **Do not write a plausible lesson into the codebase before measuring it.** "Idle unfairly depresses
  vfx" was committed as a comment, then refuted: the motion frame scored *lower* (2.13 vs 2.25).

---

## 6. Performance is a hard gate

**p95 16.80 ms on the Intel iGPU target.** Every change the prior lane shipped held it. Measure with
`scripts/capture-gameplay.mjs --width 1920 --height 1080`, and quote p95, never a single frame.

Known, pre-existing, not yours to be alarmed by: combat shows a stochastic ~250 ms spike from a
non-preemptible `buildComposedShip` admission stall (it reproduces with all graphics changes reverted,
and correlates with low ship speed). `check-helios-sky-kit.mjs` fails on `cycle 10: core fog density`
independently of any change. Attribute before you fix — stash your change and re-run.

The user's standing rule: **no quality reduction to buy performance.** Find the waste instead. The
prior lane found two nebula layers being baked and sampled every frame (32.2 MB of texture) whose
shader contribution was multiplied by exactly zero.

---

## 7. Working safely alongside the other agent

A codex thread works this repo concurrently (`codex://threads/019fd2c0-a9f5-7c20-9a7f-2de49dbc5578`).
Collisions are rare for graphics work and cheap to fix, so this is a courtesy, not a blocker.

* `design/program/NOW.md` is the coordination board. Register a lease row before mutating shared paths;
  read it before starting something new. Claiming an exact-path lease is the documented mechanism — you
  do not need permission to claim one.
* Prefer `git stash` over `git checkout <file>` when temporarily reverting: `checkout` discards *all*
  uncommitted work in that file, which once silently destroyed a session's tuning.
* Untracked new files can be deleted by this environment. `git add -N` them immediately.
* To test an asset change without shipping it: write the candidate to gitignored `.devshots/`, copy it
  over the live file, capture, then restore with `git checkout` and verify the hash. Run that as a
  **background script with a `trap ... EXIT INT TERM` restore** — an inline attempt once timed out
  mid-swap and left a modified asset live.

---

## 8. Definition of done for any single item

1. It has a written fiction entry with real specificity.
2. It has concept art that matches that entry.
3. The built asset/effect/behaviour matches the concept art.
4. An adversarial reviewer compared it to professional references and stopped finding substantive
   faults.
5. p95 16.80 ms holds.
6. Tests and `check:contracts` pass; the fiction, concept and provenance are committed.

Breadth counts as much as polish. A hundred things at "clearly good" beats three at "perfect" for a
game whose actual problem is that it feels empty and same-y.
