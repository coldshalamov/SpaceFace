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

## Open bottlenecks (ranked, post-fix)

1. **Draw submission (E7)** — the frame is CPU/submit-bound, not fill-bound. `drawPreparedFrame`
   15.75 ms / `prepareFrame` 8.19 / `setProgram` 5.72 at 152 draws / 86.7 switches. The staged plan
   is ready: root-wide player cohort, per-entry batch fallback, per-instance color, damage-scoped
   static merge, material-coherent order, release-time COLOR_0 bake, retained view list. This is the
   next real frame-time program.
2. **Worker reply / ACK tail** — E10 measured reply work p50 8 / p95 58 / p99 105 / max 458 ms. A
   freeze-hunt episode showed `awaitingAck:true`, `commandInFlight 2662 ms`, `workerSteps`
   advancing: the worker retains the next pack until the main thread ACKs, so a main-thread stall
   freezes the picture. The fence clock fix removes the steady drift; ACK decoupling from rAF is
   the next candidate (protocol change, needs focused proof).
3. **Admission wall** — cold first flight is ~15 s now; a mid-flight subject admission can still
   land a 135 ms sync slice (stress route `admission` p95 208 / max 1065 ms on a 59 % host). Cold
   decode/compile slicing and fallback disposal remain.
4. **HUD** — 11–18 ms p95 under load; the receipt-lane reuse and callout cache are in. Contact
   marks, radar and ORRERY springs are the next cuts.
5. **Host contention** — every claim here must be a matched/median result.

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

Cold boots measured 32–42 s to `entering-flight` earlier on this box, with 15–18 s in the
`render-pipelines` stage. The route labels the wait "Linking the first-flight render pipelines"; the
assets audit showed `precompile.js` has no production caller and the label is held while
`waitForRequiredOpeningPicture` runs.

The latest native run reached flight at **15.4 s** (render-pipelines 8.0 → 15.4 s, 7.5 s) on a
less-contended host, after the content-hash fast path, policy-walk collapse, texture batching and
VFX warm. Four opening roots are still permanently `missing` (604 wreck, 607–609 payloads) and show
as procedural fallbacks; they do not block flight. The first-visible-draw identity gate still fails
on late-cooked residency by design (`applyFirstPlayablePaintRelease` comment); it is a diagnostic,
not a visual gate.

A cap bypass during loading was tried and reverted: the sample came out slower, and uncapping can
steal main-thread time from the admission lanes on a contended host. Re-test only on a quiet host.


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

## The tether turn hitch: held W+A crossed the retro hemisphere (2026-11-07)

Tethering disables velocity vectoring, and the unvectored cruise bound only engaged inside the
closing-speed window near combat cruise. A held W+A from rest crossed 90° of slip *before* that
window, aimed full thrust backwards and repeated the retro-burn stop every ~2 s — the owner's
"hitches when I tether or turn while accelerating". Kernel reproduction before the fix: min speed
8.7 of a 195 WU/s cruise, 151° slip.

Fixed in `flightV3` / `propulsionKernel`:

- the unvectored assisted bound applies at every speed above the dead band;
- it holds its 90° lead allowance instead of releasing there (the vectoring weld still releases at
  90° for deliberate flips);
- a tethered **non-orbiting** player gets the bound; an active orbit assist still owns the turn.

Focused proof: `test/velocity-vectoring.test.mjs` new from-rest held-turn case — stays above half
combat speed and out of the full retro hemisphere for 15 s; velocity-vectoring 18/18, flightV3 spec
+ governed reverse 13/13, `test:fast` 39/39, `check:playable` 18/18.

## Retained-batch churn (2026-11-08)

The stress gate's "new GPU program events" were the retained rigid batch, not a new mesh shader:
`[GPU brick]`-style events named `SF_RigidOpaqueBatch_nocast|noreceive`, and the program count
went 152 → 153 → 152 every few seconds. A live probe caught the exact reason:
`[rigid-batch] rollback membership-quiet-rebuild` — the controller folded newly streamed roots
into the active cohort every 8 quiet frames, disposing and re-preparing (and relinking) the whole
batch.

Fixed:

- New roots now stay direct for the active cohort's lifetime; the cohort reforms from current roots
  only when it empties or the sector changes. A few direct hulls cost less than a 100–500 ms relink.
- A source that drifts in material/tint/uniform/shadow state is demoted **per entry** to its direct
  draw; the surviving cohort keeps its geometry/program. Geometry, reparent, render-order,
  compile-hook and layer writers still take the full rollback.
- The hitch gate now waits (bounded) for the retained batch's first activation, and counts a
  "new GPU program" only when an added program is attached to a live scene material. A disposal is
  not a link, and an ownerless cache entry is not a drawn program.

A quiet normal-flight probe after the change: batch active with 46 instances / 7 batches, 0
rollbacks while roots streamed out; no `membership-quiet-rebuild` event. Remaining stress reds are
marginal 50.0 ms frames and the stall render spikes, not the batch.

Verification after these changes: `check:playable` 18/18; `check:sim` and `check:sim:v3` exit 0
(the 47-A tape is unchanged); `test:fast` 39/39; rigid batch/policy/cohort 74/74. Wall-time stress
and witness reruns are invalid while the shared host is above ~70 % CPU (it reached 87 % from
another agent's session).

## Picture, present clock and gate truth (2026-11-08)

Three audits kept this from being called optimal. What changed:

- **The Auto/High-performance picture is no longer a quality cut.** `particleQuality` is **medium**
  (the authored mid sky tier; the source's own measurement says mid holds 60 fps on this iGPU and
  the frame is submission-bound) and `sharpen` is **false** at native raster. The legacy unsharp was
  left over from the 0.75-scale posture and doubled with CAS on any dyn-res dip.
- **CAS ignores sub-pixel fractional footprints.** `resolveCasSharpenActive` floors the CSS×DPR
  footprint, so a 1600×900 buffer against 1600.5×900.5 never reads as an upscale; a full-pixel
  deficit still does.
- **VFX, camera follow, feel and UI advance on the presented interval**, not the rAF callback dt.
  At a 30 Hz cap on 60 Hz the callback dt is 16.7 ms while the picture cadence is 33.3 ms; the old
  wiring ran cosmetics at 0.5× wall speed (0.25× at 120 Hz) while the snapshot world ran at 1×.
  `state.render.lastPresentDtMs` is now the presented interval too.
- **Receipt-lane content changes keep settled obstacle geometry.** A caption/toast text or
  show/hide no longer clears the measured rects; only a layout/settings invalidation does. The
  busy-lane safety tick re-places against the last measurement and still loses to a real one.
- **The hitch gate reports the picture and the worker lane.** `probe-runtime-witness` now records
  `picture` (native buffer vs CSS×DPR, renderScale, dynRes, relief level, contentScale, CAS state,
  bloom depth, particle/sky tier, sharpen, cap) and `lane` (apply max, >100 ms applies, freeze
  state, last-reply fold/reconcile/events); `report.md` prints both. The stress gate also records
  the parent chain and material identity of any post-warmup program link.

Latest quiet-host stress gate (20 s warm-up, 30 s sample, 1280×720 headed): **pass**, p50 16.67 /
p95 33.3 / p99 33.39, **0 app-owned >50 ms**, 6 **scheduler-only** >50 ms, **0** post-warmup program
events. Two earlier runs of the same gate each caught one illustrated-surface program link at
~3.6–3.8 s (roughness-map-only material, 4 anonymous meshes) — a mid-flight traffic family that
its admission did not warm. The identity instrumentation above is in place; treat that link as
probabilistic and unresolved, not fixed by the passing run.

Two quiet-host normal-flight witnesses after the telemetry landed (`native-posture-3/4`, 20 s of
flight each) now name the remaining tail instead of leaving it as "admission/apply 200 ms":

- Picture: buffer **1832×973 at CSS 1466×779 @1.25** — native; `renderScale 1`, `dynRes 0.90`
  with **CAS sharpen active**, `hitchRelief 0`, bloom route with 2 levels, particles **medium**,
  sky **mid**, sharpen false, cap 30. Presentation p95 **24.4 / 25.8 ms** (budget 33.3).
- Worker lane: no freeze episodes, command-in-flight 0. The only apply over 100 ms in each run is
  the **opening scene reply** (`game:newGame`, `game:scenePrepared`, `sector:enter`, 101 spawns;
  apply 122–125 ms, of which **106–118 ms is `sector:enter` replay**). Mid-flight replies fold in
  0.6–7.1 ms and reconcile in <0.1 ms; no mid-flight apply over 100 ms was observed.
- The witness report now prints `picture` and `worker lane` (apply max, slow-reply split, slow
  replay events, reply mode), so an apparent "200 ms admission/apply" must name the mode before it
  is treated as a flight hitch.

### Cold family-less rock program (2026-11-08)

The probabilistic post-warmup program link was not a new ship: the owners were live
`Asteroid_652/653/654` meshes sharing one `MeshStandardMaterial` with a roughness map and no
albedo map. A non-common rock built before its generated family maps decode keeps the procedural
tint/noise material (`visualFactory.astMaterial`, no `:fam` key). The family-ready warm built a
leaf group from the *decoded* family materials, so the old procedural program was never linked and
paid the whole illustrated-surface link on its first draw in flight.

Fix: tag that material (`spacefaceFamilylessRock`) and re-skin every live/prewarm rock onto the
decoded family in `_runRockFamilyDecodeRewarm` before its paced compile. The same rock now also
wears the intended base-colour/normal/emissive maps instead of the noise fallback. Focused proof:
`test/rock-family-library.test.mjs` (pre-decode tag → decode → one swap → idempotent; plus the
renderer wiring assertion). `test/rock-surface-library.test.mjs` also had a pre-existing brittle
regex pinned to `async () =>` after the opener gained an `options` argument; the contract is
unchanged and the assertion now names the real signature.

### Content 1:1, composed captures, and the presented-hold gate (2026-11-08)

The visual audit separated “native buffer” from “native picture”: the drawing buffer was 1832×973
while the scene ran at 0.9 content (1649×876) and CAS reconstructed it, with no measured cadence
win. That cut is gone:

- `COMBINED_READABILITY_FLOOR` is **1**. The Auto/30 fps posture keeps `dynResScale 1`,
  `contentScale 1`, `casSharpenActive false`; the hitch governor still stops at post-FX level 2
  and never drops raster.
- The witness publishes `picture.contentNative` (scene scale ≥0.999, content scale ≥0.999, no CAS
  upscale) and returns a **soft-picture** failure for a native buffer with sub-native content.
  `report.md` prints `content: 1:1` or `content: NOT 1:1 (...)`.
- Composed `t00-composed.png` / `t-final-composed.png` captures keep the HUD, so legibility and the
  final post chain are reviewed together. The first composed frame shows the mission tracker, the
  speed/energy stack, radar and prompt deck legible at 1:1.

The hitch audit's residual class — a presented-world hold with normal rAF cadence — is now a
first-class number. `presentationRunner` records `lastPresentedGapMs`, `maxPresentedGapMs`,
`presentedGapsOver100`, the current `heldPresentMs` streak, `maxHeldPresentMs`, and a small ring of
completed `heldPresentEpisodes` (wall ms). A repeated presented moment while time advances is
wall-time held, not just a duplicate frame. The witness fails **world-hold** above 100 ms
(first→last delta), and `check-hitch-budget` fails the sample on any presented gap ≥100 ms or a
repeated-moment hold >100 ms, using episode wall times so a new hold smaller than an earlier max
cannot hide.

The stress gate is now fail-closed and auditable: it waits for `authoredUpgradeDiagnostics.activeJobs`
(not only the queue's `pending/running`) before starting the sample, fails `p95` above the cadence
budget, records every unexpected spike separately from the top-20 list, snapshots the authored job at
spike time instead of serializing its later mutation, keeps unresolved program additions as audit
evidence, records host CPU busy, and refuses a ≥70% window.

## Tether-route truth and the generic frame cliff (2026-11-08)

The per-frame frame-truth trace changes the diagnosis. On the ordinary tether spin, before the
heartbeat/stand-in work:

- presented frames: **6.8 fps**; present p50 **68 ms**, p95 **106 ms**, max **341 ms**;
- simulation advanced **0.33 s per wall second**;
- **zero** fence-pin episodes >80 ms. The “locations frozen while animation continues” is not a
  fence pin: at 70–140 ms frames the world pose updates only when a frame finally presents, while
  CSS animation and asteroid tumble keep their own clocks.

After the presentation heartbeat and coarse-tier stand-in:

- presented frames **~10 fps**; sim rate **0.50×**; present p50 **65 ms**, p95 **94 ms**, max
  **136 ms** (the 341 ms freeze is gone);
- the pending-ship stand-in family disappeared from the draw census (LOD2 instead of the LOD0
  primitive pile);
- `bloomScene` (the whole world draw) p95 **31 ms**, avg 21.6 — the remaining frame cost.

The worker’s own per-system profile on the stress route (host-contended, so absolute values are
inflated; shares are the signal): step p50 **23.6 ms** / p95 **36.6**; physics **5.8 ms/tick**
(25%), tacticalAI **4.35 ms** (18%, p95 9.7), npcJobsRuntime **2.0 ms** (8%), flight 1.7,
world/traffic 0.7 each; the rest spread across ~20 systems. `NEAR_CLOCK_IDS` is not a lower
cadence — near systems still run every 60 Hz primary tick; only catch-up steps skip them.

The draw census normalized by family (`Asteroid_#`, `GLTFKit_StaticGroup_#`) shows the render tail
is **per-part ship/wreck meshes** (`GLTFKit_StaticGroup_*` 1.2k calls, `Retro_*` 1.35k, LOD hook/
nav/canopy parts ~1k over the window), VFX ~660, background ~480 — not one broken object. The
illustrated-surface per-ship uniforms keep those hull surfaces out of the retained batch, so each
part is its own draw. This is the E7 retained-batch/material-uniform problem, not a quality setting.

## Rules

- Do not lower the bar or rename a hitch; fix the frame or name the residual.
- Do not silently change the authored look. Quality tiers are named, reversible and announced.
- Do not re-record determinism goldens for a perf change.
- Every accepted change adds a row here and a focused check.
