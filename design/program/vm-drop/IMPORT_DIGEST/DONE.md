# DONE — IMPORT_DIGEST 20260926b

Post-#167 digest.

- **#168** `glb-body-in-place`: the GLB body is never copied out of the fetched buffer.
  - Downstream bytes are identical across 259 + 936 GLBs.
  - Sync parse block for the 10 heaviest packages: −97.6 ms (7.32× median / 6.71× floor). Kestrel: −19.4 ms.
  - Live body lane: 46.6 → 1.4 ms (median).
  - Import after #167 together with the `patches-after-167` fixup.
- **#169** `shader-readiness-no-isprogram`: readiness waits no longer call a synchronous `isProgram()`.
  - In-flight isProgram: 0.42–4.9 s per 30 s → 0.
  - Largest in-flight block median: ~1.9 s → ~76 ms.
  - Owner decision: the silent-handle bound goes from ~2 s to 20 s.
- Cost map: pre-flight shader admission is driver link time (1–10 s). JS is under 0.1 s.
- Master tip unchanged: `97c88f92b`.

# DONE — IMPORT_DIGEST 20260926a

Post-#165 digest.

- **#166** `render-package-digest-zero-copy`: the main-thread digest-copy lane
  drops ~14.6× live (11.7 → 0.8 ms per 45 s run; floor ≥9.7×). The 2–9 ms
  per-package bursts are gone. The isolated lane is 6–57× for packages of
  1–16 MB.
- **#167** `embedded-ktx2-single-copy`: KTX2 bytes are identical across all 259
  packages. The lane is 1.9–2.1×, with a floor of 1.39×. It removes 55.6 ms per
  set of the 10 heaviest packages (~0.29 ms/MB of KTX2).
- Holds:
  - sg02 Rapier call diet (bit-identical, but ~1.1× live)
  - early tacticalAI (did not reproduce)
  - radar residual (skipped)
- Master tip unchanged: `97c88f92b`.

# DONE — IMPORT_DIGEST 20260924ea

Post-#163 digest.

- **#164** `hull-integrity-quiet-latch`: 21.2× tight / 10.1× per-frame median;
  floor ≥8.6×; ~55 µs/frame.
- **#165** `perf-heap-sample-gate`: ~52 µs/frame.
- The registry.step per-system latch vein is exhausted. See the fresh cost map
  in `hull-integrity-quiet-latch/artifacts/cost-map-164.md`.
- Master tip unchanged: `97c88f92b`.
