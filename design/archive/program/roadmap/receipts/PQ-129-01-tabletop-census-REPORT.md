<!-- LIFETIME: EVIDENCE -->
# PQ-129.01 tabletop census report

```yaml
packet: PQ-129
dispatchUnit: PQ-129.01
lifecycleClaim: implemented
acceptanceClaim: route_accepted
disposition: PASS
baseCommit: de5a99553dc8cc19ae0f896940e21b3aa2f500bd
changedPaths:
  - scripts/probe-runtime-witness.mjs
focusedGates:
  - node --test test/tabletop-policy.test.mjs test/runtime-witness.test.mjs
  - npm run check:baseline
routeEvidence:
  - isolated headed Electron New Game seed 47, held thrust, 20000 ms
performanceEvidence:
  - .devshots/runtime-witness/report.json sha256:B0A8D7E108264D7D65F1BF4975D4246021B2A9068AF7ACFDA8556C1B6052D4FD
```

## Result

The bounded probe enables the existing table census only after entering flight, records the live
policy envelope and population every 500 ms, and restores the prior instrumentation state before
shutdown. The live Intel-D3D11 route changed all three sampled canvas hashes.

The 11 census samples measured:

- glass: 2–3 entities;
- runway: 4–8;
- beyond: 315–319;
- submitted policy population: 7–11;
- resident meshes: 12–16;
- persistent landmarks: 42.

The final frame held 3 glass, 7 runway, 317 beyond, 10 submitted, and 16 resident at a 156 × 96 WU
glass plus a 120 WU runway. `submitted` is policy population, not WebGL draw calls.

## Honest residual

This closes only the live census. It does not claim smoothness: all eight tail samples still hitched,
with presentation p95 299.6 ms and render p95 290.4 ms. The probe command returned nonzero because
the verdict correctly remained `hitching`; its report recorded no primary or cleanup error.
`PQ-129.02` must now name the live presentation owners before an implementation leaf is selected.
