# SpaceFace Production System

**Status:** DRAFT, live planning workspace
**Created:** 2026-07-10
**Roadmap authority:** `design/vision/ALPHA_PROGRAM.md`

This folder is the durable planning surface for turning the Alpha roadmap into an actual
professional production process. It exists because chat context, agent transcripts, self-scores,
and one-off goal prompts are not reliable long-term state.

These files do **not** replace the established authority chain. They refine milestone execution,
acceptance, orchestration, asset production, and gameplay evaluation beneath
`design/vision/ALPHA_PROGRAM.md`.

## Read order

1. `00_PRODUCTION_CONSTITUTION.md` — rules that prevent shallow completion and reward hacking.
2. `01_BUILD_PROGRAM.md` — milestone program aligned to the existing Alpha ledger.
3. `02_ORCHESTRATOR_SPEC.md` — how the orchestrator dispatches and continues terminal agents.
4. `03_ASSET_PRODUCTION_SPEC.md` — Blender/image/runtime asset production and acceptance.
5. `04_GAMEPLAY_OBSERVATORY.md` — temporal play evidence and quality detectors.
6. `05_AGENT_CAPABILITY_MATRIX.md` — model/tool roles and required bake-offs.
7. `06_RESEARCH_AND_IDEATION_PIPELINE.md` — multi-agent ideation and technique research.
8. `07_QUALITY_STANDARD.md` — the operational meaning of professional quality.
9. `08_IMPLEMENTATION_BACKLOG.md` — ordered packets that turn this suite into machinery.
10. `09_GENERATED_MEDIA_PIPELINE.md` — image/video generation, provenance, and ingestion.
11. `10_OBSERVATORY_HARD_GATES.md` — mechanically enforced pass/fail thresholds (anti-laziness).
12. `11_ENFORCEMENT_MACHINERY_SPEC.md` — implementation contracts for the tooling that binds the rules.
13. `DECISIONS.md` — append-only decisions, evidence, contradictions, and unresolved questions.

`templates/` contains compiled work, asset, technique, and review packet sources. `schemas/`
contains the machine-enforced states that workers, reviewers, assets, generated media, observatory
sessions, and the coverage ledger are allowed to return. `reviews/` is append-only rejection and
re-review history; the initial suite was explicitly rejected and hardened rather than self-approved.

## Working law

- The authoritative roadmap stays `design/vision/ALPHA_PROGRAM.md`.
- A worker produces a **candidate**. It never accepts its own work.
- No auto-approved terminal worker mutates the live dirty tree; SAFE-001 containment is a hard
  prerequisite for autonomous authoring.
- Progress means independently accepted player-facing coverage, not files, iterations, checks,
  transcripts, or self-assigned scores.
- Every material planning change updates this folder in the same pass. Conversation summaries are
  commentary; this folder is the durable record.
- Current live checks and working-tree evidence outrank prose.

## Current critical finding

The existing graphics process contains strong intentions but a compromised acceptance surface.
Several campaign scripts derive quality scores from iteration number, some required views are
excluded from pass decisions, exporter/finalizer paths can stamp claims or synthesize neutral maps,
and much of `revamp-evidence/` lacks the ledgers/renders required by its own ritual. Therefore:

> Existing visual outputs remain usable candidates, but none is accepted at the professional bar
> merely because it has 20 iterations, a high score, a green exporter, or a handoff marked DONE.

Independent reclassification is Milestone 0 work.
