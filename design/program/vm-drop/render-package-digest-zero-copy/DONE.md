# DONE — render-package-digest-zero-copy (#166)

Every streamed render package was copied in full on the main thread just to hand the copy to the SHA-256 worker. The copy now never happens: the fetched buffer is transferred to the worker and transferred back with the digest.

**Live A/B.** Six 45 s main-thread profiles on bare master `97c88f92b` against the patch, interleaved, Picture ON, soft-GPU. Metric: `renderPackageDigest.js` main-thread samples.

| | bare master | patched |
|---|---|---|
| Per run (ms) | 11.7 / 17.7 / 10.7 | 1.1 / 0.8 / 0.8 |
| Largest bursts | 2–9.3 ms | none ≥1 ms |

- Median **~14.6×** (11.7 → 0.8 ms). Floor **≥9.7×** (10.7 / 1.1).
- A heavier-streaming earlier run (`settled-45s-master-164`, bare) spent **204 ms / 60 bursts** in this lane. The patch removes that almost entirely, because the residual is fixed-cost postMessage bookkeeping.

**Isolated sync cost of the lane.** 5 node processes, JIT-warmed, 40 reps each (`artifacts/memcpy166.*`). Copy + post vs transfer + post:

| Size | Copy lane | Keep lane | Speedup |
|---|---|---|---|
| 1 MB | 0.11–0.13 ms | 0.018–0.021 ms | ~6× |
| 4 MB | 0.86–0.91 ms | 0.033–0.036 ms | ~26× |
| 8 MB | 1.55–1.61 ms | 0.038–0.042 ms | ~39× |
| 16 MB | 2.91–2.96 ms | 0.051–0.053 ms | ~57× |

This is a hitch/admission cut, not a per-frame average. It removes a 0.1–3 ms+ synchronous burst on each frame where a package lands (up to 9 ms observed live). Boot admission also stops copying the ~125 MB of GLB it hashes.

**Tests.**
- `test/render-package-digest.test.mjs` passes 8/8, including 3 new tests: keep-lane round trip returns the same bytes on the transferred buffer; error reply falls back to calling-thread hashing with bytes kept; a lost worker yields `{hex:null, bytes:null}`.
- Focused suite: 67 files covering loader, digest, KTX2, residency, release-soak, and reachability.
  - Patched: 395/424 pass (+6 new tests, all passing).
  - Bare master: 389/418 pass.
  - The failure set (28 fail + 1 cancelled) is **identical** on both. Examples: packaged-Electron closure, Kestrel V6, refinery/pool admission, "all 74 release bodies". See `artifacts/focused-tests-*.log`.

**Risk.** A worker that dies while holding a buffer costs one re-fetch of that package, which is the same path as a stale cache read.
