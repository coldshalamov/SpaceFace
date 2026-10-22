# Original-section Drift guidance r4 recovery

RECOVERY ONLY. This additive folder preserves the reviewed six-path r4 delta and verifies all 14 cumulative intake/guidance outputs. It does not change runtime files, integrate a PR, merge, deploy, or establish ordinary gameplay acceptance. Existing radio, r2 and r3 artifacts are unchanged.

## Restore and test

In a separate clean clone, follow ../coherent-radio/README.md, ../drift-intake-r2/README.md, then ../drift-return-r3/README.md, in that order. Their verified final recovery parent is 519f3c4dbf7d6dcfee0fd5844f4ad41d54c42389. The original radio source base is bcfdd4730a74c2b79b6e53e3bd7111d6d2ec1dc3, tree 707320df59191f596616b9741c79586fd817e386. Do not apply frozen full owner files over current master or another contributor's changes.

Run `python3 /absolute/path/to/drift-guidance-r4/restore.py /absolute/path/to/restored-clone`. The script checks patch and original manifest hashes, all 14 exact r3 baseline bytes, applies the six-path delta, and checks all 14 final bytes. No dependency installation or tests run automatically. candidate.patch includes the complete new guidance unit/diagnostic tests and the amended full return test. outputs.json contains r3 baseline and final hashes; source-manifest.json preserves the original radio-base manifest.

After normal repository dependencies are available, run these individual leaves sequentially:
- `node --test test/pallas-drift-guidance.test.mjs`
- `node --test test/pallas-drift-guidance-diagnostic.test.mjs`
- `node --test test/pallas-drift-return.test.mjs`

The latter two write to unique temporary evidence directories by default. Never run test/anvil-receiver-delivery.test.mjs or an aggregate containing it as part of this restoration.

## Reviewed results

Final frozen source passed seven focused cases, one fresh native route, and one full production departure/return, transaction, Continue and interference test. Recorded test logs are included; publication does not rerun or replace them.

The fresh haul took 211.9333 seconds after transfer and travelled 1741.8930 WU. Carrier and section peak speeds were 17.9826 and 20.1888 WU/s. Zero sampled active authored-reef/live-crew-cone membership ticks were recorded. Minimum conservative station envelope clearance was 0.7734 WU. Earlier same-harness baseline took 171.5167 seconds and peaked at 70.8648 WU/s with 194 active reef ticks: the safer route is slower, not faster. Early genuine body contacts remain recorded, so this is not a collision-free claim.

The final returned route commits at simulation time 292.6333. Exact commit evidence records scrap +3, electronics +1, unchanged wallet and cargo, empty original source pool, equal source/economy receipts and duplicate no-op. Save invalidates current native observation: the instrumented first attempt correctly rejects source-not-at-intake with conservation, then the next production tick commits. No freshness guard was weakened. Original custody and physical travel survive actual departure, return, Continue, control interruption and line-break checks.

## Limits and retained failed evidence

The earlier escape attempt failed by expecting immediate success after Save. The earlier final attempt reached physical intake/conservation then exposed a test helper API typo. Both failed logs remain under evidence; neither is claimed as a final-source failure. All 19 MB raw route samples and multi-megabyte saves are not included here. This folder includes source/test restoration artifacts, final test success logs, preserved failed-attempt logs and the published-renderer assertion diagnostic only. All generated simulation-state JSON is omitted, including fresh admission, geometry, contact chronology, summaries, measured traces and detailed return-state snapshots, because snapshot publication approval remains unresolved. The included tests reproduce fresh synthetic evidence; full recorded captures remain separately preserved.

No ordinary player-camera, mobile, performance, universal turning-arc or all-dynamic-obstacle acceptance is claimed. Existing roof/rim occlusion and the larger reef/cutter/tug/carrier visual expansion remain open.

## Runtime integration blocker

A diagnostic using exact published PR488 VFX (e7f6122f8d8f2985223940bfbb60eb4f66272561) with the existing reef cutting-vitals regression fails at spawn: one generic emission occurs where zero is required. Current master 53e32775ecd450992e0d8cea34a670b66c52cdf9 VFX blob a69b2de9cff7dc211bd06d11c73130743ce8eea4 likewise lacks the authenticated reef cutter handler. Merely omitting the unpublished renderer changes would break the truthful-presentation contract. The missing behavior is exact cutter/target-life authentication and bypass of generic work/contact/reaction emissions in favor of the genuine clamp-cut cue. No regression was removed or weakened.

Master is 99 commits ahead of PR488 with overlapping owners, so integration requires reviewed reconciliation rather than copying frozen files. This recovery commit is not that integration. The old missing shipjack.js blocker is resolved on the inspected master. No runtime branch changes were made by this recovery delivery.
