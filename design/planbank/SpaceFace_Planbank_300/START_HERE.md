# SpaceFace — 300 preconsidered development plans

**Purpose:** let a strong model decide the creative mechanism, a less-capable agent implement a bounded change, and a stronger reviewer evaluate the resulting game rather than brainstorm the same idea again.

**Contents:** 300 individually authored proposal packets across 20 domains; 20 domain implementation guides; eight deeper specifications for high-risk starting work; a source-backed audit; suggested batches; executor, integrator and reviewer prompts; and read-only brief/validation tools. These are plans, not 300 implemented features, 300 confirmed bugs, or a new task dispatcher.

**Planning baseline:** `coldshalamov/SpaceFace`, `c92756afb46a9115d47e9d1757369678023efce4`. The source commit is September 27, 2026 in America/New_York (September 28 UTC). The repository can change after this snapshot; its current code and owner direction win.

## Start with one outcome, not the whole bank

Read [the audit](REPO_AUDIT.md), then choose one of [the first batches](FIRST_BATCHES.md). Admit the selected packet through the existing INFERENCE catalog or named-task workflow. Give the executor only that packet, its domain guide and the [execution contract](EXECUTION_CONTRACT.md). The compiler below assembles that bounded brief. Do not ask a weak agent to choose among all 300 or redesign the chosen mechanism.

```sh
python tools/compile_brief.py SF-136 --output brief-SF-136.md
```

This reads the pack and writes the requested brief. It does not modify the repository, claim work, dispatch agents, run tests, create tasks, or call a model. Paths are resolved relative to the pack, so the command also works from another directory when the script path is supplied.

For a current checkout, inspect drift before execution:

```sh
python tools/check_source_drift.py --repo /path/to/SpaceFace --task SF-136
```

On Windows, supply the real checkout path, for example `--repo "C:\Projects\SpaceFace"`. A drift report is a request to reconcile current code, not a reason to reset files to this snapshot. A missing file may have moved; omitted media in the source packet is not evidence that the repository lacks it.

## Where to look

| Need | Document |
|---|---|
| Browse all 300 concrete plans | [Index](INDEX.md) |
| Start with a small high-value selection | [First batches](FIRST_BATCHES.md) |
| Understand what is observed, reported or proposed | [Repository audit](REPO_AUDIT.md) and [provenance](SOURCE_PROVENANCE.md) |
| Hand a bounded job to a weaker agent | [Executor prompt](prompts/EXECUTOR.md) and the brief compiler |
| Allocate expensive reasoning | [Model routing](MODEL_ROUTING.md) |
| Review implementation in batches | [Review rubric](REVIEW_RUBRIC.md) and [strong review prompt](prompts/STRONG_BATCH_REVIEW.md) |
| Avoid collisions and parallel implementations | [Execution contract](EXECUTION_CONTRACT.md) and [overlap map](OVERLAP_MAP.md) |
| Verify this archive | [Validation report](VALIDATION_REPORT.md) and `tools/validate_pack.py` |

## What has already been decided inside each packet

Each packet chooses a player-visible outcome, explains why two plausible alternatives lose, identifies verified existing source paths and navigation symbols, gives an implementation sequence, names ownership constraints, specifies scenario/counterexample/lifecycle cases, points at existing tests and states how completion can be claimed. The eight deep dives resolve additional state, accounting or async-boundary choices where a short packet would still leave a weak implementer too much to invent.

A packet may still need strong **cause adjudication** when a historical defect has not been reproduced or an architectural seam has changed. That is intentionally distinct from asking the weaker agent to brainstorm a new feature. It would be misleading to turn an unknown root cause into a confidently prescriptive patch.

## Suggested operating rhythm

Select one bounded outcome and check it against current play. Let the executor finish it through the live owners, including tests and the smallest necessary functional presentation. After three to five compatible completed outcomes, have the stronger reviewer inspect their diffs and the actual player route together. Fix the biggest integration failure before expanding the batch. High-risk save, shader, accounting and ownership decisions receive strong review at the seam before broad edits, not only after a large bad implementation.

Batch size is a proposed operating heuristic, not measured model economics. Use smaller batches when edits collide or results are difficult to observe. Do not accumulate ten incomplete implementations awaiting a review ceremony.

## Boundaries that matter

The existing build map remains the program front door. ORRERY remains the interface's design authority; task-needed functional edits are allowed, a parallel redesign is not. Simulation remains deterministic and single-owner; authored visuals remain the quality baseline. Release/store/trailer/certification work is not smuggled into this development bank. The ecology proposals are a separately selectable expansion, not prerequisites for fixing the current game.

This source-only assessment did not play the full game, render its omitted art, listen to its full mix or measure its live frame pacing. Two focused suites passed 12 tests; a separate selection-sigil functional suite could not load because `three` was unavailable, while the file's syntax check passed. See [provenance](SOURCE_PROVENANCE.md) for exact scope.
