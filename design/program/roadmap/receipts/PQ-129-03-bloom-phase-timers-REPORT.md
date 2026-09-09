# PQ-129.03 — Bloom-path phase timers

Status: done — the bounded player route separates the three bloom CPU pass groups and names the scene pass as the pole.

## Direct result

- Route: Electron New Game, seed 47, held thrust for 20 seconds on Intel D3D11.
- `bloomScene`: 171 samples; average `27.713 ms`; p95 `72.8 ms`; max `729.2 ms`.
- `bloomDownsample`: 171 samples; average `0.290 ms`; p95 `0.5 ms`; max `6.5 ms`.
- `bloomComposite`: 171 samples; average `0.116 ms`; p95 `0.2 ms`; max `1.8 ms`.
- The picture changed (3/3 unique canvas hashes), lifecycle stayed foreground-visible, hitch attribution stayed at 97.5% named coverage, and bounded instrumentation restored its prior state.
- Report SHA-256: `A7E78A336BE41B1C95F9C92A24DF25B1C365FDB89A0D715D8283B9F29345DA2C` for local `.devshots/runtime-witness/report.json`.

## Disposition

- Reject downsample/blur and composite tuning as the primary optimization: together they are below one millisecond at p95.
- Route the implementation toward the main HDR scene render/submission path while preserving authored bloom, resolution, exposure, grading, and default visual quality.
- The scene pass is the primary world render into the HDR target, not automatically evidence of a duplicate scene render.

## Verification boundary

- `node --check scripts/probe-runtime-witness.mjs` and the 27-test classifier/runtime-witness cluster passed before the headed run.
- The measurement completed and instrumentation restored, but Electron graceful close timed out after the report was captured; exact-child fallback found part of the process tree already gone. This cleanup anomaly does not change the pre-cleanup phase samples and is retained rather than rerun unchanged.
