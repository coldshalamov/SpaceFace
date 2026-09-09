# PQ-129.10 — Stop catch-up echo hitches

Status: implemented and directly verified on the player route.

## Production change

When an over-budget presentation callback is immediately followed by another interval over two fixed steps, the next simulation advance executes one fixed step, sheds overdue whole-step debt, and preserves the fractional accumulator remainder. The fuse disarms after that callback unless presentation overruns again.

Normal cadence retains `MAX_CATCHUP_STEPS = 4`. The change does not zero the accumulator, raise the cap, alter fixed dt/system order/input boundaries, or reduce visual/gameplay quality.

## Matched Electron result

Both arms used New Game seed 47, held thrust for 20 seconds, foreground-visible Intel D3D11, changing canvas, and bounded instrumentation restored before shutdown.

| Metric | Baseline | Recovery fuse |
|---|---:|---:|
| Hitch-free callbacks | 0 / 173 | 41 / 351 |
| Echo hitches / observed callbacks | 172 / 173 (99.4%) | 277 / 351 (78.9%) |
| Longest hitch streak | 173 | 56 |
| Sim-frame p95 | 114.9 ms | 29.1 ms |
| Sim-frame max | 198.0 ms | 44.8 ms |
| Presentation p95 | 126.0 ms | 62.3 ms |
| Sim progress during sampled route | 10.45 s | 13.20 s |

Baseline report SHA-256: `D49A61F90CF76D6CE38C41576026E1BEC8EA106221BEB2C0CF87FF97ABC5A182`. Candidate report SHA-256: `12840FB5101AE14FC9CA36094D7B57A8B7FA4B6ACAA05B313EBB89B7B209C6BA`.

The baseline's post-report Electron graceful-close timeout is retained; the candidate closed cleanly. The measurement itself completed in both arms.

## Verification

- Focused runner/classifier/runtime-witness cluster: 51/51 passed.
- `npm run check:sim:compare`: deterministic and hash-equal.
- `npm run check:playable:desktop`: 14/14 passed through New Game, flight, thrust, save, Continue, loaded flight, clean errors, and assets.
- Generic browser `npm run check:playable` did not expose its menu screen within 30 seconds despite clean errors/assets; it was not rerun unchanged. The shared-game Electron route passed and is the direct changed-path evidence.

## Remaining pole

The game still hitches. Bloom scene rendering and external scheduling now dominate the remaining misses; PQ-129 must continue rather than treating this leaf as campaign completion.
