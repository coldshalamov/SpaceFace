<!-- LIFETIME: EVIDENCE -->
# PQ-019A capsule-capture repair report

```yaml
packet: PQ-019
dispatchUnit: PQ-019.capsule-capture-repair
lifecycleClaim: focused_green
acceptanceClaim: unproven
disposition: PASS
headedBrowserLaunched: false
headedElectronLaunched: false
performanceEvidenceClaimed: false
```

## Recorded failure

H1 row 3 retained valid authored-facility/count evidence, but all three in-flight capsule projections
were offscreen: close `(4.386, 6.727)`, default `(4.405, 6.753)`, and far `(4.427, 6.786)`.
The simulation was frozen for the still while the ordinary render loop continued to run camera
follow, so a one-shot camera pose was overwritten before capture. The harness then treated the
offscreen projection as advisory. Its `CAPTURE_SEED` was also output metadata only: the New Game
screen never consumed it.

The seconds-scale regression pins all three retained projections as outside the `0.62` NDC evidence
boundary and pins the missing seed/camera/assertion contracts in the capture source.

## Repair

- The visible New Game screen receives `CAPTURE_SEED`, and the route fails unless
  `state.meta.seed` records the same value.
- A capture-only hook preserves the ordinary camera follow call and then re-aims that same camera at
  the frozen live capsule mesh's frame-local world position every render frame.
- Close/default/far use radius-proportional camera distance without teleporting the player or the
  capsule. The hook is restored in `finally`, and ordinary player follow is snapped back before the
  simulation freeze is cleared.
- Every capsule still now uses the same hard `assertInFrame` gate as static facilities. An offscreen
  subject can no longer become evidence by setting an advisory field.
- The future manifest keeps the legacy `seed` field and adds declared/recorded seed provenance plus
  the applied visible-control statement.

No gameplay system, entity position, asset, admission rule, existing H1 artifact, or product camera
implementation was changed.

## Focused evidence

- `node --test test/pq019a-capsule-capture-repair.test.mjs` — PASS, 3/3.
- `npm run check:pq019a:facility-embodiment` — PASS, 19/19.
- `npm run check:sim:compare` — PASS, deterministic and hash-equal.
- `node --check scripts/capture-pq019a-acceptance.mjs` — PASS.
- Path-scoped `git diff --check` — PASS.

## Honest residual

This unit did not launch Browser or Electron. The retained H1 facility/count evidence survives, but
current seeded close/default/far pixels and NDC projections remain for the authorized missing-row
capture. It proves no visual-quality, GPU, performance, accessibility, or human-review verdict.
