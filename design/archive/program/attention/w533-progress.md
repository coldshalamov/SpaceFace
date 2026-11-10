# W-BOOKS-0-2 (build_map row 533) — progress

**Agent:** devin-w533 (campaign-seam implementer, third session — adopted predecessor's live row)
**Unit:** Books 0–2 play per `design/expansion/06_CAMPAIGN_SCRIPT.md` (§34.7)

## Findings (verified against working tree)

- **Predecessor diff in flight (adopted, preserved):** `campaignData.js` rewrote B0–B2 steps
  to the 06 script lists (mine→skim→dock; alloy_run→scale_4→infested;
  cinder→compost→nest→elroy) with `match`/`matchSignals`/`contractId` step fields;
  `campaignTransitions.js` added `stepMatchesPayload`; `embodiedMissions.js` added
  `bookContracts` per-step offers (B1: alloy_run+infested, B2: cinder+elroy);
  `missionBoardOps.js` passes `state` to `buildMissionBoardContract`; `lifeLedger.js` +1 line.
- **Gaps confirmed:** `story:skimResolved` has NO emitter (B0 softlocks: dock step requiresPrior
  skim). `bookContracts` never read — `buildMissionBoardContract` returns null for beats 1–2,
  so NOTHING posts on the live board (board sweep pulls all campaign47a offers = dead route).
  New world signals (`kesslerPod:weighed`, `understory:*`, `encounter:resolved`) never reach
  `recordBeatStep` — no subscriptions. `_advanceEmbodiedStoryMission` only accepts one
  storyTag per beat. Live `STORY_BEATS` B1/B2 still old set-piece rows (knock/pull).
- **Already real and reusable:** Kessler pad (Tethys, plateFactor 0.94 → `variance:true` on
  any pod), Rook's booth pad (Charon, emits `rookWreck:delivered`), Understory gardens
  (`gardenFed{byPlayer}`/`compostRunComplete`), the_nest encounter 705 (`encounter:resolved`
  `shape:'the_nest'`), Elroy bounty machinery (`_resolveContract47aB2`, scan→CIVILIAN flicker,
  MEDICINE graffiti), CR-FEED machine chew cycle.

## Implementation (in progress)

1. `embodiedMissions.js`: `buildMissionBoardContract` selects next pending book contract from
   sidecar step log (first incomplete ordered step carrying a `contractId`).
2. `missionStoryOps.js`: `_advanceEmbodiedStoryMission` accepts book tags; legacy set-piece
   contracts fill the beat's remaining steps (new `completeBeatStepsForTag` path);
   `_recordCampaignBookSignal` routes world signals → recordBeatStep + advance + board refresh;
   Skim scene (`_stepContract47aSkim` in update + `_resolveContract47aSkimForDock` fallback) —
   emits exact kill-feed lines + 12.4t strain + `story:skimResolved`.
3. `missions.js`: bus subscriptions for the 8 book signals; dock hook before `_storyTrigger('dock')`;
   update hook; `sampleRecoveredAt` stamp (missionObjectiveOps).
4. `src/systems/furnaceIntake.js` (new): Ceres intake beacon eats flung pods/rocks → `furnace:fed`;
   compound extras (`furnaceFeedsNeeded`, `rookDeliveryNeeded`) gate patrol_clear completion.
5. `data/missions.js`: STORY_BEATS B1/B2 → weigh/hunt book-list objectives; PQ032 table → B3 only.
6. Tests: new `test/w533-books-0-2.test.mjs`; update stale
   (story-campaign47a-embodied-missions, pq-032-00, contract-47a-b1-followup,
   campaign47a-b2-rescue-experience→legacy, story-campaign47a, story-campaign47a-live helpers).
7. NOW row already present (devin-w533); board cell → DONE w/ sha; LANDED_REVIEW row; push.

## 2026-10-25 — regression sweep green, landing

- story-spine-memory.test.mjs fully migrated: B0 records mine→skim→dock; B1/B2 driven by authored book signals (alloy_run→scale_4→infested, cinder→compost→nest→elroy); miss/scar tests repointed to the surviving two-method set piece (B3 tow); legacy knock/pod vocabulary now exercised via completeBeatStepsForLegacy.
- Real gaps fixed (not just test text): completeBeatStepsForLegacy now files a step_progress receipt + spine note (berth ledger was blind to legacy fills); SCAR[1]/[2] + FAIL_SPEECH[1]/[2] rewritten in book language; STEP_SPEECH added for book step ids + skim; VERB_SPEECH fallback for verb-bearing receipts; filedHalev gained burn branches.
- Sweep: 15 files, 48 tests, all pass (w533 focused + campaign47a + spine-route/memory + b1-followup + b2-investigation + pq-032 + weakpoints + embodied-{save,dialogue,missions} + m5-public-route).
- player-truth --mode=adventure --gate running at time of note.
