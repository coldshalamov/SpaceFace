# CAM-REVIEW-HEARTBEAT-1 — adversarial review of the heartbeat transport repair

READ-ONLY review packet. Do not edit source, tests, docs, generated files, or git state. You may write only your receipt in this run directory.

## Context

The controller is repairing the player's worst backend symptom: the interface and fps can keep updating while ships/rocks freeze and then catch up in jumps. The architecture audit found that ordinary poses are latest-wins through the pose table, but the worker heartbeat hold can treat a busy worker event loop as a dead main thread and discard world time.

The uncommitted working tree now contains a focused repair in:

- `src/core/simLaneMain.js`
- `src/core/wholeSimBrowserWorker.js`
- `test/worker-delayed-consumer.test.mjs`
- `scripts/fleet/run.mjs` (fleet routing only; review only if it affects the launch)

The intended semantic is:

1. Main-thread heartbeats carry a production timestamp.
2. If heartbeats were produced continuously while the worker was congested, the worker must not treat the congestion as a dead page and must not delete catch-up debt.
3. If the main thread truly stopped producing frames for more than one second, the old dead-page hold still discards the hidden interval.
4. During a hold, the worker must not busy-loop timers.
5. Legacy unstamped test/dev heartbeats keep their old behavior.

## Your job

Adversarially review the actual uncommitted diff. First inspect `git diff -- src/core/simLaneMain.js src/core/wholeSimBrowserWorker.js test/worker-delayed-consumer.test.mjs scripts/fleet/run.mjs`. Verify the diff is small and not line-ending noise.

Answer these questions with exact file/line evidence:

1. Does the production timestamp really distinguish worker congestion from a dead main thread in the browser? Consider worker/main `performance.timeOrigin`, message ordering, queued heartbeat batches, clock skew, hidden tabs, slow frames, and fallback environments.
2. Can the new logic reintroduce freeze-then-teleport, busy timers, unbounded catch-up bursts, incorrect dilation/shed accounting, or a failure to pause when the page truly dies?
3. Are heartbeatHolds / heartbeatHeldMs / heartbeatAgeMs now truthful enough for diagnosis?
4. Does the new regression test prove the intended distinction? Is it a faithful test or a rigged mirror of the implementation?
5. Are existing tests that expect the dead-page hold still meaningful?
6. Find any simpler or safer implementation that preserves the same player-facing result.

Run only focused static/tests if useful. Do not boot the game, browser, or Electron.

## Receipt

Write `RECEIPT.md` with the protocol headings plus:

- `## Verdict` — ACCEPT, ACCEPT WITH FIXES, or REJECT.
- `## Findings` — ordered by severity; each with file:line and why it matters to the player.
- `## Required fixes` — only fixes you consider necessary before landing.
- `## Evidence` — checks you ran and what they showed.
