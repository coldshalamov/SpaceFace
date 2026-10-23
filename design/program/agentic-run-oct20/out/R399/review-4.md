VERDICT: FINDINGS

1. [MAJOR] src/systems/scanReveal.js:1327 — Round-3 item 3 remains partly unresolved: adding SF-174 changes unrelated lessons’ navigation and trackability. `bundle()` prioritizes SF-174 over SF-170/177/179/172. Reproduction: materialize Ceres, place the starter 40 WU beside its abandoned tug, and scan. The previously untrackable Strut Shrine return becomes trackable; Track emits `ui:setCourse` to the tug **(-13648, 9052)** instead of the shrine **(-12408, 9952)**. SF-177’s action position is also replaced. The new test checks `row.pos`, whereas navigation reads `discovery.actionPos`; report.md’s “every row’s Track target stays” claim is false. The same checks pass with HEAD’s scanReveal substituted. Fix: preserve each lesson’s original action position and trackability when appending capability text, and assert the emitted course.

2. [MINOR] src/systems/scanReveal.js:1364 — Nearest-subject selection leaves cached verdicts on discarded candidates. Reproduction: scan beside the ordinary Spare Keg; the earlier-visited Great Tanker retains an enumerable `_part` containing its capability verdict. Only the final winner’s property is deleted. A scratch assertion also fails when the farther candidate is visited first; HEAD passes. Fix: keep the candidate’s part in a local `bestPart` variable instead of writing onto live entities.

TESTS:

- `node --test test/al-long-1-revisit-4242.test.mjs` — **12 pass / 0 fail**.
- `node --test test/al-lg-capability-doors.test.mjs test/grok-disc-discovery.test.mjs test/seam-scan-reveal.test.mjs test/scanner-signal-investigation.test.mjs test/world-one-offs.test.mjs test/lg-tow-predict.test.mjs test/massline-elastic-whip-head.test.mjs test/massline-elastic-whip-snap.test.mjs test/countermeasure-denied-readiness.test.mjs test/m2-world-records.test.mjs` — **85 pass / 0 fail**.
- `node $env:TEMP/r399-r4-bootstrap.mjs` — three feature-removal mutations: **0 pass / 1 expected failure each**, at catalog requirements, head admission and presented verdict assertions. Additional scratch checks: **1 pass / 1 fail**.
- `node --test --test-name-pattern='review: Ceres|review: all discovery' <temp>/routes.test.mjs` — **0 pass / 2 fail**.
- HEAD-substituted selector/navigation checks — **3 pass / 0 fail**. Initial `--import` invocation had **0 pass / 1 startup failure** from Windows path syntax; corrected to a file URL.
- `node <temp>/scope-check.mjs` — **7 pass / 0 fail**: supplied patch matches live files; all paths allowed and unprotected.

Scratch directory: `C:\Users\93rob\AppData\Local\Temp\r399-r4-GnhjAl`.

UNVERIFIED: Browser/Electron/GPU presentation; historical baseline and 154-test claims. Round-3 items 1–2 are resolved by LEAD AMENDMENT 1 and were not reopened.