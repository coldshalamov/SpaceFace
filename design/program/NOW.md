<!-- LIFETIME: VOLATILE -->
# NOW — threads changing the shared checkout

```yaml
refreshed: 2026-09-27
baseCommit: e0dd924dccbf97289bc3930dc7616be7b2a42648
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
| Graphics program: finish every GRAPHICS_PROGRAM.md backlog row (GFX-1, 3–14) | devin-graphics | LIVE (verified 2026-09-27) | `tools/blender/forge/**`, `tools/art/render_hull_posters.mjs`, `scripts/fleet-look.mjs`, `scripts/flight-look.mjs`, `scripts/build-pack-release-assets.mjs`, `src/ui/hullPosters.js` (GFX-5), generated asset outputs via `publish.mjs` (`assets/ships/**`, `src/render/renderPackageManifest.js`, `src/data/modelTruthCensus.json`), `design/program/GRAPHICS_PROGRAM.md` | packet 1: env portability + GFX-6 kit helpers + GFX-13 wreck pack + GFX-1 trade hub; then GFX-3 place batches, GFX-4/7/8/14 bodies, GFX-9/10/11/12 runtime |
| Perf pipeline: plan + leaf implementation | devin-perf-pipeline | STALE — adoptable (writer dead ~3h; liveness 2026-09-27) | `src/render/**` + flight/input/perf files per this row's original claim — uncommitted hunks in tree are stranded work, adopt per §3a | probe-route dependent: landed deep-queue pipeline-gate overlap + union projectile sweep + alloc-scratch/memo/latch batch + probe GC boundary + COOP/COEP + getAppMetrics witness; agent stopped mid-lane |
| THE HAND lane session — flight/rope/fields/verbs/stunts/onboarding judgment + found-defect fixes | devin-lane-hand | STALE — adoptable (~2h) | `src/systems/masslineThrow.js`, `src/systems/tetherGameplay.js`, `src/systems/fields.js`, `src/systems/stuntGrammar.js`, `src/systems/onboarding.js` | per §3: judged implemented units live, work found gaps; flightV3.js/input.js under perf-lane claim — coordinating by exact path. Open ledger rows in this area at the time the writer went quiet: D87 (fields runtime-profile guard), D88 (tether:cutDenied no subscriber) |
| FIGHT+WORLD agentic run: Bay 7 place+scan, Kurtz desk, presence services, adventure kill shards, throwable mines, thrown explosive fuse, memorial thief, Choir berth memory, cookoff hop, yard crush debris, archive strip residue, kill-replay live hull | cursor-fight-world-run | STALE — adoptable (~3.5h); 11 slices landed, ~12 test files + system hunks still uncommitted in tree | `src/data/sectors.js`, `src/data/sectorAnchors.js`, `src/systems/story.js`, `src/ui/station/barContacts.js`, `src/ui/station/stationApp.js`, `src/ui/station/serviceQuotes.js`, `src/systems/aftermathWrecks.js`, `src/systems/mines.js`, `src/systems/lootShards.js`, `src/systems/uniqueWrecks.js`, `src/systems/memorialThief.js`, `src/data/worldOneOffs.js`, `src/combat/lightCookoff.js`, `src/systems/killReplay.js`, `test/helios-bay7-scan.test.mjs`, `test/kurtz-bar-desk.test.mjs`, `test/faction-presence-service-wire.test.mjs`, `test/adventure-kill-shard.test.mjs`, `test/seam-mines.test.mjs`, `test/thrown-explosive-proximity.test.mjs`, `test/memorial-thief.test.mjs`, `test/choir-berth-memory.test.mjs`, `test/light-cookoff-chain.test.mjs`, `test/b7-set-pieces.test.mjs`, `test/crucible-a-list.test.mjs`, `test/wave-b9-kill-replay.test.mjs` | adopt: run the new focused tests, commit by pathspec if green; 536afa04b already landed the impulseCharges.js hunk that was on this row's list (detonator recycled-id fix) — do not revert it |
| Object-interaction makeover: repair packet-A overkill wire (missing `_onCombatDamage` handler + mining consumer), review + land fracture/substance/verb packets | fight-interactions | repairing + landing | `src/systems/collisionConsequences.js`, `src/systems/mining.js` | add handler, wire overkill fracture path, focused test, baseline, pathspec commits |
| Board §1C wave-1 dispatch — rows 1–13 + 20–21 claimed to `devin-wave1` agents; orchestrator edits board/NOW only | devin-swarm | dispatching | `build_map.md` §1C, `design/program/NOW.md` | flip CLAIMED rows on claim, delete on landing; wave 2 = rows 19 + 22–25 after render files settle |
| Board §1C row 1 ADOPT-FIGHTWORLD — adopt the stale `cursor-fight-world-run` tree residue: inspect hunks, run focused tests, pathspec-commit per feature group | devin-w1-adopt-fw | LIVE | `src/data/sectors.js`, `src/data/sectorAnchors.js`, `src/systems/story.js`, `src/ui/station/barContacts.js`, `src/ui/station/stationApp.js`, `src/ui/station/serviceQuotes.js`, `src/systems/aftermathWrecks.js`, `src/systems/mines.js`, `src/systems/lootShards.js`, `src/systems/uniqueWrecks.js`, `src/systems/memorialThief.js`, `src/data/worldOneOffs.js`, `src/combat/lightCookoff.js`, `src/systems/killReplay.js`, `src/systems/missions.js`, `src/systems/traffic.js`, `test/helios-bay7-scan.test.mjs`, `test/kurtz-bar-desk.test.mjs`, `test/faction-presence-service-wire.test.mjs`, `test/adventure-kill-shard.test.mjs`, `test/seam-mines.test.mjs`, `test/thrown-explosive-proximity.test.mjs`, `test/memorial-thief.test.mjs`, `test/choir-berth-memory.test.mjs`, `test/light-cookoff-chain.test.mjs`, `test/b7-set-pieces.test.mjs`, `test/crucible-a-list.test.mjs`, `test/wave-b9-kill-replay.test.mjs`, `test/combat-doctrines.test.mjs`, `test/doctrine-fire-phases.test.mjs`, `test/mine-layer.test.mjs`, `build_map.md` §1C row 1, `design/program/NOW.md` | group hunks by feature; `node --test` each focused suite; pathspec-commit only green groups; never revert foreign hunks or `536afa04b` (impulseCharges fix) |
| Board §1C rows 2 + 9 + 11/12/13 — ADOPT-PERF (judge stale perf-lane hunks under `src/render/**`, commit coherent ones by pathspec) then D86 sigil GLSL, D74 `'patch'` reserved word, D85+D82 massline-arc reset + soft-card inventory | devin-w1-render | LIVE | `src/render/**` EXCEPT `src/render/renderer.js` (owned elsewhere) and `src/render/renderPackageManifest.js` (graphics lane); plus `src/render/vfxColorLightDirector.js`, `scripts/audit-color-lighting.mjs`, `docs/visual-assets/COLOR_LIGHTING_STANDARD.md`, `test/vfx-color-light-director.test.mjs`, `test/selection-sigil.test.mjs`, `scripts/capture-selection-sigil.mjs`, `scripts/selection-sigil-lab.html`, `scripts/capture-sigil-live.mjs`, `src/render/forceLanguage/sweptSurfaceBatch.js`, `docs/visual-assets/SOFT_CARD_INVENTORY.json`, `build_map.md` §1C, `design/program/DEMO_READINESS_2026-09-20.md` §6, `design/program/NOW.md` | per-hunk `git diff` judgment, focused tests, pathspec-commit each sub-task; delete landed board rows + ledger rows |


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
