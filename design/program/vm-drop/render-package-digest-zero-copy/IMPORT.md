# IMPORT — render-package-digest-zero-copy (#166)

## What

Stops the main thread from copying each render package before hashing it.
`fetchVerifiedRenderBytes` in `src/render/renderPackageLoader.js` used to call
`sha256Hex`, which did `view.slice()` on the main thread and sent the copy to
the digest worker. That is one full memcpy of every streamed GLB, seen as
2–9 ms bursts per package.

The new lane is `sha256HexKeepingBytes` (`src/render/renderPackageDigest.js`).
It transfers the fetched buffer itself to the worker. The worker
(`renderPackageDigestWorker.js`, `{keep:true}`) transfers the same buffer
straight back with the hex. Neither thread copies any bytes.

## Apply

```
git am --ignore-space-change design/program/vm-drop/render-package-digest-zero-copy/patches/*.patch
```

- Base: master `97c88f92b`.
- #166 alone am-verifies to `27e34501e`.
- The patch is independent of #167 `embedded-ktx2-single-copy`. Applying #167 then #166 gives `24a2d1557`.
- The file is LF, but `--ignore-space-change` is harmless.

## Behavior and fallbacks

Picture and data are identical. The loader parses the same bytes, on the buffer the worker handed back.

- **Worker error reply:** the buffer comes back with the error and is hashed on the calling thread, which is what the copying lane did.
- **Worker `error` event, retirement, or timeout while it holds the buffer:** the lane answers `{hex:null, bytes:null}`. The loader then treats that read like a stale read and re-fetches with `read('reload')` plus the old copying `digestOf`.
- **Partial views, SharedArrayBuffer, or no Worker:** these take the old copying lane.
- **Unchanged:** the existing `sha256Hex` API and its wrapper.

## Not wired / not touched

- No change to vendor GLTFLoader copies: `GLTFBinaryExtension` body slice and `loadBufferView` (owner/vendor side).
- No change to the boot manifest, cache policy, or residency.
