# SpaceFace Production System

> **Manual campaign system — not automatic repository policy.** This folder applies only when the
> user or lead explicitly activates a named production campaign or packet. Ordinary feature/fix
> work follows the scoped `AGENTS.md`, architecture, activated product plan, and live checks; it
> should implement a coherent result across every required integration seam. Campaign roles,
> submission states, dispatch quotas, and writable-path lanes do not constrain ordinary work.

**Status:** DRAFT, live planning workspace
**Roadmap authority:** `design/vision/ALPHA_PROGRAM.md`

**Unified live status:** `design/program/README.md`. This production folder defines process and
acceptance contracts; it no longer duplicates the current Alpha + Depth done/remaining roll-up.

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
11. `10_OBSERVATORY_HARD_GATES.md` — normative pass/fail thresholds to be implemented by OBS-003.
12. `11_ENFORCEMENT_MACHINERY_SPEC.md` — implementation contracts for the tooling that binds the rules.
13. `DECISIONS.md` — append-only decisions, evidence, contradictions, and unresolved questions.

`templates/` contains compiled work, asset, technique, and review packet sources. `schemas/`
contains the machine-enforced states that workers, reviewers, assets, generated media, observatory
sessions, and the coverage ledger are allowed to return. `reviews/` is append-only rejection and
re-review history; the initial suite was explicitly rejected and hardened rather than self-approved.

## Working law (inside an explicitly activated campaign only)

- The authoritative roadmap stays `design/vision/ALPHA_PROGRAM.md`.
- A worker produces a **candidate**. It never accepts its own work.
- SAFE-001 is controller-waived and frozen for this campaign at 88/88 fixtures; remaining review
  findings are tracked P2 control-plane debt. No further SAFE review or repair cycle is scheduled.
  External workers still do not self-integrate, but the controller may continue read-only work,
  exclusive Blender work, and targeted supervised integration/commits under live ownership.
- Progress means independently accepted player-facing coverage, not files, iterations, checks,
  transcripts, or self-assigned scores.
- Every material planning change updates this folder in the same pass. Conversation summaries are
  commentary; this folder is the durable record.
- Current live checks and working-tree evidence outrank prose.

## Status routing

Do not preserve campaign state in this README. Current whole-program completion and pickup live in
`design/program/`; packet state belongs to the activated packet/controller. `08_IMPLEMENTATION_BACKLOG.md`,
`DECISIONS.md`, and `reviews/` retain machinery proposals and historical evidence, not a second current
status surface. Visual outputs require current player-route evidence and independent judgment; iteration
counts, self-scores, file existence, and author-written completion claims do not establish acceptance.
