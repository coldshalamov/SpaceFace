# Expansion continuation: restart and failure recovery

Current source pointer (25 October 2026, 04:38 UTC): read [SOURCE_HANDOFF_2026-10-25_RECORDER_BINDING.md](SOURCE_HANDOFF_2026-10-25_RECORDER_BINDING.md) and the compact [OPEN_GOALS.md](OPEN_GOALS.md). All twelve goals remain OPEN. Historical checkpoints and acceptance/reviewer fields remain preserved; verify current ownership and permissions before resuming. No merge, deployment or held-operation retry is authorized by this pointer.


This procedure was requested on 8 October 2026 after repeated status reports replaced
implementation. It supports the original expansion; it is not a new feature queue or
evidence of gameplay completion. Current task state belongs in `EXECUTION_STATUS.md`.

## Resume from observable state

1. Read the current source checkpoint in `EXECUTION_STATUS.md`, then inspect the real
   checkout with `git status --short`, `git branch --show-current`, and `git rev-parse HEAD`.
   Do not assume a previous machine's paths or dependencies survived.
2. Run `node scripts/check-continuation-readiness.mjs`. Its output is a timestamped local
   diagnostic, not remote-access proof or a permission grant. Address the particular failed
   probe. Materialize required public source and install locked dependencies through permitted
   tools; preserve existing work. Never bypass an access denial.
3. Continue the already-active unit and respect exact dirty paths. Otherwise take the next
   unfinished original unit from the current handoff. Reproduce, implement, test, review,
   commit, and publish it. Checking unrelated PR metadata is not an implementation attempt.
4. Follow the existing repository validation and pathspec rules. Do not weaken physics,
   AI, determinism, saves, or correct assertions just to finish a test. A fixture repair is
   not a gameplay repair; report that distinction.

## A failure has a scope

Record the operation, UTC observation time, exact result, and the step it prevents.
Keep these separate: public reads, checkout, dependencies, edits, tests, connector writes,
CLI authentication, remote commits, and deployment. A missing local file does not establish
that the public repository lacks it. A CLI login failure does not establish connector failure.

If a tool reports `automatic approval review was cancelled`, do not attribute that event to
the user without evidence. Check whether the operation actually started or completed, then
use supported retry/approval handling. Respect real denials and confirmation requirements;
do not turn a tool failure into a blanket authorization or a blanket prohibition.

When publishing is unavailable, continue independent authorized source work and preserve
coherent commits. Before publishing, verify current remote ancestry and reconcile newer
upstream changes. Verify the remote commit before claiming delivery. Do not merge or deploy.

## Leave one usable handoff

Update the short current section of `EXECUTION_STATUS.md`: active outcome and exact paths,
branch/commit, actual test result, publication state, any operation-specific failure, and
the next executable command. Preserve reviewer fields and original attempts. On restart,
verify those facts rather than treating yesterday's failure as today's diagnosis.

## What the 8 October diagnosis established

- Repeated continuation requests arrived, but execution repeatedly stopped after metadata
  checks and stale blocker reports. The prompts already requested implementation.
- At 21:11 UTC the local GitHub CLI had no saved login. That did not describe connector access.
- At 21:13 UTC connector branch creation and independent readback succeeded for
  `dot/expansion-continuation-2026-10-08` at `518c8d6fce7202f412d54995876c4ced0ddfd696`.
- At 21:16 UTC a shallow public clone and targeted source checkout succeeded. At 21:19 UTC
  the locked production dependency install succeeded and Rapier imported.
- Dependency execution encountered automated-review cancellations along the way. Their
  underlying service cause was not established; they were not evidence of user denial.

These observations disprove the blanket access blocker, not every possible tool failure.
This runbook and checker cannot force an assistant to follow them. Evaluate the correction
by subsequent tested changes and verified delivery, not by another promise or setup report.


## Current recovery boundary — 22 October 2026

Read the latest EXECUTION_STATUS.md checkpoint and PALLAS_LIGHT_CUT_EXPERIENCE_ADDENDUM_2026-10-22.md before resuming. The c9155b39 recovery commit preserves historical Pallas, mobile, upstream-overlay and residency artifacts, not an integrated runtime branch. Its public recovery README and hash-checking restoration scripts describe the exact separate bases. Never apply those snapshots blindly over current master or sum their test counts into a combined result.

Work only in the assistant's own environment; do not create or resume external Work/Codex execution threads. Preserve canonical dirty paths and held PR480 sector-register/asset operations. Re-read remote refs, reconstruct separately, reconcile newer work, register the explicit residency test and run the bounded permitted tests before sealing a combined candidate. Do not rerun the forbidden receiver test. Do not retry the twice-stalled large VFX blob. Small verified recovery/document writes do not clear that runtime-delivery gap.

Keep the current browser failure distinct from historical graphics failures. No failed startup, CPU render, simulated lifecycle call or Chromium job success proves personally piloted play or world visibility. Resume ordinary-play acceptance only with an actually functioning permitted browser. Preserve all ten open outcome markers until their original acceptance conditions are met.
