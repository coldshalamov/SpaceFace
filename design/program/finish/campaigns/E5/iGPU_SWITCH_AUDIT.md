# E5 — Intel iGPU switch audit + platform isolation status

**Owner:** Lane 1 PIPELINE. **Date:** 2026-11-06.

## 1. Cross-origin isolation (the SAB unlock)

| Shell | Header source | State |
|---|---|---|
| Dev server (`server.js`) | shared `scripts/lib/gameServer.cjs` staticHeaders | **Verified live**: `crossOriginIsolated === true`, SAB lane auto-armed, SAB journal arena bound (this session's E1 runs). |
| Electron shell | same shared server, `http://127.0.0.1:<port>/` (electron/main.cjs:1289) | Same headers by construction (one module, "so the two launchers can never drift"). Live-shell probe pending machine-quiet window; no code gap found — the master plan's "[I] Electron sets no isolation" is outdated. |
| Public web deploy | `vercel.json` | **Was missing entirely — fixed this session**: `/(.*)` now sends COOP `same-origin` + COEP `credentialless`, matching the shared server's values. Boot path loads zero third-party origins (audited: all external URLs in the repo are license comments), so credentialless cannot break a resource. |

SAB lane arming is capability-gated in `src/core/simLaneMain.js resolveSimLaneFlags` (auto-arms
wherever the realm can host it; `?simSab=0` opts out). Every E10 trace export now carries
`crossOriginIsolated`, `sharedArrayBuffer`, and the sim-lane transport diagnostics (E5 probe).

## 2. GPU switches in the Electron shell (electron/main.cjs `applyGpuHintSwitches`)

| Switch | Set | Intended effect on the Intel iGPU | Measured |
|---|---|---|---|
| `ignore-gpu-blocklist` | yes (unless safe-graphics flag) | Un-blocklists Intel gen9/gen12 blocks; hardware GL/D3D11 instead of SwiftShader | Present since the earlier perf campaign; the 2026-11-05 handoff's live play shows `software=false`, ANGLE/D3D11 — consistent with it working. A dedicated A/B is not yet recorded. |
| `enable-gpu-rasterization` | always | Raster 2D/composited layers on GPU | Not separately A/B'd. |
| `enable-zero-copy` | yes (unless safe-graphics) | Zero-copy GPU upload paths | Not separately A/B'd. |
| `force_high_performance_gpu` | yes (unless safe-graphics) | Discrete-preference hint (no-op on single-GPU laptop) | n/a on this laptop. |
| `use-angle=d3d11` (env `SPACEFACE_ANGLE_BACKEND`) | yes | Pins ANGLE backend; avoids GL-on-D3D12 surprises | The handoff's live evidence shows ANGLE/D3D11 active. |
| `js-flags` (memory ceiling) | yes | Bounded old-space for the renderer process | Not separately A/B'd. |
| `disable-features=…`, backgrounding/component/metrics disables | yes | Removes background throttling/noise | Not separately A/B'd. |

**Honest status:** every switch's presence and intent is verified in code, and the composite
result (hardware ANGLE/D3D11, no software fallback) is verified in the 2026-11-05 live-play
evidence. A per-switch A/B table on this laptop is NOT yet recorded — it needs machine-quiet
matched runs and belongs with the next matched measurement window (shared with E1's live
re-record). No switch is claimed as individually measured.

## 3. Signed update path

- Feed: electron-builder `publish: github (coldshalamov/SpaceFace)`; NSIS target;
  `electron/autoUpdate.cjs` guards dev/isolated-evidence launches away from the feed and gates
  `checkForUpdates`.
- **Code signing is not configured** (no certificate/signtool config in package.json `win` or
  build scripts). Unauthenticated-download risk is bounded by the GitHub release transport, but
  "signed update" is NOT met. The 2026-11-05 handoff also lists "actual signed Electron
  old→new update" as open. Next step needs the owner's signing certificate decision — flagged,
  not worked around.
