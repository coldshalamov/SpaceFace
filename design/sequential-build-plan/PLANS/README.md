# SpaceFace Sequential Agent Prompt System

> **2026-07-24 user override:** SF-07 is rejected and must not be dispatched. Preserve G
> auto-target/draw-to-fly. Never restore MMB pursuit selection, target-relative station keeping,
> pursuit impulses/UI, or the reviewer-derived T19 proposal. The machine sequence and SF-07
> tombstone carry the same prohibition.

This package converts the supplied SpaceFace planning conversation and three design packages into **36 sequential, self-contained implementation prompts**. Each prompt is sized as one coherent engineering checkpoint: large enough to produce visible progress, bounded enough for one strong agent to audit, implement, verify, and hand to review.

The sequence is not a blind waterfall. SpaceFace is a live repository. Prompt `SF-00` first reconciles current code, branches, plans, checks, routes, and evidence. Every later prompt repeats the live-repository rule and may conclude `ALREADY_SATISFIED`, `BLOCKED`, or `NEEDS_RESCOPE` rather than rebuilding obsolete work.

## Start here

1. Place this folder in a controller-owned location associated with the SpaceFace repository. It can be tracked or untracked; do not place it inside a path governed by another agent’s active lease.
2. Give the agent the entire folder but paste **only the next file from `plans/`** into a fresh thread.
3. Begin with `plans/SF-00_HARD_Live_Repository_Truth_Reconciliation_and_Sequence_Bootstrap.md`.
4. The agent reads dependency receipts, audits the live repo, performs the bounded implementation, writes `receipts/SF-XX.yaml`, updates the prompt completion record, and moves the prompt to `review/`.
5. A reviewer uses `review/REVIEWER_PROMPT.md`. Only after review/integration should the controller advance.
6. Global program status remains owned by the SpaceFace lead/integrator. Feature agents do not casually edit `design/program/NOW.md`, the shared index, or global completion claims.

## Model routing

The title and frontmatter of every prompt identify four separate dimensions:

- `difficulty`: reasoning and repository risk.
- `discipline`: program, systems, world, full-stack, or frontend.
- `frontend_difficulty`: how much UI, Three.js, VFX, asset, camera, or player-camera judgment is involved.
- `vision_requirement`: whether a no-vision agent may complete the task or whether visual acceptance needs a strong vision-capable frontend agent.

A backend/no-vision coding agent such as the user’s Codex/GLM-style lane is appropriate for `VISION-NO` and most pure-kernel portions of `VISION-OPTIONAL` tasks. `VISION-RECOMMENDED` tasks can be implemented structurally by a no-vision agent, but should be reviewed in the actual browser/Electron camera by a vision-capable agent. `VISION-YES` tasks should be assigned to a strong frontend/3D/game-feel agent such as the user’s Fable-style lane, or split so a systems agent owns the kernel and the vision agent owns presentation and visual acceptance.

Do not spend a visual agent on a pure deterministic kernel. Do not let a no-vision agent sign off a station, planet, VFX, HUD, camera, asset family, sector composition, or store-capture task by reading source code.

## What each prompt contains

Every prompt includes:

- YAML routing metadata and stable dependencies.
- XML-tagged role, context, pseudo-skills, mission, scope, implementation direction, acceptance, failure modes, verification, and receipt contract.
- A dated but explicitly non-authoritative live-repo snapshot.
- The SpaceFace authority chain, shared-tree safety, single-writer rules, determinism, browser/Electron parity, save, accessibility, and evidence requirements.
- The causal problem, why the feature is valuable, and the exact player-observable checkpoint.
- Anti-placeholder rules aimed at the recurring failure modes: central circles, generic spheres, labels as behavior, UI-only rewards, hidden autopilot, direct velocity writes, primitive-plus-bloom VFX, and debug-only routes.
- A completion checklist and file-movement protocol.

## Directory layout

```text
SpaceFace_Sequential_Agent_Prompt_System/
├── README.md
├── SEQUENCE_MATRIX.md
├── DEPENDENCY_GRAPH.md
├── WORKFLOW_AND_REVIEW_PROTOCOL.md
├── LIVE_REPO_SNAPSHOT.md
├── MODEL_ROUTING_SUMMARY.md
├── SOURCE_MATERIAL_MAP.md
├── MANIFEST.md
├── plans/                 # Paste exactly one next prompt into a fresh implementation thread
├── review/                # Completed prompt moves here; reviewer prompt and template live here
├── receipts/              # One machine-readable YAML receipt per task
├── machine/               # Sequence JSON and receipt schema
└── reference/             # Supplied planning source material, copied for context
```

## The dependency spine

The sequence deliberately follows this shape:

1. Reconcile live truth and establish a combined baseline.
2. Build a deterministic physics/control laboratory.
3. Make Massline acquisition and controls trustworthy.
4. Prove orbit, release, and one sling course.
5. Repair or retire the flailing trackpad dogfight mode.
6. Establish truthful collision/docking and physical combat response.
7. Add a small gravity/field and physics-weapon vocabulary.
8. Prove a planet, world jobs, and a physical cargo/heist loop.
9. Establish components, contextual operations, payloads, receivers, and a reusable World Site runtime.
10. Build the Wreck Cathedral and recompose one sector.
11. Exteriorize Asteroid Ops and transform one industrial claim.
12. Manufacture permanent physics/travel infrastructure.
13. Add specialized Masslines only after the base maneuver is proven.
14. Consolidate story, visual families, HUD/VFX/camera, the gold corridor, endings, and release.

This alternates foundations with visible payoff. It avoids a year of invisible architecture while also preventing agents from producing another hundred beautifully named spheres.

## Status vocabulary

- `IMPLEMENTED`: code/data exists in the current tree.
- `FOCUSED_GREEN`: declared focused checks pass.
- `ROUTE_ACCEPTED`: ordinary player inputs prove the outcome on the current revision.
- `VISUALLY_ACCEPTED`: current game-camera media has passed independent visual review.
- `INTEGRATED`: the result is recoverable on the intended branch/revision with required evidence.
- `ALREADY_SATISFIED`: current code already meets the prompt; the agent proved it instead of inventing work.
- `BLOCKED`: an exact dependency, authority, tool, or shared-path conflict prevents honest completion.

No agent may compress these states into “done.”

## A note on scope

The later prompts are ambitious, but each is a vertical slice, not a demand to populate the entire galaxy. The Wreck Cathedral prompt builds one wreck. The sector prompt recomposes one sector. The planet prompt proves one planet. The visual-family prompt produces one representative wave. Breadth comes only after the reusable primitive and ordinary player route have survived review.
