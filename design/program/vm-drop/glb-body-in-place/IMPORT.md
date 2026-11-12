# IMPORT — glb-body-in-place (#168)

## What

The vendored three r184 GLTFLoader (`vendor/addons/loaders/GLTFLoader.js`) copied the whole BIN chunk out of every
GLB inside the synchronous `parse()` call (`GLTFBinaryExtension`: `this.body = data.slice(...)`). Every streamed
render package, every whole-ship and every release part paid a full-body memcpy on the main thread before any
decoding started (render packages: 716.9 MB of BIN across 259 packages).

Now the extension keeps the BIN chunk as a **range on the caller's GLB** (`bodySource`, `bodyByteOffset`,
`bodyByteLength`) and nothing copies it:

- `EXT_meshopt_compression` sources (all render-package geometry) are viewed in place
  (`new Uint8Array(source, bodyOffset + byteOffset, byteLength)`), exactly the bytes the old
  `new Uint8Array(body, byteOffset, byteLength)` saw.
- Plain bufferViews (embedded KTX2 / PNG images, uncompressed accessors) are sliced straight off the range. Same
  bytes, same single slice, still standalone ArrayBuffers (they are cached, handed to Blobs, accessors and
  transferring decoders, and a view would pin the whole GLB — so that copy is deliberately kept).
- `body` stays available for any other consumer: a getter materializes it, byte-identical to the old eager slice,
  on first access; from then on the ranges retire and the stock path is used.
- Anything the stock path would treat differently (buffer ≠ 0, `uri` set, non-integer / negative offsets, meshopt
  views past the body end) takes the stock path, so malformed files fail exactly as before. bufferView slices keep
  `ArrayBuffer.prototype.slice` clamping.

Only the GLTFLoader vendor copy and one new test change. Peak memory during a parse also drops by one body
(GLB + body copy → GLB only).

## Apply

```
git am --ignore-space-change design/program/vm-drop/glb-body-in-place/patches/*.patch
```

- Base: master `97c88f92b`. Verified tree `d8221d563` (= scratch `03c406090`).
- **With #167 (`embedded-ktx2-single-copy`)**: apply #167, then #168, then
  `patches-after-167/*.patch`. #167's direct slice asks for the `'buffer'` dependency, which on #168 would
  materialize the body (moving the full copy to the first KTX2 texture). The after-167 patch slices the same
  clamped range off the fetched GLB instead. Verified tree `16cdd6663` (= scratch `vm-work/hillclimb-20260926c`
  `619537c2e`). #166 + #167 + #168 + after-167 (+ #169) also apply cleanly; #168 applies on the full local stack
  `vm-work/stack-20260924u`.

## Caller contract (new)

Callers must not mutate or transfer the ArrayBuffer they pass to `parse()` until parsing settles. Every in-repo
caller already complies: `renderPackageLoader` and `assetLoader.loadGltfDocument` hand over a fresh fetch buffer
and drop it; `FileLoader`-driven `load()` does the same.

## Not wired / owner decision

- **Retail bundle:** `scripts/build-bundle.mjs` resolves `three/addons/*` from `node_modules`, not `vendor/`. As
  with the existing `SpaceFace:` patches in `vendor/three.module.js`, this cut reaches the zero-build path (browser
  dev, Electron dev, every VM/owner profile) but not the packaged bundle, unless the bundle aliases
  `three/addons/loaders/GLTFLoader.js` to the vendor copy. Owner's call.
- No asset, manifest, KTX2Loader, meshopt or render-package change.
