<!-- LIFETIME: VOLATILE -->
# NOW — threads changing the shared checkout

```yaml
refreshed: 2026-09-06
baseCommit: 099c2b8d9708c152e4449f0a4e04ffaae3a0f1eb
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
   verify the staged names, publish, then remove the row.
6. End every task with `RESULT: DONE` or `RESULT: NOT DONE` using the template in
   [`02_REMAINING_WORK.md`](./02_REMAINING_WORK.md). Delete stale rows; Git and receipts own history.
7. Do not create a worktree by default. Existing worktrees are recovery obligations recorded in
   [`04_WORKTREE_AND_INTEGRATION.md`](./04_WORKTREE_AND_INTEGRATION.md), not current ownership.

## Active mutation windows

| Task | Thread | State | Exact paths being changed now | Next terminal action |
|---|---|---|---|---|
| Finish-game fleet | grok-controller 01a08d61 | MUTATING | `design/program/NOW.md`, `design/program/roadmap/program-queue.json` | 164 walker not run (GPU); 164.00b node pin; 158/160/166/194 live; skip 141.02 |
| Bug/perf sweep | grok-controller 01a08d61 | RESULT: DONE | released; frame cap now gates GPU presents; menu stage draw is allocation-free | 30 fps cap skips presents, leftover sim still 60 Hz; 9/9 twice |
| PQ-160.00 ring buffer + replay | opencode-go/deepseek-v4.1-flash | RESULT: DONE | released; 30 s ring + replay verifier + pause Replay surface | 600/600 ticks hash-equal at seed 16000; new test 4/4 twice; live capture + free camera are the open seams |
| PQ-160.01 auto-clip | opencode-go/deepseek-v4.1-flash pid 2336 | MUTATING | `src/core/simSnapshot.js`, `src/testing/lab/differentialReplay.js`, `src/ui/screens/pause.js`, `src/ui/screens/replay.js`, `src/ui/screens/clips.js` | bolas-kill clip window headless; clip list; no GPU export |
| PQ-145.00 drawn map route | Codex map remainder 2026-09-10 | RESULT: DONE | released; map, freight test and receipt ready for controller | seed 14500 route true at 120 ticks; 2/2 twice; Throughline 8/8; headless only |
| PQ-163.04 cliff | opencode-go/deepseek-v4.1-flash (recovery) | RESULT: DONE | released; receipt appendix committed | design proxy 4/4; playtest retention residual |
| PQ-163.03b stranger readback | grok-controller 01a08d61 | RESULT: DONE | released; STRANGER_READBACK committed `ad35e82b2` | Kimi accept; controller 7/7 twice; unaided stranger residual |
| PQ-153.02 landmarks | zai-coding-plan/glm-5.3-flash max pid 29352 | RESULT: NOT DONE | released; 6/6 reachable committed; stills rejected (skybox/dust, onCamera110=0) | recapture serialized behind 194.01 GPU |
| PQ-161.01 telegraphs | opencode-go/deepseek-v4.1-flash pid 12240 | RESULT: DONE | released; pairing committed | live death-cause pairing ≥90% |
| PQ-161.02 seed align | opencode-go/deepseek-v4.1-flash | RESULT: DONE | released; seed 16102 aligned, contrast green 6/6 twice, receipt appended | controller commits by pathspec |
| PQ-194.00 S1 kit | claude-opus-5 pid 18804 | RESULT: DONE | `design/frontend/direction/approved/`, `assets/ui/kit/`, `design/frontend/direction/receipts/` | six frames + 157-asset kit + 86 icons + 41 marks + tokens + motion/sound + kit page + 3 file:// prototypes; title pick v2; receipt at `design/frontend/direction/receipts/S1-REPORT.md`; controller commits by pathspec |
| PQ-164.00 pad screen walk | grok-controller salvage | RESULT: NOT DONE | released; node pin 5/5 twice; Chromium walk waits on 194 GPU | `check:gamepad:screens` not run |
| PQ-164.03 haptics | command-code/deepseek-v4.1-flash pid 11900 | RESULT: DONE | released; `src/systems/gamepad.js`, `test/pq-164-03-haptics.test.mjs`, `design/program/roadmap/receipts/PQ-164.03-REPORT.md` | rumble table by momentum (seed 16403, rows monotone); reduce-motion silent; 3/3 twice; no Chromium; baseline reds pre-existing |
| PQ-194.01 UI stage (gate zero) | claude-opus-5 L-A | RESULT: DONE | `src/render/uiStage.js` (new), `src/core/presentationFreeze.js`, `src/core/renderUpdatePhase.js`, `src/ui/screenManager.js`, `src/ui/views/menuFrames.js`, `src/ui/screens/mainMenu.js`, `src/ui/screens/crucible.js`, `src/ui/station/stationApp.js`, `src/ui/station/stationScreen.js`, `styles/kit.css`, `assets/ui/backdrops/` (new) | released; 9/9 `--world` frames show a lit world at 1280/1920/2560, one GL context on Intel, stage released in flight; receipt `design/frontend/direction/receipts/P20-REPORT.md`; controller commits by pathspec |
| PQ-193.00 packaged bodies | Devin adoption 2026-09-11 | MUTATING | `src/render/partsLibrary.js` (193.00 hunks only — first-flight cook hunk preserved, never committed by me), `test/live-ship-visual-package-coverage.test.mjs`, `test/live-whole-ship-admission.test.mjs`, `design/program/roadmap/receipts/PQ-193.00-REPORT.md`, `design/program/roadmap/program-queue.json` (row only) | adopt stale HOLD; verify tests still green; default-route GPU proof; land 193.00 hunks by patch staging |
| PQ-030.02 counter first | glm RETURNED | HOLD | clock test already at HEAD | vision/silhouette clause open; do not reimplement clock |
| PQ-166.00 language bridge | opencode-go/deepseek-v4.1-flash | RESULT: DONE | released; receipt `design/program/roadmap/receipts/PQ-166.00-REPORT.md` | language picker + live re-render for any locale; English default; 4/4 headless screens re-render, seed 16600 |
| PQ-165.00 presets and frame cap | command-code/deepseek-v4.1-flash pid 15456 | RESULT: DONE | released; receipt `design/program/roadmap/receipts/PQ-165.00-REPORT.md` | 3 presets → 3 tiers; 30/60/120/off resolve with VSync; seed 16500; headless only (renderer scheduler consumption unproven) |
| PQ-158.00 sample library | zai-coding-plan/glm-5.3 leaf .00 | RESULT: DONE | released; 181/182 cues sample-backed (seed 15800), new-game unmute, frame-sleep unchanged; SAVE_SCHEMA.md regenerated (one default line); integrator flip wanted: test/depth-program-a1-live-integration.test.mjs:13-17 still pins the old mute policy | receipt `design/program/roadmap/receipts/PQ-158.00-REPORT.md` |
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

| PQ-164.01 glyphs and remap | devin session 2026-09-11 | MUTATING | `src/systems/gamepad.js`, `src/ui/bindings.js`, `src/ui/input.js`, `src/ui/screens/settings.js`, `test/pq-164-01-glyphs-remap.test.mjs`, `design/program/roadmap/receipts/PQ-164.01-REPORT.md`, `design/program/roadmap/program-queue.json` (PQ-164.01 row only), `design/program/NOW.md` (this row) | headless: device-aware promptLabel + pad remap/conflict + profile persistence; no GPU |
| PQ-141.02b occupational still retry | Codex 2026-09-11 | MUTATING | `src/render/vfx.js` (NPC job signatures only), `.devshots/delegate-20260910/scratch/pq-141.02/retry-b/`, `.devshots/delegate-20260910/scratch/pq-141.02/retry-c/`, `.devshots/delegate-20260910/scratch/pq-141.02/launch-b.mjs`, `.devshots/delegate-20260910/scratch/pq-141.02/launch-c.mjs`, `design/program/roadmap/receipts/PQ-141.02-REPORT.md` | seed 14102; surface-bound contacts and survey fan; fresh-launch retry after GPU residency failure; finish missing role stills; no commit |

## Start another task

Use the copy-ready prompts in [`AGENT_TASK_PROMPTS.md`](./AGENT_TASK_PROMPTS.md), or run:

```text
node scripts/program-dispatch.mjs --next
node scripts/program-dispatch.mjs --ready
```

Choose the highest-priority result you want, add its short mutation row only when editing begins, and
finish it. If one exact hunk is protected, continue the task's disjoint work or choose the next queue
row; never report the whole program blocked.
