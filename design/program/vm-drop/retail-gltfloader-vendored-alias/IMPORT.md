# IMPORT — retail-gltfloader-vendored-alias (#170)

## What

The zero-build path (browser dev, Electron dev, every VM and owner profile) resolves `three/addons/` through the
`index.html` importmap to `vendor/addons/`. `scripts/build-bundle.mjs` (the `npm run dist` / packaged Electron
path) resolved every bare specifier from `node_modules`. So the packaged game parsed every render package with the
**stock** `node_modules/three/examples/jsm/loaders/GLTFLoader.js`, and #168's in-place GLB body reads
(`vendor/addons/loaders/GLTFLoader.js`) never shipped.

The retail esbuild call now aliases exactly one specifier:

```
'three/addons/loaders/GLTFLoader.js' → <root>/vendor/addons/loaders/GLTFLoader.js
```

The alias lives in the new `scripts/lib/retailBundleAliases.mjs`, and `build-bundle.mjs` applies it with
`alias: retailBundleAliases(ROOT)`. `three` itself and every other addon still resolve from `node_modules`. The
vendored loader's own `import … from 'three'` goes to the npm package too, so there is still only one THREE
instance.

Files changed:
- `scripts/build-bundle.mjs`: +5 / −1 lines (one import, the alias, and comments)
- `scripts/lib/retailBundleAliases.mjs`: new, 17 lines
- `test/retail-gltfloader-vendored-alias.test.mjs`: new, 4 tests

## Apply

```
git am --ignore-space-change design/program/vm-drop/retail-gltfloader-vendored-alias/patches/*.patch
```

- **Import order: after #168** (`glb-body-in-place`). The patch applies without #168, since it touches none of
  #168's files, but its test asserts the #168 markers are in the bundle.
- Verified with `git apply --cached`:

  | Base | Resulting tree |
  |---|---|
  | #168 (`03c406090`) | `41309c6a6` (= scratch `vm-work/hillclimb-20260926e` `2121e9a48`) |
  | #167 + #168 + after-167 (`vm-work/hillclimb-20260926c`) | `4874a4732` (= scratch `vm-work/hillclimb-20260926f` `3ce58c5a6`) |
  | + #169 (`vm-work/hillclimb-20260926d`) | clean |
  | `vm-work/stack-20260924u` | clean |
  | bare master | clean |

## Why aliasing is safe (version check)

- `package.json`/lockfile pin `three` at `0.184.0`. `vendor/three.core.js` is byte-identical to the npm
  `build/three.core.js` (r184).
- On bare master, `vendor/addons/loaders/GLTFLoader.js` is **byte-identical** to the npm r184 GLTFLoader. So is
  everything it imports (`utils/BufferGeometryUtils.js`, `utils/SkeletonUtils.js`), and so is
  `libs/meshopt_decoder.module.js`.
- After #168, the only difference between the two loaders is #168's `SpaceFace:` hunks. There is no other
  behavioral difference.
- `assetLoader.js` `ASSET_RUNTIME_DECODER_CONTRACT.gltfLoader` already names `vendor/addons/loaders/GLTFLoader.js` as
  the runtime decoder. Retail now matches its own contract.
- The new test fails if `vendor/three.core.js` and npm `three` drift to different revisions. That is the one way
  this alias could later mix versions.

## Not changed (owner decisions, see DONE.md)

These other vendor files still differ from npm and still do **not** reach retail:
- `vendor/three.module.js`: two `SpaceFace:` fixes (the empty shadow sampler depth texture, and destroyed-program
  readiness).
- The vendored KTX2Loader's CSP-safe Basis patch. Retail already covers it with `configureCspSafeKtx2Loader` in
  src.
- Older vendored postprocessing/shader addons. Only the asteroid interior preview uses these.

#170 deliberately does not touch any of them.
