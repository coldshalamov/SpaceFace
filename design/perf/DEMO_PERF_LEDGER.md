# Demo performance ledger

Owner: performance hill-climb, 2026-11-07. This is the scoreboard, not a promise. All numbers are
from the same laptop and must name their context.

## Hardware and context

- Windows, 14 logical CPUs, 32 GB, **integrated Intel Graphics (0x7D45, D3D11)**, ANGLE.
- Shared checkout: other agents/Chrome can run concurrently; every run records host CPU busy and
  memory. Treat a single run as a sample, not a verdict.
- Demo target: **fluid 60 fps where the hardware allows; otherwise a locked, hitch-free 30 fps.**
  Never trade authored identity (bloom, trails, Nocturne, readable HUD) for a synthetic score.

## Protocol

1. Headed Electron/browser, 1280×720–1280×800, post-boot warm-up ≥20 s so the authored queue settles.
2. `scripts/probe-runtime-witness.mjs` for the ordinary New Game flight; `scripts/check-hitch-budget.mjs
   --headed --warmup=20000 --duration=30000` for the 6-enemy/10-rock stress scene.
3. Record: presentation p95, render p95, UI p95, vfx p95, long tasks (count/max), hitch samples, GPU
   tier, pixel ratio, CPU busy. Three runs, median, same scene.
4. A win is only a win if the matched run moves; a single noisy run is not evidence.

## Baseline and current

| Run | Context | Presentation p95 | Render p95 | UI p95 | Long tasks ≥50 ms | Max | Notes |
|---|---|---:|---:|---:|---:|---:|---|
| medium, original | headed witness, New Game | 53.4 ms | 36.9 | 16.2 | 339 | 497 | full raster, 2 bloom levels, no cap |
| integrated Auto v1 | headed witness, New Game | **36.8 ms** | **25.6** | **12.1** | **135** | **349** | auto High performance, 30 cap |
| stress scene | headed hitch gate | — | **54.4** | 16.6 | 143 frames >32 ms | 150 | 6 enemies / 10 rocks; still red |
| native + playout fix | headed witness, New Game | **41.1 ms** | **27.7** | **11.0** | 4/8 samples ≥50 ms | 52.1 | native 1280×720 at DPR 1; fence depth 1–2, playback ~1.0; 59 % host |

Two back-to-back tagged samples under a 59 % busy host (`perf-truth-1/2`) measured presentation
p95 55.9 / 58.3, render p95 39.0 / 39.8, UI p95 17.3 / 18.1. They are recorded as **contended
samples**, not a regression: the matching earlier sample at lower host load was 36.8 / 25.6 / 12.1.
The initial `[render]` console line reports the pre-preset 0.90 buffer; the live probe after flight
reads the applied 0.75 buffer (960×540).

The auto profile is `applyQualityPreset(..., 'low')` on an integrated GPU whose quality mode is Auto
(`src/render/renderer.js`, `src/render/adaptiveQuality.js`). It is reversible from Settings → Video
and never overrides a Manual choice.

## Configuration for this game (2026-11-07 owner direction)

SpaceFace is top-down: a ship is either on screen at a readable size or it is not. Whole-ship LOD
demotion is therefore **not** a performance lever for ordinary play. Keep it off
(`WHOLE_SHIP_LOD_RUNTIME_DEMOTION = false`); only a true speck (< 32 CSS px at first admission) may
start on the authored LOD2 sibling. Everything the player can read admits the authored LOD0 body.
LOD stays available for a race camera view if that mode is built; it is not a substitute for fixing
model loading or frame cost.

Resolution is a readability contract, not a free lever. The auto profile's own `renderScale` now
joins the combined-readability product, so dynamic resolution and hitch relief cannot compound a
0.75 preset down to ~0.45 of display (the observed blurry zoom-out failure). The combined raster
stays at or above 0.6; CAS sharpens the one intentional 0.75 scale.

## Measurement truth (2026-11-07)

The 60 fps-era thresholds were calling healthy capped frames hitches. All live/reporting thresholds
are now cadence-relative:

- Hitch = 1.5 × (1000 / live frame cap); 33.3 ms at 30 fps is on time, >50 ms is a missed present.
- `perfRuntime.beginFrame` receives the live cadence, not a hardcoded 16.67 ms.
- `check:hitch-budget` derives its budget from the live cap (or `--frame-budget-ms`), so the 30 fps
  demo route no longer fails on its own healthy cadence.
- The hitch governor uses the same cadence-relative ring.

## Landed since the first baseline

| Change | Expected effect | Proof |
|---|---|---|
| Auto preset keeps `qualityMode: auto` (`applyAutoQualityPreset`) | dyn-res/relief stay live; the preset no longer persists Manual | live probe: preset low, mode auto, 960×540, cap 30 |
| Combined readability floor includes the auto `renderScale` | no dyn-res compounding below 0.6; removes zoom-out blur | live probe: `dynResScale` 0.8 → 1.0 |
| Receipt/caption lane re-places from measured geometry on the 10 Hz safety tick; rowGap cached; real invalidations still re-measure | cut the 2.5–6 ms flush to rect reuse; target UI p95 ≤6 | `test/hud-receipt-geometry` 13/13 |
| Stunt callout resolves its eleven singleton obstacles once and stops forcing a rect read on the unchanged branch | ~0.3–0.5 ms UI + removes a 1–2 ms spike per callout | `pq-146-03` / `stunt-combo` 28/28 |
| Content-hash fast path in the render-package loader | warm re-admission needs no metadata fetch, re-serialize or re-hash | `render-package-loader` 51/51 (fast-path fetch count 1) |
| Collapse policy-walk yields for repeat archetypes | 3–6 fewer present waits per resident hull | `authored-async-liveness` + glass/lifetime suite 81/81 |
| Batch ambient flight texture uploads (4 maps / 4 MiB; on-glass stays per-item) | fewer residency present waits per hull | residency tests green |
| Budget-relative hitch truth in witness/probe/governor | a healthy 30 fps present is no longer reported as a hitch | `hitch-classifier` + witness suites: focused 266/266 |
| Initial ship LOD only for <32 px specks | readable contacts keep the authored body | `ordinary-ship-lod` / policy 72/72 |

## Open bottlenecks (ranked)

1. **Scene render** — normal-flight render p95 is still 25–39 ms depending on host load; the stress
   scene (6 enemies/10 rocks) is the pole. Draw submission/program switches (E7: setProgram 5.7 ms,
   drawPreparedFrame 15.75 ms), 52k stress-scene points, and 32 visible light slots are the candidates.
   No whole-ship LOD substitution.
2. **HUD** — the always-mounted HUD remains 12–17 ms p95 under load; the receipt lane fix targets the
   largest single flush, then contact marks / radar / ORRERY springs.
3. **Admission wall** — cold first flight still stages authored bodies late. Fast paths reduce the
   warm path; the cold decode/compile lane and fallback disposal are the next fixes.
4. **Host contention** — every claim here must be a matched/median result; single runs at 59 % CPU
   are samples only.

## Resolution is not the frame pole (same-session slope, 2026-11-07)

One headed session, manual quality (no dyn-res/relief), 7 s reset window per scale, host 59 % busy:

| renderScale | buffer | render avg / p95 | presentation avg / p95 |
|---:|---|---:|---:|
| 0.90 | 1152×648 | 27.3 / 34.1 | 34.7 / 43.4 |
| 0.75 | 960×540 | 29.5 / 37.0 | 38.5 / 49.9 |
| 0.60 | 768×432 | 29.5 / 36.4 | 36.5 / 45.0 |
| 0.75 (repeat) | 960×540 | 31.1 / 38.7 | 37.4 / 45.1 |

A 2.25× pixel cut changed render p95 by ~1 ms (inside the noise band). Under this host's CPU
contention the render phase is **submission/CPU-bound, not fill-bound**. Cutting resolution further
would only blur the picture. The next real lever is E7: fewer draws and program switches
(`setProgram` 5.72 ms, `drawPreparedFrame` 15.75 ms at 152 draws / 86.7 switches), then the retained
render list. Re-check the slope on a quiet host before ever raising or lowering the preset again.

## First-flight loading is the other red (2026-11-07)

Cold boots currently take 32–42 s to `entering-flight`, with 15–18 s in the `render-pipelines`
stage. The route labels the wait "Linking the first-flight render pipelines"; the assets audit
showed `precompile.js` has no production caller and the label is held while
`waitForRequiredOpeningPicture` runs. The host was 59 % busy for both samples; the whole route was
about 2× slower, so these are not a clean before/after.

A cap bypass during loading was tried and reverted: the sample came out slower (14.7 → 18.1 s in
the stage), and uncapping can steal main-thread time from the admission lanes on a contended host.
Re-test only on a quiet host, with the admission stage spans as the matched metric. The real
candidates remain the serial admission wall (per-hull compile/upload paced waits) and the four
permanently `missing` opening roots.

## Tether / boost / turn hitch: an in-frame shader link, fixed (2026-11-07)

The owner's "world hitches but UI keeps animating" symptom was a GPU brick, not frame cost. The
saved `freeze-hunt` witness showed:

- `[GPU brick] bloomScene 241.2 / 241.0 / 485.4 ms` on a tether run
- `programsAfter 185 → 197 → 200`, no new geometries
- `unstampedVisible`: `VFXBatch` root `SF_ActionAnswers`, plus `sf-energy-massline` cylinders

The tether/action VFX were created lazily on the first event and were absent from the first-flight
effect cook, so their programs linked inside a presented frame. `SF_ActionAnswers` is now minted
during `_initPools` (behind the loading shell), and the tether/action roots are in the live
first-flight effect cohort (`latePipelineAdmission.js`): massline energy ribbon, swing trace, latch
rim, chain readout, action answers. Focused proof:
`test/post-opening-pipeline-admission.test.mjs`.

Re-run with `--tether-boost-stress --turn-stress` under the same contended host: **no `[GPU brick]`**,
`bloomScene` p95 24.7 / **max 36.4 ms** (was max 486), and the first-visible-draw identity gate
now passes. The remaining admitted-subject stall in that stress route is 208 ms p95 / 1065 ms max
on `admission` (new ship entering the glass on a 59 % busy host); that is the admission lane, not
the tether VFX.

## Visual quality restored (2026-11-07)

The owner reported pixelation on zoom-out. The real chain was:

1. the auto preset wrote a sub-native `renderScale` (0.75, later 0.85);
2. `pixelRatioCap: 1` + the Auto integrated relief capped the pixel ratio at **1.0** even on the
   owner's **DPR 1.25** panel;
3. dyn-res could then take the content scale to 0.8 and the governor's old raster rung to 0.8.

The old picture presented ~0.53–0.68 physical pixels per display pixel and the browser upscaled it
1.5–1.9×. Fixed:

- `low.renderScale` is **1.0**, `pixelRatioCap` **2**, bloom levels back to the authored **2**.
- `INTEGRATED_RELIEF_RASTER_CAP` is **1.0**; the Auto pixel-ratio ceiling is the integrated tier's
  1.5, so a 1.25 panel renders native and a 2× panel still caps at 1.5.
- `COMBINED_READABILITY_FLOOR` is **0.9**: dyn-res can take one band to 0.9, never below.
- The hitch governor stops at level 2 (post-FX) and **never drops the raster**.

The authored bloom, Nocturne, trails, atmosphere and post-FX stay on. Resolution is not used as a
performance lever for this top-down picture; the frame is submission-bound.

Live headed probe at DPR 1 (CSS 1280×720): `renderScale 1`, drawing buffer **1280×720** (1:1, no
browser upscale), dyn-res 0.9, fence playback ~1.0. On the owner's DPR 1.25 panel the same profile
presents 1600×900. A no-op relief rung no longer announces "Graphics eased automatically"; only an
actually visible rung (bloom depth above 1, post-FX, or raster) may toast.

## The repeated world-only hitch: the playout clock ran below wall speed (2026-11-07)

The saved freeze-hunt / E1 evidence plus the placeholder fence arithmetic showed a second, systemic
defect that fits "the 3D world hitches while the DOM UI keeps animating" across tether, boost and
turn:

- `presentationRunner` measured `frameDt` per rAF callback but only advanced the snapshot fence on
  presented frames. At the 30 fps cap on a 60 Hz display every other callback is a cap-skip, so the
  fence received 16.7 ms per present instead of 33.3 ms; its 1.5× playback cap could then only reach
  **0.9× wall speed**. On a 120 Hz panel it was **0.43×**.
- The sim (worker timer or main lane) kept advancing at 1.0×, so `presentedTime` drifted back
  through the 18-pack ring, pinned to the oldest pack and advanced only when a reply landed — a
  staircase at worker-reply cadence, worst exactly when a tether/boost/turn tick lowered the reply
  rate. The DOM UI/audio run on their own clocks, so they kept moving.

Fix: `presentationRunner` accumulates `presentElapsedS` across every callback since the last present
and stamps it on the presented frame; the renderer feeds that to the fence. Live headed probe:
`playbackRate 0.99–1.03`, `bufferDepthPacks 1–2`, `delayMs 58–77` (pre-fix arithmetic: 1.5 saturated,
16–17 packs, 1.7–11.7 s lead). Focused proof: `test/presentation-runner.test.mjs` — a 30 Hz cap on a
60 Hz callback stream must stamp ~0.033 s per present, not 0.017 s.

This is presentation-only and deterministic: same elapsed source, accumulated; no sim state or
ownership changed.

## Rules

- Do not lower the bar or rename a hitch; fix the frame or name the residual.
- Do not silently change the authored look. Quality tiers are named, reversible and announced.
- Do not re-record determinism goldens for a perf change.
- Every accepted change adds a row here and a focused check.
