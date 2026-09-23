# quiet-solid-world — solid-world audit (PQ-210.03)

Measured on the Grok Bot VM with an otherwise-idle host (only desktop/session services; no other game probes or Cursor cloud agents). Answers: whether anything on the live screen was discarded, and the worst wait before an on-screen mesh appeared.

## Command

```
npm run probe:solid-world
```

Equivalent: `node scripts/probe-solid-world.mjs --headless` (default Crucible **45 s**, then open-flight belt **180 s**; pending limit **0.25 s**).

## Master SHA

`9f6c7b78f5f4505e283667757baa56f3a135b933` (origin/master at measure time; vm-drop tip before this job commit was `661a83d36bfe80ed260d540bda08153dc13d971d`, which only adds prior outbox folders under `design/program/vm-drop/`).

## Environment

- Host: Linux grok-bot-vm, `uname` 6.12.94+, x86_64 KVM guest
- When: 2026-09-21 21:50–21:54 EDT (America/New_York); wall ~258 s
- CPU: Intel(R) Xeon(R) Processor, **8** logical cores; load average at start **5.21 / 4.55 / 2.56** (probe + SwiftShader; no concurrent game probes)
- GPU: **software** — Playwright Chromium headless_shell with `--use-angle=swiftshader-webgl` / `--enable-unsafe-swiftshader` (ANGLE SwiftShader / Subzero path); **not** a discrete GPU (`nvidia-smi` absent)
- Node: v20.19.2 / npm 9.2.0
- Playwright Chromium headless_shell v1228 under `~/.cache/ms-playwright/` (not committed)

## Key answers

| Question | Answer |
|---|---|
| Anything on screen discarded? | **No** — `onGlassDisposals=0` (diag 0) in both Crucible and belt |
| Worst wait before an on-screen mesh appeared | **0.765 s** (Crucible); belt worst **0.424 s** |
| Probe verdict | **FAIL** (pending age over 0.25 s limit: Crucible 5 frames, belt 3 frames) |

## Phase detail

| Metric | Crucible (45 s) | Belt (180 s) |
|---|---|---|
| Frames sampled | 307 | 2331 |
| onGlassDisposals (diag) | **0** (0) | **0** (0) |
| Worst on-glass pending | **0.765 s** | **0.424 s** |
| Pending-on-glass frames (peak roots) | 14 (16) | 8 (1) |
| geoQueue peak / urgent / drainingFrames | 16 / 14 / 16 | 1 / 0 / 8 |
| admitted / skipped / enq / dedup / batches | 29 / 0 / 29 / 89 / 6 | 33 / 2 / 35 / 95 / 11 |
| maxRafGap | 1430 ms | 1344 ms |
| rafGapAtPendingMax | 298 ms | 421 ms |
| Frames over 0.25 s pending | 5 | 3 |
| Phase verdict | FAIL | FAIL |

Overall: `RESULT: FAIL —` pending waits exceeded the 0.25 s budget; residency evicts that dispose on-glass meshes stayed at zero.

## Probe artifact paths

All under `design/program/vm-drop/quiet-solid-world/` on branch `vm-drop`:

- `probe-stdout.log` — full PQ-210.03 witness (this run; ends `RESULT: FAIL`)
- `probe-stderr.log` — empty on this run
- `report.md` — this file
- `DONE.md` — one-paragraph summary

No live code, assets, or `VM_LANES.md` were modified. Playwright browser binaries stayed outside the repo.

## Notes / caveats

This is a **software ANGLE SwiftShader** measurement under Chromium headless_shell, **not** a discrete GPU laptop. Large `maxRafGap` values (1.3–1.4 s) and non-zero `rafGapAtPendingMax` mean some pending-age samples coincide with global frame freezes; the probe still attributes wall-clock pending age against the 0.25 s limit and fails. Use the numbers as an idle-machine software baseline: **no on-screen discard**, worst on-glass mesh wait **0.765 s**. Console noise included expected isolated-store 404s, first-flight wasp admission warnings, one authored-admission abort, and a VFX `pos` TypeError — none changed the disposal counter. An earlier attempt in this session was aborted mid-belt when the shell wedge closed the browser; that incomplete log was overwritten by this completed run.
