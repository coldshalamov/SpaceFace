# E5 — Shared memory everywhere / Electron-first: diagnosis

## 1. The player-visible problem
The public web build runs the transfer fallback (no SharedArrayBuffer → every sim pack crosses
the wire as cloned bytes), timers are clamped to 100 µs, and the laptop's shipped shell (Electron)
was believed to lack isolation too. Slower transport, weaker measurements.

## 2. Measured cause chain (verified this session)
- **The dev/embedded server already sends the right headers**: `scripts/lib/gameServer.cjs`
  sends `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy:
  credentialless` on every byte, with the comment naming exactly what they unlock. Electron
  loads the game from `http://127.0.0.1:<port>/` served by THIS server (electron/main.cjs:1289,
  shared with server.js "so the two launchers can never drift") — **the master plan's
  "[I] Electron sets no isolation" is outdated for the shell; the remaining gap is verification,
  not implementation.** Live probe on the dev server today: `crossOriginIsolated === true`,
  SAB lane auto-armed (simLaneMain resolveSimLaneFlags auto-arms where the realm can host it).
- **The public deploy sends no isolation headers** [V]: `vercel.json` carries only cache/
  nosniff headers. This is the real gap — the public build's SAB lane can never arm.
- **Third-party audit**: the boot path loads zero third-party origins (all external URLs in the
  repo are license comments); `credentialless` COEP cannot break any resource.
- **Electron GPU switches already present** [V]: `applyGpuHintSwitches` sets
  `ignore-gpu-blocklist`, `enable-gpu-rasterization`, `enable-zero-copy`,
  `force_high_performance_gpu`, `use-angle=d3d11` (env-overridable), plus `js-flags`
  (memory), `disable-features`, backgrounding/component-update disables. What's missing is the
  measured audit table (which switch earns its keep on the Intel iGPU), not the switches.
- **Signed update path**: `electron/autoUpdate.cjs` exists (inspection + honest status in
  STATUS.md; a real signed old→new update run needs a packaged build and is outside a working
  session's reach — tracked, not claimed).

## 3. Is the design the bottleneck?
No. The transport design (SAB arena v2 with cloned-array fallback) is correct and already
capability-gated. The bottleneck is a deployment header gap. Replacing the transport would buy
nothing; the fix is one header block plus proof.

## 4. Chosen road
1. `vercel.json`: add COOP `same-origin` + COEP `credentialless` on all routes (same values the
   shared server sends — one policy everywhere).
2. Probe: the E10 frame-truth trace already records `crossOriginIsolated` + `SharedArrayBuffer`
   in every export; add the SAB-lane state (simLane flags/journal diagnostics) to the trace so
   "the SAB lane active" is citable from the same evidence.
3. Electron: verify the shell reaches `crossOriginIsolated === true` through the embedded server
   (probe when the machine allows a launch); document the iGPU switch audit table with
   measured A/B where a run is possible, honest "not yet measured" where not.
4. Signed update path: inspect and document; no false claims.
