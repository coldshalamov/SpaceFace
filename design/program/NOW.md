<!-- LIFETIME: VOLATILE -->
# NOW — threads changing the shared checkout

```yaml
refreshed: 2026-09-19
baseCommit: a4429eb5a63c0c71907175c8aea0279c4e04d176
expiresAfterCommits: 10
expiresAfterDays: 2
```

This is a short collaboration board, not a roadmap, backlog, completion ledger, or reason to stop
working. Product status and remaining tasks live in
[`02_REMAINING_WORK.md`](./02_REMAINING_WORK.md) and
[`roadmap/program-queue.json`](./roadmap/program-queue.json).

## Rules

1. Add one row immediately before the first mutation. Reading, research, review, and tests reserve no
   file and need no row.
2. Name the exact task, thread label, current state, and files being changed now. Do not claim a
   subsystem, lane, tool, GPU, or future phase.
3. A row protects the exact dirty hunk from being overwritten. It does not block the task, packet, or
   other files. Work on disjoint hunks or another returned task while arranging an explicit handoff.
3a. **A row is a claim, not evidence — check liveness before yielding to it.** Run
   `node scripts/check-now-liveness.mjs`. A row whose claimed files are untouched for 90 minutes is
   **stale by definition**: the writer is dead or done. Adopt the work (evaluate the dirty diff,
   finish or land it, receipt it) and delete the row — do not route around it, do not wait, do not
   ask. Dirty files alone are never proof of a live writer in this chronically dirty tree, and
   "row exists + files dirty" is the claim verifying itself. Collisions here are cheap and
   recoverable; work stalled behind a ghost is invisible and permanent — yielding to a stale row
   is the failure mode, not the safe choice.
4. Reread a shared file before every patch. Release the row as soon as mutation stops.
5. Use `PUBLISHING` only for the brief stage/commit/push window. Stage only the task's exact files,
   verify the staged names, publish with `git commit -- <paths>` (a pathspec publish cannot race a
   snapshot), then remove the row. A staged deletion of a file that exists in `HEAD` and on disk
   means the shared index is stale, not that the file is gone: `git reset -- <paths>`, then publish.
6. End every task with `RESULT: DONE` or `RESULT: NOT DONE` using the template in
   [`02_REMAINING_WORK.md`](./02_REMAINING_WORK.md). Delete stale rows; Git and receipts own history.
7. Do not create a worktree by default. Existing worktrees are recovery obligations recorded in
   [`04_WORKTREE_AND_INTEGRATION.md`](./04_WORKTREE_AND_INTEGRATION.md), not current ownership.

## Active mutation windows

| Task | Thread | State | Exact paths being changed now | Next terminal action |
|---|---|---|---|---|
| PQ-033.02 min-spec floors and soak (adopted the stale devin-desktop checkpoint `PQ-033.02-soak-then-PQ-172-mods`; its fixes are committed, PQ-172.00/.01 are NOT this unit's scope) | devin-desktop | MUTATING | `src/save/saveSystem.js` (preserve the five-bugs epoch-alias hunk at :241 — do not revert), `test/pq-033-02-convoy-cap-job-release.test.mjs` (new), `design/program/roadmap/receipts/PQ-033.02-REPORT.md`, this row. UNPUBLISHED BY DESIGN: `src/systems/world.js` carries three other lanes' uncommitted hunks (field regrowth + its `src/systems/fieldDepletion.js` dependency, membership hysteresis, scan compass) — partial work publishes with pathspecs only, so the cap-refused-job release rides that file's next legitimate commit. Published: soak-driver turn retry `10935f3f8`, Electron-path harness fixes `9d7b61180`. Evidence (copied into the main tree): `.devshots/spec2/min-spec-soak-browser-2026-09-19T13-35-19-198Z-21908-05fb3dee`. | BROWSER ACCEPTANCE COMPLETE (run 4, candidate `c79a5b6e6`): 200 cycles / 155.5 min, every public cycle passed, worktree stable, quota never fired (saveBytes 636 KB→1.81 MB). Floors red and named: median 16.88 ms vs 16.7 (59.3 fps), gameplay hitches 7.01/min vs 1, one 6.58 s transition hitch, boot 15.49 s vs 10, heap 210 MB/30 min vs 30, plus 200 informational `[render] first-flight build` warnings counted by the probe. Electron acceptance (candidate `56949dfc1`, same game code) is running in `.devin-tmp/pq033-electron-wt`. Next unit: attribute the remaining ~3-9 KB/cycle save growth on the dock/trade route. |
| Onboarding vertical: thesis-first first hour | zai-coding-plan/glm-5.3 | RESULT: NOT DONE (route shipped + committed 614bec27d; stranger full-hour metrics not met — far-field body demotion defeats scripted thrust after swing recoil, see receipt) | released; `src/systems/onboarding.js` (thesis-first BEATS: tether→raid→claimed→drills→seam/dock/choice, raid+claimed beats, milestones, rescue/raid restage recovery, DOM guards), `scripts/check-first-hour.mjs`, `scripts/check-professional-first-hour-one-voice.mjs`, `scripts/lib/bench/playthroughStrangerPilot.mjs` (new — stranger archetype module), 4 beat-FSM test drivers. Attach <60s PROVEN (0.53s, seed 4242). Instrument integrations for the instrument lane (NOT committed, contested): pilot stranger re-export, ledger TARGETED_TYPES += 'firsthour:milestone', harness stranger entry + onboarding system + production flag seed — see receipt `design/program/roadmap/receipts/onboarding/2026-09-19-thesis-first-first-hour.md` | receipt written; NEXT: fix far-field body sleep for scripted input, then fixed-seed metrics twice |

| Finish-game fleet | grok-controller 01a08d61 | MUTATING | `design/program/NOW.md`, `design/program/roadmap/program-queue.json` | 164 walker not run (GPU); 164.00b node pin; 158/160/166/194 live; skip 141.02 |
The legacy extraction, live Shipworks guidance, Market quantity controls and public career route are
committed after controller review. UI performance and place acceptance continue in this campaign.
PQ-184.01, PQ-184.03, PQ-187.00, PQ-177.07, PQ-144.01, PQ-190.00 and PQ-184.02 are closed in the
canonical queue. The duplicate incomplete checkout was removed after its DROP disposition was
committed and pushed.

The three native art rows (ordinary working tug, held furniture construction repair, yard tug body
re-author) are deleted: their writers stopped on provider limits, the dirty work was adopted and
finished, and it is committed and pushed. Ordinary life is done on the route — the tug moves a real
load through the combat attachment service under Rapier, and a five-minute HUD-hidden capture at the
Ceres reference pocket shows all six quiet behaviours (`scripts/capture-ordinary-life.mjs`).

| Failing-test repair (entity-mesh-visibility + pq-030-02 seed 30000) | muse-fix-tests | RESULT: DONE | released; test-only pin refreshes, `src/` untouched, foreign hunks preserved | both files 17/17, pq-030 family 12/12, check:baseline 15/15 |

## Start another task

Use the copy-ready prompts in [`AGENT_TASK_PROMPTS.md`](./AGENT_TASK_PROMPTS.md), or run:

```text
node scripts/program-dispatch.mjs --next
node scripts/program-dispatch.mjs --ready
```

Choose the highest-priority result you want, add its short mutation row only when editing begins, and
finish it. If one exact hunk is protected, continue the task's disjoint work or choose the next queue
row; never report the whole program blocked.
