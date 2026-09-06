<!-- LIFETIME: VOLATILE -->
# NOW — threads changing the shared checkout

```yaml
refreshed: 2026-09-06
baseCommit: 540dda0bcc6ac4b7c18e291d8c597a6e4bdd4691
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
| Campaign coordination | controller 01a0768b | MUTATING | `design/program/NOW.md` | keep current ownership and close accepted leaves in existing queue |
| PQ-031.01 — Coupled-pair physics | current implementation thread | MUTATING | `src/systems/tetherGameplay.js`, `src/core/sg02DynamicBodyOwner.js`, `src/systems/tumbleStates.js`, `.codex/agent-checkpoints/PQ-031.01.json` | start after PQ-140.01; preserve exact-path ownership |
| PQ-031.02 — NPC counterplay | current implementation thread | MUTATING | `src/systems/tetherGameplay.js`, `src/core/sg02DynamicBodyOwner.js`, `src/systems/tumbleStates.js`, `.codex/agent-checkpoints/PQ-031.02.json` | start after PQ-031.01; preserve exact-path ownership |
| PQ-190.01 — The effect-class VFX matrix | ChatGPT Pro 6a9df168-a78c-83ea-b0d8-d913318c840b | MUTATING | `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`, `docs/visual-assets/SOFT_CARD_INVENTORY.json`, `scripts/check-vfx-techniques.mjs`, `.codex/agent-checkpoints/PQ-190.01.json` | return a pushed remote candidate; Codex independently reviews and integrates the matrix |
| PQ-187.02 — The kit | ChatGPT Pro 6a9df1b5-1254-83ea-838b-b22d45140dc9 | MUTATING | `styles/fonts/`, `styles/fonts.css`, `styles/kit.css`, `src/ui/kit/`, `assets/audio/ui/`, `_uilab.html`, `scripts/probe-frontend-snapshot.mjs`, `.codex/agent-checkpoints/PQ-187.02.json` | return a pushed remote kit candidate; Codex handles visual/hull capture and acceptance |
| PQ-019.facility-presentation-h1 — Four-role facility presentation | ChatGPT Pro 6a9df1d1-f710-83e9-b39d-2c6a88f8e35d | MUTATING | `scripts/capture-pq019a-acceptance.mjs`, `scripts/validation-manifests/pq019a-capsule-presentation.mjs`, `test/pq019a-capsule-presentation-h1-manifest.test.mjs`, `.codex/agent-checkpoints/PQ-019.facility-presentation-h1.json` | return the bounded framing repair; Codex runs the Browser/Electron capture and review |
| PQ-038.native-acceptance — Dense PresentationWorld | ChatGPT Pro 6a9df1d7-acac-83ea-8a4c-1c699d9c0dd2 | MUTATING | `scripts/lib/performancePresentationWorldAcceptance.mjs`, `scripts/check-performance-presentation-world.mjs`, `scripts/validation-manifests/performance-presentation-world-browser.mjs`, `scripts/validation-manifests/performance-presentation-world-electron.mjs`, `test/performance-presentation-world-acceptance.test.mjs`, `test/performance-presentation-world-manifests.test.mjs`, `.codex/agent-checkpoints/PQ-038.native-acceptance.json` | return a static harness/contract candidate; Codex owns brokered live and native acceptance |
| PQ-041.native-acceptance — Exact-package Electron | ChatGPT Pro 6a9df1de-35ec-83e9-9043-8725a5fcfe87 | MUTATING | `scripts/check-electron-platform-contracts.mjs`, `scripts/check-electron-packaged-startup.mjs`, `scripts/validation-manifests/performance-electron-modernization-browser.mjs`, `scripts/validation-manifests/performance-electron-modernization-electron.mjs`, `test/electron-packaged-startup-contract.test.mjs`, `test/performance-electron-modernization-manifests.test.mjs`, `.codex/agent-checkpoints/PQ-041.native-acceptance.json` | return the bounded static package/manifest contract candidate; Codex owns package build, Browser/Electron, and GPU proof |

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

## Start another task

Use the copy-ready prompts in [`AGENT_TASK_PROMPTS.md`](./AGENT_TASK_PROMPTS.md), or run:

```text
node scripts/program-dispatch.mjs --next
node scripts/program-dispatch.mjs --ready
```

Choose the highest-priority result you want, add its short mutation row only when editing begins, and
finish it. If one exact hunk is protected, continue the task's disjoint work or choose the next queue
row; never report the whole program blocked.
