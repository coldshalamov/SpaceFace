VERDICT: FINDINGS

1. [BLOCKING] test/al-long-1-revisit-4242.test.mjs:95 — The presentation harness omits registered `spectrum`, hiding a real-route failure. Reproduction: seed 4242, starter fit, 40 WU beside the Disputed Keg, scan and advance two ticks with `[scanner, spectrum, scanReveal]`. Scanner publishes the capability refusal, then Spectrum overwrites the same prompt with **“FAINT · 0 WU · PASS 1 — Occluded. move and pulse again”**. The final displayed detail contains no capability verdict; the scratch assertion fails. `spectrum/index.js:131` publishes after scanner, and `promptDeck.js:705` replaces the existing decision. Fix: preserve the capability verdict through the final scan publication or a separate visible decision, and include Spectrum in the presentation regression.

TESTS:

- `node --test test/al-long-1-revisit-4242.test.mjs` — **12 pass / 0 fail**.
- `node --test test/al-lg-capability-doors.test.mjs test/grok-disc-discovery.test.mjs test/seam-scan-reveal.test.mjs test/scanner-signal-investigation.test.mjs test/world-one-offs.test.mjs test/lg-tow-predict.test.mjs test/massline-elastic-whip-head.test.mjs test/massline-elastic-whip-snap.test.mjs test/countermeasure-denied-readiness.test.mjs test/m2-world-records.test.mjs` — **85 pass / 0 fail**.
- `node $env:TEMP/r399-r4-bootstrap.mjs` — three HEAD-substitution mutations: **0 pass / 1 expected failure each**, detecting removed catalog requirements, head admission and presented verdict; scratch route/selector checks **2 pass / 0 fail**.
- `node --test --test-name-pattern='review: Ceres|review: all discovery' $env:TEMP/r399-r4-GnhjAl/routes.test.mjs` — **2 pass / 0 fail**; round-4 navigation finding resolved.
- `node $env:TEMP/r399-r4-GnhjAl/scope-check.mjs` — **7 pass / 0 fail**.
- `node $env:TEMP/r399-r5-spectrum-bootstrap.mjs` — **0 pass / 1 fail**, reproducing the prompt overwrite. Earlier selector check also confirms round-4’s `_part` leak is resolved.

UNVERIFIED: Browser/Electron/GPU presentation; historical baseline and 154-test claims. Slam, physical tow-bar and earned hour-10–25 access remain deferred under LEAD AMENDMENT 1.