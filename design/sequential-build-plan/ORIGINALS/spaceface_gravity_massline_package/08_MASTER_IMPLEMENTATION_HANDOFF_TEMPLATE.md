# Master Implementation Handoff Template

Use this wrapper with one selected feature brief. Replace bracketed fields. Do not ask an agent to implement the entire gravity package at once.

---

## Task

Implement **[FEATURE NAME]** in the SpaceFace repository.

## Product context

SpaceFace is becoming a top-down assisted-relational-physics sandbox. The player chooses targets, directions, risks, and timing; the computer supplies bounded precision needed to express those intentions through keyboard and trackpad controls.

The feature must strengthen at least one of these pillars:

- Physics traversal.
- Physics combat.
- Space crime/interception.
- Planetary/orbital operations.
- Industrial control of world infrastructure.

## Problem

[PASTE THE PROBLEM SECTION]

## Consequences of the problem

[PASTE THE CONSEQUENCE SECTION]

## Intended player fantasy

[PASTE WHY IT IS COOL]

## Proposed solution

[PASTE THE PROPOSED SOLUTION]

## Mandatory first step: current-repository audit

Before proposing code changes:

1. Inspect current `git status` and relevant diffs.
2. Read the current owner files and nearby `AGENTS.md` instructions.
3. Identify any existing implementation of this feature or adjacent mechanics.
4. Name the current single writers for physics, input, cargo, credits, factions, missions, and save state where relevant.
5. Identify current tests, feature flags, and browser probes.
6. State which earlier assumptions from this brief are stale or already implemented.

Do not create a parallel system when an owner or service already exists.

## Required planning output before editing

Return:

1. Current behavior and failure reproduction.
2. Ownership map.
3. Exact vertical slice.
4. Files to modify and files explicitly not to modify.
5. State and event contract.
6. Input contract.
7. Physics/math model.
8. Player-facing presentation.
9. Deterministic test plan.
10. Ordinary browser-route proof plan.
11. Performance budget.
12. Rollback/feature-flag plan.
13. Known risks and deferred work.

## Hard design laws

- Player supplies intent; computer supplies precision.
- Do not add button complexity when context can be inferred and previewed.
- Artistic physics is allowed, but the rules must remain consistent and visible.
- Physics outcomes route through the physics authority; no direct hidden velocity writes.
- Presentation consumes semantic state/events; render code does not author outcomes.
- No new credit, cargo, reputation, or mission owner.
- Preserve physics-earned velocity unless a named mechanic removes it.
- Player collision consequences may be asymmetric and forgiving.
- The feature must have at least two meaningful uses unless explicitly scoped as infrastructure.
- A feature is not complete until reachable and demonstrated in ordinary play.

## Acceptance requirements

[PASTE THE BRIEF ACCEPTANCE SECTION]

Additionally require:

- No console errors.
- Deterministic or boundedly invariant behavior under replay.
- Save/load behavior explicitly tested or explicitly declared transient and safely cleared.
- Reduced-motion/accessibility behavior.
- Measured performance evidence.
- Screenshot/video evidence from the actual game.

## Forbidden shortcuts

[PASTE THE BRIEF FORBIDDEN SHORTCUTS]

Also forbidden:

- State injection used as the only proof.
- A hidden feature flag left unreachable.
- A placeholder primitive claimed as final visual quality.
- Lowering unrelated quality or content density to pass performance.
- Editing expected golden output merely to make checks green.
- Broad rewrites outside the selected ownership seam.

## Completion report format

At completion report:

1. What changed in player-observable terms.
2. What existing systems were reused.
3. Files changed.
4. Tests run and results.
5. Browser route and evidence paths.
6. Performance measurements.
7. Remaining defects or uncertainty.
8. Feature flag/default status.
9. Commit hash if committed.
10. Why this implementation satisfies the intended fantasy rather than only the source-level contract.
