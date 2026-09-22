# quiet-open-flight — open-flight smooth probe (opening vs settled)

Measured on the Grok Bot VM with an otherwise-idle host (only desktop/session services; no other game probes or Cursor cloud agents). Separates the **opening** window (first ~20 s of flight, settle 0) from **settled** flight (discard 25 s, then sample 20 s).

## Commands

Opening (already completed earlier this session; artifact reused):

```
npm run probe:smooth-flight
```

Equivalent: `node scripts/probe-smooth-flight.mjs` (open flight, default seed/kit, sample **20 s** after flight start, `SPACEFACE_SMOOTH_SETTLE_MS` unset / 0).

Settled (this resume):

```
SPACEFACE_SMOOTH_SETTLE_MS=25000 npm run probe:smooth-flight
```

Equivalent: same script with **25 s** of flight discarded before the **20 s** sample.

## Master SHA

`9f6c7b78f5f4505e283667757baa56f3a135b933` (origin/master at measure time; vm-drop tip before this job commit was `11e4a628367caf9c2dc24a0b699549d54b2c7b90`, which only adds prior outbox folders under `design/program/vm-drop/`).

## Environment

- Host: Linux grok-bot-vm, `uname` 6.12.94+, x86_64 KVM guest
- When: opening ~2026-09-21 21:25–21:26 EDT; settled ~2026-09-21 21:44–21:46 EDT (America/New_York)
- CPU: Intel(R) Xeon(R) Processor, **8** logical cores; whole-machine busy **58%** (opening) / **75%** (settled) during each sample (probe text)
- GPU: **software** — `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`; **not** a discrete GPU (`nvidia-smi` absent). Playwright Chromium headed on DISPLAY=:4
- Node: v20.19.2 / npm 9.2.0
- Playwright Chromium v1228 installed locally under `~/.cache/ms-playwright/` (not committed)

## Opening vs settled — key numbers

| Metric | Opening (settle 0, sample 20 s) | Settled (settle 25 s, sample 20 s) |
|---|---|---|
| Mean FPS | **7.5** (140 frames) | **11.1** (199 frames) |
| Frame time p50 / p95 / p99 | 100.0 / 233.3 / 816.7 ms | 83.3 / 150.0 / 383.3 ms |
| Frames over **33 ms** | **140** (100.0%) | **199** (100.0%) |
| Frames over **50 ms** | **140** (100.0%) | **199** (100.0%) |
| Frames over **100 ms** | **63** | **19** |
| Worst frame | **1233 ms** | **683 ms** |
| Wave in measured window? | **No — NOT COVERED** | **No — NOT COVERED** |
| Launch to flight | 11.7 s | 13.7 s |
| Host busy in-sample | 58% of 8 cores | 75% of 8 cores |
| End scene (other ships / entities) | 19 / 91 | 20 / 80 |

Opening is heavier: shader admission, first-flight holds, and early mesh builds dominate (worst freeze 1233 ms; 63 frames over 100 ms). After 25 s settle, mean fps rises to **11.1**, worst frame drops to **683 ms**, and frames over 100 ms fall to **19**. Neither window captured a wave materialize event, so link/upload counts must not be compared to a COVERED run.

## Probe artifact paths

All under `design/program/vm-drop/quiet-open-flight/` on branch `vm-drop`:

- `probe-opening-stdout.log` — full SMOOTH-FLIGHT WITNESS (opening / settle 0)
- `probe-opening-stderr.log` — empty on that run
- `probe-settled-stdout.log` — full SMOOTH-FLIGHT WITNESS (settled / settle 25 s)
- `probe-settled-stderr.log` — empty on that run
- `report.md` — this file
- `DONE.md` — one-paragraph summary

No live code, assets, or `VM_LANES.md` were modified. Playwright browser binaries stayed outside the repo.

## Notes / caveats

This is a **software ANGLE SwiftShader / Subzero** measurement, **not** a discrete GPU laptop. Mean ~7.5–11 fps and multi-hundred-ms worst frames are expected under that path; use the numbers as an idle-machine software baseline (opening vs settled), not as a player-hardware ceiling. Console noise included expected isolated-store 404s for `__spaceface_player_store` and a KHR_parallel_shader_compile warning. An earlier settled attempt at ~21:26 aborted after printing only the npm script header; the completed settled witness is the 21:44 run.
