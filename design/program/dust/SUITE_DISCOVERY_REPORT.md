# Latent test-suite discovery report (DUST P7 / BS-9a)

Generated 2026-10-31T15:31:53.871Z by `node scripts/dust-suite-discover.mjs --run --limit 15 --budget 480000 --out design/program/dust/SUITE_DISCOVERY_REPORT.md` (node v24.15.0).

Report-only census of `test/**/*.test.mjs` files not wired into any package.json script.
It gates nothing and does not modify the check chain. Matching rules: exact script-string
path (R1), shell-glob expansion (R2), whole-test-dir reference (R3) — see the header of
`scripts/dust-suite-discover.mjs`.

## Population

| measure | count |
|---|---|
| total `test/**/*.test.mjs` | 4957 |
| routed (referenced by an npm script) | 709 |
| unrouted (latent) | 4248 |
| routed via exact path / glob / dir | 672 / 37 / 0 |

Observed but not counted or run: 1 test/**/*.test.js, 1 test/**/*.spec.mjs.

### Unrouted size distribution (lines)

| bucket | files |
|---|---|
| <100 lines | 1338 |
| 100-499 | 2618 |
| 500-1999 | 288 |
| >=2000 | 4 |

## Run sample

Ran 15 unrouted file(s) with `node --test <file>`, per-file timeout 60s, wall-clock budget 8 min.

| outcome | files |
|---|---|
| pass | 15 |
| fail | 0 |
| timeout | 0 |
| error | 0 |
| not-run | 0 |

| outcome | seconds | file |
|---|---|---|
| pass | 1.0 | test/47a-doctrine-staging.test.mjs |
| pass | 1.4 | test/47a-handoff-beacon-stationary.test.mjs |
| pass | 3.5 | test/47a-jurisdiction-engagement.test.mjs |
| pass | 4.5 | test/accessibility-settings-parity.test.mjs |
| pass | 2.8 | test/action-vfx.test.mjs |
| pass | 1.6 | test/activity-broken-attachment-continuation.test.mjs |
| pass | 0.4 | test/activity-scheduler-lifecycle.test.mjs |
| pass | 1.1 | test/activity-scheduler.test.mjs |
| pass | 0.5 | test/adaptive-quality-controller.test.mjs |
| pass | 0.7 | test/advanced-micro-motion.test.mjs |
| pass | 2.3 | test/adventure-kill-shard.test.mjs |
| pass | 2.3 | test/adventure-migration.test.mjs |
| pass | 3.7 | test/adventure-speed-contracts.test.mjs |
| pass | 7.2 | test/adventure-speed-set-pieces.test.mjs |
| pass | 5.3 | test/adversarial-combat-feel.test.mjs |

Estimated full latent-set serial runtime from this sample: ~3.0 h (2545 ms/file mean over 15 files; timeout-capped files skew this low).

---

This artifact informs Finish T1 manifest-runner work; it does not replace it and gates nothing.
