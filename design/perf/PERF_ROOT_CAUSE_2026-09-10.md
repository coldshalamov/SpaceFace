<!-- LIFETIME: DURABLE -->
# The hidden ship picture was eating the frame

**2026-09-10. Independent performance investigation. Owner Intel iGPU (ANGLE, Intel 0x7D45), headed
isolated Electron, New Game seed 47.**

## Plain language

The game was slow and kept freezing because of a picture you cannot see.

The New Game / Load screen shows your ship turning slowly on a stand. That little ship picture is
drawn on its own separate canvas with its own graphics context. When you pressed **Launch**, that
picture never stopped. It kept turning, kept drawing, and — because of a two-line unit mix-up — it
asked the graphics card to make itself **25% bigger every single frame, forever**.

Five seconds into flight it had grown to **106,963 x 53,862 pixels**. That is a picture roughly
**3,400 times** the area of the actual game window, and the game was asking the graphics driver to
allocate it sixty times a second while you were flying.

That one defect was **59% of the entire main thread**. Everything else — the simulation, the AI, the
physics, the bloom, all the ships and rocks on screen — added up to **8.7%**.

It is fixed and committed. Measured on the same machine, same route, minutes apart:

| | Before | After |
|---|---|---|
| Hitches (stutters) during flight | **194 of 981 frames** | **0 of 1215 frames** |
| Simulation cost per frame (p95) | 10.7 ms | **2.2 ms** |
| Drawing cost per frame (p95) | 7.7 ms | **4.7 ms** |
| Long main-thread blocks in a 20 s flight | **44** | **0** |
| Memory used during 20 s of flight | 438 to 944 MB | 282 to 330 MB |
| Ceres jump | **lost the graphics context (black)** | **presents, 16.5 ms settled frame** |

The "Ceres jump kills the picture" bug that a lane has been chasing all day was this same bug. It now
survives the jump with no context loss.

**One consequence matters more than the fix:** every performance ranking in the program was measured
while this was running. "Simulation is the pole." "Table authority is the next 50%." The 408-entity
census. The dock tax. None of those numbers are trustworthy any more. Simulation cost dropped by
almost 5x without a single line of simulation code being touched. **Anything ranked against the old
numbers should be re-measured before someone spends a day on it.**

## The defect

`src/ui/shipPreviewMount.js`, `resize()`:

```js
const nextW = Math.max(1, Math.floor(canvas.clientWidth || canvas.width || W || 320));
```

`canvas.clientWidth` is a **CSS pixel** size. `canvas.width` is the **device pixel** backing store —
already multiplied by `renderer.setPixelRatio()`. Using the second as a fallback for the first means
that whenever the canvas is not in layout (`clientWidth === 0`: hidden screen, detached stage, a
drift loop still running after its screen left), each call feeds the previous device-pixel size back
in as a CSS size, and `setSize` multiplies by the device pixel ratio again.

On this machine `devicePixelRatio` is 1.25, so the drawing buffer grows **1.25x per frame without
bound**. It is a pure positive-feedback loop; nothing in the path clamps it.

Two changes landed in `76dab7e2a`:

- `resize()` falls back to the last known **CSS** size, never to the backing store, and clamps to a
  4096 px preview ceiling.
- `src/ui/screens/stageHull.js` stops its drift loop when the canvas leaves layout. The Launch path
  replaces the screen stack without always routing through `onHide`, which left a second WebGL
  context re-rendering behind the world for the entire flight.

That commit also lands the adopted `PROG3-LEFTOVERS` hunk already sitting in `shipPreviewMount.js`
(`secondaryPreviewWebGlBlocked`, wired in `stationApp`/`shipworks` with its test). That checkpoint was
7 hours stale and adoptable by the rule in `AGENTS.md` §3. Its `NOW.md` row should be deleted;
`NOW.md` is dirty with foreign work so this pass did not edit it.

## The evidence

### Controlled A/B — CDP CPU profile, 20 s flight window, seven minutes apart

Same probe, same route, same machine. This is the primary proof.

| | Before | After |
|---|---|---|
| `WebGLRenderer.setSize` self time | **12,287 ms / 59.2%** | **absent** |
| `resize @ shipPreviewMount.js` | 231 ms | absent |
| Top-level owner | `tick @ stageHull.js:89` — **60.8%** | `frame @ presentationRunner.js:744` — **58.8%** |
| Game loop share of main thread | 8.7% | 58.8% |
| Long tasks in the window | 44 | **0** |
| Idle | 24.4% | 26.9% |

### Direct runtime observation — the stage canvas backing store

| Moment | Before | After |
|---|---|---|
| New Game screen (visible, laid out) | — | 1235 x 623 (correct: 988 x 499 CSS x 1.25) |
| Entering flight | 4,706 x 2,371 | 1235 x 623 |
| Flight + 5 s | **106,963 x 53,862** | 1235 x 623 |

At its worst that is 5.76 **billion** pixels — roughly a 23 GB drawing buffer, requested every frame,
on a GPU that shares system memory with a machine that had 5 GB free.

### Runtime witness, after (corroboration, not a controlled A/B)

The archived "before" witness ran under different host load and window focus state, so treat it as
supporting rather than decisive. The CPU-profile A/B above is the controlled comparison.

- New Game, 20 s held thrust: `presenting`; **0 hitches over 1215 frames**; `simTime 20.08` in a 20 s
  window (the sim now tracks real time — before it lost 26% of the window to shedding); presentation
  p95 4.7 ms, render p95 3.7 ms, sim p95 2.2 ms, ui p95 0.9 ms; bloomScene p95 3.2 ms.
- Ceres public jump (`--sector-entry`): `presenting`; **zero context-loss lines**; 12 hitches over
  1184 frames; `sector:exit -> sector:enter` **100.5 ms with 0 hitches**; settled frame **16.5 ms**.

### Two theories killed by measurement, not argument

- **GC / allocation churn.** `--gc-probe`: a forced collection moved the heap 285 MB to 282 MB. Three
  megabytes. `--alloc-probe`: **4 MB** of sampled allocation across the whole window, the largest
  single site being `cloneUniforms` in three.js at 1.4 MB. Allocation is not a pole and GC is not a
  pole. The 2026-08-28 "1.3 GB churn" note is superseded.
- **The game's own GPU submission.** `--no-submit-diagnostic` replaces scene submission with a
  constant clear. Result: `drawSubmit` p95 **0.1 ms**, callback CPU p95 **3.6 ms** — and rAF still
  arrived only every **59.5 ms (p95)**, with 111 long tasks. With the game drawing *nothing*, frames
  were still slow. That is what proved the cost was outside the game's render path.

Both probes have existed in `scripts/probe-runtime-witness.mjs` for some time. No archived report in
`.devshots/runtime-witness/` had ever armed either one.

## Why this survived weeks of investigation

This is the part worth internalising, because the mechanism will recur.

1. **The hitch classifier can only see inside its own callbacks.** A parasite living in a *different*
   `requestAnimationFrame` callback is, by construction, invisible to it — it can only be reported as
   a gap. That gap was labelled `externalScheduling`, and `externalScheduling` was the largest owner
   in nearly every report (44 of 53 hitches in run 69; mean gap 114.7 ms).
2. **A hole in the measurement was read as a finding.** Measured phases summed to about 25 ms while
   frames took about 100 ms. The missing 75% had a name, so it stopped being treated as unexplained.
3. **The doc forbade the fix.** `PERF_WHAT_MATTERS.md` lists "Classifier coverage, extra timers, more
   probes" as forbidden slog and states "Measurement is done enough to pick a pole" — while 75% of
   the frame was unattributed. That instruction is what kept the campaign inside the local maximum
   the owner described.
4. **Nobody took a whole-process profile.** Not a custom classifier, not another in-game counter: a
   plain V8 CPU profile of the main thread. It named the owner on the first run, in one line, with no
   theory required.

The lesson is narrow and reusable: **a custom in-engine profiler can only find bugs in the code it
wraps.** When the residual is bigger than everything you can see, the next instrument must be one
that sees the whole process — not more coverage of the part you already see.

## What is actually left

All numbers post-fix, same machine.

### 1. Load is 26 seconds to flight — now the biggest player-facing cost

| Stage | Duration |
|---|---|
| preparing-run to authored-visuals | 1.9 s |
| **render-pipelines** | **6.8 s** |
| **gpu-resources** | **17.3 s** |
| entering-flight | at 26.0 s |

10.6 s of long main-thread tasks, essentially all inside that window. This is shader program creation
and texture residency, and on this machine it goes through ANGLE's GLSL to HLSL to D3DCompile path
(the `X4122` compiler warnings in the console are D3DCompile's own output, which confirms it). This
is real, it is the top remaining item, and it is not the same problem as the frame.

### 2. One 2.2 s block about six seconds into flight

A single long task at t about 32 s, with flight beginning at t about 26 s. The loading snapshot names
it: `jobs entity:fx:81:in-flight:compiling-pipelines`. This is the "leftover FX" item another lane
already identified, and it is **still true after the fix**. Either drain those keys to completion
behind the loading shell, or keep them out of the first-flight submit set. Holding them and flushing
on first paint is what produces the block.

### 3. The jump tunnel itself

`jump:chargeStart -> jump:start` is 3.6 s with 19 hitches; `jump:arrive -> +1500 ms` is 1.5 s with 15.
The sector swap in the middle is now clean (100.5 ms, 0 hitches). Named synchronous owners:
`world.enterSector` 112.4 ms, `bus.sector:enter` 93.2 ms, `guardedRendererLifecycleCallback` 75.4 ms.
Those three are worth an hour; they are not a TDR.

### 4. The upstream lifecycle leak (root cause of the root cause)

The two committed changes are defence in depth. The actual defect is that **Launch never tears the
New Game / Load screen down**. Evidence: `k-world--stage` still reports `hasGL: true` during flight,
so the mount, its WebGL context, and the hangar GLB it loaded via `loadDockBackdrop` all live for the
whole run. `boot-terminal-canvas` (2475 x 1315) is still connected during flight too — the same class
of leak. The fix belongs in the screen stack (`src/ui/screens/newGame.js`, `saveLoad.js`, and whatever
owns the Launch transition), not in the preview mount.

### 5. First-visible-draw identity gate still fails

`uncaptured-first-draw-resource`, 37 uncaptured program keys, programs 96 to 96. Worth closing for the
census's integrity, but with 0 hitches in flight it is no longer a player-facing cost.

## Structural options — what could be replaced wholesale

The owner asked explicitly whether whole chunks could be swapped for packages, ported, or rebuilt.
Honest answer first: **none of these was the constraint.** The constraint was a two-line unit bug in a
hidden canvas, and no amount of architectural change would have found it. Ranked by whether any
current number actually points at them:

| Option | Would it help? | Honest cost |
|---|---|---|
| **Re-measure before choosing anything** | **Yes — do this first** | One afternoon. Every ranking below is otherwise guesswork. |
| **WebGPU backend** (three.js 0.184 ships `WebGPURenderer`) | **The one structural lever aimed at a real remaining number.** Dawn to D3D12 with `createRenderPipelineAsync`; no GLSL to HLSL to D3DCompile translation. That is precisely the 6.8 s + 17.3 s load mechanism. | Large. `src/render/vfx.js` is 13.7k lines of GLSL that must become TSL/WGSL, and `three.quarks` 0.17's WebGPU support must be verified before committing. Not a silent swap. |
| **KTX2 / meshopt asset pipeline** | Already done and correct. Release GLBs carry `KHR_texture_basisu`, `EXT_meshopt_compression` and `KHR_mesh_quantization`. The 686 MB of PNGs on disk are source files, not runtime. | none — verified, no action |
| **Simulation on a Worker** | Not indicated. Sim is 2.2 ms p95. `src/core/simWorker.js`, `simWorkerHost.js` and `simTransport.js` currently have **zero importers** — dead code. Either wire them or delete them; leaving them is a standing invitation to a wasted campaign. | Snapshot fence (PQ-081) first, then a copy-cost bench. |
| **ECS / SoA typed-array entity storage** (bitecs-style) | Not indicated. Entities are a `Map` with a maintained `entityIndex` of sub-lists already. 2.2 ms p95. | Large, and it fights the 47-A golden-hash contract. |
| **Same-material `BatchedMesh`** | **No.** Draw calls measured 22 to 96. Intel iGPUs tax draw count, but not at 96. This is a non-problem. | none |
| **Rapier body sleeping** | **No.** 66 bodies, 0.8 ms. Already stale in the docs, still repeated in prompts. | none |
| **Rust / WASM islands** | Not indicated. No named CPU island exceeds 250 ms in a 20 s profile. | none |
| **Porting the renderer to Bevy or a native engine** | No. Three.js is not the bottleneck and never was in this data. | A new game. |
| **Dynamic resolution** | Already built (`src/render/adaptiveQuality.js`) and deliberately restricted to software-rendering emergencies, because resizing render targets costs 0.5 to 1.3 s stalls on this hardware. That reasoning is now *doubly* justified — a runaway resize is exactly what this bug was. Leave it off. | none |
| **Bloom off / quality presets / FSR** | No. bloomScene p95 is 3.2 ms. Also illegal as a default. | none |

## Instruments worth keeping

The scratchpad probe that found this should be promoted into `scripts/` as a new file (it edits
nothing existing):

1. Launch the isolated evidence Electron via `createIsolatedElectronLaunch`.
2. `page.context().newCDPSession(page)`, then `Profiler.enable` and `setSamplingInterval 200`.
3. Drive New Game to Launch, wait for `window.__SF_WITNESS__.verdict().facts.mode === 'flight'`.
4. `Profiler.start()`, hold `KeyW` 20 s, `Profiler.stop()`, write the `.cpuprofile`.
5. Aggregate self time by `callFrame`, and inclusive time by top-level entry.

A second, even cheaper one: **census every `<canvas>` in the document during flight** — id, class,
backing store, client size, connected. That one call is what turned a profile line into a proof, and
it would have caught this bug at any point in the last several weeks.

Both are additive. Neither requires touching `scripts/probe-runtime-witness.mjs`, which is dirty with
foreign work.

## Standing corrections to the program docs

Not edited here — `design/program/PERF_WHAT_MATTERS.md` and `design/perf/TABLE_AUTHORITY_PLAN.md` are
dirty with foreign work. Whoever owns them should apply these:

- "Sim is the pole / table authority is the next 50%" — measured under the parasite. Sim is now
  2.2 ms p95. **Re-census before starting that lane.**
- "Sector-entry GPU hitch is gone" was stale, then "Ceres jump cook TDRs" was true; both are now
  superseded — Ceres presents with no context loss.
- "Measurement is done enough to pick a pole" — this is the instruction that held the campaign in
  place while 75% of every frame was unattributed. It should be replaced with a rule that an
  unattributed majority is a measurement gap, never a finding.
- Bloom-off, prewarm retries, Rapier-sleep and dummy precompile remain correctly forbidden. That part
  of the doc held up.

## Files

- Fix: `76dab7e2a` — `src/ui/shipPreviewMount.js`, `src/ui/screens/stageHull.js`
- Evidence: `.devshots/runtime-witness/report-claude-*.md` and `.json`
  (`baseline-prior`, `run2-newgame-gc-alloc`, `run3-nosubmit`, `after-newgame`, `after-ceres`)
