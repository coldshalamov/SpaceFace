# DONE — shader-readiness-no-isprogram (#169)

The in-flight readiness waits no longer freeze the main thread on a synchronous `isProgram()`. Nothing about what
gets compiled or drawn changes.

## Where the "~5.1 s of bloom readiness / shadow-sweep links" actually goes

`artifacts/shadercost.mjs`, 6 bare-master from-launch runs, window from the New Game screen to flight entry:

| Part | Kind | Main-thread ms |
|---|---|---|
| `getProgramParameter` + `isProgram` waits | driver / GPU-process link time (SwiftShader) | **975 – 10 571** |
| linkProgram / compileShader / shaderSource submits | native, async | 20 – 35 |
| three's JS program build (WebGLProgram, key, includes, uniforms) | JS | 36 – 78 |
| SpaceFace readiness JS (poll loops, guards, link reporter) | JS | **1 – 8** |

So the cost is **not CPU-side JS**. Polling less often, deduping keys (three already dedupes by cacheKey; the whole
JS build is ≤78 ms), or skipping LINK_STATUS reads has a ceiling well under 0.1 s.

The waits split into two kinds:
- **First-use waits.** `getProgramParameter` inside three's `WebGLUniforms` at the opening touch draws
  (`openingGpuAdmission` / `uiStage.prepareForFirstDraw` / `_bakeEnv`). These are the driver link itself. The
  draw needs it, and it is soft-GPU link time that won't match real hardware.
- **isProgram rechecks.** Each one waits behind the whole queued link cohort.

Experiment (`ab169x-nocheck`, 3 runs): removing the recheck **before flight** only moves that wait into the
first-use `getProgramParameter` (pre-flight GL wait 3.9–15.0 s against 1.0–15.4 s on bare). It is not a loading
win on soft-GPU. **In flight it is pure waste**: the guarded drawables are hidden, so nothing needs the link
synchronously.

## Measurement

`artifacts/gl169.mjs`, `gl169-census.txt`. Isolated Electron from-launch runs + 30 s held thrust, Picture ON,
soft-GPU, on current master. Compared: 12 master-bloom runs (bare ×9, plus #168-only ×3, which doesn't touch GL)
against 6 #169-behavior runs (final ×3 interleaved with bare ×3, plus nocheck ×3).

| In-flight, per 30 s | master (12 runs) | #169 (6 runs) |
|---|---|---|
| isProgram main-thread | 419 – 4 931 ms, **every run ≥419** | **0 in all 6** |
| total GL wait (isProgram + getProgramParameter) | median ~4.2 s (0.75–5.8 s) | median **~0.18 s** (0.085–1.4 s) |
| largest single GL block (hitch frame) | median ~1.9 s (0.13–3.8 s) | median **~76 ms** (29–837 ms) |
| GL blocks >50 ms | median 11 (6–19) | median **1** (0–5) |

Interleaved final pairs only:

| Metric | bare | #169 |
|---|---|---|
| In-flight GL wait | 3735 / 5227 / 4748 ms | 85 / 243 / 1375 ms (worst pair 2.7×, median ~19×) |
| Max block | 2029 / 3779 / 3307 ms | 29 / 95 / 837 ms |

- #169's one 837 ms block is a first-use COMPLETION_STATUS read inside an opening touch draw, which happens on
  master too.
- **Loading parity.** Launch-to-flight: bare 4.1 / 4.3 / 4.6 s vs #169 3.4 / 4.7 / 5.1 s. Pre-flight GL wait:
  bare 5.9 / 5.3 / 1.0 s vs #169 4.7 / 5.0 / 5.1 s.
- **Waits still settle on link completion, never on a timeout.** The longest continuous readiness-poll span in
  #169 runs is ≤1.5 s; on bare it is 2.0–4.2 s.

## Tests

Focused 96-file suite:

| | pass / total | failed + cancelled |
|---|---|---|
| **#169** | **686/723** | 36 + 1 |
| **bare master** | **684/721** | 36 + 1 |

The failure set is identical. In the 3 readiness files, the 4 failures seen on bare are the renderer
wiring-contract checks. The 3 new or changed tests fail against master's bloom.js (mutation check).

## Risk

- **Picture:** none. The same programs, keys and settle condition are used.
- **Behavior:** the bound on a silently forgotten GL handle goes from ~1–2 s to the existing 20 s deadline.
  Client-detectable dead handles are now caught faster, on the next poll. This reverses an owner-tuned safety
  recheck, so **the owner decides whether to import it**.
- **Real hardware:** saves the owner-measured 10–28 ms per recheck (≤~14 ms/s whenever a compile is pending). The
  large soft-GPU blocks come from long SwiftShader link queues.
