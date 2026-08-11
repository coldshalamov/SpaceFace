# The Creative Convergence Loop

This is the shared mental process behind every domain workflow. It approximates how a strong creative developer, designer, artist, or director thinks when asked to expand a game—then adds explicit review so model output cannot stop at the first defensible result.

## Phase 0 — establish player-facing truth

Before ideation, inspect the current game.

Record:

- what the player sees;
- what the player does;
- what repeats;
- what is absent;
- what is confusing;
- what is attractive or memorable;
- what exists only in code, labels, radar, menus, or distant simulation;
- what current systems are already strong enough to reuse.

Capture the ordinary route. Do not begin from plan prose and assume its claims are true.

Deliverable: a one-page **Current Experience Diagnosis** containing no proposed solutions yet.

## Phase 1 — reconstruct the intended experience

Use the GDD, active packet, selected workflow, and current user direction.

Write:

- the fantasy in one sentence;
- the 30-second player loop;
- the 5-minute loop;
- the session-level purpose;
- the intended visual/emotional character;
- the relevant North Star vectors;
- what must remain simple.

Deliverable: a **Target Experience Contract** written in player language.

## Phase 2 — inventory the design space

Map the existing vocabulary.

### Nouns

Ships, roles, factions, cargo, asteroids, stations, planets, wrecks, sites, weapons, modules, commodities, hazards, routes, events, story evidence.

### Verbs

Thrust, turn, boost, attach, reel, pay out, release, fire, push, pull, scan, mine, cut, repair, transfer, steal, escort, tow, build, activate, disable, salvage.

### States

Working, idle, damaged, disabled, overloaded, abandoned, under construction, hostile, inspected, wanted, stripped, repaired, player-owned.

### Relations

Produces, carries, protects, hunts, services, inspects, steals, supplies, responds to, competes with, remembers.

The creative opportunity often lies in a missing relation or state, not a missing noun.

Deliverable: a **Vocabulary and Negative-Space Matrix**.

## Phase 3 — extract mechanisms from reference games

Choose two to four references whose mechanisms address the deficit.

For each reference, record:

- what player experience it produces;
- the underlying production or design mechanism;
- what is specific to that game and must not be copied;
- how the mechanism could operate through existing SpaceFace verbs and owners.

Example:

```text
Reference: Outer Wilds
Experience: curiosity pulls the player without mission assignment.
Mechanism: visible anomalies + incomplete information + knowledge that unlocks routes.
Do not copy: time loop, Nomai aesthetics, dialogue structure.
SpaceFace transfer: unusual traffic/wreck/field behavior creates a physical lead; scanner and ledger preserve what was learned.
```

Deliverable: a **Mechanism Transfer Sheet**.

## Phase 4 — divergent ideation through INDEPENDENT passes

One context generating the whole pool sequentially converges on its first frame:
every later candidate is an echo of the first. LLM ideation also homogenizes —
separate agents that read the same examples first produce the same pool
(see RESEARCH_SOURCES.md: creative-homogeneity findings). Structure divergence
against both failure modes:

**Rule zero — printed examples are SPENT.** Every example in these docs (the
miner→hauler→tender chain, the Ceres refinery cast, the swarmer/controller/
anchor roster, the Helios civic-traffic list, every example invocation) is a
tombstone: it exists to show *shape* and is permanently used up as *content*.
Submitting one as a candidate is a rule violation, not a shortcut. The live
pocket cast shipping 1:1 with the docs' example list is the observed failure
this rule exists to stop.

**Independent passes** (separate subagent contexts where tools permit; at
minimum, separated generations that do not read each other before the merge):

1. **Repo-native pass** — reads ONLY SpaceFace: VISION, current systems, current
   data, current fiction. Never reads the reference library. Asks: what do the
   systems already here make possible that nothing exploits?
2. **Player-fantasy pass** — starts from an anecdote worth retelling ("holy
   shit, I did that" / "oh fuck, I did that") and works backward to the unit.
3. **World-logic pass** — starts from the economy/faction/industrial fiction:
   who needs this to exist, and who responds?
4. **Reference-mechanism pass** — the ONLY pass that reads
   `03_REFERENCE_GAME_PATTERN_LIBRARY.md`; transfers mechanisms, never surfaces,
   and rotates away from references the board flags as overused.
5. **Contrarian/wildcard pass** (optional at 3x+) — argues with the emerging
   consensus: what is everyone else's pool missing or wrong about?

At least one accepted candidate per slate must come from the repo-native pass —
justified entirely from SpaceFace's own systems and fiction, traceable to no
reference game.

Within each pass, still force spread across: ordinary/common; risky/criminal;
emergency/failure; rare/mysterious; player-built/transformed.

Do not evaluate while generating. Weak ideas are allowed during divergence.

Deliverable: a **Candidate Pool** with at least the scale minimum, each candidate
tagged with its originating pass and a fingerprint
(`verb, subject, sector, layer, tempo, domain`).

## Phase 4b — opportunity search (mandatory at 3x+, recommended always)

Deficit-repair is not the only door. Before selection, run one explicit pass that
ignores every detected gap and asks:

- What existing SpaceFace system creates an unexploited possibility?
- What would be funny, beautiful, dangerous, surprising, socially revealing, or
  trailer-worthy even though no defect asks for it?
- What can only this game — top-down physics, Massline, working universe — do?

Every substantial run considers both repair candidates and opportunity
candidates. The director board's OPPORTUNITY cell exists so this pass has a
recorded outlet; a run that picks it records `--mode opportunity`.

## Phase 5 — synthesis and combination

The strongest candidates often combine existing systems.

Create a matrix of candidates versus current systems. Favor candidates that create several meaningful intersections without requiring several new frameworks.

Examples:

- miner + cargo transfer + pirate opportunity + repair response + aftermath;
- planet + Massline + atmosphere + collector + pursuit;
- concussion weapon + light enemy + solid asteroid + cargo objective;
- wreck + salvor + black box + law dispute + player claim.

Ask:

> If this unit were removed, how many other systems would become less interesting?

Deliverable: a **System Multiplication Map**.

## Phase 6 — selection and portfolio shaping

Score candidates using `01_SCALE_AND_DISPATCH.md`.

Then perform a qualitative portfolio review:

- Are the selected units genuinely different?
- Do they reinforce one location or loop?
- Is one foundational unit required before the others?
- Is the portfolio visually and mechanically varied?
- Does it contain ordinary life as well as spectacle?
- Is there at least one player opportunity per unit?
- Is the selection biased toward easy, low-value work?

Select N primary candidates plus replacements.

Deliverable: an **Accepted Production Slate** with explicit reasons and cut candidates.

## Phase 7 — implementation through current owners

For each unit:

1. identify current state owner and presentation owner;
2. characterize baseline behavior;
3. define the smallest new seam if needed;
4. implement the complete player-visible path;
5. attach visuals/audio/UI to semantic events and physical truth;
6. preserve save/determinism/performance;
7. prove the normal route.

Do not spread partial implementation across all units before any one works. Complete the highest-dependency unit first.

Deliverable: one **Production Unit Record** per unit.

## Phase 8 — cold adversarial review

The reviewer receives:

- Target Experience Contract;
- baseline footage/screenshots;
- current ordinary-route footage/screenshots;
- controls and intended use;
- no self-score and no implementation hardship narrative.

The reviewer issues:

- `KEEP`;
- `REVISE`;
- `REBUILD`;
- `CUT`.

It identifies the three most important player-facing defects, not a laundry list.

Deliverable: an **Adversarial Review Record**.

## Phase 9 — revision, replacement, or removal

Fix the largest causal defect first.

Examples:

- role unreadable → rework silhouette before adding lights;
- mechanic unpleasant → simplify control law before adding VFX;
- event invisible → move participants/routes before writing more events;
- sector cluttered → remove props before optimizing them;
- weapon redundant → change its physical role or cut it;
- narrative inert → add physical consequence rather than more prose.

If two serious revisions leave the same root defect, replace or cut the candidate.

Deliverable: updated unit and causal re-review.

## Phase 10 — portfolio integration

For 3x/5x:

- run units together;
- observe competition for attention, performance, space, and systems;
- remove redundancy;
- tune cadence and hierarchy;
- verify that units create a coherent local ecology or arsenal;
- capture a 5–10 minute route.

Deliverable: **Portfolio Review Record**.

## Phase 11 — learning capture

Record:

- what pattern succeeded;
- what failed and why;
- which existing systems made production cheap;
- what new seam proved reusable;
- which values, dimensions, or presentation rules should be reused;
- what should never be auto-generalized;
- the next best Nx invocation.

This is how later inference converges faster instead of rediscovering the same problems.
