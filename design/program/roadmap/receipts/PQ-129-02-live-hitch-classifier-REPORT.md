# PQ-129.02 — Live hitch classifier

Status: done — the bounded player-route classifier names 97.8% of hitches and remains off by default.

## Direct result

- Route: Electron New Game, seed 47, held thrust for 20 seconds.
- Runtime: foreground-visible, changing canvas (3/3 unique hashes), Intel D3D11, no probe or cleanup error.
- Instrumentation: render-work and hitch attribution enabled only for the bounded window; both prior states restored before shutdown.
- Histogram: 343 observed frames, 269 hitches, 263 named, 6 unknown; named coverage `0.977695167286245`.
- Owners: simulation 119, bloom 69, external scheduling 65, residual present 5, UI 5, unknown 6. Compile, upload, compose, autosave, admission, VFX, feel, and callback-untracked were zero on this route.
- Report SHA-256: `72812BA869B62580D73B6AE8E45C6C615A52C2E87F718A3B20B4CEB606611E47` for local `.devshots/runtime-witness/report.json`.

## What changed

- The probe resets after warm-up, captures at the exact sampling cutoff, and fails if instrumentation restoration fails.
- Frame-local attribution now joins existing compile, upload, compose, bloom, autosave, simulation-frame, callback-gap, and callback-remainder measurements to the interval that just ended.
- Detailed work can outrank a broad enclosing bucket only when it accounts for at least 75% of that bucket; small slices cannot steal a frame.
- Production defaults remain unchanged. No visual or gameplay quality setting was reduced.

## Focused verification

- `node --test test/hitch-classifier.test.mjs test/runtime-witness.test.mjs` — 27/27 passed.
- `npm run probe:runtime-witness` — result-bearing run above; nonzero process status is expected while the live verdict remains `hitching`.

## Routing consequence

The route rejects compile, upload, compose, autosave, and admission as current poles. Continue through `PQ-129.03` to retain honest bloom subphase timing, then optimize the measured bloom/presentation path without lowering default quality. Simulation and external scheduling remain measured parallel poles for later leaves.
