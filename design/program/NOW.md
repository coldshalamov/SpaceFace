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
| W-BOOKS-0-2 (build_map row 533) — Books 0–2 play per 06_CAMPAIGN_SCRIPT | devin-w533 | active 2026-10-25 | `src/story/campaign47a/{campaignData,campaignTransitions,embodiedMissions,index}.js`, `src/systems/{missionStoryOps,missionObjectiveOps,missions}.js`, `src/data/missions.js`, `src/systems/furnaceIntake.js` (new), `test/w533-books-0-2.test.mjs` (new), `test/{contract-47a-b1-followup,campaign47a-b2-rescue-experience,story-campaign47a,story-campaign47a-embodied-missions}.test.mjs`, `build_map.md` cell 533, `design/program/LANDED_REVIEW.md`, `design/program/attention/w533-progress.md` | rewire B0–B2 as ordered script-mission lists (Skim scene, alloy run+Scale 4+Infested Hauler, Cinder Board+Compost Run+Nest+Elroy) → focused test → board cell → pathspec commit+push → LANDED_REVIEW row |
| INFERENCE 50 catalog packets | grok-inf50 | DONE 2026-10-25 — adopted by devin-lanec | (adoption) all 50 claimed catalog rows resolved: 43 SHIPPED + AL-LG-04 SHIPPED @ e3711912bc (landed by the board-400 AL-LONG-2 commit during adoption) + AL-HF-04 already-true + AL-LG-12 cut + SEED-SE-02/SEED-SE-05/SEED-PC-04/SEED-WL-05 blocked; 36/37 `test/inf50-*` files green | leftovers are foreign, not inf50: build-map row 394 rival-anchor/takedown slice stays dirty in `src/ai/racingDriver.js`, `src/missions/racingOpponents.js`, `src/ui/racingRecognition.js`, `src/ui/racingHud.js`, `src/data/racingSetPieces.js` — it breaks `test/racing-set-pieces.test.mjs` (Mira stalls at the anchor gate; row-394 owner must finish or revert); `src/systems/vignetteInterpreter.js`, `scripts/build-lived-vignettes.mjs`, `src/data/flavor/020-ad-board.js`/`030-graffiti.js`, `src/data/raceLevels.js`, `src/ui/targetPanel.js` carry live foreign hunks — preserved; SEED-SW-02 pin drift logged as inference-memory defect |
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
<!-- devin-ten-bm22 stale-closed 2026-10-24 by devin-acct3: 1610+ min no progress; nothing from the packet landed. Build-map rows 399/423/462/459/463/472/475/394/395/452/444 remain OPEN and reclaimable by dispatch; per-row plans stay at agentic-run-oct20/out/R<row>/plan.md; claimed write-set dirty hunks stay protected by dirtiness. -->
<!-- devin-30-oct23 closed 2026-10-23 — landed rows 546, 270, 461, 471, 479, 473, 498+499, O23 beta identity, W-BLOOM-LOW engine laws (507 slice); codex adversarial review over the landed range returned 9 findings, all fixed in 75e483cf01; everything pushed to origin/master; checkpoint released. Rows short of the 30 target: the orphaned-hunk well ran dry — remaining open rows are multi-day surfaces (501 W-HEADS, 500 W-PROVENANCE) or foreign-lane territory. -->
<!-- claude-beta-oct23 stale-closed 2026-10-24 by devin-acct3: 1170+ min no local progress; clone C:/Users/93rob/Documents/GitHub/SpaceFace-beta untouched today, last commit 2026-10-23 — preserved there with its dirty work. Its listed landed reviews/ledger rows/board rows revert to their own ledgers (several already closed by other agents). Its named files here are unclaimed again; foreign dirty hunks on them stay protected by dirtiness. -->
<!-- zcode-a34 stale-closed 2026-10-24 by devin-acct3: 1100+ min no progress; writer dead. W1 write set (~30 paths: ai/*, combat/*, render/massline*, swarmArenaLadder, swarmArena additive, rockCore/terrainAnchors, test/zc-a34-*) remains uncommitted in-tree — preserved by dirty-file rules and adoptable under whichever board row owns each file; the full row text is in this file history. Its 34 §33-menu items stay tracked there, not here. -->
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

| Original thirty-row continuation | codex-bm30-oct23 | DONE — adopted stale lane and landed its pending units; checkpoint .codex/agent-checkpoints/BM30-CONT-OCT23.json | Published19 full rows; root447/471/466 source paths released. Adopted 2026-10-25 and landed: 464+450 d13289ff70 (sector laws, wonders, landmark background, interdiction bearing HUD); 430 5da188cfe0 (Clips collector, authored-place replay, ten score phrases); 436 bfea03251b (station life + bay traffic); 498/499 5f0aad109c (class hardware + strain readout; vfx.js landed via filtered hunks — Row-492 held-annulus/radiance hunks preserved foreign-dirty); 400 e3711912bc (reckoning callbacks + B7 boards); 409 dadfda4b3f (ambient caption inventory). 402 already DONE 21fbbd1c40; 466 already DONE; 410 DONE afd3bca234 (four-locale first-hour overlay + per-locale glossary). Remaining: none | Complete original thirty existing rows; 466 full closure waits402; no unchanged403 recount |
<!-- Coordination 2026-10-23T14:40Z to devin-ten-oct23: 464/450 already implemented by codex-bm30-oct23/world_396. Exact dirty environmentalMachinery.js and sectorVisualProfiles.js hunks are this continuation, preserving the foreign Helios change. Please do not rebuild or overwrite; BM30-CONT-OCT23 checkpoint owns final checks and publication. Your other ten-row paths remain disjoint. -->

<!-- 2026-10-23T14:54Z to claude-beta-oct23 (owns scripts/check-ui-screen-imports.mjs): baseline fails its HUD import literal check because hud.js now validly imports { BINDINGS, promptLabel }, while predicate requires exact { BINDINGS }. All key label uses remain present; adjust import recognition without weakening binding coverage. Root preserves your protected checker file. -->
<!-- codex-bm30-oct23 466 continuation: owns only src/ui/screens/industryReadout.js next-step copy + test/fb-industry-one-readout.test.mjs; existing capped income, named rocks and physical rescue preserved. Full row closure waits on world_396 row402 canonical recipe unification. -->
<!-- 2026-10-23 coordination to current vfx.js writer (thermalMark/mining-colour/station-broadcast hunks): codex-bm30-oct23/audio_404 is implementing498/499 in clean helper files and preserving your37-line diff. Please publish your finished vfx.js work before their tiny Line heat/class lifecycle hooks land, or name your exact boundary here. No current-date checkpoint identifies your path ownership. -->
| INFERENCE+world session — catalog claims, §34 seams, attention/experience units, pulse rows | devin-infworld | active 2026-10-25 | design/program/INFERENCE_IDEAS.md, src/data/factions/**, src/data/encounters/**, design/program/attention/**, src/systems/story.js | per-owner spec: inference lines + faction-strange/places-people/campaign seams + attention/experience units + pulse rows; per-agent NOW rows per packet |
| Experience-program audit-then-finish (X-01…X-09) | devin-expu | DONE 2026-10-25 | design/program/experience/** | all nine units verified fully landed: each impl-note stamped complete-with-evidence (sha + green focused test + residual-closure lines); no genuinely-unfinished named sub-scope remained — all unlanded draft scope was adjudicated at plan time (rejected/spliced/parked as non-goal) |
| D254 dead fill tails — raise fill append cap so every reservoir line is live | devin-prod1 | DONE 2026-10-25 — cap removed, corpus 1344→1399, WAVs regenerated | src/data/barkSituationFill.js, test/bark-fill-reachability.test.mjs, design/program/DEMO_READINESS_2026-09-20.md | land fix + ledger row deletion |
| Attention-unit survey + finish unlanded seams (ATT rows) | devin-attu | DONE 2026-10-25 | landed ff8ea0c5b2 (8 vignette a2x inserts + 10 mail letters); attention/*.md row notes | survey complete — report filed to caller |
| TERRITORY B — adopt dead zcode-inf20 claims: PULSE-07 rim-POI lore join, EXP-12 status, SEED-SC-08/15 postcard hulks | devin-infb | active 2026-10-25 | `tools/blender/forge/ships/place_rhea_slag_hauler.py`+`place_proteus_funnel.py` (new), `tools/blender/forge/fleet.json`, `src/render/partsLibrary.js`, `assets/ships/parts/parts_manifest.json`, `assets/ships/parts/places/place_rhea_slag_hauler.glb`+`place_proteus_funnel.glb`, `assets/ships/release/parts/places/`+`release_manifest.json`, `assets/ships/render-packages/pilots.json`+new package dirs, `src/render/renderPackageManifest.js`+`src/data/modelTruthCensus.json` (generated), `src/data/frontierRegions/north.js`+`east.js`, `design/program/INFERENCE_IDEAS.md` cells SEED-SC-08/SEED-SC-15 only, `design/program/LANDED_REVIEW.md`, `design/program/attention/infb-progress.md` | PULSE-07/EXP-12 already SHIPPED by earlier devin-infb sessions — re-verified only; SEED-SC-08/15: forge build → release → pilot → landmarkGlb swap → focused test → pathspec commit+push → inference-record + LANDED_REVIEW row |
|| TERRITORY A — adopt dead zcode-inf20 code/data claims; verify-then-mark landed lines | devin-infa | DONE 2026-10-25 — finished by adopting subagent | landed 24134c54af (AL-LG-10 deedResaleQuote + AL-LG-11 bound ram plate + both focused tests) and 299346d578 (SEED-ST-01 dial-gloss eyebrow follow-through); catalog cells all 8 lines SHIPPED (6 already-true verified: AL-HF-07 4ea9ddc8da, SEED-SW-16 e3d9e2edde, SEED-ST-02 0f8fbabd57, ST-04 b6b5e68681, ST-05 380324d1d2); 2 LANDED_REVIEW rows + 3 inference records; foreign newGame.js/new-gameLayouts.js hunks preserved dirty | strand complete — report in design/program/attention/infa-progress.md |
| D256 localize bark fill tails — T localized rows for fill-tail lines in es-ES/fr-FR/de-DE/pt-BR | devin-d256 | DONE 2026-10-25 — landed 64715aa33c | `src/localization/barks.js`, `design/program/DEMO_READINESS_2026-09-20.md` (D256 row deleted), `design/program/LANDED_REVIEW.md`, `design/program/NOW.md` | 928 fill-tail R() rows authored per faction register → parity [] → pq-166-02 green → row deleted → pathspec commit+push |
| faction-art seam — rows 495/512/514/543 (rock family, station kits, hull kits, portrait pools) | devin-fart | active 2026-10-25 | `tools/blender/forge/rock_family.py` + `tools/blender/forge/ships/place_rock_*.py` + faction-variant `ships/*.py` + `var_station_*` (new), `tools/blender/forge/fleet.json`, `assets/ships/parts/parts_manifest.json`, `assets/ships/release/` + `release_manifest.json`, `assets/ships/render-packages/pilots.json`, `src/render/renderPackageManifest.js` + `src/data/modelTruthCensus.{json,generated.js}` (generated; preserve devin-infb rows), `src/render/partsLibrary.js` (faction-kit + overlay maps, additive), `src/data/swarmArenaLadder.js` + `src/data/claimableBodies.js` (placeId rows, additive), `src/data/localPortraits.js` + `src/data/portraits.js` + `assets/portraits/**`, `build_map.md` cells 495/512/514/543, `design/program/LANDED_REVIEW.md`, `design/program/attention/fart-progress.md` | one row at a time: 495 → 514 → 512 → 543; per row: forge build → publish.mjs promotion → focused tests → pathspec commit+push → LANDED_REVIEW row + honest board cell |
| Encounters stranding recovery — RC-459 physical-ask packet (stranded ~10:08, dead lane) | devin-encr | DONE 2026-10-25 — landed `9d65866e15` + pushed | (released) 30 regenerated modules + script + interpreter + rc459 test (tail finished: snub-pilot leg on the stranded real-tow test); stale ambient count fix `67cd85266c`; review row `85846f22c4` | progress note: `design/program/attention/encr-progress.md`; foreign leftovers preserved: `src/ai/maneuver.js` brake hunk (breaks vignette-navigation — owner lane must finish), `test/encounter-barks.test.mjs` cap hunk |
