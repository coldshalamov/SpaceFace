# boot-stage-profile — cold boot to first control (three runs)

**Kind:** report (no game code changed)
**Measured SHA (origin/master tip):** `0612d2b9fc994557dd35cb00d0df21b791722c23`
**When:** 2026-09-22 ~21:00–21:01 EDT (America/New_York)
**Branch for this outbox:** `vm-drop` (job folder only)
**GPU tier:** **software** (Playwright Chromium + ANGLE SwiftShader / Subzero — same harness family as `boot-times`; distinct from Electron llvmpipe used in alloc/cpu-profile).

## Definition

- **Start:** page navigation (`page.goto` of the local game server).
- **End / first control:** `state.mode === 'flight'` and `state.render.firstPlayableFrameAt` is finite.
- **Path:** New Game → Launch. Intro cinematic skipped via `sf.cinematicSeen`.
- **Cold:** fresh Playwright Chromium context each run.

## Command

```
node design/program/vm-drop/boot-stage-profile/measure-boot-times.mjs
```

(Outbox-local copy of the `boot-times` harness; does not touch `src/`.)

## Three times (cold boot → first playable)

| Run | Wall (nav → first-playable) | Boot → main menu | Longest stage | Longest ms |
|---|---:|---:|---|---:|
| **1** | **24.03 s** | 6.07 s | `loading:entering-flight → first-playable` | **8540** |
| **2** | **26.1 s** | 6.11 s | `loading:entering-flight → first-playable` | **7746** |
| **3** | **22.91 s** | 6.24 s | `loading:entering-flight → first-playable` | **7315** |

**Headline three times:** **24.03 s**, **26.1 s**, **22.91 s**.

**Longest stage (all three runs):** **`loading:entering-flight` → `first-playable`**.

## Stage detail (run 1)

| Phase | ms |
|---|---:|
| domcontentloaded → sf-ready | 5779 |
| sf-ready → main-menu-visible | 291 |
| main-menu-visible → first-title-control | 97 |
| first-title-control → new-game-visible | 683 |
| new-game-visible → loading:preparing-run | 365 |
| loading:preparing-run → launch-clicked | 34 |
| launch-clicked → loading:authored-library | 153 |
| loading:authored-library → loading:authored-visuals | 1615 |
| loading:authored-visuals → loading:entering-flight | 2832 |
| loading:entering-flight → first-playable | 8540 |

## Environment

- Host: grok-bot-vm-257014980, Linux 6.12.94+
- CPUs: 8; loadavg at capture: [2.51,2.48,2.11]
- Node: v20.19.2
- GPU (from run 1): ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)
- First title control: {"action":"newGame","label":"New Game"}

## Artifacts

- `measure-boot-times.mjs` — outbox-local harness
- `raw-runs.json` — full stage timelines
- `probe-stdout.log` — harness summary
- `report.md` / `DONE.md` / `IMPORT.md`

No live loader changes. Sibling historical measure: `design/program/vm-drop/boot-times/` (older master SHA).
