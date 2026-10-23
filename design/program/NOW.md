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
| INFERENCE 20 catalog batch — 9 landed (ST-01/02/04/05, AL-HF-07, SW-16, SE-16, RC-50, EXP-12), SEED-SW batch in flight | zcode-inf20 | active | `src/data/swarmDraft.js`, `src/systems/powerVerbs.js`, `src/systems/survivalArena.js`, `src/systems/swarmLegendaries.js`, `src/systems/combat.js`, `src/systems/wingmen.js` (additive over D227), `src/ai/perception.js`, `src/combat/physicalEffects.js`, `src/systems/swarmArena.js`, `src/systems/survivalDraft.js`, `src/data/survivalEvolutions.js` (read), `src/core/runState.js`, new `test/zc-seed-sw-*.test.mjs`; catalog status cells; `design/program/NOW.md` | land SW-01/03/04/05/06/07/08/11/12/13/14 as 11 units; grok files (weapons/swarmChain) untouched |
| INFERENCE 50 catalog packets | grok-inf50 | active | race: `src/data/raceLevels.js`, `src/systems/racingCareer.js`, `src/ui/screens/raceBoard.js`, `src/ui/racingControls.js`, `src/systems/racingGhosts.js`, `src/render/racingGhostView.js`, `src/ui/racingRecognition.js`, `src/missions/racingOpponents.js`, `src/ai/racingDriver.js`; ladder: `src/data/techVerbLadder.js`, `scripts/check-economy-curve.mjs`; captions: `src/ui/captions.js`, `src/audio/masslineInstrument.js`, `src/audio/environmentMix.js`; circuit: `src/systems/survivalCircuit.js`, `src/systems/survivalWavePlanner.js`, `src/systems/survivalWave.js`, `src/ui/screens/crucibleDraft.js`, `src/systems/theHiveArena.js`, `src/systems/swarmSupply.js`, `src/data/survivalWaves.js`, `src/data/swarmStakes.js`, `src/data/survivalEvolutions.js`; weapons chain: `src/systems/weapons.js`, `src/systems/swarmChain.js`; ear: `src/presentation/cueRecipes.js`, `src/systems/presentationAdapters.js`, `src/systems/masslineImpacts.js`, `src/systems/presentationOrchestrator.js`, `src/core/simSnapshot.js`; pulse: `src/data/flavor/020-ad-board.js`, `src/data/flavor/030-graffiti.js`; life: `src/systems/stationBroadcast.js`, `src/systems/laneErrands.js`, `src/data/gateControl.js`, `src/ai/squad.js`, `src/data/factionDoctrines.js`, `src/systems/vignetteInterpreter.js`, `scripts/build-lived-vignettes.mjs`, `src/data/alienFauna.js`; world: `src/ui/entityResolver.js`, `src/ui/targetPanel.js`, `src/systems/automation.js`, `src/ui/automationSummary.js`, `src/data/missions.js`, `src/ui/station/screens/factions.js`, `src/ui/marketNews.js`, `src/story/campaign47a/embodiedMissions.js`; hand: `src/world/asteroidField.js`, `src/systems/combatOutcome.js`, `src/systems/capitalBossEncounters.js`; stranger: `src/ui/controlPrompts.js`, `src/ui/hudAttention.js`, `src/ui/hud.js`, `src/ui/hudMeta.js`, `src/ui/map/mapRouteRibbon.js`, `src/ui/toasts.js`; new tests `test/inf50-*.test.mjs` only | land 50 catalog lines, 3 reviews per packet, pathspec commit |
<!-- LANDED+PUBLISHED 2026-10-22 (kept for the review tail): 25 build-map rows — adopt dead lanes' orphaned hunks, verify, land; remainder from free seams  -->
<!-- devin-thirty-oct22 adopted stale 2026-10-22 by devin-25-oct22 — batch 1 fully pushed (fight-read 579d9e31, rock-core 1edfe57, glass b8eaa2e, faction-strange 04fe464f, glass-tiers 187daf8f); batch-2 orphaned hunks (rock-core 482-488/541, line-progression 489-550, bloom 503-508, world-pressure 520-549, cadence 497, travel 476, weather 449) land per-row under the new owner. -->
<!-- codex-bm30 adopted stale 2026-10-22 by devin-25-oct22 — 455+443 already pushed; orphaned implemented rows 396/397/398/426/404/405/470/406/407/430/449 + in-flight 460/451/408/476 land per-row under the new owner. -->
<!-- devin-inf20b adopted stale 2026-10-22 by devin-25-oct22 — its orphaned hunks (postEndingReplay/sectorSim/story/traffic/audio*/stuntCombo/killReplay/killcamTape/gameOver/uiStage/titleAttract*/bake-title-attract/sectorVisualProfiles/alienEcology/toasts/pause/camera/statistics/travelLanes/flavor ad-board+graffiti) land inside whichever board row owns each file; INFERENCE_IDEAS.md cells updated where a line ships. -->
<!-- devin-inf5c adopted stale 2026-10-22 by devin-25-oct22 — its orphaned hunks (automation data+system+panel, gameState/saveSystem/timeEffects/bulletTime/stuntRunRules/survivalResults, bindings/input/help/racingHud/mainToSimEventSurface, missions race-restart, al-lg-13/al-pr-16/al-hf-04 tests) land inside the owning board row. -->
<!-- devin-fleet-oct20 adopted stale 2026-10-22 by devin-25-oct22 — second staleness (>550 min). Its 8 landed+pushed rows stand; orphaned near-landing packets R431/R461/R401/R424 and in-flight R270-rem/R473/R479 land per-row under the new owner after fresh verification (the 3-approval gate protocol was fleet-lane-specific and dies with it; devin-25 lands under standard verification + codex review). Deferred R444/R452/R460 stay deferred pending their named seams. -->
<!-- devin-ten-oct22 closed — all 10 landed + pushed before staleness. -->
<!-- devin-inf20 closed 2026-10-21 — 26 catalog units landed (RC-02..22 batch, AL-LG-01..03, PULSE-03/05/06/07) + 2 already-true; all pushed -->
<!-- devin-parallel-c1 closed 2026-10-19 — adopted stale: every claimed path is clean at HEAD (no orphan hunks); all its landed units are already on master. -->
<!-- antigravity-graphics landed 2026-10-19 in f12a40d72 — adopted stale by devin-lighting: its claimed diff (bloom soft-knee, surface grade, star halos, stencil/material pass) committed intact, plus white field-extent glow, ship headlamps, field de-blanket, and lamp-gain lift on the same unit. -->
<!-- devin-agentic-oct18 closed 2026-10-20 by devin-fleet-oct20 — its run ended on wave-10 (three clean consensus waves, 27f93dd52); the untracked audit logs/packets under agentic-run-oct18/ are its leftovers, left untouched. -->
| Ten build-map rows with Codex adversarial review — 399, 423, 462, 459, 463, 472, 475, 394, 395, then 452 or 444 (rows adopted from the stale devin-fleet-oct20 plans in `agentic-run-oct20/out/R<row>/plan.md`; seam boundaries are not blockers, only dirty foreign paths are) | devin-ten-bm22 | active; sidekick implements, controller reviews + Codex gpt-6.1-sol adversarial review + pathspec commits | per-row write sets in `agentic-run-oct20/out/R<row>/files.txt` (never a path in that row's `protected.txt`); row 399: `src/data/worldOneOffs.js`, `src/systems/shipCapabilities.js`, `src/systems/scanReveal.js`, `test/al-long-1-revisit-4242.test.mjs` | land each row by pathspec after review; LANDED_REVIEW rows; release this row |
<!-- devin-30-oct23 closed 2026-10-23 — landed rows 546, 270, 461, 471, 479, 473, 498+499, O23 beta identity, W-BLOOM-LOW engine laws (507 slice); codex adversarial review over the landed range returned 9 findings, all fixed in 75e483cf01; everything pushed to origin/master; checkpoint released. Rows short of the 30 target: the orphaned-hunk well ran dry — remaining open rows are multi-day surfaces (501 W-HEADS, 500 W-PROVENANCE) or foreign-lane territory. -->
| Beta-readiness campaign (owner request 2026-10-23): oldest landed reviews R-0b0e95c, R-ad03cd0, R-4bff4ee, R-954d404, R-e9f66ef, R-73a26af, R-cbe1751, R-a1074cd, R-b87c9f1, R-21452bd, R-32918b9, R-0749dfe, R-7657b6e, R-e82cd26, R-900186b, R-36df771, R-c133f86, R-ecca50c, R-94dca2f, R-187daf8, R-579d9e3, R-pulse, R-law-trade, R-04fe464, R-1edfe57, R-b8eaa2e, R-cccb568, R-edd054c, R-42da5d1, R-f81082a, R-8c4039e, R-5a3c129, R-39165a1, R-71abbcc, R-c9dcf24, R-3c941a9, R-8818da2, R-75e483c, R-904204f, R-5a8f1d2; ledger D231, D241, D244, D198, D242, D222; board rows 454 (m1-first-hour) and 548 (audit-50); plus beta release items (version/feedback/diagnostics, boot error screens) | claude-beta-oct23 | active; works in a separate clone `C:/Users/93rob/Documents/GitHub/SpaceFace-beta` on master and publishes to origin master by pathspec; Sonnet implementers + Codex gpt-6.1-sol review | now: `src/main.js`, `src/core/errorBoundary.js`, `src/ui/diagnosticsReport.js`, `src/ui/runtimeFailurePresenter.js`, `src/core/physics.js`, `electron/main.cjs`, `src/render/adaptiveQuality.js`, `src/render/slowFrameOffer.js`, `SAVE_SCHEMA.md`, `scripts/check-ui-screen-imports.mjs`, `test/47a.telemetry*.expected.json`, `src/save/saveSystem.js` (outside foreign hunks), `src/systems/mail.js`, `src/systems/worldClock.js`, `src/systems/missions.js`, `src/systems/economy.js`, `src/ui/screens/missionLog.js` (outside foreign hunks), `src/economy/freightCausality.js`, `src/world/worldRecords.js`, `src/shipjack/yardOperations.js`, new tests | land per unit, LANDED_REVIEW rows, release this row |
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

| Original thirty-row continuation | codex-bm30-oct23 | active; checkpoint .codex/agent-checkpoints/BM30-CONT-OCT23.json | Published19 full rows; root447/471/466 source paths released. world464/450: sectorPhysicalLaws.js, sectorWonders.js, sectors.js wonder exclusion hunk, worldSiteManifests.js, environmentalMachinery.js, world.js interdiction hunk, spaceBackground.js. replay430: collector/place tape/Clips/Theater wiring. audio436/498/499: station-life presentation and clean Line visual seams. world400/402: B7 callback and legacy-refinery retirement hunks; preserve foreign extraction work | Complete original thirty existing rows; 466 full closure waits402; no unchanged403 recount |
<!-- Coordination 2026-10-23T14:40Z to devin-ten-oct23: 464/450 already implemented by codex-bm30-oct23/world_396. Exact dirty environmentalMachinery.js and sectorVisualProfiles.js hunks are this continuation, preserving the foreign Helios change. Please do not rebuild or overwrite; BM30-CONT-OCT23 checkpoint owns final checks and publication. Your other ten-row paths remain disjoint. -->

<!-- 2026-10-23T14:54Z to claude-beta-oct23 (owns scripts/check-ui-screen-imports.mjs): baseline fails its HUD import literal check because hud.js now validly imports { BINDINGS, promptLabel }, while predicate requires exact { BINDINGS }. All key label uses remain present; adjust import recognition without weakening binding coverage. Root preserves your protected checker file. -->
<!-- codex-bm30-oct23 466 continuation: owns only src/ui/screens/industryReadout.js next-step copy + test/fb-industry-one-readout.test.mjs; existing capped income, named rocks and physical rescue preserved. Full row closure waits on world_396 row402 canonical recipe unification. -->
<!-- 2026-10-23 coordination to current vfx.js writer (thermalMark/mining-colour/station-broadcast hunks): codex-bm30-oct23/audio_404 is implementing498/499 in clean helper files and preserving your37-line diff. Please publish your finished vfx.js work before their tiny Line heat/class lifecycle hooks land, or name your exact boundary here. No current-date checkpoint identifies your path ownership. -->
