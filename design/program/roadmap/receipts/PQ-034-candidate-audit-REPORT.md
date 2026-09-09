<!-- LIFETIME: EVIDENCE -->
# PQ-034 candidate-audit report

```yaml
packet: PQ-034
dispatchUnit: PQ-034.candidate-audit
auditBase: bb59685d59c08fdd1cf59549f0a5e63c783be75b
protectedCandidateRef: claude/perf00-20260727
protectedCandidateTip: dce03987dcf070bab3889494a691cc3893a79b81
integrationTipBeforeReceipt: 757402b335df49fb6c69541e47e6904b7b2adc17
acceptedCandidateCommit: e28082e67b371d695995b8525ddd1ce1773a3fa6
acceptedIntegrationCommit: 9b1a2d7f27e6ee6301c30935689f83d9d0e0d622
lifecycleClaim: integrated
acceptanceClaim: focused_green
disposition: PASS
protectedWorktreeMutated: false
performanceEvidenceClaimed: false
browserElectronEvidenceClaimed: false
```

## Commit-by-commit disposition

| Candidate | Disposition | Current-master ruling |
|---|---|---|
| `ed1df0d7` | `reject` | Bundles several render/product optimizations outside the evidence-harness write set and has no current native shader-link or context-recovery proof. Synthetic warmups are retained only as protected donor material. |
| `1d71964a` | `revise` | Link-event quiescence and peak provenance are useful, but the private draw wrapper and local `peakFrame` do not bind the required common display/render-frame identity. |
| `fb44ceb8` | `reject` | Promotes p50/p99 from the final 180-sample ring as long-horizon PQ-025 owner truth. A 30/90-minute qualification needs full-window semantics and a wraparound regression. |
| `24610f39` | `revise` | Bounded first-fault diagnostics are useful, but the patch depends on rejected context, omits coordinator-level labeling, and needs current PQ-040 owner reproduction before integration. |
| `e28082e6` | `accept` | Adds p99.9 and strict greater-than-two-times-median hitch counts from the complete raw closure window. The validator recomputes the values, and the focused closure contract passes on current master. |
| `81788ba5` | `revise` | PMREM ownership is plausible, but the source-string test does not exercise `_bakeEnv`, the patch depends on `24610f39`, and no unsolicited-upload failure was reproduced on current master. |
| `9a725a6d` | `revise` | Fail-closed query counts/drain concepts are useful, but queries have no monotonic query ID or immutable display-frame/render-frame origin, so this patch cannot authorize GPU timing evidence. |
| `0bc61347` | `reject` | Unmeasured comet texture admission is a product/resource optimization, not PQ-034 evidence authority, and lacks a bounded cold/visible/context-restore WebGL proof. |
| `760d42ab` | `reject` | Resets projectile smoke cadence to stabilize counts, changing cosmetic output to suit the harness without a reproduced player-visible defect. |
| `dce03987` | `reject` | Creates a second 3,160-line Playwright runner and partial matrix rather than extending the existing driver/runtime matrix. It can exit successfully with only 2/16 routes runnable and lacks the required Electron pair, baseline/candidate alternation, and separated equivalence/validity/improvement authority. |

The rejected/revise commits were mechanically trial-integrated and then reverted before publication.
The cumulative production/test diff from `auditBase` therefore contains only the accepted
`e28082e6` change. The protected candidate branch and its clean worktree remain unchanged and
available for narrow future donor review.

## Focused evidence

Entry at `bb59685d`:

- `npm run check:perf-counters` — PASS, 29/29.
- `npm run check:perf-packets` — PASS, 39/39.
- `npm run check:baseline` — PASS, 10/10 in 45.479 seconds.
- `node scripts/check-program-docs.mjs` — PASS, zero warnings.

Current-master candidate audit:

- `node --test test/performance-attribution.test.mjs test/performance-closure-contracts.test.mjs test/pq025-acceptance-contracts.test.mjs` — PASS, 81/81 during trial integration.
- Accepted lane exit: `node --test test/performance-closure-contracts.test.mjs test/performance-final-acceptance.test.mjs test/performance-closure-probe-contract.test.mjs` — PASS, 21/21.
- `npm run check:perf-counters` — PASS, 29/29.
- `npm run check:perf-packets` — PASS, 39/39.
- `npm run check:baseline` — PASS, 10/10 in 39.736 seconds.
- `node scripts/check-program-docs.mjs` — PASS, zero warnings.

## Residuals owned by `PQ-034.native-closure`

- Implement GPU query terminal identity with monotonic query ID plus immutable
  display-frame/render-frame origin and delayed/drop/disjoint/context-loss/nested-refusal coverage.
- Extend the existing `performanceScenarioDriver` and runtime-parameterized attribution route; do
  not revive `probe-perf-scenario.mjs` as a parallel authority.
- Add path-safe tracked manifest discovery and paired Browser/Electron closure manifests.
- Preserve distinct equivalence, measurement-validity, and improvement verdicts.
- Run matched native evidence only after the independent harness-repair units are closed and the
  exact `browser-gpu`, `performance-evidence`, and `validation-broker` mutexes are claimed.
