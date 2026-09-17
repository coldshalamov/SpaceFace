<!-- LIFETIME: STABLE -->
# INFERENCE convergence layer — ideas in, A-list game out

Parent contract: [`INFERENCE_LANES.md`](./INFERENCE_LANES.md) (execution law) and
[`INFERENCE_GOAL.txt`](./INFERENCE_GOAL.txt) (operator prompt). This file adds the
three things the parent assumes but never states: **how owner ideas enter**,
**which standards every expansion must satisfy**, and **how round-robin work
converges the whole game to maximum quality** instead of wandering.

The governing sentence still holds:

> Think until the idea would actually play. Build that whole thing. Prove only
> the claim. Then rotate to a different kind of value.

## 1. Owner idea intake

The owner speaks in ideas and directions ("pirates should ransom, not just
shoot", "make the belt feel worked"). An idea is **raw material**, not a spec
and not an order. The agent's job is to EXPAND it into something playable, then
run the normal loop.

Two doors, same protocol:

1. **Inline:** `INFERENCE 3 — <idea text>` or `INFERENCE IDEA: <idea text>`.
   The idea travels in the request; N defaults to 3 when an idea is present
   (one idea usually needs one built unit plus rotation).
2. **Inbox:** [`INFERENCE_IDEAS.md`](./INFERENCE_IDEAS.md). The owner drops
   one-liners; an agent claims exactly one line (claim protocol in that file),
   expands it, builds it, and marks it shipped. Several agents can be thrown
   at the inbox at once — one idea per agent, disjoint paths, no parallel
   implementations of the same line.

### EXPAND (runs once, before CONSIDER)

1. Restate the idea as a **player fantasy** in one sentence ("I talk the
   pirate down and pay with cargo instead of hull").
2. Name the **verbs, place, people, script beats, density, and consequence**
   the fantasy needs to actually play. If any is missing, invent it — that
   invention is the work.
3. Name the **live owners** that already do those jobs and the **standards**
   (§2) that constrain them.
4. If the idea is really three ideas, pick the one a stranger would remember
   and note the others as follow-ups, not extra units.

Then CONSIDER runs normally: two or three real alternatives *within the
idea's direction*, winner built whole. An idea never excuses a thin row —
"the owner asked for pirates" does not make one more pirate id a unit.

An idea that contradicts the standards (§2) or the vision is reshaped, not
obeyed literally: keep the fantasy, change the mechanism, say so in one line.

## 2. Standards basis (non-negotiable)

Every INFERENCE unit, new or polish, satisfies these. They are the floor the
owner's directions stand on — an expansion that violates one is not done:

- **Vision:** `design/VISION.md` — physical agency inside a living local
  world; complex-looking outcomes from simple trustworthy rules.
- **Architecture:** `ARCHITECTURE.md` — flat state, event bus, system
  registry; sim independent of Three.js on the XZ plane; `state.rng` /
  `state.simTime`, never ambient randomness or wall time in sim.
- **Craft floors:** `build_map.md` §1.3 — numbers in player units, live
  owner + measurement (never a capture campaign), consequences, no drag /
  no momentum clamps / no NPC gyros, never edit a test or golden to pass,
  fixed seeds, one architecture, default route only.
- **Single writers:** economy→credits, factions→reputation/sector ownership,
  cargo→cargo, ships→derived stats, heat→WANTED heat. Extend owners; never
  a second system.
- **Feel:** `design/FEEL_CONTRACT.md` for anything the hands touch. Feel
  guts go through the Fun Loop, not around it.
- **Visual craft:** `docs/visual-assets/README.md`, the production and VFX
  technique standards. No camera-facing soft square as a designed object;
  no presentation of emptiness (WF-11/12/13 only once something plays).
- **Performance:** structural work (batching, cadence, culling, residency),
  never quality cuts or emptied skies to pass.
- **Accessibility:** input reachability, reduced-motion/flash behavior,
  legibility, contrast preserved.

The SHIP report (§10 ledger in the parent) gains one line: `STANDARDS` —
which basis items the unit touched and how it honored them (one line total,
not a compliance essay).

## 3. The A-list bar (what "maximum quality" means per unit)

A unit converges only if each unit is itself finished. Before SHIP, the unit
must clear all eight:

1. **Complete** — the workflow's "One production unit" list, filled with
   play. Place + people + script + density for activities; the equivalent
   depth for other domains.
2. **Dense** — enough participants / beats / branches to go wrong. One
   thing once is content, not a feature.
3. **Readable** — a stranger understands cause, motion, and why at the
   shipping camera, HUD-hidden, in motion.
4. **Consequential** — routed through current owners (cargo, heat, ledger,
   wreck, price, reputation). Nothing evaporates.
5. **Wired** — reachable on the default route, no flag/URL/debug key; the
   listener, bind, or spawn inspected, not assumed.
6. **Measured** — a number in player units on a fixed seed, before/after
   when the unit changes existing behavior.
7. **Bounded** — entity, query, allocation, draw, texture, and save growth
   declared and within the perf budget; no unbounded scans or journals.
8. **Kind** — reduced-motion/flash, input reachability, and legibility
   intact; new UI text localizable (no hardcoded taste rules).

Depth and breadth are different motions and both are required:

- **Depth** = one verb, place, or system made fully real (complete +
  dense + consequential). One deep unit beats five shallow rows.
- **Breadth** = rotation carrying depth to every domain over successive
  batches, so no area stays prototype while another gets hero passes.

## 4. Round-robin polish loop

INFERENCE alternates **new** units with **polish** units. A polish unit
reviews existing shipped work against the §3 bar and iterates it to the bar.
This is how the game converges instead of sprawling.

Rules:

1. **Ratio.** Every unscoped batch of 3+ contains at least one polish unit
   (review + improve), unless the owner explicitly scoped new content.
   Scoped batches (`INFERENCE 3 MISSIONS`) may be all-new but still rotate
   kinds inside the domain.
2. **Target.** The polish target is the weakest shipped thing the agent
   actually saw: the lowest §3 score on a surface the ordinary route hits.
   Honest inputs, in order: looking at play; the quality scorecard's
   weakest fresh cell (`docs/agentic-development/QUALITY_SCORECARD.md`);
   the detector's starved list (optional hint, same as ever). Never polish
   by registry count alone.
3. **Review inside the unit.** State the deficit in player words, grade the
   eight §3 checks pass/fail, then fix what fails. The review lives in the
   unit's SHIP report (CONSIDERED + grades), not a separate review file.
   Deletion and simplification are valid polish outcomes (WF-18).
4. **Lineage.** Record polish with `--verdict rebuilt` when it reworks a
   recorded unit, else `implemented` with reason prefix `polish:`. The
   fingerprint keeps the same subject so resurrection checks see the line.
5. **Rotation still applies.** A polish unit is a different kind of value
   from its neighbors (same §3.4 fingerprint rule). Do not polish the same
   subject twice in one batch.

## 5. Robustness rules

1. **One claim each.** One agent, one idea or weakness, one NOW row with
   exact paths. Research and looking reserve nothing.
2. **Collisions split, never block.** If the idea's paths collide with a
   live hunk, build the disjoint part or take the next idea/weakness. Never
   revert a foreign hunk; never start a parallel implementation of a live
   row's unit.
3. **Thin is rejected at every stage.** If CONSIDER cannot name place,
   people, script, and density (or the domain equivalent), the idea is not
   ready — pick a smaller complete slice, not a thin whole.
4. **Iterate inside the unit.** The first green draft is a draft. Play it,
   judge it against §3, fix what you would not ship. Ship the second or
   third attempt.
5. **Record discipline.** `inference-record run` once per batch;
   `inference-record unit` after every unit commit (new or polish). Never
   hand-edit `inference-memory.json`. Memory conflicts: re-read, re-run,
   never discard another unit's entries.
6. **Teammate look for N ≥ 3.** Before the batch report, one different
   agent (or a fresh pass) looks at the actual work for unfinished, buggy,
   and cheap. Fix what is real. No review JSON, no stored stills.
7. **No second queue.** The ideas inbox is raw material, capped at 20 open
   lines. It admits nothing, prioritizes nothing, and never replaces the
   program queue or the look-then-rotate loop. Stale lines (>60 days,
   untouched) are deleted, not carried.

## 6. Convergence tracking (how we know it is working)

- **Within a batch:** N complete units, kinds rotated, at least one polish
  (rule §4.1), every unit clearing §3, ledger reported.
- **Across batches:** `inference-memory.json` shows all WF domains touched
  within their staleness window (unmeasured domains surface via starved
  scheduling, never via counts); `rebuilt` verdicts accumulate on the
  weakest subjects; failed-twice patterns stop recurring.
- **Game-level:** the scorecard's red cells shrink and the weakest fresh
  cell rises. Convergence means manager cycles increasingly select smaller,
  less severe work while the representative route matrix stays green —
  not "no open tasks".

When the loop is healthy, any batch — owner ideas, bare look-and-rotate, or
a mix — leaves the game strictly closer to the A-list bar on every axis it
touched. That is the guarantee this layer exists to give.
