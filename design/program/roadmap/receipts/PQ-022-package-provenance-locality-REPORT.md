<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-022
leafId: PQ-022.package-provenance-locality
acceptance: focused-green
disposition: IMPLEMENTED
candidateCommit: (the commit carrying this receipt)
-->
# RECEIPT — PQ-022.package-provenance-locality

**Session:** 2026-08-31. **Base:** `3588971b`.

```yaml
parent: PQ-022
leafId: PQ-022.package-provenance-locality
assetIds: [production-render-package-graph-223]
playerRoute: canonical Launch to flight startup-readiness route
sourceOwner: scripts/build-render-package-pilots.mjs + scripts/lib/renderPackageCompiler.mjs
runtimeOwner: src/contracts/renderPackage.js + src/render/renderPackageManifest.js
```

## Result

Render packages no longer fingerprint all 159,130 bytes of the aggregate `pilots.json`. Each
package now binds a stable canonical `spaceface.renderPackagePilotBinding.v1` record containing only
its effective pilot row and matching release-manifest row. The existing source-GLB hash/bytes,
semantic hash, package content hash, optional runtime hash, and generated runtime index remain
fail-closed.

The public helper rejects mismatched release ID, path, SHA-256, or byte count before compilation.
Production provenance URIs are repository-relative, so an absolute checkout path cannot make two
otherwise identical builds differ. `pilots.json` and `renderPackageManifest.js` remain global
indexes; subjective asset-review notes remain outside the immutable binding.

## One-time migration boundary

The current 223-package graph was rebuilt once to replace its legacy aggregate-manifest fingerprints.
All 223 changed metadata files differed only at:

- `contentHash`;
- `runtimeHash` where the package carries a runtime table;
- `provenance.sourceManifest.{uri,sha256,bytes}`.

An automated recursive field comparison found **0 unexpected fields**. No `render.glb` payload
changed. Rover, Drifter, and Ranger retained their current source URL, release SHA-256, and release
byte bindings; the older `10bee97d` generated outputs were not imported.

## Locality and determinism

- Focused tests prove property-order independence, unrelated pilot-row independence, owned-pilot
  invalidation, release-row-only invalidation, mismatch rejection, and checkout-independent URIs.
- A second complete 223-package build produced the identical 224-file metadata/index aggregate
  SHA-256 `4c4abe8d8cf24d828e597307cdf23ccece2c2e0a666a095499b4666f89f0948d`.
- The builder validates every committed package against its expected local pilot/release binding,
  so a stale or selectively missed package fails before the runtime manifest can be accepted.

## Verification

- `node --test test/render-package-compiler.test.mjs test/render-package-pilots.test.mjs` — **36/36**.
- `npm run check:render-package-pilots` — **fresh 223 production packages**.
- `npm run check:render-package-coverage` — **223/223 production assets packaged**; three named
  development-only reference/held assets remain explicitly excluded.
- `npm run check:asset-startup-readiness` — canonical root reached flight; authored preload resolved
  usable, the player Kestrel admitted its release asset, and there were zero page issues.
- `npm run check:baseline` — **14/14 green**.
- Syntax checks and `git diff --check` — green.

## Honest boundary

This is a tooling/runtime-trust implementation leaf. It makes future package churn local and closes
the released-asset startup graph, but it does not visually accept any individual ship or place and
does not complete the broader PQ-022 asset-family parent.
