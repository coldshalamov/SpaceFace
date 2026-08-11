# Inference Scale, Dispatch, and Nx Semantics

## 1. Why scale must mean accepted value

Without a common scale, “5x” can be misread as five files, five brainstorms, five recolors, five commits, or five times the abstraction. None guarantees more game.

In this system:

> **Nx means N independently reviewable production units accepted into a coherent portfolio.**

Each workflow defines what one unit means for that domain.

Examples:

- NPC workflow: one complete occupation/response package.
- Enemy workflow: one enemy combat-role package plus encounter proof.
- World-site workflow: one embodied destination operation.
- Weapon workflow: one mechanically distinct tool with multiple uses.
- Graphics workflow: one production asset family seed, not one mesh.
- Feel workflow: one resolved player-facing feel defect.

## 2. Universal scale contract

| Scale | Accepted units | Candidate pool | Review | Integration obligation |
|---|---:|---:|---|---|
| `1x` | 1 | at least 4 | one cold domain/player review | one ordinary-route proof and one learning note |
| `2x` | 2 | at least 7 | per-unit review | units must interact or contrast meaningfully |
| `3x` | 3 | at least 10 | per-unit + cohesion review | at least two subtypes; one shared route or family proof |
| `5x` | 5 | at least 16 | two review lenses + portfolio review | at least three subtypes; 5–10 minute route; propagation recipe |

The candidate pool may include existing content selected for re-authoring, not only new ideas.

## 3. A unit is accepted only when

1. It is reachable through the ordinary game route or is an explicitly source-only production unit with a named integration dependency.
2. Its player-facing outcome is observable without reading the implementation report.
3. It passes its domain-specific contract.
4. A cold reviewer issues `KEEP` after at least one review cycle.
5. It does not violate current owner, save, deterministic, accessibility, or performance contracts.
6. It improves at least three North Star vectors from `00_SPACEFACE_TEAM_MINDSET.md`.
7. It is not redundant with another accepted unit in the same tranche.

## 4. Invocation syntax

Use natural language with these fields:

```text
Execute [WORKFLOW ID / NAME] at [1x|2x|3x|5x].
Scope: [sector, system, family, route, or player loop].
Primary deficit: [what the player currently experiences].
Desired player outcome: [what should become possible or perceptible].
Protected seams: [known paths or systems not to alter].
Reference emphasis: [optional games/patterns].
Review: use [one|two] independent adversarial agents.
Implementation requirement: do not return only a plan; build through current owners and prove in ordinary play.
```

A compact invocation is also valid:

```text
WF-05 3x — Ceres physics arsenal; distinct push, cluster, and capture roles; normal-route combat proof.
```

The executing agent must expand the compact instruction using this system.

## 5. Scope sizing rules

### 1x

Use when:

- testing a new production recipe;
- repairing one weak mechanic;
- promoting one asset-family seed;
- adding one occupation or event chain;
- proving one destination operation.

The unit should be finishable without broad cross-owner rewrites.

### 3x

Use when:

- a mini-roster or family is needed;
- three units must interact;
- one activity pocket needs breadth;
- one workflow has already succeeded at 1x.

The three units should produce a recognizable local ecology, not three isolated novelties.

### 5x

Use when:

- producing a sector tranche;
- creating an arsenal/roster/asset portfolio;
- testing repeatable production at scale;
- enough foundational work is accepted to support integration.

Do not begin at 5x for an unproven base mechanic or art recipe.

## 6. Candidate accounting — slots, not sums

Candidates are still characterized 0–5 on: North Star alignment; player-visible
delta; systemic multiplication; distinctness; craft/spectacle potential;
feasibility within current owners; reusability after acceptance. **But the slate
is never selected by adding those numbers.** An additive total systematically
picks the candidate that is decent at everything and exceptional at nothing —
the fourth hauler variant beats the unforgettable thing forever.

Select by **slots**. At 3x/5x the slate must fill different kinds of value, and a
candidate wins a slot by being the best *at that slot's job*:

- **one systemic unit** — multiplies existing systems (the classic all-rounder);
- **one spectacle unit** — the only-SpaceFace physical moment; judge it by the
  trailer test: *would this clip show something no other space game shows?*
- **one texture unit** — quiet, funny, beautiful, dreadful, ordinary labor, or a
  single great landmark. **Texture units are exempt from the three-vector rule**
  (README): one vector moved well is enough when the value is atmosphere or
  identity. A world that is all legible industry has no awe in it.
- remaining slots: domain-appropriate (common high-frequency unit, rare
  discovery, identity/character/place unit…).

At 1x, state which slot the unit fills. Feasibility **breaks ties inside a slot**;
it never decides *between* slots. Cost and risk are recorded separately rather
than rewarded — a high-value high-risk candidate may be selected for a prototype;
a low-value cheap candidate must not win merely because it is easy.

## 7. Diversity requirements — against the tranche AND the corpus

At 3x and 5x, the portfolio must not consist of cosmetic siblings pretending to be gameplay breadth.

Examples:

- Five NPC craft recolors are not 5x NPC work.
- Five weapons with different damage and fire rate are not a 5x arsenal.
- Five station meshes opening the same screen are not five destinations.
- Five lore entries are not five narrative threads.
- Five particles with different colors are not five VFX families.

Each workflow defines subtype axes. At 5x, at least three axes must vary.

Mechanically: give every candidate a fingerprint over the axes
`verb, subject, sector, layer, tempo, domain` and check the slate with
`checkSlate` (scripts/lib/inferenceCore.mjs) — pairs must differ on at least two
axes, and a multi-domain scope at 3x+ must span at least two of its domains when
two or more units survive selection (`5x POLISH` returning five VFX tweaks is a
scope violation, enforced). One genuinely strong survivor remains a valid honest
underdelivery; the candidate pool still has to meet the requested Nx effort bar.

**Distinctness is judged against everything already shipped, not only this
tranche.** The board prints blocked fingerprints and the memory holds accepted
ones; a candidate that `sameIdea`-matches an accepted unit is multiplication
(route it to WF-16 deliberately), not novelty. Run 14's "new" occupation must be
compared against runs 1–13 — that comparison is exactly what the memory is for.

## 8. Parallel execution

Parallelize only when units do not compete for the same owner or creative dependency.

Safe pattern:

- one agent audits/candidates;
- one asset agent develops a selected family;
- one gameplay agent wires an already selected behavior;
- one cold reviewer waits for evidence.

Unsafe pattern:

- five agents independently redesigning `input.js`;
- multiple art agents inventing different faction languages;
- separate agents adding parallel traffic, event, or VFX frameworks;
- implementation and review performed by the same context without a cold pass.

At 5x, use a portfolio director to freeze shared language before parallel production.

## 9. Stop conditions

Stop, return a focused blocker, and preserve useful work when:

- the current owner seam cannot express the unit without a broad architecture change;
- a protected path is actively leased;
- the ordinary route cannot reach or observe the work;
- the base mechanic is too broken for content to reveal its value;
- two revisions fail for the same root defect;
- the requested unit duplicates accepted content;
- performance can pass only by lowering quality or density;
- the remaining candidates are filler.

## 10. Required final report

Every Nx execution returns:

```text
Requested scale:
Accepted scale:
Rejected/replaced candidates:
Units accepted:
Normal-route evidence:
Review verdicts:
Top revisions made:
Performance/save/accessibility status:
North Star vectors improved:
Reusable recipe learned:
Next recommended workflow invocation:
```
