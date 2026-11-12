# Foundry: earned recovery passage, 12 November 2026

Evidence baseline: [e20a7254](https://github.com/coldshalamov/SpaceFace/commit/e20a7254aa1be2f8eda3fa81a22c7d0add0d6954), existing PR #942. Research only; no gameplay change or acceptance of the whole act.

## Result and limits

A continuous native scripted run earned every clear from1 through13, chose to stay at the first exit, and ended alive in draft13: hull77.3702,14925credits,90370score. Final clear tick93693; admitted/resolved46/46, no live or pending Brood. Seed4242, Ricochet Runner, paid Fortify turrets and paid round4 upgrades. The runner used production boot, keyboard/mouse command-lane inputs and public draft/refit requests, not direct gameplay-state mutation. It read internal target state, so this is not novice usability or mounted-UI proof. Independent review confirmed those limits.

| Round | Start → clear tick | Active elapsed | First → last sampled hull |
|---|---|---|---|
| 11 | 63867 → 78053 | 236.43s | 260 → 260 |
| 12 | 78189 → 88625 | 173.93s | 260 → 77.37 |
| 13 | 88761 → 93693 | 82.20s | 77.37 → 77.37 |

No late Line events occurred. This combat route clears13 without demonstrating its intended throw lesson. Scrape does not require Line; generic collision/terrain kill receipts cannot establish that a selected Leecher was scraped off. No family-resolved earned latch/surface observation was captured.

Round12 preserves one sampled admitted ship through age1061, four by1181, with two Ghost sensor cues and first sampled Brood at701. This supports foreground then layered pressure, not exact spawn timing from samples. Round13 first sampled Brood is22 at age569: compatible with a missing-loose-mass fallback, **not proof** that fallback happened or that the lone-shell opening was validated.

No new pixels, audio review, human comprehension, Save/Continue, banking, extraction after staying, alternate seeds or rounds14–20 were demonstrated.

## Creative decision and reusable connections

Keep the connected recovery act in [swarmFoundryScore.js](../../src/data/swarmFoundryScore.js):11 recovers control through existing-bank scraping;12 leaves Ghost's charged line while Leecher pressure returns;13 uses surviving loose matter against a shell. Existing20-round scope is retained. [survivalWave.js](../../src/systems/survivalWave.js) owns the progression and foreground read windows.

The [Leecher planner](../../src/systems/swarmOpeningLeecher.js) and [Brood engine](../../src/systems/swarmBrood.js) reuse an original bank and native contact envelope. The [Glassback planner](../../src/systems/swarmOpeningGlassback.js) reuses eligible surviving mass rather than manufacturing a lesson prop. Existing [recovery tests](../../test/swarm-foundry-recovery.test.mjs) and [selected scrape native test](../../test/swarm-selected-scrape-native.test.mjs) remain isolated mechanic evidence, not substitutes for earned scene comprehension.

No concrete defect warrants a source patch from this run. Round12's hull loss identifies the next review focus, not a reason to nerf difficulty from one automated strategy. No missing model was established; preserve local model-makers' ownership.

## Next executable review

1. Inspect earned round12 damage intervals and cue readability before/after Leecher arrival.
2. Observe original bank identity, native eligibility, latch and scrape cause on the earned route; deliberately execute the scrape with ordinary movement.
3. Capture round13 planner selection/failure and surviving mass geometry, then deliberately throw eligible original matter and escape shards. Do not refill or replace lost terrain to force a successful lesson.
4. Obtain genuine rendered review of navigation, scale, lighting and cue composition before claiming these scenes communicate their verbs.

This advances connected-progression evidence for SF-GAME and the SF-WORLD-DIRECTION/SF-SECTOR-COHERENCE/SF-LIVING-WORLD acceptance work, without closing those goals.

## Evidence identity

Preserved review bundle: `swarm-earned-recovery-act-complete.tar.gz`, SHA256 `44e13ad65fa7c18c00a06908a985f444e47a27420e952b3df779ec69e587c2b3`.
Contains runner, raw trace, concise result, independent review and hashes.
Runner SHA256 `66534558c4ec63a5c841387f092240c06608c3943d5af581854a87b7884296c2`;
raw trace `107175ab2619654be8c1e00aae064d1d3e3fb9a4f779c31b2e59580ef8576d37`.
Backup was downloaded back and verified. It is supporting evidence, not deployment or merge acceptance.
