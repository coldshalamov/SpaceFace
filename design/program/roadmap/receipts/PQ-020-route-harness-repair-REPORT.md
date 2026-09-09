<!-- LIFETIME: EVIDENCE -->
# PQ-020 route-harness repair report

```yaml
packet: PQ-020
dispatchUnit: PQ-020.route-harness-repair
lifecycleClaim: focused_green
acceptanceClaim: unproven
disposition: PASS
headedBrowserLaunched: false
headedElectronLaunched: false
performanceEvidenceClaimed: false
```

## Recorded failure

H1 completed the public Helios Prime to Ceres jump on the real route and observed the correct
Helios-side endpoint identity, but `assertEndpointApproach()` rejected the valid arrival solely
because it was `429.564 WU` from that gate. The packet defines source-direction identity and gate
existence; it defines no absolute `300 WU` arrival threshold.

The exact retained snapshot was added as a regression before the repair. It made the focused
manifest suite fail 13/14 with:

`Ceres entry from sector_helios_prime landed 429.564 WU from its endpoint gate`

## Repair

The unsupported absolute-distance assertion was removed. Both load-bearing route assertions remain:

- `closestEndpointGateTo` must equal the source sector;
- Ceres must expose a gate whose `gateTo` is that source sector.

The exported pure assertion accepts the recorded Helios snapshot and still rejects both the wrong
closest-gate identity and a missing source gate. No route, coordinate, gate, jump, camera, gameplay,
or performance behavior changed.

## Focused evidence

- Red characterization: `node --test test/pq020-ceres-topology-manifest.test.mjs` — FAIL, 13/14 at
  the recorded `429.564 WU` arrival.
- `node --test test/pq020-ceres-topology-manifest.test.mjs` — PASS, 14/14.
- `npm run check:pq020:proofs` — PASS, 14/14.
- `npm run check:pq020:ceres-topology` — PASS; Cathedral route remains `9379.334 WU`.
- `node --check scripts/lib/pq020CeresFunctionalRoute.mjs` — PASS.
- Path-scoped `git diff --check` — PASS.

## Honest residual

This unit did not rerun Browser or Electron. It proves no Cathedral pixels, cold-Continue route,
accessibility, GPU, performance, or human verdict. The retained successful public jump should not be
repeated merely to reproduce it; the authorized H1 continuation begins from the repaired route cell.
