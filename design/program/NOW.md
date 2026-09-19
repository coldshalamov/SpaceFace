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
| PQ-208.00 progression verb drift guard (mechanical consumer verification for declared verb keys, fail-closed; leaf PQ-208.01 key wiring NOT this unit) | pq208-glm | RESULT: DONE | released; `scripts/check-progression-verb-audit.mjs` (consumer-evidence guard: {file,symbol} verified live each run, unwired keys only behind {declaredOnly: leaf}, fail-closed; 4 landing-lane keys now mechanically pinned to their landed consumers), `test/pq208-progression-verb-drift-guard.test.mjs` (new, 7/7 incl. planted-drift negatives), `design/program/PROGRESSION_VERTICAL_AUDIT.md` regenerated (additive). Commit `a28a13b4f` (+receipt commit). Receipt `design/program/roadmap/receipts/PQ-208.00-REPORT.md`. `src/data/modules.js` net-unchanged (drift planted→FAIL→reverted byte-identical; corrections are leaf .01's). check:baseline 12/15, all 3 reds proven foreign (massline-heads identical red under HEAD audit script; 47a green solo; sim goldens drift with src/ dirty from live lanes) | DONE: audit exit 0 (16 verb keys verified / 2 declared-only tracked by PQ-208.01); guard exits 1 on planted unwired key |
| PQ-033.02 min-spec floors and soak (adopted from devin-desktop, stale 227 min; convoy cap-release fix + test ALREADY on master via `5617c1cd5`, test green 2/2; PQ-172.00/.01 NOT this unit's scope) | glm-5.3-pq033-02 | MUTATING | `src/save/saveSystem.js`, `src/world/worldRecords.js`, `src/systems/world.js` (only if a focused fix needs it — disjoint hunks only), `scripts/lib/releaseSoakProbe.mjs`, `test/`, `design/program/roadmap/receipts/PQ-033.02-REPORT.md`, `design/program/NOW.md`, `design/program/roadmap/program-queue.json` | Unit of work: attribute the second save-growth source on the dock/trade route (~3-9 KB/cycle, quota ~cycle 600-700), fix it, land a focused test; then targeted floor work that is attributable in-session (save growth feeds heap growth). Floors honestly red until a fresh 2h soak pair says otherwise; receipt updated at close.
| Onboarding vertical: thesis-first first hour | zai-coding-plan/glm-5.3 | RESULT: NOT DONE (route shipped + committed 614bec27d; stranger full-hour metrics not met — far-field body demotion defeats scripted thrust after swing recoil, see receipt) | released; `src/systems/onboarding.js` (thesis-first BEATS: tether→raid→claimed→drills→seam/dock/choice, raid+claimed beats, milestones, rescue/raid restage recovery, DOM guards), `scripts/check-first-hour.mjs`, `scripts/check-professional-first-hour-one-voice.mjs`, `scripts/lib/bench/playthroughStrangerPilot.mjs` (new — stranger archetype module), 4 beat-FSM test drivers. Attach <60s PROVEN (0.53s, seed 4242). Instrument integrations for the instrument lane (NOT committed, contested): pilot stranger re-export, ledger TARGETED_TYPES += 'firsthour:milestone', harness stranger entry + onboarding system + production flag seed — see receipt `design/program/roadmap/receipts/onboarding/2026-09-19-thesis-first-first-hour.md` | receipt written; NEXT: fix far-field body sleep for scripted input, then fixed-seed metrics twice |
| Arranger v1 integration + economy resource-work publisher in world owner | arranger-integrator | RESULT: DONE | released; `5617c1cd5` Arranger v1 (installer preflight refused the divergent working tree, so the delivery's documented `patches/world-arranger.patch` merge path was used; patch(preimage)==delivered file verified by hash; world.js carried hunks from the field-regrowth / membership-hysteresis / PQ-033.02 lanes landed deliberately with their paired files — fieldDepletion.js, membership test update, PQ-033.02's intent-to-add test). `ad60fed4a` economy resource-work publisher (persisted sector-wide seq, admission/clearance/cap checks, no-subscriber-tolerant free-regrow fallback, settle/cancel/uncertain rules) + `test/economy-resource-work-publisher.test.mjs` 7/7 against the real economy subscriber. arrangementVersion save round-trip proven through the real saveSystem envelope path (v1 new game / missing→v0 / explicit-0→v0 / unknown rejected) — no src/save/ edit needed. World suites: same 7 pre-existing failures before and after; baseline red set unchanged. | full playthrough battery deferred to the integrator after all packets land; new-campaign-only rollout (no v0→v1 migration) |

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
| PQ-207.00 berth mechanic ledger cost (people-who-remember residuals `.00`) | devin-desktop | RESULT: DONE | released; `src/story/mechanicVoice.js` (rap line asks presence instead of building a page), `src/systems/shipLedger.js` (additive read-only presence probe `shipLedgerHasFactOutside` + per-family early exit — write-set crossing recorded in the receipt), `test/pq-207-00-berth-mechanic-cost.test.mjs` (new, 9/9). Commits `492bb4a9d` + `9f5af58aa`. Receipt `design/program/roadmap/receipts/PQ-207.00-REPORT.md` | DONE: 3745 us -> 19 us per berth card on a scarred hull with a 240-row trade ledger (5335 -> 20 us per arrival); `buildShipLedger` pages byte-identical vs `492bb4a9d^`; check:baseline 11/15 with all 4 reds proven foreign (identical with this change reverted). Queue close-out left to the fleet lane, which owns `program-queue.json`. Follow-up found, not fixed: `src/ui/screens/footprint.js:961` rebuilds a ledger page on the same 18-frame cadence while the board is open |

## Start another task

Use the copy-ready prompts in [`AGENT_TASK_PROMPTS.md`](./AGENT_TASK_PROMPTS.md), or run:

```text
node scripts/program-dispatch.mjs --next
node scripts/program-dispatch.mjs --ready
```

Choose the highest-priority result you want, add its short mutation row only when editing begins, and
finish it. If one exact hunk is protected, continue the task's disjoint work or choose the next queue
row; never report the whole program blocked.
