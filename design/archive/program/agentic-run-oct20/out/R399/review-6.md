VERDICT: FINDINGS

1. [MAJOR] src/ui/signalInvestigationPrompt.js:80 — Capability verdicts disappear when the scanner’s six-result cap excludes the door. Reproduction: seed 4242, starter fit, 500 WU beside the Tanker; spawn six ordinary wrecks 20–120 WU from the player, pulse, advance two ticks with `[scanner, spectrum, scanReveal]`. The Tanker’s SF-174 says `"not yet"`, but all six published rows describe nearer wrecks and `signal:capability` is absent. Fix: deliver capability verdicts independently of the capped signal list and add this crowded-scan regression. Round 5’s Spectrum overwrite itself is fixed.

2. [MINOR] src/ui/signalInvestigationPrompt.js:237 — `destroy()` leaves the capability decision alive, contradicting report.md:186. Reproduction: offer a capability result, call `destroy()`; the deck still contains `"signal:capability"`. The scratch assertion fails. Fix: resolve owned decisions during teardown and test cleanup.

TESTS:

- `node --test test/al-long-1-revisit-4242.test.mjs` — **13 pass / 0 fail**.
- `node --test test/al-lg-capability-doors.test.mjs test/grok-disc-discovery.test.mjs test/seam-scan-reveal.test.mjs test/scanner-signal-investigation.test.mjs test/world-one-offs.test.mjs test/lg-tow-predict.test.mjs test/massline-elastic-whip-head.test.mjs test/massline-elastic-whip-snap.test.mjs test/countermeasure-denied-readiness.test.mjs test/m2-world-records.test.mjs` — **85 pass / 0 fail**.
- `node $env:TEMP/r399-round6-checks.mjs` — three HEAD-substitution mutations, **0 pass / 1 expected failure each**: missing requirements, missing head qualification, missing capability presentation. Preliminary raw-diff comparison failed; source equality subsequently verified by blob hashes.
- `node $env:TEMP/r399-round6-bootstrap.mjs` — eight route probes completed; no assertion counts.
- `node $env:TEMP/r399-round6-edge.mjs` — **0 pass / 2 fail**, reproducing findings above.
- `node $env:TEMP/r399-round6-scope.mjs` — **30 checks passed / 1 failed**: report text differs from its patch blob.
- `node $env:TEMP/r399-round6-final-scope.mjs` — **26 pass / 0 fail**; all five source/test files match the supplied patch; no protected paths included.

UNVERIFIED: Browser/Electron/GPU presentation; historical baseline-failure attribution and earlier expanded-suite counts. Slam, physical tow thresholds, and earned hour-10–25 access remain explicitly deferred.