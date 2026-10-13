# Player-truth regrade: FAIL — adventure (d88f4d5881 frames)

Regrade of the Code Work master-gate trace `state/mastercheck-d88f/adventure/` with this harness. No new browser. Pixel readability was recomputed from the 316 saved play frames.

- Build under test when the frames were shot: d88f4d5881
- Renderer: SwiftShader (software GL). Absolute frame times are software-renderer evidence.

| Check | Result | Measured |
|---|---|---|
| readability | **FAIL** | asteroid 100% low-contrast (8 samples, ΔL < 8). enemy 0, projectile 0, under the sample floor, not graded |
| frame_time | **UNKNOWN** | software-renderer evidence · p50 94 ms · p99 904 ms · 962 long tasks ≥250 ms |

Worst frames (contact sheet, red box): `frames/0001.jpg` (sim 1.8 s, ΔL 0) and `frames/0002.jpg` (sim 4.1 s, ΔL 0). The box is the on-screen asteroid. It does not separate from the black backdrop.

Overall of this pair is **FAIL** because readability failed. The harness graded `frame_time` UNKNOWN: this trace has no `--baseline`, so the absolute SwiftShader numbers are evidence and not a PASS or a FAIL. The same numbers against a p99 of 200 ms and 10 long tasks would FAIL at a matched 1-minute load, and would be ADVISORY (not a FAIL) if that load were 13 versus 8. That UNKNOWN is still printed. It is an INCOMPLETE cause only when no check FAILed.
