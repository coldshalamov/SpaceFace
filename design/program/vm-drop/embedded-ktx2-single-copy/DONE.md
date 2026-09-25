# DONE — embedded-ktx2-single-copy (#167)

Every embedded KTX2 texture used to be copied twice on the main thread before transcoding. It is now copied once, and the bytes handed to KTX2Loader are identical.

**Identity**
- Across all **259** git-tracked `render.glb`, the sha256 + length of every buffer given to KTX2Loader is identical ON vs OFF, using the vendored GLTFLoader + MeshoptDecoder (`artifacts/ktxid.mjs`, `ktx-identity-all-packages.txt`).
- Example, aftermath-aft-weapon-spar: 9 images, and parser bufferViews cached drops from 30 to 21. The 9 image bufferView slices never happen.
- Unit tests (`test/embedded-ktx2-textures.test.mjs`) pass 7/7, including 3 new ones:
  - the direct slice returns exact bytes, requests only 'buffer', and leaves the body undetached;
  - an extension-decoded view keeps the parser path;
  - a real-package identity check with the toggle ON vs OFF.
- A mutation check (off-by-one slice, or default OFF) fails the new tests.

**Speed, isolated, JIT-warmed** (5 node processes, 40 reps each; `artifacts/memcpy166.*`). Double vs single copy:

| Size | Double copy | Single copy | Speedup |
|---|---|---|---|
| 1 MB | 0.21 ms | 0.11 ms | 1.9× |
| 4 MB | 1.26–1.34 ms | 0.66–0.69 ms | 1.9× |
| 8 MB | 2.97–3.10 ms | 1.39–1.44 ms | 2.1× |
| 16 MB | 6.07–6.45 ms | 4.22–4.65 ms | 1.39× (floor) |

**Real-GLB parse** of the 10 most KTX-heavy packages (191.7 MB of KTX2; `artifacts/parse167.*`), 5 isolated processes, interleaved ON/OFF, 10 warmed rounds each:

| Metric | Result |
|---|---|
| Main-thread parse time removed | **52.1 / 52.8 / 57.9 / 75.1 / 55.6 ms** per 10-package set (median 55.6 ms, ≈5.6 ms per heavy package, ≈0.29 ms per MB of KTX2) |
| Whole parse | 1.12–1.17× |

For a p90 package (6.6 MB of KTX2) that is about 1.9 ms removed from the frame it lands on.

**Live 45 s A/B** (`artifacts/live-ab-45s.txt`): this lane is not separable from noise. Those windows streamed only small packages (median package KTX2 is 243 KB), so the win shows up on heavy-package admission rather than in quiet flight.

**Tests.** Focused 67-file suite: patched 395/424, bare 389/418, with an identical pre-existing failure set (see #166 DONE).

**Risk.** Near-zero. The bytes are provably the same, and only bufferViews with extensions or non-integer fields fall back.
