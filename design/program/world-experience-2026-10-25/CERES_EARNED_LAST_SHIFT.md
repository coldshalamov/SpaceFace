# Ceres Last Shift earned archive: dependent native acceptance draft

This candidate depends on open PR599 at 5ce922abc78e7c85f514d7aef5a1db9fc00fa29c. Do not merge before that dependency is integrated or explicitly reconciled. It targets master for the usual hosted CI, not PR599's branch. The two public parents are that reviewed dependency and master878409729c815a17e9959e488f715e89d2dd0cc2. The current Market and Missions UI changes remain intact.

## Incremental scope
Two NEW test files only, plus an append-only package leaf and this report/evidence. No production runtime changes beyond the explicitly inherited PR599 dependency.
- test/fixtures/ceres-earned-interventions-native.mjs
- test/ceres-earned-interventions.test.mjs
- check:ceres-earned-interventions runs node --test test/ceres-earned-interventions.test.mjs.
All previous package commands and their order are preserved. The native test retains its120000ms timeout. Actual current runner functions select the new reachable leaf once in static shard3/3 with the unchanged180000ms command cap. No workflow or runner changes; no receiver aggregate.

## What the fixture proves
Production createSimHost/newGameBoot runs the authoritative graph. Initial Ceres sector and arrival pose are configured BEFORE earning work, with empty Last Shift clues and receipts. Ordinary updates materialize three originals. The main projected fairlead, not the authority entity, is selected; KeyC crosses the input bridge and produces a real player-scanner pulse. Player and original fairlead retain their same live native records, physicsBodyNativeReady and valid Rapier bodies before and after scanning.

The real worker offer crosses to the main prompt. FILE returns through the bridge and produces exactly one fairlead archive receipt. Reusing the consumed card fails. Filing adds no credits or wallet event. The actual scan separately earned150 credits from survey_cartography, which is explicitly observed and accounted, not claimed as a FILE reward.

The earned archive then survives production enterSector RPCs to Helios and back to Ceres, with actual sector exit events delivered to main. These transitions teleport (continuous:false, noTeleport:false). This is receipt continuity, NOT Save/load or a flown journey.

## Evidence and limits
Frozen packet4a2184002a6e1163b47e5a89ac656d50ef1fc6f0 and full raw outpute857b572f611a4830cf7e7feb210add4a175a294 are retained beside this report. Author qualification: one native test passed, exit0, zero failures/skips/cancellations,2387.648991ms test process,1667 recorded loaded modules on public786ae6eb plus reviewed599 overlay. Current878 adds only the externally landed Missions UI changes; this newly assembled checkout has NOT yet passed hosted execution.

Independent fixture review confirms the scope and assertions; no additional native rerun was performed by the publisher. Headless prompt-deck substitute and in-process structured-cloned worker transport are intentional. No browser/OS-worker, Tally delivery, full campaign, Save/Continue, held receiver test, visual or complete-game acceptance is claimed. The separate failed Tally tow experiment is NOT included in this execution gate.

PR599's historical49 narrative and89 RUCKUS passes are dependency evidence, not passes on this new candidate. Its broader CI ended red with an incomplete comparison; this draft does not claim to repair those failures.
