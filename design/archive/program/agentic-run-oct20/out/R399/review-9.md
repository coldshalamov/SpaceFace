VERDICT: FINDINGS

1. [MAJOR] src/data/worldOneOffs.js:707 - The Held Note can advertise “ready” when the fitted ship cannot deploy its required decoy. `fieldDeployFor()` selects the largest-radius countermeasure; the deployment owner selects the first fitted countermeasure. Reproduction: seed 4242, legal Hawser fitted with `mod_chaff_dispenser_m` before `mod_decoy_buoy_s`; scan the Held Note, then press countermeasure without an inbound missile. Scratch output: card `"Your Signal Decoy Buoy S throws it — ready."`, `deployed:[]`, denial `{kind:"chaff",reason:"no_lock"}`. Fix: make capability evaluation use the deployment owner’s selection rule and add this mixed-fit regression.

TESTS:

- `node --test test/al-long-1-revisit-4242.test.mjs` — **16 pass / 0 fail**. Round 8’s MAJOR is fixed: both selectors use the fitted radius, and the regression exercises both paths.
- `node --test test/al-lg-capability-doors.test.mjs test/grok-disc-discovery.test.mjs test/seam-scan-reveal.test.mjs test/scanner-signal-investigation.test.mjs test/world-one-offs.test.mjs test/lg-tow-predict.test.mjs test/massline-elastic-whip-head.test.mjs test/massline-elastic-whip-snap.test.mjs test/countermeasure-denied-readiness.test.mjs test/m2-world-records.test.mjs` — **85 pass / 0 fail**.
- `node --test "$env:TEMP/r399-r9-probes.test.mjs"` — **0 pass / 1 fail**, reproducing finding 1.
- `node --experimental-loader $reviewLoaderUri --test --test-name-pattern="eight authored" test/al-long-1-revisit-4242.test.mjs`, substituting HEAD’s `worldOneOffs.js` — **0 pass / 1 expected failure**: missing authored requirement.
- Same loader command, pattern `"head-qualified line door cannot"`, substituting HEAD’s `shipCapabilities.js` — **0 pass / 1 expected failure**: starter incorrectly accepted.
- Same loader command, pattern `"door verdict survives the production route"`, substituting HEAD’s `signalInvestigationPrompt.js` — **0 pass / 1 expected failure**: capability card absent.
- `node "$env:TEMP/r399-r8-scope.mjs"` — **25 checks pass / 0 fail**: supplied patch matches live files, remains inside `files.txt`, and contains no protected paths.

UNVERIFIED: Browser/Electron/GPU presentation; historical execution counts and baseline-failure attribution in `report.md`.

