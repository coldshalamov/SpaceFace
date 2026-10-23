VERDICT: FINDINGS

1. [MAJOR] src/ui/signalInvestigationPrompt.js:137 - Round 6’s cap fix still loses doors when the capped result contains a subset of the uncapped verdicts. Reproduction: seed 4242, actual starter fit, player 120 WU from the authored Spare Keg and 1626 WU from the authored Tanker; add five nearer ordinary wrecks, pulse, advance two ticks with `[scanner, spectrum, scanReveal]`. `scan:capabilityVerdicts` correctly includes both doors. The subsequent capped scanner batch includes only the Spare Keg, and `showResults()` replaces `signal:capability` with that subset. The final card loses the Tanker. Scratch assertion fails. Fix: make the dedicated event authoritative for that pulse; prevent capped-list extraction from replacing its complete verdict set. Add this two-door regression.

TESTS:

- `node --test test/al-long-1-revisit-4242.test.mjs` — **14 pass / 0 fail**, including round 6’s original crowded case and teardown.
- `node --test test/al-lg-capability-doors.test.mjs test/grok-disc-discovery.test.mjs test/seam-scan-reveal.test.mjs test/scanner-signal-investigation.test.mjs test/world-one-offs.test.mjs test/lg-tow-predict.test.mjs test/massline-elastic-whip-head.test.mjs test/massline-elastic-whip-snap.test.mjs test/countermeasure-denied-readiness.test.mjs test/m2-world-records.test.mjs` — **85 pass / 0 fail**.
- Both commands initially aborted during import: **0/1**, **0/10**, respectively. The unrelated `lineProgression` manifest lacked its clock declaration; another lane subsequently added it.
- Temporary loader runs isolating that import failure — **14/0**, **85/0**. Initial loader setup attempt: **0/1**, invalid Windows import URL.
- HEAD-substitution mutations for catalog requirements, head qualification, and capability presentation — **0 pass / 1 expected failure each**. Assertions respectively detect missing requirements, incorrect starter acceptance, and missing capability cards.
- Dedicated-event deletion mutation — **0 pass / 1 expected failure**.
- Temporary multi-door probes, including the authored Helios pair — **0 pass / 1 fail each**, reproducing finding 1.
- `node $env:TEMP/r399-r7-scope.mjs` — **24 checks pass / 0 fail**; supplied patch matches live files; no protected paths included.

UNVERIFIED: Browser/Electron/GPU presentation; historical baseline failure fingerprints and previous-round counts. Slam, physical tow thresholds, and earned hour-10–25 access remain explicitly deferred.