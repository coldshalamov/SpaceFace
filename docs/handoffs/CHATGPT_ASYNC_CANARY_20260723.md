# ChatGPT Async Delegation Canary — Historical Handoff

> **Classification:** non-authoritative historical handoff. This records a reusable delegation-packet shape; it does not reserve paths, report current completion, or modify program status.
>
> **Reference base:** remote `master` at `ea698805383a7aa7bcbf373b129b4a8dd041cb1b`. Re-read volatile surfaces before reuse, especially `NOW.md`.

## Canonical control surfaces

SpaceFace already has a control plane; an asynchronous worker must use it rather than inventing another plan, queue, status board, or receipt system.

- [Root agent orientation](../../AGENTS.md) owns repository-wide engineering invariants and task routing.
- [Canonical Build Map](../../CANONICAL_BUILD_MAP.md) is the program front door and names the existing control surfaces.
- [Docs agent notes](../AGENTS.md) classify `docs/handoffs/` as historical evidence, not completion authority.
- [Program agent notes](../../design/program/AGENTS.md) reserve whole-program status and promotion for the lead/integrator.
- [NOW](../../design/program/NOW.md) is the volatile lease/collision surface; never reuse its dated status claims without revalidation.
- [Program queue](../../design/program/roadmap/program-queue.json) owns cross-plan priority and dependencies.
- [Execution protocol](../../design/program/roadmap/00_EXECUTION_PROTOCOL.md) owns claim, proof, collision, receipt, and handoff rules.
- [Roadmap README](../../design/program/roadmap/README.md) owns stable packet identities.
- [Live acceptance matrix](../../design/program/03_LIVE_ACCEPTANCE_MATRIX.md), [verified outcomes](../../design/program/01_VERIFIED_DONE.md), and [remaining work](../../design/program/02_REMAINING_WORK.md) own acceptance/accounting truth.
- Hash-bound receipts belong under `design/program/roadmap/receipts/`; a worker returns evidence, while the integration owner updates global surfaces.

## Seven-field asynchronous packet template

```yaml
objective_non_goals:
  objective: "<one bounded player/system/document outcome>"
  non_goals: ["<explicit exclusions>", "<compatibility paths not to edit>"]

base_identity:
  repository: "coldshalamov/SpaceFace"
  base_commit: "<full 40-hex SHA>"
  requested_branch_or_worktree: "<exact identity>"
  target_branch: "<integration target; normally supplied by the lead>"

allowed_write_set:
  paths: ["<exact repository-relative paths>"]
  new_files: ["<subset, if any>"]
  forbidden_shared_paths: ["NOW/status/queue/receipts/generated/package/registry/etc. unless leased"]
  mutex_requests: ["<git-index|browser-gpu|registry|save-schema|input|...>"]

authority_entrypoints:
  required_reading: ["<root and nearest AGENTS.md>", "<packet authority>"]
  live_entrypoints: ["<default-route implementation seams>"]
  existing_patterns_and_checks: ["<specific files/commands; no broad archive sweep>"]

invariants:
  - "Preserve unrelated work; never manufacture a clean tree with reset/restore/clean/stash."
  - "Honor determinism, single-writer, default-route, compatibility, accessibility, and quality contracts."
  - "Do not expand scope or edit global status surfaces merely because a nearby defect is discovered."

validation_evidence:
  focused: ["<narrow command + exact result>"]
  risk_triggered: ["<determinism/save/launch/a11y/perf checks as applicable>"]
  public_route: {status: "<run|not-run>", artifacts: ["<commit-bound evidence>"]}
  report: {commands: "<with exit status/counts>", known_failures: ["<never erase reds>"]}

handoff_escalation:
  result_commit_or_diff: "<SHA or uncommitted-diff identity>"
  changed_files: ["<exact list>"]
  state_reached: "<IMPLEMENTED|FOCUSED_GREEN|ROUTE_ACCEPTED|INTEGRATED>"
  shared_change_requests: ["<specific integration-owner requests>"]
  unresolved_risks: ["<unknowns, drift, collisions, missing proof>"]
  escalate_when: ["scope/path budget changes", "authority changes product decision", "unidentified collision"]
```

## State boundaries

- **`IMPLEMENTED`**: a coherent code/content/document slice exists; no check, route, review, or integration claim follows automatically.
- **`FOCUSED_GREEN`**: named narrow checks pass against the exact receipt/result commit; this does not prove public reachability, visual quality, or integration.
- **`ROUTE_ACCEPTED`**: normal public input and current player-facing evidence pass for the exact build/route; this does not by itself place the work on the target branch or reconcile ledgers.
- **`INTEGRATED`**: the reviewed logical commit is on the active target branch and the required acceptance, receipt, queue, and status surfaces agree. Only the integration owner should promote this state.

These labels are evidence boundaries, not synonyms for “done.” Never infer a higher state from a lower one, and never import historical greens or worker confidence as current proof.

## Return contract

An asynchronous worker returns a candidate: exact base and result identities, exact changed-file list, complete validation record, evidence paths, known failures, shared-change requests, unresolved risks, and branch/worktree disposition. The reviewer or integration owner decides whether to accept, promote, or reject it.
