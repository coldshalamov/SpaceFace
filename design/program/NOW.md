<!-- LIFETIME: VOLATILE -->
# NOW — threads changing the shared checkout

```yaml
refreshed: 2026-10-04
baseCommit: 76f4fe2527e2991510ebf704625bbf5cb439e1c7
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
7. Do not create a worktree by default; if one is unavoidable it is a single `.worktrees/<name>`
   shared by the whole sitting — port the work back and `git worktree remove --force` in the same
   turn. Existing worktrees are recovery obligations recorded in
   [`04_WORKTREE_AND_INTEGRATION.md`](./04_WORKTREE_AND_INTEGRATION.md), not current ownership.
   `git worktree list` shows only the main checkout before you walk away.

## Active mutation windows

| Task | Thread | State | Exact paths being changed now | Next terminal action |
|---|---|---|---|---|
| BATCH-20 sitting — 20 units down the ladder: defect ledger → board 278-283 → lanes → authored | devin-batch20 | IN PROGRESS | landed: D136 (with owner session), row 196 J4/J5, §22 A7, §22.4 B10 (retraction + DONE), M0-EVIDENCE, D170 market family strip (1ef3c5179), convoy spill REV fixes (4882c18a2), arcRail REV-D169 (3eae22922+9f911c780, live-probe verified), D171 adjudicated — harness asserted retired contract (b7cfb1b64), D112 Settings+Shipworks 390px (73aac3aef), CV-SO wreck names its victim on first scan (b5ccc8c67), REV-D112 701–899 band + head-cap (597e32abc), HUD fixture append() repair (0c7b1e8fc), D132 ecology offer retention (d4e8eca03), D133 refused-rescue latch (62e66e8f6), CV-SO-2 kill record + REV (6873254df, 2466dc8fe, b330dcb11), battle-aftermath re-pin (4dc05e63b), REV-D112-2 glow pool (573d408aa), stable-bind readers — throw/camera/warm resolve the stamp (49fa48f23), stable-bind REV — seed/aim/camera/tether/retire/world-write all prove the stamp, record-index fast path (89e5c2139), durable-bind save/restore rehydration (64ad41072 tests; saveSystem.js hunks riding the sibling's in-flight commit), sector-transition retire — a fix that never asked for the entered sector drops with its paired burn (4d2f8143d); D173 row deleted post-`76a660d2a`; massline load-pill null-tether guard (ff9d19f12); CV-THROW ear — the release snap grades the cut by class (2291359d9); authored-asset stale-fixture repin (8c803eea4); world-residency repin onto the membership-dwell contract (34a7600d4); D174 intent-pin repoint — dock/hail/lock read live records via shared playerIntentPins (d72447901, row deleted, vm-drop hazard → D175); mining tether-bound reads generation-proofed + dead aliases dropped (1f84f2fd0). Now mutating: `src/core/physics.js` + `test/physics-legacy-custom-mask.test.mjs` (PQ-195.01 legacy mask — LANDED c98bbb9d4, review pass); motion-lab adopt in flight (`src/systems/tacticalAI.js`, `src/ai/fodderCohort.js`, `src/ai/squadFrame.js`, `src/data/flightFeelEnvelopes.js`, 4 red scenarios left); G-LOC hull-ceiling gate (`src/ui/hud.js` + `test/hud-g-lag.test.mjs`); objective edge-arrow pin (new `test/objective-edge-arrow.test.mjs`); Vesta pocket day (`src/data/sectorActivityPockets.js` + new `test/vesta-activity-pocket-chain.test.mjs`); `build_map.md`/ledger §6/receipts by the orchestrator only | land unit → review subagent → close row → next |
| Parallel unit wave — 5 disjoint lanes + follow-ons: (a) C5 combat-verb sound harness half `src/audio/combatVerbCues.js`+`src/data/audioRecipes.js`+`test/combat-verb-cues.test.mjs` — landed b59479dd3 + REV 283d7c94a; (b) C6 sky-luminance reconcile `src/data/sectorVisualProfiles.js`+`test/wave-c6-sky-luminance.test.mjs` — landed 92e8d4339 + REV f1d3f5884; (c) §24 spent-crystals — already true at HEAD (74454e261), verified; (d) §24 more-stamps `src/data/opticStructures.js`+new test — landed d32cd8b0e + REV 99ce696bc; (e) D130 classifyWorld leg `src/world/activityRuntime.js`+`test/classify-prune-sweep.test.mjs` — landed 08d4898af + REV ef6cdc9aa; (f) D173 mining-pin record read `src/world/activityRuntime.js`+4 classify fixtures — landed 76a660d2a + REV f9b885039; (g) CR-FEED Charon tailings sweep `src/data/environmentalMachinery.js`+`test/cr-feed-sector-machines.test.mjs` — landed 482e9c8a9, REV in flight; (h) §22.5 C6 sector-skies import `src/render/deepSkyPlates.js`+`spaceBackground.js`+`sectorVisualProfiles.js`+`tabletopPictureRecipes.js`+`test/wave-c6-sky-plates.test.mjs`+assets — landed 34a6705fa + REV 847e2df84; (i) CR-FEED Io bell ringer (same machinery+test paths) — landed 0df6fd7e8, REV in flight | devin-parallel-c1 | IN PROGRESS | the paths listed left | land each unit by exact pathspec → adversarial review per unit → board/ledger rows close in the landing commits |
| Sole-agent cleanup + quiet-host sweep: master-side stale checks repinned and pushed (`e15597892`); soak market-verify hardened (`127197043`); D67 closed (`b231a7f0c`); D24 resoak attempts F+G died at launch — the cook lane starves when two headed system-Chrome probes contend for the GPU (product is bounded/fail-visible, worst ~210 s; contention, not a regression — a lone probe clears in ~46 s); attempt H launched 08:01Z on a quiet host, in flight cycling | devin-sweep-oct3 | IN PROGRESS | `scripts/lib/releaseSoakProbe.mjs`, `scripts/check-gameplay-core.mjs`, `design/program/DEMO_READINESS_2026-09-20.md` §6 | D24 soak verdict → heapsnapshot diff → remove or keep row; then final sync (PRs/tree/master==origin) |



## Remaster machine

The other computer does not share this checkout. It only adds finished files under
[`vm-drop/`](./vm-drop/README.md), on branch `vm-drop`, and the job list is
[`VM_LANES.md`](./VM_LANES.md). Local threads do not write in that folder. An empty table above
does not invite the other machine into `src/`.

## Start another task

Use the copy-ready prompts in [`AGENT_TASK_PROMPTS.md`](./AGENT_TASK_PROMPTS.md), or run:

```text
node scripts/program-dispatch.mjs --next
node scripts/program-dispatch.mjs --ready
```

Choose the highest-priority result you want, add its short mutation row only when editing begins, and
finish it. If one exact hunk is protected, continue the task's disjoint work or choose the next queue
row; never report the whole program blocked.
