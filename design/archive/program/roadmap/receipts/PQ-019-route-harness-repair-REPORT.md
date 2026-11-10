<!-- LIFETIME: EVIDENCE -->
# PQ-019C route-harness repair report

```yaml
packet: PQ-019
dispatchUnit: PQ-019.route-harness-repair
lifecycleClaim: focused_green
acceptanceClaim: unproven
disposition: PASS
headedBrowserLaunched: false
headedElectronLaunched: false
performanceEvidenceClaimed: false
```

## Recorded failure

H1 row 4 retained a valid real-GPU DOM-abandon route and lawful-observe route, then stopped at
`waitForCapsule()`. The old helper used one uninstrumented 20-second wall-clock timeout and observed
only whether a live capsule existed. It did not retain simulation time, tick, time scale, launch
schedule, launch receipt, mission-heist state, or a competing terminal receipt. A slowed or paused
simulation could therefore be mislabeled as a missing product launch.

The seconds-scale regression was added before the implementation. It initially failed at module
instantiation because the simulation-state classifier did not exist. The pinned old fingerprint now
proves that 20 wall seconds at `timeScale: 0.1`, with only two simulation seconds elapsed and a
four-second launch schedule, remains `pending`.

## Repair

- `waitForCapsule(page, missionId)` now samples the authoritative simulation clock, tick, time scale,
  mode, facility schedule and receipt, tracked mission-heist launch fields, terminal arbiter receipt,
  and the live capsule identity.
- A pure manifest classifier returns `pending`, `ready`, `terminal_race`, or `launch_missed`.
  It never accepts wall time as product-failure evidence.
- The 45-second wall deadline is only a harness-stall guard. If reached, it reports the latest bounded
  simulation snapshot and its still-pending verdict rather than inventing a missing-launch result.
- A real terminal receipt wins the race over a capsule observation. A missing capsule becomes a
  product-facing failure only after the scheduled launch plus one simulation second of grace.
- Successful waits append their simulation-bound snapshot and verdict to the H1 trace, so a future
  broker receipt can show why the route advanced.

No gameplay owner, tuning value, acceptance artifact, or existing H1 evidence was changed.

## Focused evidence

- Red characterization: `node --test test/pq019-surface-heist-manifest.test.mjs` — FAIL at import,
  missing `PQ019_CAPSULE_LAUNCH_GRACE_S`.
- `node --test test/pq019-surface-heist-manifest.test.mjs` — PASS, 11/11.
- `npm run check:pq019c:mission` — PASS, 65/65.
- `npm run check:pq019b:seams` — PASS, 91/91.
- `npm run check:pq019a:facility-embodiment` — PASS, 19/19.
- `node --check scripts/probe-pq019-surface-heist.mjs` — PASS.
- `node --check scripts/validation-manifests/pq019-surface-heist.mjs` — PASS.

## Honest residual

This repair unit did not spend another broker claim and proves no new Browser, Electron, GPU,
performance, accessibility, visual-quality, or human-review result. H1 may rerun the missing terminal
routes only after the remaining independent headless harness repairs are committed. The prior H1
surviving evidence remains valid and should not be repeated without a bounded reason.
