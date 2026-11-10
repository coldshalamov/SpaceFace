# boot-times — cold boot to first control (three runs)

Measured on the Grok Bot VM with an otherwise-idle host (only desktop/session services; no other game probes or Cursor cloud agents). Report only — the live loader was not changed.

## Definition

- **Start:** page navigation (`page.goto` of the local game server).
- **End / first control:** `state.mode === 'flight'` and `state.render.firstPlayableFrameAt` is finite (ship is playable).
- **Path:** New Game → Launch (ordinary open flight). Intro cinematic skipped via `sf.cinematicSeen` so the clock is boot→menu→cook→flight, not splash hold.
- **Cold:** fresh Playwright Chromium context each run (no shared HTTP/storage cache between runs). Server process reused.

## Command

```
node design/program/vm-drop/boot-times/measure-boot-times.mjs
```

(Outbox-local helper; does not touch `src/` or live npm scripts.)

## Master SHA

`0fd64234a71147fd16f47f7a5f988d30fe758e3f` (origin/master at measure time; vm-drop tip before this job commit was `a3e5206a88e8123edb735b1dc309559ccae4aa44`, which only adds prior outbox folders under `design/program/vm-drop/`).

## Environment

- Host: Linux grok-bot-vm, `uname` 6.12.94+, x86_64 KVM guest
- When: 2026-09-21 23:42–23:44 EDT (America/New_York); wall ~73 s for three runs + idle gaps
- CPU: Intel(R) Xeon(R) Processor, **8** logical cores; load average at start **1.34 / 2.72 / 2.35**; in-run host busy ~47–49%
- GPU: **software** — `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`; Playwright Chromium headless with `--use-angle=swiftshader-webgl` / `--enable-unsafe-swiftshader`; **not** a discrete GPU (`nvidia-smi` absent)
- Node: v20.19.2
- Playwright Chromium headless_shell v1228 under `~/.cache/ms-playwright/` (not committed)

## Three times (cold boot → first playable)

| Run | Wall (nav → first-playable) | Perf (DCL → first-playable) | Boot → main menu | Longest stage |
|---|---:|---:|---:|---|
| **1** | **22.64 s** | 21.15 s | 7.68 s | `loading:entering-flight` → `first-playable` (**8050 ms**) |
| **2** | **21.69 s** | 18.90 s | 5.47 s | `loading:entering-flight` → `first-playable` (**7623 ms**) |
| **3** | **20.97 s** | 19.53 s | 6.53 s | `loading:entering-flight` → `first-playable` (**8219 ms**) |

**Headline three times:** **22.64 s**, **21.69 s**, **20.97 s** (wall clock).

**Longest stage (all three runs):** **`loading:entering-flight` → `first-playable`** (~7.6–8.2 s). Runner-up cook segments: `loading:authored-visuals` → `entering-flight` (~2.7–3.2 s) and early `domcontentloaded` → `sf-ready` (~5.2–7.3 s).

First enabled title control each run was **New Game** (no saves → Continue disabled). DEMO copy naming Crucible as the first button was not re-ordered here; this job only measures.

## Stage detail (run 1, typical)

| Phase | ms |
|---|---:|
| domcontentloaded → sf-ready | 7298 |
| sf-ready → main-menu-visible | 377 |
| main-menu-visible → first-title-control | 71 |
| first-title-control → new-game-visible | 644 |
| new-game-visible → loading:preparing-run | 402 |
| loading:preparing-run → launch-clicked | 8 |
| launch-clicked → loading:authored-library | 171 |
| loading:authored-library → loading:authored-visuals | 1445 |
| loading:authored-visuals → loading:entering-flight | 2682 |
| **loading:entering-flight → first-playable** | **8050** |

Runs 2–3 share the same stage order; full phase tables are in `raw-runs.json`.

## Artifacts

All under `design/program/vm-drop/boot-times/` on branch `vm-drop`:

- `measure-boot-times.mjs` — outbox-local cold-boot harness
- `raw-runs.json` — full stage timelines, GPU strings, host busy %
- `probe-stdout.log` — harness summary lines
- `report.md` — this file
- `DONE.md` — one-paragraph summary
- `IMPORT.md` — import notes (report only)

No live code, assets, or `VM_LANES.md` were modified. Playwright browser binaries stayed outside the repo.

## Notes / caveats / blockers

- **Software GPU baseline** — times are SwiftShader/Subzero, not a discrete GPU laptop. Use as an idle-machine software reference, not a player-hardware ceiling.
- **Report only** — loader stages were measured; nothing under `src/ui/loading*` (or elsewhere) was changed.
- Console noise: expected isolated-store **404** for the empty player store mount.
- **Blockers:** none for completing this outbox measurement. Demo readiness “title under ten seconds” is a different predicate (boot→title); menu landed in **5.5–7.7 s** here, while first *ship* control needed the cook (~21–23 s wall).
