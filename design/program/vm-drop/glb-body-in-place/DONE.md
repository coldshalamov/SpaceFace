# DONE — glb-body-in-place (#168)

The GLB body is no longer copied out of the fetched buffer on the main thread. Everything handed downstream is
byte-identical.

## Identity (`artifacts/id168.mjs`)

Each GLB is parsed with the untouched three r184 loader (the `node_modules` copy, byte-identical to the pre-patch
vendor file) and with the patched vendor copy, using production plugins (meshopt + embedded-KTX2 plugin; KTX2Loader
stubbed to hash and transfer). Compared per file: sha256 + length of every KTX2 buffer given to KTX2Loader, every
image Blob, every resolved bufferView, every geometry attribute and index (bytes + layout + type), node matrices,
groups, bounds, and material texture slots. Also records whether the body was ever materialized.

| Set | Files | Identical | Body materialized | Downstream items compared |
|---|---|---|---|---|
| All git-tracked `render.glb` | **259** | **259** | 0 | 2106 KTX2, 20 980 bufferViews, 7 719 node rows |
| Every other tracked `.glb` (parts, whole-ships, sources, incubator, proto) | 936 | 936 | 0 | 2163 KTX2, 5 036 PNG Blobs, 61 416 bufferViews, 24 357 node rows |
| Same two sets on #167 + #168 + after-167 | 259 + 936 | all | 0 | same |

- Mutation checks: an off-by-one bufferView slice gives DIFF; a shifted meshopt view throws in the decoder.
- Unit tests: `test/gltf-glb-body-range.test.mjs` 4/4 (real meshopt+KTX2 package and an uncompressed whole-ship
  vs stock; lazy `body` equals `data.slice(chunk)` and retires the ranges; range guards). With #167 on top,
  `test/embedded-ktx2-textures.test.mjs` gains a vendored-loader case (8/8).

## Speed, isolated, JIT-warmed (`artifacts/parse168.mjs`)

Stock vs patched, interleaved, 10 warmed rounds after 4 warm-up, separate node processes. "sync" is the
synchronous `parse()` call, i.e. the block that lands on one frame.

| Set | sync block (stock → #168) | removed | speedup (median / floor) | whole parse |
|---|---|---|---|---|
| 10 largest render packages (272.9 MB), master plugin, 5 processes | 112.3 → 15.0 ms | **97.6 ms** (93–100) | **7.32× / 6.71×** | 1.43× (1.35–1.44) |
| same, on #167 (after-167 patch), 5 processes | 114.2 → 15.4 ms | **99.2 ms** (95–107) | **7.59× / 7.16×** | 1.46× (1.44–1.52) |
| all 259 render packages (729 MB), on #167, 3 processes | 280 → 114 ms | **166 ms** (164–171) | 2.46× / 2.46× | 1.23× (−200…220 ms) |
| kestrel render package (36 MB), 3 processes | 20.3–21.1 → 1.3–1.4 ms | **18.9–19.8 ms** | **15.4× / 14.8×** | 1.64–1.71× |
| p90 package, blackmarket (8.7 MB) | 1.9 → 0.5–0.7 ms | 1.2–1.4 ms | 3.1× / 2.7× | 1.2–1.26× |
| p50 package (0.5 MB) | 0.30 → 0.25 ms | ~0.05 ms | noise | noise |

About 0.35–0.55 ms per MB of BIN chunk (large packages) is removed from the frame the package's parse starts on.

## Live (`artifacts/live-ab168.txt`)

From-launch + 30 s held-thrust Electron profiles, Picture ON, soft-GPU, 3 + 3 interleaved:

- Main-thread `GLTFBinaryExtension` lane: **147.2 / 43.9 / 46.6 → 0.6 / 8.5 / 1.4 ms**. Median ~33×, floor 5.2×.
  The run showing 8.5 ms streamed the most resources of all six (146).
- What's left is the JSON-chunk TextDecoder and header only. No `get body` frames appear in any patched run.
- Largest single body-copy burst: **20.2 / 15.2 / 8.4 ms → none / 3.4 ms (JSON) / none**. The 20 ms one is the
  opening Kestrel.

## Tests

Focused 96-file suite (the #167 list plus every test touching GLTFLoader, bloom or readiness):

| | pass / total | failed + cancelled |
|---|---|---|
| **#168** | **688/725** | 36 + 1 |
| **bare master** | **684/721** | 36 + 1 |

The two runs have an **identical failure set** (`diff` of the `not ok` lines is empty). The +4 are the new tests.
The pre-existing failures are the same ones listed in #166/#167 DONE: packaged-Electron closure, Kestrel V6,
opening remaster identity, faction kits, refinery promotion, render-package pool admission, the renderer
wiring-contract checks, and others.

## Risk

Low.
- The bytes are provably identical.
- Out-of-contract inputs fall back to the stock path.
- The one new contract: don't mutate or transfer the buffer passed to `parse()` until it settles. All in-repo
  callers already comply.
- The retail bundle uses `node_modules` three, so it is untouched unless the owner aliases the vendor loader.
