# DEMO-DETERMINISM-1-C — continue DEMO-DETERMINISM-1 (the previous run was cut off mid-task by a runner bug, now fixed)

**For:** the same kind of agent. Read `design/program/fleet/packets/DEMO-DETERMINISM-1.md` (the task and rules), then
the previous run's log and receipt: `.devshots/fleet/runs/DEMO-DETERMINISM-1.devin3.2026-11-24T01-45-15//run.log` and `.devshots/fleet/runs/DEMO-DETERMINISM-1.devin3.2026-11-24T01-45-15//RECEIPT.md` (if present). It was stopped
at 27.6 minutes while working; its uncommitted edits are still in the working tree (`git diff` the
files it names). Pick up exactly where it stopped: finish, measure, commit its/your work by exact
path (own-commit rules in the original packet), and write the final RECEIPT.md with `Result: DONE`
(or PARTIAL with what is left). Do not redo finished steps.

Note from the director: the previous run found that check:sim moved only because of an UNCOMMITTED
plain-words edit in `src/data/narrative.js` (the 47-A contract body: "Weigh the sample"; content-only,
zero motion diffs). That copy pass is intended. Commit that narrative.js hunk together with the
re-recorded golden (`test/47a.telemetry.save-v27.expected.json`, via the project's re-record command)
in ONE commit whose message says the golden moved for contract wording only. Then pin and remove the
bench's wall-clock dependency (rapierRuntimeBlocked backoff / setTimeout-bounded init in physics.js).
