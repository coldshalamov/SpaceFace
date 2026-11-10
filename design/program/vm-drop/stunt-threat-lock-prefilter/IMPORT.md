# IMPORT — stunt-threat-lock-prefilter

Apply `patches/0001-perf-combat-stunt-threat-lock-prefilter.patch` onto master or
stacked tip after #40 `stunt-threat-index-lanes`.

Single file: `src/combat/stuntFlightEvidence.js`.

Verify: `node --test test/stunt-combo.test.mjs test/stunt-taxonomy.test.mjs test/pq-155-03-stunts-pay.test.mjs`
