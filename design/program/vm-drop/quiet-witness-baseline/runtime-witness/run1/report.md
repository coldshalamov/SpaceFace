# Runtime witness

Verdict: inconclusive
Not enough runtime samples yet.

Next: Let the game run a few seconds, then read window.__SF_WITNESS__.verdict().

## Live
- mode: n/a
- simTime: n/a
- clockScale: n/a
- lifecycle: n/a
- suspended: false
- documentHidden: false
- contextLost: false
- executedFrames: n/a
- rendererFrame: n/a
- drawCalls: n/a
- lastFrameError: none
- gpu: n/a

## Where the last frames went (ms)
- no phase ranking (perf runtime did not report)

## Sample deltas (tail)
- simDelta: 0.00
- executedFrames delta: 0
- rendererFrame delta: 0
- hitch samples: 0
- canvas hashes: 0 unique 0

## Console (loop/GPU)
- [http.404] http://127.0.0.1:37343/src/data/emergentPrimitives.js
- [console.error] Failed to load resource: the server responded with a status of 404 (Not Found)

## Host load during the window
- unavailable
## Continue loading readiness
- unavailable: no `game:loadingProgress` events were observed
## Opening frame render subphases
- bloomScene: samples 0; p95 0.0 ms; avg 0.0 ms; max 0.0 ms
- bloomDownsample: samples 0; p95 0.0 ms; avg 0.0 ms; max 0.0 ms
- bloomComposite: samples 0; p95 0.0 ms; avg 0.0 ms; max 0.0 ms
## Opening first-touch owner
- disabled: pass `--opening-first-touch-owner` to arm the opt-in cold/warm owner capture
## Opening exact-owner micro-raster
- disabled: pass `--opening-exact-owner-touch` to arm the opt-in four-owner 64x64 cold touch
## No-submit scheduler A/B
- disabled: pass `--no-submit-diagnostic` to replace scene submission with a constant clear
## Tabletop census (PQ-129.01)
- route: New Game seed 47, held thrust, 20000 ms at 500 ms cadence
- sim delta: 0.00 s; executed-frame delta: 0
- bounded instrumentation: renderWork enabled for this probe only; prior state restored before shutdown: false
- census unavailable: the live renderer did not publish a probe-gated table sample
## Sector-transition phase ledger
- unavailable: no armed public jump event sequence was observed
## Live hitch attribution (PQ-129.02)
- bounded instrumentation: classifier enabled for this probe only; prior state restored before shutdown: false
- system timing coverage: prime-period-stratified
- observed frames: 0; hitches: 0; named: 0; unknown: 0
- hitch runs: first 0; echoes 0; longest streak 0
- named coverage: 0.000
- owner counts: none## Long tasks (main-thread blocks)
- not captured

## Bloom subphases (PQ-129.03)
- bloomScene: samples 0; p95 0.0 ms; avg 0.0 ms; max 0.0 ms
- bloomDownsample: samples 0; p95 0.0 ms; avg 0.0 ms; max 0.0 ms
- bloomComposite: samples 0; p95 0.0 ms; avg 0.0 ms; max 0.0 ms
## Sampled simulation systems
- unavailable: the bounded per-system sampler produced no samples
