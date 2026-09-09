<!-- LIFETIME: EVIDENCE -->
# PQ-041 broker/package acceptance-surface report

```yaml
packet: PQ-041
dispatchUnit: PQ-041.acceptance-surfaces
lifecycleClaim: integrated
acceptanceClaim: unproven
disposition: PASS
headedBrowserLaunched: false
headedElectronLaunched: false
packagedRuntimeLaunched: false
performanceEvidenceClaimed: false
```

## Integrated route

The paired `performance-electron-modernization-browser` and
`performance-electron-modernization-electron` manifests now drive the established release-soak
wrappers. A promoting wrapper consumes its externally issued one-use claim before opening any
runtime and content-binds the canonical consumed-ledger entry. Direct wrapper invocation remains
diagnostic-only.

The Electron command first runs the existing exact generated-package startup checker under the
same consumed claim, then runs the source Electron public-route soak. Its subreceipt binds
`app.isPackaged`, executable and app-archive hashes, bundled route/storage readiness, and owned
cleanup. Browser and Electron evidence share one source digest, retain distinct runtime candidate
digests, preserve default quality, and report their measured p95 difference without requiring a
speedup. M6 fresh capture now delegates these manifests rather than invoking a producer directly.

The packaged-startup report override is path-contained inside the repository, and canonical broker
evidence is published only after the release-soak contract, artifacts, wrapper identity, and
producer publication all validate.

## Focused checks

- Paired manifest, packaged-startup, release-soak, evidence-checker, M6 matrix, and Electron security
  contracts: **63/63 pass**.
- `node scripts/check-electron-platform-contracts.mjs`: **PASS** on Electron `43.2.0`.
- `npm run check:m6:packaging`: **PASS**, including deterministic bundle construction.
- `node scripts/program-dispatch.mjs --ready`: queue schema and dependency routing **PASS** while the
  unit was claimed.

One stale platform assertion was corrected to distinguish the canonical page CSP from the exact
external KTX2 worker response; the page still forbids string evaluation. The release-soak's bounded
state-integrity traversal is shallow-first so dense entity graphs cannot hide invalid top-level
player state.

## Honest residual

No Browser, Electron, packaged runtime, controller, audio, display, lifecycle, GPU, or performance
acceptance was spent by this integration. `PQ-041.native-acceptance` remains a separate ready unit:
it requires one clean candidate-bound Browser claim followed by Electron and the M6 matrix. Existing
source-only diagnostics and package-build success cannot substitute for those claims.
