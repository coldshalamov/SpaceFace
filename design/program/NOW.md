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
| BATCH-20 sitting — 20 units down the ladder: defect ledger → board 278-283 → lanes → authored | devin-batch20 | IN PROGRESS | landed: D136 (with owner session), row 196 J4/J5, §22 A7, §22.4 B10 (retraction + DONE), M0-EVIDENCE, D170 market family strip (1ef3c5179), convoy spill REV fixes (4882c18a2), arcRail REV-D169 (3eae22922+9f911c780, live-probe verified), D171 adjudicated — harness asserted retired contract (b7cfb1b64), D112 Settings+Shipworks 390px (73aac3aef), CV-SO wreck names its victim on first scan (b5ccc8c67), REV-D112 701–899 band + head-cap (597e32abc), HUD fixture append() repair (0c7b1e8fc), D132 ecology offer retention (d4e8eca03), D133 refused-rescue latch (62e66e8f6), CV-SO-2 kill record + REV (6873254df, 2466dc8fe, b330dcb11), battle-aftermath re-pin (4dc05e63b), REV-D112-2 glow pool (573d408aa), stable-bind readers — throw/camera/warm resolve the stamp (49fa48f23), stable-bind REV — seed/aim/camera/tether/retire/world-write all prove the stamp, record-index fast path (89e5c2139), durable-bind save/restore rehydration (64ad41072 tests; saveSystem.js hunks riding the sibling's in-flight commit), sector-transition retire — a fix that never asked for the entered sector drops with its paired burn (4d2f8143d); D173 row deleted post-`76a660d2a`; massline load-pill null-tether guard (ff9d19f12); CV-THROW ear — the release snap grades the cut by class (2291359d9); authored-asset stale-fixture repin (8c803eea4); world-residency repin onto the membership-dwell contract (34a7600d4); D174 intent-pin repoint — dock/hail/lock read live records via shared playerIntentPins (d72447901, row deleted, vm-drop hazard → D175); mining tether-bound reads generation-proofed + dead aliases dropped (1f84f2fd0); RF-SECTOR REV — stale nav retires only on teleporting enters, continuous Voronoi flips preserve the burn (337772d59); D176 cargo run-scoped spill latch cleared at all three run boundaries (c12b0b75d, row deleted); convoy side-haul arrival pressure gated on the hauler's own endpoint geometry — REV-4882 regression repaired (5058eca11); stable-bind REV-2 — write seams stamp (missions/nav waypoint choke, throw seed, setCourse ordering), read seams resolve (goalTarget/search/HUD/VFX/site-clear), save derives durable id from the stamp (71e9b2d2f); world-site beam fixture repinned onto the two-field lock contract (b34bd451d); mining fixtures repinned onto the same lock (194bf1f42); recycled-id attack pinned on the serialized durable bind (9b41b8576); sample-sweep repins — force-palette, Pallas solid dressing, closure-probe options (501d34001) and loop-orch + save-index + control-prompts (e36bed0f8); D172 repin — lane-version fixture, guarded promote, drain-budget (0d101bebc, row deleted); D172 REV — parity clears + defense-in-depth input latch clears (8fc92142e); PQ-022 refinery candidate-admission suite retired — candidate superseded by the Forge publication, evidence deliberately purged (c919ab338); mobile lane's legacyTouch wall-clock read routed through perfNow (dirty hunk riding their staged file); save-growth defect repaired — ambient kill tombstones minted PERMANENT records with no bound (b320e4d35); REV blocker: denylist evicted marker-free authored anti-respawn tombstones — allowlist flipped to provable ephemeral provenance (positional mint key or 'kill'-stamp + no identity) + identity-latch merge (c64502743); save-continuity harness repinned onto the chunked-deserialize contract (4bfadea74); UI budget baseline re-shot headed — check:ui:budgets PASS (67a87c95d); save-lane hunks landed by hunk-stage (33a287870); reconcile-comment landed (979ef4d3d); legacyTouch perfNow rode the PQ-020 staged sweep (7f6f048ef); F1/F2 production-path fix — record.identityKey lands the semantic mint key, not wr_* (c1c408b91, VERIFIED re-review); graphics-asset-receipt ROOT repinned repo-relative (ce19604ff); save-growth soak on the allowlist ran flat-band healthy (farRows pinned 2-4, zero stale orphans); SP1 duration audit completed — den-access earned-latch modeling + choir_long_night live-salvage driver + choir_what_remains filed-choice return drive, 14/14 routes native (912a52555); Helios starter extraction chain repaired end-to-end — extraction-pair role guarantee + authored-field shape predicate + placed-set/displacement + pocket anchoring + barge persistent custody + early cutter slot reservation + hook exclusions (a23bc316a); receiptless solver teleport repair — concentric narrow-phase detonation stranded hulls at MWU distances under an Infinity dv budget, pose sanity bound restores predicted pose (249db9726, runtime proof 2 deliveries/2 loops green); D177 ledger row for foreign proportional-collider regression; worker drive pursuit fix — velocity-matched chase for moving work targets + relative-velocity arrival gate (333435070, choir runtime all three conditions green; independent review VERIFIED with a bounded slow-drift note). D177 resolved — fixture pinned the retired single-capsule contract; repinned onto measured-skin compounds + capsule fallback, row deleted (0d47a63f4). Baseline sweep repairs: brood baseline bodies (f2d7b95cd), SAVE_SCHEMA regen for committed miningTargetId (1ff37e20d), m1 dry-mass pins track the authored drill-amp starter fit (f267d9046), pq020 structuralCost digest re-pin that 7f6f048ef claimed but never landed (2e5802858). Station-tabs/rail re-run green 7/7 (was soak contention). sim/sim-v3 hash drift remains foreign dirty-lane (clean at HEAD). D130 radar leg — one stance verdict per contact per draw (f7c3d5494); modulepreload registry regen (0850303c4); D130 registry-step leg — partition-time calendar Set gates updateDt (d10294702). Now mutating: `src/core/physics.js` + `test/physics-legacy-custom-mask.test.mjs` (PQ-195.01 legacy mask — LANDED c98bbb9d4, review pass); motion-lab adopt in flight (`src/systems/tacticalAI.js`, `src/ai/fodderCohort.js`, `src/ai/squadFrame.js`, `src/data/flightFeelEnvelopes.js`, 4 red scenarios left); G-LOC hull-ceiling gate (`src/ui/hud.js` + `test/hud-g-lag.test.mjs`); objective edge-arrow pin (new `test/objective-edge-arrow.test.mjs`); Vesta pocket day (`src/data/sectorActivityPockets.js` + new `test/vesta-activity-pocket-chain.test.mjs`); `build_map.md`/ledger §6/receipts by the orchestrator only | land unit → review subagent → close row → next |
| Parallel unit wave — 5 disjoint lanes + follow-ons: (a) C5 combat-verb sound harness half `src/audio/combatVerbCues.js`+`src/data/audioRecipes.js`+`test/combat-verb-cues.test.mjs` — landed b59479dd3 + REV 283d7c94a; (b) C6 sky-luminance reconcile `src/data/sectorVisualProfiles.js`+`test/wave-c6-sky-luminance.test.mjs` — landed 92e8d4339 + REV f1d3f5884; (c) §24 spent-crystals — already true at HEAD (74454e261), verified; (d) §24 more-stamps `src/data/opticStructures.js`+new test — landed d32cd8b0e + REV 99ce696bc; (e) D130 classifyWorld leg `src/world/activityRuntime.js`+`test/classify-prune-sweep.test.mjs` — landed 08d4898af + REV ef6cdc9aa; (f) D173 mining-pin record read `src/world/activityRuntime.js`+4 classify fixtures — landed 76a660d2a + REV f9b885039; (g) CR-FEED Charon tailings sweep `src/data/environmentalMachinery.js`+`test/cr-feed-sector-machines.test.mjs` — landed 482e9c8a9 + REV f4199577c; (h) §22.5 C6 sector-skies import `src/render/deepSkyPlates.js`+`spaceBackground.js`+`sectorVisualProfiles.js`+`tabletopPictureRecipes.js`+`test/wave-c6-sky-plates.test.mjs`+assets — landed 34a6705fa + REV 847e2df84; (i) CR-FEED Io bell ringer (same machinery+test paths) — landed 0df6fd7e8 + REV f4199577c; (j) REV-nit batch + per-sector hazard discs — landed f4199577c + REV bdff70a4c (world.js dedupe hunk rode 4e6ad8957); (k) CR-BERTH-1 consignment line `src/data/factionBerths.js`+`src/systems/world.js`+`src/systems/factionPresence.js`+`src/data/frontierRumors.js`+`src/world/farActorTable.js`+`src/render/partsLibrary.js`+`test/cr-berth-1-consignment-line.test.mjs` — landed 4e6ad8957, REV LAND-WITH-NITS → resolved ab1e82169 (tombstone/far-actor pins, receipt save round-trip, warm enumeration, doc numbers); (l) CR-FEED Ashfall claim-scarecrow (first repulsor-kind machine) — landed b750a7306 + REV nits d63bf176c + fecf39154 (full-coverage disc re-site; nested same-type readout retain in `src/data/hazardLanguage.js`+`src/ui/alerts.js`; new `test/hazard-readout-retain.test.mjs`); (m) REV-f4199577c batch — landed bdff70a4c; (n) CR-HOLLOW-2 Sedna watch-day pockets `src/data/sectorActivityPockets.js`+`test/sedna-activity-pocket-chain.test.mjs`+4 chain-test recounts — landed a59e2c891, REV LAND-WITH-NITS → comment nits 517c165db; (o) D176 world one-offs local-as-global fix `src/systems/world.js`+`test/world-one-offs.test.mjs`+ledger row — landed aa58286c9, row closed, REV LAND-WITH-NITS (all LOW); (p) PQ-020 census regression — activity-slot repoints took solid-dressing colliders post-309deb2f7; fix gates solidPlan off for activityObjectSlotId spawns `src/systems/world.js`+`test/ceres-active-pockets.test.mjs` — landed 7f6f048ef (commit also swept a sibling's staged touch→mobile split, disclosed in body), REV LAND-WITH-NITS → all resolved: POI-path symmetric gate 69dcd86f4, promoted landmark POIs keep measured-skin bodies (reachable REDUCED→FULL ghost defect) 527ca6383, berth admission hardened on real berth rows 75d90223f, D176 re-seat widened + pinned 69e4becc4 | devin-parallel-c1 | IN PROGRESS | the paths listed left | land each unit by exact pathspec → adversarial review per unit → board/ledger rows close in the landing commits |
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
