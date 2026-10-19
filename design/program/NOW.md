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
| Parallel unit wave — 5 disjoint lanes + follow-ons: (a) C5 combat-verb sound harness half `src/audio/combatVerbCues.js`+`src/data/audioRecipes.js`+`test/combat-verb-cues.test.mjs` — landed b59479dd3 + REV 283d7c94a; (b) C6 sky-luminance reconcile `src/data/sectorVisualProfiles.js`+`test/wave-c6-sky-luminance.test.mjs` — landed 92e8d4339 + REV f1d3f5884; (c) §24 spent-crystals — already true at HEAD (74454e261), verified; (d) §24 more-stamps `src/data/opticStructures.js`+new test — landed d32cd8b0e + REV 99ce696bc; (e) D130 classifyWorld leg `src/world/activityRuntime.js`+`test/classify-prune-sweep.test.mjs` — landed 08d4898af + REV ef6cdc9aa; (f) D173 mining-pin record read `src/world/activityRuntime.js`+4 classify fixtures — landed 76a660d2a + REV f9b885039; (g) CR-FEED Charon tailings sweep `src/data/environmentalMachinery.js`+`test/cr-feed-sector-machines.test.mjs` — landed 482e9c8a9 + REV f4199577c; (h) §22.5 C6 sector-skies import `src/render/deepSkyPlates.js`+`spaceBackground.js`+`sectorVisualProfiles.js`+`tabletopPictureRecipes.js`+`test/wave-c6-sky-plates.test.mjs`+assets — landed 34a6705fa + REV 847e2df84; (i) CR-FEED Io bell ringer (same machinery+test paths) — landed 0df6fd7e8 + REV f4199577c; (j) REV-nit batch + per-sector hazard discs — landed f4199577c + REV bdff70a4c (world.js dedupe hunk rode 4e6ad8957); (k) CR-BERTH-1 consignment line `src/data/factionBerths.js`+`src/systems/world.js`+`src/systems/factionPresence.js`+`src/data/frontierRumors.js`+`src/world/farActorTable.js`+`src/render/partsLibrary.js`+`test/cr-berth-1-consignment-line.test.mjs` — landed 4e6ad8957, REV LAND-WITH-NITS → resolved ab1e82169 (tombstone/far-actor pins, receipt save round-trip, warm enumeration, doc numbers); (l) CR-FEED Ashfall claim-scarecrow (first repulsor-kind machine) — landed b750a7306 + REV nits d63bf176c + fecf39154 (full-coverage disc re-site; nested same-type readout retain in `src/data/hazardLanguage.js`+`src/ui/alerts.js`; new `test/hazard-readout-retain.test.mjs`); (m) REV-f4199577c batch — landed bdff70a4c; (n) CR-HOLLOW-2 Sedna watch-day pockets `src/data/sectorActivityPockets.js`+`test/sedna-activity-pocket-chain.test.mjs`+4 chain-test recounts — landed a59e2c891, REV LAND-WITH-NITS → comment nits 517c165db; (o) D176 world one-offs local-as-global fix `src/systems/world.js`+`test/world-one-offs.test.mjs`+ledger row — landed aa58286c9, row closed, REV LAND-WITH-NITS (all LOW); (p) PQ-020 census regression — activity-slot repoints took solid-dressing colliders post-309deb2f7; fix gates solidPlan off for activityObjectSlotId spawns `src/systems/world.js`+`test/ceres-active-pockets.test.mjs` — landed 7f6f048ef (commit also swept a sibling's staged touch→mobile split, disclosed in body), REV LAND-WITH-NITS → all resolved: POI-path symmetric gate 69dcd86f4, promoted landmark POIs keep measured-skin bodies (reachable REDUCED→FULL ghost defect) 527ca6383, berth admission hardened on real berth rows 75d90223f, D176 re-seat widened + pinned 69e4becc4; (q) D178 player-store sweep — 68 probe/check server.js spawns now unmount the store (`SPACEFACE_PLAYER_STORE_DIR:''`) or mount isolated dirs (station-tab mkdtemp), `playerStoreMounted:false` declared at every issues collector — 71 `scripts/` files landed 765dcc222, row closed 14c23585b, REV BLOCKER → resolved ff282d138 (missed spawns closed, url-keyed store filters in the private CDP collectors, env ordering flipped deterministic — verified live over CDP: the store-404 entry carries entry.url, a control asset 404 stays visible); (r) CR-WEIR Dione lane toll funnel — third weir shape (trapezoid: wide mouth upstream, narrow gap at the booth) on the empty 720r Lane Customs disc `src/world/customsWeir.js`+`test/customs-weir.test.mjs` — landed a23c85be5 + annexed 42ec10c12, REV LAND-WITH-NITS → comment nits a89a8ebf0; (s) D179 weir-pod patrol-adoption guard (review's flagged adjacent defect, filed+fixed same sitting) `src/systems/lawSecurity.js`+`test/customs-weir.test.mjs` — landed f24f4379d, REV LAND-WITH-NITS (respawned after first reviewer died on a connection error) → resolved c1b16062a (dwell housekeeping runs under the patrol gate; cone-path twin filed as D180, sink-side fix prescribed); (t) CR-BERTH-2 Understory Afterwake Slip — second faction berth off station_expanse, organic digest-slip crib (alien_growth kit), hulk gated on a proved-loss appraisal receipt `src/data/factionBerths.js`+`src/systems/factionPresence.js`+`src/data/wreckClasses.js`+`src/systems/lossLedger.js`+`test/understory-afterwake-slip.test.mjs`+`test/cr-berth-1-consignment-line.test.mjs`+`test/world-one-offs.test.mjs` — landed 38162edf9, REV LAND-WITH-NITS → resolved 15b0e90d2 (feed gate keys on shipDefId matching desk denial, count = distinct fed hulls via fedLossIds, authored wreckClass honored on berthConsign bodies — 'consigned_hulk' registered, berth-1's dead field goes live — comment numbers + ghost-crib intent documented); sitting paused here per user — build green (bundle 286/286 packages valid), annex row in build_map §23.3.1, foreign fodderCohort const→let typo repaired uncommitted for the motion-lab sibling | devin-parallel-c1 | IN PROGRESS | the paths listed left | land each unit by exact pathspec → adversarial review per unit → board/ledger rows close in the landing commits |
| Zero-overhead graphics overhaul: stencils, materials, paneling, star halos, and bloom | antigravity-graphics | IN PROGRESS | `src/render/illustratedStencils.js`, `src/render/illustratedSurface.js`, `src/render/illustratedHullLayout.js`, `src/render/bloom.js`, `src/render/spaceBackground.js`, `src/data/lookMoods.js` | verify baseline + test suites + subagent review |
| Agentic orchestration run — ~55 units: defects/reviews first, then §1.8 sweep fixes + lane slices + INFERENCE look-then-rotate; workers on exact-path write sets, controller-only commits | devin-agentic-oct18 | IN PROGRESS | Shared surfaces under orchestrator lock: `design/program/NOW.md`, `build_map.md`, `design/program/DEMO_READINESS_2026-09-20.md`, `design/program/LANDED_REVIEW.md`, `design/program/INFERENCE_IDEAS.md`, `design/program/inference-memory.json`, `design/program/agentic-run-oct18/` | dispatch waves → audit diffs → pathspec commit+push → file review rows; stale rows devin-batch20 + devin-sweep-oct3 adopted and closed 2026-10-18 (their claimed files carried no orphan hunks) |
<!-- devin-ten-oct18 closed 2026-10-18 — INFERENCE x5 + build-map x5 sitting complete: ten units
     landed (5 inference + 5 §23.2 build-map); per-unit commits in git log; checkpoint released. -->



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
