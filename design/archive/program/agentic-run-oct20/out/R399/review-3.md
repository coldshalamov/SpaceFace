VERDICT: FINDINGS

1. [MAJOR] test/al-long-1-revisit-4242.test.mjs:460 — Round-2 finding 2 remains unresolved: the required physical tow check was replaced with comparisons against the same rating function the door reads. Reproduction using the existing propulsion-kernel harness, actual starter fittings, 90 t Spare Keg and 90 ticks: starter **48.30 WU/s**, accepted Hawser **40.55 WU/s**; neither meets the approved **60 WU/s** bar. Fix: establish a common physical criterion that demonstrates the transition, or explicitly amend the approved scope and defer this outcome.

2. [MAJOR] src/data/worldOneOffs.js:393 — Round-2 finding 3 remains incomplete against the approved plan. The catalog contains six tow requirements, one line requirement and one field requirement; the test explicitly expects three kinds. The report now acknowledges deferred slam coverage, but `plan.md` still requires all four kinds and has no amendment permitting this deferral. Fix: deliver the supported slam outcome or reconcile the approved scope with the explicitly incomplete requirement.

3. [MINOR] src/systems/scanReveal.js:1369 — Appending a body-specific verdict to an unrelated archive lesson separates the displayed capability from its action. Reproduction: scan the Disputed Keg with the accepted whip fit, then choose Track. The prompt says “Your whip holds — ready,” but the course targets **(11644.424, 7173.206)** rather than the keg at **(11408, 7182)**. Additionally, the first eligible wreck in Map insertion order supplies every lesson’s verdict when multiple doors overlap. Fix: preserve the capability subject’s identity and destination in a dedicated result/action; keep unrelated lesson navigation separate.

TESTS:

- `node --test test/al-long-1-revisit-4242.test.mjs` — **11 pass / 0 fail**. Round-2 finding 1’s distance fix passes at 1,300 and 2,150 WU.
- `node --test test/al-lg-capability-doors.test.mjs test/grok-disc-discovery.test.mjs test/seam-scan-reveal.test.mjs test/scanner-signal-investigation.test.mjs test/world-one-offs.test.mjs test/lg-tow-predict.test.mjs test/massline-elastic-whip-head.test.mjs test/massline-elastic-whip-snap.test.mjs test/countermeasure-denied-readiness.test.mjs test/m2-world-records.test.mjs` — **85 pass / 0 fail**.
- `node …/r399-review-Pgm4r9/run-mutations.mjs` — HEAD substitution for catalog, capability helper and scan integration: **each 0 pass / 1 expected failure**, at the relevant assertion. Initial loader invocation had three startup failures; corrected before collecting these results.
- `node --test --test-name-pattern=review: …/r399-review-Pgm4r9/routes.test.mjs` — **0 pass / 2 fail**: tracking destination and overlapping-door scenarios.
- `node --test --test-name-pattern="review: real Spare" …/r399-review-Pgm4r9/routes.test.mjs` — **1 pass / 0 fail**.
- `node --test …/r399-review-Pgm4r9/tow.test.mjs` — **0 pass / 1 fail**, reproducing item 1.
- `node --test --test-name-pattern="review: two actual" …/r399-review-Pgm4r9/routes.test.mjs` — **0 pass / 1 fail**: overlapping actual authored bodies after repositioning.

UNVERIFIED: Browser/render presentation; earned hours-10–25 progression; historical baseline results and their claimed foreign-change attribution.