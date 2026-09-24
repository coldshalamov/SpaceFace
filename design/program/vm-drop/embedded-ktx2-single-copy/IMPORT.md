# IMPORT — embedded-ktx2-single-copy (#167)

## What

Embedded KTX2 textures are now copied once on the main thread instead of twice.

`EmbeddedKtx2TexturePlugin` (`src/render/embeddedKtx2Textures.js`) used to do two copies:

1. It took `parser.getDependency('bufferView', i)`, which is a `slice` of the GLB body that the parser also caches.
2. It then ran `slice(0)` on that again, because KTX2Loader transfers the buffer it receives.

Embedded KTX2 is **502.6 MB of the 695.5 MB** of all 259 render packages, so the second copy was substantial.

For a plain bufferView (integer buffer and byteLength, no extensions), the new `transferableSourceBytes` slices `body[byteOffset, byteOffset+byteLength)` once, directly off `parser.getDependency('buffer', def.buffer)`. That is exactly what `loadBufferView` would have produced, and the parser's bufferView cache is never populated for image views. Extension-decoded bufferViews (for example `EXT_meshopt_compression`) keep the old parser path.

The bench/proof toggle `setEmbeddedKtx2DirectSliceForBench(false)` restores the old path. The production default is ON.

## Apply

```
git am --ignore-space-change design/program/vm-drop/embedded-ktx2-single-copy/patches/*.patch
```

- Base: master `97c88f92b`.
- #167 alone am-verifies to `1203c460c`.
- #167 then #166 gives `24a2d1557`. The two patches are independent.

## Not wired / not touched

- The vendor `GLTFLoader` copies (`GLTFBinaryExtension` body `data.slice`, `loadBufferView` for geometry) are unchanged. Those are owner/vendor side.
- No asset, manifest, or KTX2Loader change.
