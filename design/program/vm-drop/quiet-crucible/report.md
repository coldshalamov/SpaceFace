# quiet-crucible — smooth-flight crucible probe

Measured on the Grok Bot VM with an otherwise-idle host (only desktop/session services; no other game probes or Cursor cloud agents).

## Command

```
npm run probe:smooth-flight:crucible
```

Equivalent: `node scripts/probe-smooth-flight.mjs --crucible` (swarm mode, seed **4242**, default kit, default sample **30 s** after flight start).

## Master SHA

`9f6c7b78f5f4505e283667757baa56f3a135b933` (origin/master at measure time; vm-drop tip was `0c0a2718a87908f0c59c86777f600efba2807fef`, which only adds prior outbox folders under `design/program/vm-drop/`).

## Environment

- Host: Linux grok-bot-vm, `uname` 6.12.94+, x86_64 KVM guest
- When: 2026-09-21 21:24 EDT (America/New_York)
- CPU: Intel(R) Xeon(R) Processor, **8** logical cores; whole-machine busy **64%** during the sample (probe text)
- GPU: **software** — `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`; no NVIDIA device (`nvidia-smi` absent). Playwright Chromium headed on DISPLAY=:4
- Node: v20.19.2 / npm 9.2.0
- Playwright Chromium v1228 installed locally under `~/.cache/ms-playwright/` (not committed)

## Key numbers

| Metric | Value |
|---|---|
| Mean FPS | **12.1** (335 frames / 30 s) |
| Frame time p50 / p95 / p99 | 66.7 / 133.4 / 300.0 ms |
| Frames over **33 ms** | **335** (100.0%) |
| Frames over **50 ms** | **298** (89.0%) |
| Frames over **100 ms** | **24** |
| Worst frame | **1133 ms** |
| Wave in measured window? | **Yes — COVERED (edge)** |

Wave detail from the witness: wave 1 planned/materialized/started ~9.8 s before the sample clock (and a second materialize at −5.3 s). Probe labels this as covered on the edge: spawn GPU cost lands inside the window via deferred mesh builds. End scene: 10 other ships, 99 entities.

## Probe artifact paths

All under `design/program/vm-drop/quiet-crucible/` on branch `vm-drop`:

- `probe-stdout.log` — full SMOOTH-FLIGHT WITNESS transcript (this run)
- `probe-stderr.log` — empty on this run
- `report.md` — this file
- `DONE.md` — one-paragraph summary

No live code, assets, or `VM_LANES.md` were modified. Playwright browser binaries stayed outside the repo.

## Notes / caveats

This is a SwiftShader software-GPU measurement, not a discrete GPU laptop. Mean ~12 fps and a 1.1 s worst frame are expected under that path; use the numbers as an idle-machine software baseline, not as a player-hardware ceiling. Console noise included expected isolated-store 404s for `__spaceface_player_store` and a KHR_parallel_shader_compile warning.
