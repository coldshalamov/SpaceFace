<!-- LIFETIME: VOLATILE -->
# NOW — threads changing the shared checkout

```yaml
refreshed: 2026-09-21
baseCommit: 190c2d3717f1cd3dda43651be424f7a841e3af70
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
| AQ-LIGHT foundry HDRI as image-based light (sky stays sector plate) | devin-aq-light | DONE c4a0294cf | `src/render/foundryEnvironment.js`, `src/render/renderer.js` (env-bake hunks, landed via 6381d57e7), `assets/background/env/`, `test/foundry-environment.test.mjs`, `vendor/addons/loaders/HDRLoader.js`, `NOTICE`, `design/program/NOW.md` | recorded, released |
| AQ-LOD whole-ship LOD: ranger lod1/lod2 real simplification | devin-aq-lod | DONE 38cbe05ef | `scripts/build-wholeship-lod.mjs`, `scripts/check-lod.mjs`, `scripts/lib/renderPackageCompiler.mjs`, `assets/ships/parts/wholeships/ranger_production_v1_lod{1,2}.glb`, `assets/ships/release/parts/wholeships/ranger_production_v1_lod{1,2}.glb`, `assets/ships/release/release_manifest.json`, `assets/ships/render-packages/pilots.json`, `assets/ships/release/render-packages/` (ranger lods + stale-set repair), `src/render/renderPackageManifest.js`, `test/ranger-wholeship-lod-quality.test.mjs`, `test/perf-submit-lod-archetype.test.mjs`, `design/program/DEMO_READINESS_2026-09-20.md` (D16, D17 rows) | recorded, released |
| AQ-CAS contrast-adaptive sharpen on below-res frames | devin-aq-cas | DONE e0f3c4236 | `src/render/cas.js`, `src/render/casHeaders.generated.js`, `src/render/bloom.js`, `src/render/renderer.js`, `scripts/build-cas-shader.mjs`, `test/cas-sharpen.test.mjs`, `vendor/fidelityfx-cas/` | recorded, released |
| INFERENCE catalog VERB-02 (opening raid already happening) | devin-inference-10 | DONE 0c4293e4d | `src/data/encounters/015-opening-hauler-raid.js`, `test/opening-hauler-raid-and-pursuit.test.mjs` | recorded, released |
| INFERENCE catalog WORLD-03 (Choir-Tender wreck on Helios chart) | devin-inference-10 | DONE 3e6ca5201 | `src/data/sectors.js`, `test/world-03-choir-tender-chart.test.mjs` | recorded, released |
| INFERENCE catalog INST-02 (comms fan matches power rail) | devin-inference-10 | DONE 5fb238ab7 | `styles/commsradial.css`, `test/inst-02-comms-fan-power-rail.test.mjs` | recorded, released |
| INFERENCE catalog VERB-03 (hitch hint on heavy hauler) | devin-inference-10 | DONE fb1c6484a | `src/systems/onboarding.js`, `test/verb-03-hitch-hint-heavy-hauler.test.mjs` | recorded, released |
| INFERENCE catalog WORLD-04 (Choir-Tender investigator) | devin-inference-10 | DONE eb8f3793c | `src/data/encounters/343-unique-wreck-choir-tender-investigator.js`, `src/systems/uniqueWreckEncounterScripts.js`, `src/systems/encounterScripts.js`, `src/data/uniqueWrecks.js`, `src/data/encounters/index.generated.js` | recorded, released |
| INFERENCE catalog INST-04 (prompt deck matches flight cluster) | devin-inference-10 | DONE dc6d7d696 | `styles/prompt-deck.css`, `test/inst-04-prompt-deck-flight-cluster.test.mjs` | recorded, released |
| INFERENCE catalog PIC-08 (shove-kill schedule cause) | devin-catalog-grunt | DONE 26732571a | `src/systems/masslineThrow.js`, `src/systems/collisionConsequences.js`, `test/entity-killed-presentation-receipt.test.mjs` | recorded, released |
| INFERENCE catalog TOOL-02 (hover and tab are different recordings) | devin-catalog-grunt | DONE df4d6bd90 | `assets/audio/ui/ui_hover.wav`, `assets/audio/ui/ui_tab.wav`, `src/audio/sampleLibrary.js`, `src/data/audioRecipes.js`, `assets/reference/cc0/PROVENANCE.md`, `test/audio-ui-hover-tab.test.mjs` | recorded, released |
| Ten seam-polish fixes (user-requested cracks sweep) | devin-polish-ten | DONE 1d1d1c23e | `src/ui/input.js`, `src/ui/promptDeck.js`, `src/ui/screens/sandbox.js`, `src/ui/uiPrimitives.js`, `src/ui/hud.js`, `src/ui/commandBar.js`, `src/ui/galaxyMap.js`, `src/ui/screens/settings.js`, `src/ui/listControls.js`, `src/ui/bandHud.js`, `test/prompt-deck.test.mjs` | recorded, released |
| B1 (§22.4): hours 1–10 still pay — income curve, encounters still spawn after hour 4 | zcode-gaprow-B1 | MUTATING | `src/systems/economy.js`, `src/systems/encounterDirector.js`, `test/b1-hours-income-encounter-supply.test.mjs` | derived-model fixture prints income > 0 post-hour-1 and hours-5–9 supply > 0 on seeds 4242 and 8008, then pathspec commit |




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
