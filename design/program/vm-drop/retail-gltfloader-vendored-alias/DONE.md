# DONE — retail-gltfloader-vendored-alias (#170)

**Import order: after #168.** The packaged (retail) bundle now parses GLBs with the vendored GLTFLoader, so #168's
in-place GLB body reads reach players. Dev and retail load the same loader code.

## How retail resolved GLTFLoader (before)

- `npm run dist` runs `scripts/build-bundle.mjs`, then electron-builder. electron-builder ships only `build/web/**`
  plus the electron shell files.
- `build-bundle.mjs` is a single esbuild call:
  - `bundle`, `splitting`, `platform: 'browser'`
  - `mainFields ['browser','module','main']`, `conditions ['browser','import']`
  - no plugins, and no alias before #170

  Bare specifiers resolve through npm `three@0.184.0`'s `exports` map (`./addons/*` → `./examples/jsm/*`).
  The HTML importmap is stripped from the bundled `index.html`.
- There are two GLTFLoader import sites. Both are literal dynamic imports, so the alias covers them:
  - `src/render/renderPackageLoader.js:907`: `import('three/addons/loaders/GLTFLoader.js')`, the render-package
    decoder. It sits next to `three/addons/libs/meshopt_decoder.module.js`.
  - `src/render/assetLoader.js:816`: `createRuntime`, the whole-ship and part loader. It falls back to the in-repo
    `./GLTFLoader.js`, which is not three's loader and is untouched.
- esbuild metafile, bare master: the retail chunk `GLTFLoader-NVOIVSBQ.js` (`export {… as GLTFLoader}`) contains
  `node_modules/three/examples/jsm/loaders/GLTFLoader.js`.
- **#168 alone leaves the retail JS byte-identical to master** (`diff -rq`, all 166 files). That confirms #168 never
  reached players.

## Version comparison

| File | vendor (bare master) vs npm three 0.184.0 |
|---|---|
| `three.core.js` | byte-identical (r184) |
| `addons/loaders/GLTFLoader.js` | **byte-identical** (so, after #168, the only difference is #168's hunks) |
| `addons/utils/BufferGeometryUtils.js`, `utils/SkeletonUtils.js` (GLTFLoader's imports) | byte-identical |
| `addons/libs/meshopt_decoder.module.js` | byte-identical |
| `three.module.js` | differs: 2 `SpaceFace:` fixes (not in retail, not changed here) |
| `addons/loaders/KTX2Loader.js` | differs: CSP-safe Basis wrapper (retail already has `configureCspSafeKtx2Loader`) |
| postprocessing/shaders (8 files) | older upstream copies (asteroid interior preview only) |

Full table: `artifacts/logs/vendor-vs-npm-divergence.txt`. Beyond #168, the two GLTFLoaders have **no behavioral
difference**.

## Proof

The bundles were built through the **real** `scripts/build-bundle.mjs`. A loader hook (`artifacts/tools/`) wraps its
`esbuild.build` with the same options plus `metafile`, and copies the JS out before the asset stage.

The asset stage fails identically on bare master, #168 and #170. This is **pre-existing**: 54 of 259 render
packages' `runtime` tables no longer match what `renderPackageRuntimeTable` derives. It is material-role drift
from master `a1cc1c66d` (`artifacts/logs/master-runtime-table-drift.json`). So `npm run dist`, `check:bundle` and
`check:m6:packaging` cannot complete on master today, with or without #170.

### Bundle contains the #168 code path

| Build | GLTFLoader input in retail chunk | `glbBodyRange` / `glbBodySliceRange` / `bodyByteOffset` in bundle |
|---|---|---|
| bare master | `node_modules/.../GLTFLoader.js` (42 392 B) | absent |
| #168 | same (JS byte-identical to master) | absent |
| **#168 + #170** | **`vendor/addons/loaders/GLTFLoader.js` (43 966 B)** | present (`GLTFLoader-N622CPRW.js`) |
| #167 + #168 + after-167 | npm loader | only the after-167 helper *call* (feature-detected, inert) |
| **#167 + #168 + after-167 + #170** | **vendor loader** | present |

Other modules: 1 258 input modules have identical output bytes. The only other moves are chunk regrouping and
±1–13 B of identifier renaming in 6 render modules (`artifacts/logs/inputs-diff.txt`). Two things drop out of the
bundle: the stock GLTFLoader and its `SkeletonUtils` copy. The npm `BufferGeometryUtils` loses
`toTrianglesDrawMode`, which now comes from the byte-identical vendor copy.

### Bundle size delta

| | JS files | JS bytes | gzip |
|---|---|---|---|
| master → #168 + #170 | 166 → 165 | 17 596 660 → 17 597 946 (**+1 286 B**, +0.007 %) | 5 433 130 → 5 433 067 (**−63 B**) |
| #167/#168 stack → + #170 | 166 → 165 | 17 597 259 → 17 598 545 (**+1 286 B**) | 5 433 360 → 5 433 307 (**−53 B**) |

### Byte identity through the actual retail bundle (`artifacts/tools/idretail170.mjs`)

Each GLB is parsed in Node with the retail bundle's own chunks: the `GLTFLoader-*` chunk, the
`meshopt_decoder.module-*` chunk and the production `embeddedKtx2Textures-*` plugin chunk. It is parsed once with
the "before" bundle and once with the "after" bundle, with KTX2Loader stubbed to hash and transfer. Compared:
- every KTX2 buffer, image Blob and resolved bufferView;
- every attribute and index (bytes + layout);
- node matrices, groups, bounds and material slots;
- whether the GLB body was ever materialized.

| Before → after bundle | Set | Files | Identical | Body materialized |
|---|---|---|---|---|
| master → #168 + #170 | all tracked `render.glb` | **259** | **259** | 0 |
| master → #168 + #170 | every other tracked `.glb` | 936 | 936 | 0 |
| stack → stack + #170 | 259 + 936 | 1 195 | 1 195 | 0 |
| master → stack + #170 | 259 render packages (bufferView probe excluded: #167 stops routing KTX2 through it) | 259 | 259 | 0 |

- Totals match #168's own identity run exactly: 2 106 / 2 163 KTX2 buffers, 5 036 Blobs, 20 980 / 61 416
  bufferViews and 7 719 / 24 357 node rows.
- **Mutation:** an off-by-one on the bundled range slice gives DIFF on 4 of 5 packages (`idretail-mutation.txt`).
- **Unit-test mutation:** dropping the alias fails 2 of the 4 new tests.

### Suites vs untouched master

The suite is #168's 96-file focused list (every GLTFLoader, render-package, bloom and readiness test) plus the
packaging and loader set:
- m6-packaging-parity
- electron-packaged-startup(-contract)
- electron-security-contract
- lab-bridge-absence
- asset-reachability-dynamic-assets
- build-identity-pilots
- release-meshopt-profile-parity
- ktx2-csp-worker
- basis-transcoder-csp
- render-package-*
- asset-loader-*
- gltf-material-contract
- (cached-/embedded-) ktx2

The new #170 test is also included on the #170 side.

| Build | pass / total | fail + cancelled |
|---|---|---|
| bare master `97c88f92b` | 709 / 746 | 36 + 1 |
| **#168 + #170** | **717 / 754** | 36 + 1 |

- The failure sets are **identical**: `suite-failure-set-diff.txt` is empty. They are the same pre-existing set as
  #166–#168: packaged-Electron closure, Kestrel V6, opening remaster identity, faction kits, refinery promotion,
  package-pool admission, renderer wiring contracts, and so on.
- The +8 are #168's 4 tests and #170's 4 tests.
- On the #167 + #168 + after-167 + #170 stack, the quick set (#170 + glb-body-range + embedded-ktx2 +
  lab-bridge + m6-packaging) passes 28/28.

## Risk

Low.
- The retail loader is now the exact file dev has used all along, and it is proven byte-identical downstream on
  all 1 195 tracked GLBs.
- #168's caller contract (don't mutate or transfer the `parse()` buffer until it settles) now applies to retail
  too. Both retail callers already comply; they are the same src as dev.
- Drift guard: the test fails if vendor three and npm three are ever different revisions.
- Not measured here: packaged-Electron boot. The asset stage cannot complete on master because of the
  pre-existing runtime-table drift. The JS chunks were executed directly instead.

## Owner decisions (not blockers for #170)

1. **Retail build is broken on master (pre-existing).** 54 render-package runtime tables are stale since
   `a1cc1c66d` (the material-role classifier). Refreshing them changes shipped material roles
   (hull → signal/…), so it is a picture decision.
2. **Other dev-only vendor patches.** The `vendor/three.module.js` `SpaceFace:` fixes (empty shadow sampler
   depth texture, and destroyed-program readiness) still do not reach retail. Aliasing `three` to vendor would
   close that gap, but it swaps the whole core in retail. That is a separate, larger decision; the same
   mechanism (`retailBundleAliases`) would carry it.
