<!-- LIFETIME: HISTORICAL -->
# PQ-045.target-motion-late-audit — receipt

```yaml
unit: PQ-045.target-motion-late-audit
resultCommit: ceae0456 (repair integrated on master; candidate commit 5caa0fc6 on fable/target-motion-audit)
date: 2026-08-10
worker: codex exec (isolated worktree at ebebc2d2), controller-reviewed and integrated
verdict: PASS
```

## What changed

- `src/systems/npcJobsRuntime.js`: target-ambiguity re-admission now requires the destroyed event's
  id to match a recorded ambiguous-target contender (`targetAmbiguousRefs`, recorded at ambiguity
  detection, cleared at every reset/resolve site).
- `test/pq045-late-audit-h1.test.mjs`, `test/pq045-late-audit-h2.test.mjs`: pinned regressions.

## Hypothesis outcomes

- **H1 — numeric entity-id reuse on release/sector-exit: DISMISSED.** Release and sector-exit keep
  cleanup bound to retained exact terminal actor identity; a same-numeric-id replacement keeps its
  `jobId` and `intent.brake`; `release()` and `_onSectorExit()` do not mutate it. Pinned by the H1
  test.
- **H2 — unrelated id-only same-type destroyed event causing target-ambiguity re-admission:
  REPRODUCED and repaired.** Mechanism: the pre-repair refresh path allowed re-admission on
  `targetAmbiguous && same type` without proving the destroyed payload named an ambiguous-target
  contender. The repair records contender refs and gates re-admission on an id match; an event
  naming an actual contender still re-admits the sole surviving target.

## What passed

- `node --test test/pq045-late-audit-h1.test.mjs test/pq045-late-audit-h2.test.mjs` — 2/2
  (worker run and independent controller re-run in the primary at the integration commit).
- `node --test test/ceres-activity-runtime-lifecycle.test.mjs` — 30/30 (worker run at candidate).
- `npm run check:baseline` — 11/11 green at the candidate.

## What remains unproven / excluded

- No headed/browser evidence — the unit is a bounded deterministic audit; none was budgeted.
- No broader lifecycle-matrix rerun (explicitly excluded by the unit's no-reopen rule).
- Entity refs retained in `targetAmbiguousRefs` are transient runtime state (not serialized) and
  are used only for id comparison; they clear on resolve/reset. Reviewed and accepted.
