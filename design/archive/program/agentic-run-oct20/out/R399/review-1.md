VERDICT: FINDINGS

1. [BLOCKING] src/data/worldOneOffs.js:162 - The Disputed Keg’s verdict does not reach the displayed scan prompt. Reproduction: materialize the authored keg, scan from 40 WU away, refit starter → enabled Whip → starter, waiting past cooldown each time. Its signal changes “not yet” → “ready” → “not yet”, but `payload.primary` remains `signal:discovery:SF-169`. `signalInvestigationPrompt.js:22` displays only that primary customs lesson. The new test searches `signals[]`, bypassing this failure. Fix: make the keg’s lesson reachable through the displayed scan UI and assert the presented result.

2. [BLOCKING] src/data/worldOneOffs.js:392 - Both new slam doors describe a capability distinction absent from the player route. Production-enabled `physics:impact` receipts at 75/90 WU/s route wreck damage but **zero player damage** for both starter and Mule: `collisionConsequences.js:341` explicitly skips the player. Moreover, test line 437 substitutes `type:'ship'` for the actual wreck. Changing only that fixture type to `wreck` fails: Mule damage is approximately **207/200**, contradicting its survival assertion. Fix: validate the actual wreck/player collision route and implement a supported capability-dependent outcome, or defer these doors; retain the real entity type in the test.

3. [MAJOR] test/al-long-1-revisit-4242.test.mjs:410 - The tow check replaces the required common 1.5-second window with five seconds for acceptance. Concrete kernel results for Spare Keg: starter/Hawser reach **48.30/40.55 WU/s at 1.5 seconds**, and **161.00/254.21 at five seconds**. Neither passes the original acceptance window; both pass the replacement window. Thus the test does not establish its claimed “where the starter cannot” outcome. Fix: compare both fits against the same agreed physical criterion and resolve the unsupported door claim before counting it complete.

4. [MAJOR] test/al-long-1-revisit-4242.test.mjs:489 - The release-energy assertion passes without releasing anything. In an OS-temp copy, replacing `runtime.cutAttachment(...)` with literal `true` leaves the test **1 pass / 0 fail**. Continued spring acceleration satisfies `delta > 0`. Fix: assert attachment removal and isolate the release response from continued attached motion, using a matched control or immediate native velocity measurement.

TESTS:

- `node --test test/al-long-1-revisit-4242.test.mjs` — **11 pass / 0 fail**.
- `node --test test/al-lg-capability-doors.test.mjs test/grok-disc-discovery.test.mjs test/seam-scan-reveal.test.mjs test/scanner-signal-investigation.test.mjs test/world-one-offs.test.mjs test/lg-tow-predict.test.mjs test/massline-elastic-whip-head.test.mjs test/massline-elastic-whip-snap.test.mjs test/countermeasure-denied-readiness.test.mjs test/m2-world-records.test.mjs` — **85 pass / 0 fail**.
- Temp `no-cut.test.mjs`, `--test-name-pattern="line: a stretched"` — **1 pass / 0 fail**, exposing finding 4.
- Temp `real-wreck.test.mjs`, `--test-name-pattern="slam: the authored"` — **0 pass / 1 fail**, exposing finding 2.
- HEAD-substitution loader, separately targeting assertions at lines **159, 299, 360** — each **0 pass / 1 fail**, confirming sensitivity to catalog additions, head qualification, and tow-neighbor rejection respectively.
- Temp `routes.test.mjs`, `--test-name-pattern="review: live-route"` — **1 pass / 0 fail**; printed primary-selection and tow measurements.
- Temp `player-route.test.mjs`, `--test-name-pattern="review: player"` — final **1 pass / 0 fail** with production flags and a combat-writer spy.
- Scratch setup failures: four loader startup failures; one collision-harness failure before enabling production flags. Corrected before using their results.

UNVERIFIED: Browser/render presentation; the explicitly deferred earned hours-10–25 progression; reported baseline results and their foreign-change attribution were not independently reproduced.