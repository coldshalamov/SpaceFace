# FB-097 — A shipped build keeps a bounded ring of its last hitch attributions in ordinary play

**Kind:** build · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: perfRuntime.js, seam: hitchClassifier.js, seam: runtimeWitness.js
**Write-set:** `src/core/perfRuntime.js`, `src/render/hitchClassifier.js`, `src/core/runtimeWitness.js`, `test/fb-hitch-ring-in-play.test.mjs`
**Neighbours (extend, never restate):** SFQ-B211

## The gap
`hitchAttributionEnabled` is false in ordinary play and only two probe scripts turn it on, so the 19-owner
`HITCH_OWNERS` histogram produces nothing for a real player session. When the owner reports "it hitched at
Ceres", nobody can say who paid.

## Why this direction
Always-on profiling was rejected for cost. A bounded ring (last 16 hitch frames, owner + ms) written only when
a frame classifies as a hitch costs nothing on smooth frames, and the classifier already exists.

## Mechanism
- Keep the classifier armed in production but write only on hitch frames into a fixed-size ring under
  `state.render` (no allocation after boot).
- Surface the ring in the runtime witness report and on the Statistics receipt route (see FB-102 for the sim
  half of that screen).
- Pin that a smooth 600-frame run writes zero ring entries and a scripted hitch frame writes exactly one with
  the right owner.

## Done when
`npm run probe:runtime-witness` on seed 4242 Ceres shows the ring populated after a deliberate hitch;
`test/fb-hitch-ring-in-play.test.mjs` pins zero writes on smooth frames; frame-time p95 unchanged vs. baseline
within noise.

## Do not
Do not enable the CPU profiler or Tier-1 counters by default. Do not grow the ring. Do not read
`performance.memory` outside a capture.

## Focus test starting points
- `test/hitch-classifier.test.mjs`
- `test/render-hitch-attribution.test.mjs`
- `test/runtime-witness-production-matrix.test.mjs`
