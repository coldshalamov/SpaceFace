VERDICT: FINDINGS

1. [MAJOR] src/systems/scanReveal.js:104 - The uncapped verdict event excludes doors that an upgraded scanner actually reveals. Its fixed 2,200 WU cutoff ignores `sensorRadiusMultForScan(state)`; `nearbyCapabilityPart` repeats this at line 1415. Reproduction: seed 4242, legal Hawser fit with `unique_deepsurvey_suite`, player 2,600 WU from the authored Tanker, six nearer ordinary wrecks, `[scanner, spectrum, scanReveal]`, pulse and advance two ticks. Scratch output: `realReveal:"identified"`, `realVerdict:"not yet"`, but the final capability card names only the Spare Keg. The Tanker verdict disappears. Fix: use the actual fitted reveal radius for both selections and add this crowded, upgraded-scanner regression.

TESTS:

- `node --test test/al-long-1-revisit-4242.test.mjs` — **15 pass / 0 fail**. Round 7’s earlier MAJOR is fixed: code preserves the complete set, and its capped-subset regression passes.
- `node --test test/al-lg-capability-doors.test.mjs test/grok-disc-discovery.test.mjs test/seam-scan-reveal.test.mjs test/scanner-signal-investigation.test.mjs test/world-one-offs.test.mjs test/lg-tow-predict.test.mjs test/massline-elastic-whip-head.test.mjs test/massline-elastic-whip-snap.test.mjs test/countermeasure-denied-readiness.test.mjs test/m2-world-records.test.mjs` — **85 pass / 0 fail**.
- `node --test "$env:TEMP/r399-r8-probes.test.mjs"` — **0 pass / 1 fail**, reproducing finding 1. Initial attempt also failed **0/1** because the scratch fixture omitted `data.fittings`; corrected before the reported reproduction.
- `node --experimental-loader $reviewLoaderUri --test --test-name-pattern="eight authored" test/al-long-1-revisit-4242.test.mjs`, substituting HEAD’s catalog — **0 pass / 1 expected failure**: missing authored requirement.
- Same loader command with pattern `"head-qualified line door cannot"`, substituting HEAD’s capability owner — **0 pass / 1 expected failure**: starter incorrectly accepted.
- Same loader command with pattern `"door verdict survives the production route"`, substituting HEAD’s prompt adapter — **0 pass / 1 expected failure**: capability card missing. These demonstrate three assertions detect deleted feature code.
- Initial loader invocations using a Windows path instead of a file URL — **0/1 each**, three import aborts before assertions.
- `node "$env:TEMP/r399-r8-scope.mjs"` — **25 checks pass / 0 fail**: supplied patch matches live files, stays within `files.txt`, and includes no protected paths.

UNVERIFIED: Browser/Electron/GPU presentation; historical baseline failure attribution and previous-round execution counts in `report.md`.