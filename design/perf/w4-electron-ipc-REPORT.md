# Wave-4 Lane Report — Electron IPC / Context-Isolation Audit

Lane question: *is the IPC layer hot? Does per-frame data cross the main↔renderer boundary,
and what does each preload-bridge call cost?*

Branch: `devin/1790670866-w4-electron-ipc` off `origin/master` (c19e77b9c).

## Verdict

**DOCUMENTED — IPC is not hot; no change warranted.** The entire developer-visible channel
surface is nine narrow, allowlisted channels driven by rare events (menu build, achievement
sync, clip export, workshop actions, window lifecycle). A live instrumented census through
boot → New Game → Launch → 8 s of real flight → minimize/restore measured **4 organic
crossings** (1 `build-info`, 2 `steam-status`, 3 `shell-lifecycle` sends), **zero
`ipcRenderer.send`**, zero `sendSync`, and ~0.29 ms of total main-process handler wall time.
No per-frame data crosses the boundary: sim↔render share one JS heap via the dense-snapshot
fence, assets stream over the in-process loopback HTTP server (`127.0.0.1:<port>`), and codec
work uses in-renderer `Worker.postMessage` (a different, in-process boundary). The measured
per-call bridge cost — ~1–3.5 ms per `invoke` round-trip — is immaterial at this frequency
(five orders of magnitude under a 16.6 ms frame across a whole session).

## webPreferences audit (electron/main.cjs `createWindow`)

| Option | Value | Assessment |
|---|---|---|
| `contextIsolation` | `true` | Default since Electron 12; the security checklist requires it even with `nodeIntegration:false`. Its cost is the contextBridge proxy hop measured below — paid only by the 9 allowlisted calls. |
| `sandbox` | `true` | Default since Electron 20; constrains the preload to `ipcRenderer`/`contextBridge` — matches how `preload.cjs` is written. |
| `nodeIntegration` | `false` | Minimal surface; game code never sees Node. |
| `backgroundThrottling` | `true` for players | Chromium default; throttles rAF/timers when the page is backgrounded. Correct here because the game *wants* the sim parked when hidden — `spaceface:shell-lifecycle` already drives `presentationRunner`'s HIDDEN_OR_MINIMIZED parking. Only the dual-gated isolated-evidence profile may disable it (`SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION` + test mode). |
| `spellcheck` | `false` | Skips the hunspell/dictionary service entirely (UI already sets `spellcheck="false"`). |
| `v8CacheOptions` | `'bypassHeatCheck'` | Wave-1 electron lane; persists V8 code cache on first load, later launches deserialize. |
| `webSecurity` / `allowRunningInsecureContent` | `true` / `false` | Baseline secure; loopback-only origin. |
| `offscreen` | absent | Correct — offscreen rendering forces software-composited frame shuttling; a WebGL game needs the accelerated surface. |
| `preload` | `electron/preload.cjs` | Narrow bridge; see census below. |

No `ipcRenderer.sendSync`, no `@electron/remote`, no `webContents.executeJavaScript` on the
game window (the only call is the env-gated one-shot player-store migration window). IPC
error path is correct: `handle` errors serialize only `message` to the renderer, which the
preload swallows where appropriate.

## Channel census (static + measured)

All nine channels, their only callers, and the measured counts from two instrumented live
sessions (`scripts/w4-ipc-census.mjs` — boots the real shell through an instrumentation
wrapper, `scripts/w4-ipc-census-main.cjs`, that counts every `ipcMain` invoke/send and every
`webContents.send` before `electron/main.cjs` loads; no shipped file modified):

| Channel | Dir | Renderer caller | Trigger | Measured (run 1 / run 2) |
|---|---|---|---|---|
| `spaceface:shell-lifecycle` | main→r `send` | `presentationRunner` subscribe | window focus/blur/minimize/show/restore + power suspend/resume/lock | **8 / 6** sends (incl. the driven minimize+restore cycle) |
| `spaceface:quit` | r→main `send` | `quitGame.js` (3 bridge aliases) | user quit | **0 / 0** |
| `spaceface:build-info` | r→main `invoke` | `mainMenu.js` fine print | once per page load (memoized `versionPayloadPromise`) | **1 / 1** |
| `spaceface:steam-status` | r→main `invoke` | `achievements.js` `syncSteamBacklog` | install + `save:store-synced` | **2 / 2** |
| `spaceface:achievement-unlock` | r→main `invoke` | `achievements.js` `mirrorToShell` | per unlock | **0 / 0** (no unlock fired) |
| `spaceface:workshop-status/-publish/-sync` | r→main `invoke` ×3 | `settings.js` workshop UI | user action | **0 / 0** |
| `spaceface:save-clip` | r→main `invoke` | `clipExport.js` | per export job (≤24 MB b64) | **0 / 0** |
| `spaceface:perf-metrics` | r→main `invoke` | none — probe-only channel | perf probes only | **0 / 0** |

Main-process handler wall time for the whole organic session: ~0.29 ms. Renderer→main
`send` count: **0** in both runs.

## Preload bridge cost per call (measured inside the live page, 400 warm iters)

| Call | run 1 | run 2 |
|---|---|---|
| `spacefaceShell.buildInfo()` invoke round-trip | 1.63 ms | 0.87 ms |
| `spacefaceShell.perfMetrics()` invoke round-trip | 3.46 ms | 1.79 ms |
| in-page `async` no-op baseline | 0.00015 ms | 0.00015 ms |
| `structuredClone` of an invoke-size payload | 0.0019 ms | 0.0020 ms |

The ~1–3.5 ms invoke cost is boundary hops (main-world → isolated-world contextBridge
proxy, then renderer → main-process Mojo pipe, then the same path back), *not*
serialization — cloning an equivalent payload in-page is ~2 µs. `perfMetrics` is the
pricier channel because its handler runs `app.getAppMetrics()` (~0.67–0.79 ms of
main-side work per call, measured). Even a hypothetical per-frame `invoke` would cost
~1–3.5 ms of renderer await latency — but no caller is per-frame, and `send` (the only
fire-and-forget primitive used) is strictly cheaper since it never waits on a reply.

## Research citations

- **Electron IPC tutorial** — channels/`send`/`invoke` patterns:
  https://www.electronjs.org/docs/latest/tutorial/ipc
- **`ipcRenderer` API** — "`send`/`invoke` args are serialized with the Structured Clone
  Algorithm, just like `window.postMessage`"; `invoke` resolves a Promise; `sendSync`
  exists but is unused here (it would block the renderer main thread until the reply):
  https://www.electronjs.org/docs/latest/api/ipc-renderer
- **`contextBridge` API** — "Function values bound through the `contextBridge` are proxied
  through Electron to ensure that contexts remain isolated… parameters, errors and return
  values are copied when they are sent over the bridge" (explains the measured ~1 ms floor):
  https://www.electronjs.org/docs/latest/api/context-bridge
- **`BrowserWindow` options** — `backgroundThrottling` "throttle[s] animations and timers
  when the page becomes background… Defaults to `true`"; `sandbox` "Default is `true` since
  Electron 20": https://www.electronjs.org/docs/latest/api/structures/browser-window-options
- **Electron performance tutorial** — "Under no circumstances should you block this process
  [main] and the UI thread with long-running operations": main-process IPC work totals
  ~0.3 ms/session here, so the boundary cannot stall the shell's UI thread.
  https://www.electronjs.org/docs/latest/tutorial/performance
- **Electron security checklist** — `contextIsolation`+`sandbox` posture this shell already
  holds: https://www.electronjs.org/docs/latest/tutorial/security
- Per-frame traffic that *does* cross a process boundary is Chromium-internal (renderer →
  GPU process command buffers for WebGL) — outside the `ipcMain`/`ipcRenderer` surface this
  lane audits, and already visible via `app.getAppMetrics()` on the probe channel.

## Findings (documentation-only; no patch)

1. **Stale contract test**: `test/electron-security-contract.test.mjs` — *"sandboxed preload
   remains a one-way lifecycle subscription"* asserts the preload sends only the quit
   channel, but PQ-033.03 / PQ-172.01 added six `invoke` channels (`save-clip`,
   `build-info`, `achievement-unlock`, `steam-status`, `workshop-*`, `perf-metrics`).
   Verified failing on clean HEAD (3 failures in that file), plus
   `check-electron-dependency-drift` fails on clean HEAD (expected prod-dep set missing
   `electron-updater`, `three-mesh-bvh`, `three.quarks`, `@elemaudio/web-renderer`).
   Preexisting — flagged for the contract lane.
2. **Three quit bridges** (`spacefaceLifecycle.quit`, `spacefaceShell.quit`,
   `spacefaceQuit`) expose the same channel; hygiene redundancy, zero cost.
3. `spaceface:perf-metrics` is probe-only (no `src/` caller) — correct as-is.

## Metrics

- **Golden 47a** (`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs
  test/47a.inputs.json --expect test/47a.telemetry.expected.json --hash --repeat 20
  --reload-at 600`): `sha256 == baselineSha256 ==
  cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`, `deterministic: true`,
  exit 0 — identical by construction (zero shipped-file edits).
- **IPC census** (2 instrumented live sessions, `design/perf/w4-electron-ipc-census.json`):
  organic traffic = 3 invokes + 3–8 lifecycle sends + 0 `send`/session; total main-process
  handler time ~0.29 ms; bridge invoke cost 0.87–3.46 ms/call across runs.

## Zero visible quality change

No shipped code changed. Added: `scripts/w4-ipc-census-main.cjs` (instrumentation wrapper
entry), `scripts/w4-ipc-census.mjs` (Playwright driver), this report, and the census JSON
receipt. All are measurement tooling; the game and shell binaries are byte-identical.
