# SpaceFace — Quality-Preserving Performance Triage

**Generated:** 2026-07-06  
**Scope:** Baseline measurement only — no runtime code changed, no quality knobs reduced.

Evidence artifacts:
- `.devshots/perf/raf-control.json`
- `.devshots/perf/performance-profile.json`
- `.devshots/perf/performance-profile-crowded-flight.jpg`
- `.devshots/perf/hitch-budget.json`
- `.devshots/perf/ui-perf-triage.log`

---

## 1. Environment

| Field | Value |
|---|---|
| **Browser path** | Installed Chrome/Edge via CDP (`probe-performance-profile.mjs`, `probe-raf-control.mjs`); Playwright Chromium for hitch-budget |
| **Electron** | Not used for this triage (browser probes only) |
| **Window size (perf profile)** | 1830×973 requested; effective viewport 1540×732 @ DPR 1.25 |
| **Window size (raf control)** | 1830×973; effective 1540×732 @ DPR 1.25 |
| **Window size (hitch budget)** | 1280×800 @ DPR 1.0 |
| **GPU renderer** | `ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)` |
| **GPU tier** | **Integrated** (Intel via ANGLE/D3D11). Not software/SwiftShader. |
| **Headed / headless** | Perf profile + raf control: **headed**. Hitch budget (corrected re-run): **headed**. First hitch-budget npm invocation fell through to script defaults (**headless**, 60 s) — see Command notes. |
| **User agent** | Chrome/149.0.0.0 (Windows NT 10.0; Win64; x64) |
| **Concurrent asset work** | Blender MCP + `blender.exe` process hints present during perf profile (`environment.activeAssetPipeline: true`) |
| **Default video settings (unchanged)** | `renderScale: 0.85`, `bloom: true`, `shadows: false`, `particleQuality: medium`, `pixelRatioCap: 2` |

### rAF environment control (`check:perf:control`) — PASS

Blank-page and WebGL-clear baselines both pass at ~17 ms p95 on this machine, confirming the OS/browser can sustain 60 Hz when not running the full game stack.

---

## 2. Summary table

Measurements from **`crowded-flight`** scenario (`check:perf`, strict, diagnostic variants). Hitch-budget rows are from the corrected headed 20 s run unless noted.

| Metric | crowded-flight | hitch-budget (20 s headed) | Budget / target | Pass? |
|---|---:|---:|---|:---:|
| **rAF p95** | 33.4 ms | 14.9 ms | ≤16.7 target / ≤34.3 floor | crowded: floor only |
| **rAF hitches >32 ms** | 95 | 7 | ≤0 (crowded) | **FAIL** (crowded) |
| **Diagnostic frame p95** | 33.4 ms | — | ≤34.3 floor | PASS (crowded) |
| **Render calls peak** | 253 | — | ≤600 | PASS |
| **Triangles peak** | 17,644 | — | — | — |
| **Heap growth** | 0.94 MB | — | ≤30 MB | PASS |
| **Phase sim p95** | 2.1 ms | — | ≤4 ms | PASS |
| **Phase simFrame p95** | 3.9 ms | — | ≤8 ms | PASS |
| **Phase render p95** | 7.0 ms | — | ≤16 ms | PASS |
| **Phase vfx p95** | 0.4 ms | — | — | PASS |
| **Phase feel p95** | 0.1 ms | — | — | PASS |
| **Phase ui p95** | 1.1 ms | — | ≤2 ms | PASS |
| **Callback p95** | 10.7 ms | — | ≤16.7 ms | PASS |
| **Untracked p95** | 0.2 ms | — | ≤4 ms | PASS |
| **Spatial hash rebuilds/s** | 0 | — | ≤15 | PASS |
| **Spatial hash queries/s** | 0 | — | ≤55 | PASS |
| **Spatial hash candidates/s** | 0 | — | ≤2500 | PASS |
| **Visible meshes** | 208 | — | ≤220 | PASS (tight) |
| **Ship dynamic meshes** | 85 | — | ≤96 | PASS |
| **Material keys** | 49 | — | ≤64 | PASS |
| **Bloom full-frame passes** | 2 | — | ≤2 | PASS |
| **Bloom passes** | 3 | — | ≤3 | PASS |
| **Loop shed backlog frames** | 2 | — | ≤5 | PASS |
| **UI compositor: hiddenBackdropActive** | 0 | — | ≤0 | PASS |
| **UI compositor: inactiveDockFadeDisplayed** | 0 | — | ≤0 | PASS |
| **UI compositor: deadVignetteShells** | 0 | — | ≤0 | PASS |
| **UI compositor: inactiveFullscreenShellsDisplayed** | 0 | — | ≤0 | PASS |

### Command results

| Command | Result | Notes |
|---|---|---|
| `npm install` | Skipped | `node_modules` present |
| `npm run build:bundle` | **PASS** | `build/web/` OK |
| `npm run check:perf:control` | **PASS** | rAF baseline 17.1 ms p95 |
| `npm run check:perf` | **FAIL** (3 budgets) | See failed budgets below |
| `npm run check:hitch-budget -- --duration 20000 --warmup 5000` | **Partial** | npm did not forward `--duration`/`--warmup`; first run used defaults (60 s, headless). Corrected headed run via direct `node` invocation succeeded. |
| `npm run check:ui:perf` | **PASS** | Frame-sleep OK; radar perf OK; ui-identity 12/12 |
| `npm run check:radar:perf` | **PASS** | Included in `check:ui:perf`; standalone also green |

### `check:perf` failed budgets

1. `raf.frame.hitchesOver32.max` — **95** (limit 0)
2. `raf.frame.p95.target` — **33.4 ms** (limit 16.7 ms)
3. `raf.frame.p95.environmentFloor` — **33.4 ms** (limit 17.05 ms = raf-control webgl-clear p95 17.1 + 0.25 tolerance)

### Diagnostic variant deltas (crowded-flight, rAF p95)

| Variant | rAF p95 | Δ vs baseline 33.4 ms | Interpretation |
|---|---:|---:|---|
| `webgl-submit-noop-diagnostic` | **16.8 ms** | **−16.6 ms** | GPU submit/present dominates |
| `sim-paused-render-only` | 33.4 ms | 0 | Simulation not primary |
| `sim-paused-bloom-off` | 33.5 ms | +0.1 | Bloom not primary |
| `bloom-off-straight-render` | 33.4 ms | 0 | Post chain not primary |
| `bloom-post-grade-off` | 33.8 ms | +0.4 | Grade/grain not primary |
| `hud-hidden-compositor-isolation` | 33.4 ms | 0 | DOM HUD compositor not primary |
| `ui-effects-off-diagnostic` | 33.4 ms | 0 | CSS effects not primary |
| All HUD region isolations | 33.4–33.5 ms | ~0 | Per-region compositor not primary |

---

## 3. Bottleneck classification

**Primary:** **GPU/WebGL submit or post-processing** (`render-submit-present`, confidence **high**)

**Secondary (episodic, not steady-state):** **shader compile / asset upload hitch** — startup and warm-up spikes; not the sustained 30 fps pacing bucket.

### Ruled out (with evidence)

| Class | Ruled out? | Why |
|---|---|---|
| Software WebGL / wrong GPU path | Mostly | raf-control WebGL-clear at 17.1 ms p95 on same Intel GPU; not SwiftShader |
| DOM/CSS compositor | **Yes** | Every HUD/root/UI-effects variant stays ~33.4 ms |
| JS frame callback | **Yes** | callback p95 10.7 ms ≤ 16.7 ms; untracked 0.2 ms |
| Simulation / physics | **Yes** | simFrame p95 3.9 ms; `sim-paused` still 33.4 ms |
| VFX | **Yes** | vfx phase p95 0.4 ms |
| Spatial hash / broadphase | **Yes** | 0 rebuilds/queries/candidates in sample; all spatial budgets pass |
| Bloom / post-processing (steady) | **Yes** | `bloom-off` and `sim-paused-bloom-off` do not improve p95 |
| Unclassified steady pacing | **No** | Noop diagnostic isolates GPU submit |

### Integrated GPU context

The machine is on **Intel integrated graphics**. raf-control proves the browser can hit ~17 ms on empty WebGL, but crowded authored flight sits at **33.4 ms p95** — exactly one missed 60 Hz frame worth of GPU work per displayed frame on this tier. This is an environmental constraint amplifier, not the root cause class (noop proves JS-side phases are not the long pole).

---

## 4. Evidence

### GPU/WebGL submit or post-processing (primary)

- `raf.frame.p95.target` **failed**: 33.4 ms > 16.7 ms
- `raf.frame.hitchesOver32.max` **failed**: 95 hitches > 0
- `raf.frame.p95.environmentFloor` **failed**: 33.4 ms > 17.05 ms (game adds ~16.3 ms over empty WebGL baseline)
- `webgl-submit-noop-diagnostic` rAF p95 **16.8 ms** vs baseline **33.4 ms** — **16.6 ms delta** meets `render-submit-present` threshold (≥10 ms)
- `sim-paused-render-only` rAF p95 **33.4 ms** — pausing sim does not recover 60 Hz
- `bloom-off-straight-render` rAF p95 **33.4 ms** — disabling bloom diagnostically does not recover 60 Hz
- Scene still submits **253 draw calls**, **208 visible meshes**, **49 material keys** — within numeric budgets but dense for iGPU fill-rate
- Authored ship breakdown: **26 drive:core + 26 drive:plume + 10 canopy** transparent surfaces across 10 ships — high transparent-layer pressure

### Shader compile / asset upload hitch (secondary, episodic)

- `framePacingWarmup` **not ready** (timeout): worst frame **133.4 ms** during 5 s warm-up gate
- Hitch-budget headed run: worst frame **567.5 ms** at +8172 ms (early-session spike); 4 frames >50 ms
- Hitch-budget headless default run: worst frame **717 ms**; 130 frames >50 ms; longtasks ≥50 ms clustered ~92–97 s
- `recent asset fetches: []` at spike time — spikes correlate with warm-up/compile, not mid-flight streaming
- Steady-state crowded-flight p95 still 33.4 ms after warm-up — compile hitches are additive, not the sustained bucket

### Classes examined and rejected

- **DOM/CSS compositor:** `hud-hidden`, `hud-layer-hidden`, `root-nonhud-overlays-hidden`, `ui-effects-off`, all per-region HUD isolations → rAF p95 unchanged (~33.4 ms). UI compositor shell flags all **0**.
- **JS frame callback:** `frame.callback.p95` 10.7 ms (pass); `frame.untracked.p95` 0.2 ms (pass).
- **Simulation:** `phase.simFrame.p95` 3.9 ms (pass); `sim-paused` rAF p95 33.4 ms.
- **Spatial hash:** `spatialHash.*PerSecond` all **0** in crowded-flight window (pass). Radar perf check: 99.21% candidate reduction, spatial scan 7.2 ms — CPU-side radar/spatial path healthy.
- **VFX:** `phase.vfx.p95` 0.4 ms.

---

## 5. Next recommended prompt

**Choose: Prompt 2 — GPU submit structural reduction (quality-preserving)**

### Prompt queue (for orchestration)

| # | Prompt | When |
|---|---|---|
| 1 | Quality-preserving performance triage baseline | **Done (this report)** |
| 2 | GPU submit structural reduction | Primary bottleneck is `render-submit-present` |
| 3 | Startup hitch / shader-compile gating | Episodic 500–700 ms spikes persist after warm-up |
| 4 | Bloom/render-target graph structural pass | Only if Prompt 2 insufficient; bloom-off diagnostic already ruled out as primary |
| 5 | iGPU fill-rate validation matrix | Cross-tier confirmation after structural wins |

### Justification for Prompt 2

The `webgl-submit-noop-diagnostic` variant drops rAF p95 from **33.4 → 16.8 ms** while every sim, bloom, and UI isolation variant leaves p95 unchanged. JavaScript phases sum to ~10.7 ms and pass all budgets. The crowded scene submits **253 draws / 208 visible meshes** with **52 transparent ship surfaces** (plume + canopy) on **Intel iGPU** — within draw-count budgets but over fill-rate for 60 Hz.

Prompt 2 should target **structural** GPU submit reduction only:
- Canonical material role sharing (reduce variant count below 49 without dropping meshes)
- Transparent pass ordering / plume+canopy batching
- Authored static batch expansion (22 visible batches today; 85 dynamic ship submeshes remain)
- No default changes to `renderScale`, `bloom`, `shadows`, or `particleQuality`

**Do not** recommend bloom-off, render-scale reduction, or shadow/particle disabling as fixes — those remain diagnostic-only isolates per probe policy.

---

## Appendix — probe classifier output

```json
{
  "primary": "render-submit-present",
  "labels": ["render-submit-present"],
  "confidence": "high",
  "ruledOut": [
    "simulation-frame-budget",
    "ui-javascript-budget",
    "raw-draw-call-count-budget",
    "game-js-callback-budget"
  ],
  "nextContracts": [
    "Keep authored visuals enabled, but reduce GPU submit/present pressure: shared materials, fewer shader/material variants, cheaper transparent/fullscreen compositing."
  ]
}
```

Source: `scripts/probe-performance-profile.mjs` → `.devshots/perf/performance-profile.json`