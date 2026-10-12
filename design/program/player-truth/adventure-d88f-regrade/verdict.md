# Player-truth regrade: FAIL — adventure (d88f4d5881 frames)

Regrade of the Code Work master-gate trace `state/mastercheck-d88f/adventure/` with this harness. No new browser. Pixel readability was recomputed from the 316 saved play frames.

- Build under test when the frames were shot: d88f4d5881
- Renderer: SwiftShader (software GL). Absolute frame times are software-renderer evidence.

| Check | Result | Measured |
|---|---|---|
| readability | **FAIL** | asteroid 100% low-contrast (8 samples, ΔL < 8). enemy 0, projectile 0, under the sample floor, not graded |
| frame_time, no --baseline | **UNKNOWN** | software-renderer evidence · p50 94 ms · p99 904 ms · 962 long tasks ≥250 ms |
| frame_time vs p99 200 ms / 10 long tasks, matched 1m load | **FAIL** | same numbers. regression |
| frame_time, same numbers, 1m load 13 vs 8 | **ADVISORY** | numbers would FAIL; not a FAIL |

Worst frames (contact sheet, red box): `frames/0001.jpg` (sim 1.8 s, ΔL 0) and `frames/0002.jpg` (sim 4.1 s, ΔL 0). The box is the on-screen asteroid. It does not separate from the black backdrop.

Overall of this pair is **FAIL** because readability failed. `frame_time` stays UNKNOWN until `--baseline` supplies a measurement, and that UNKNOWN is still printed. It is an INCOMPLETE cause only when no check FAILed.
