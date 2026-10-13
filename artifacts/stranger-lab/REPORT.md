# Stranger Lab report

Entry command: `node tools/agentic/stranger-lab/cli.mjs prove`

The 120-tick canary (seed 7, first-time pilot, flight, `drop-thrust`) fingerprint is `1fa2b9dde58ddc9c15a8f0a47f4f4067553055cd770e1d59a3a5f4ccc1653bde`. Prove replays that tape with the fault injector off and keeps the green control free of fabricated failures.

`artifacts/stranger-lab/sample-failure.json` is the 9-frame shrunk tape. Replaying it reproduces fingerprint `35c547e6b523044e876f2fa691eff4171ec35e64335c64c40fedeee7598364a9`.

Sweep: `node tools/agentic/stranger-lab/cli.mjs sweep` — 12 journeys × 12 seeds = 144 runs. Every persona is in the rotation, and each one attempts that journey's cue. Counts: 144 pass, 0 incomplete, 0 fail, 0 confirmed product defects. None were invented. Incomplete is reserved for a cue that was issued and still missed its milestone; that row keeps its tape. A detector confirmation exits 1. Route misses exit 3 and are not hidden by the headed status.

## Headed

Chrome at 390×844 stepped all 25 selected tapes through `runBrowserLabScenarioInternal` and recorded the host result (`browserStatus: pass` and the tape's tick count, including docking at 600 and combat at 1800). The host runs the focused flight bundle, so those ticks are the recorded axes in that bundle, not a second combat or docking world. `deviceTested` is false. No frame rate is claimed.

Evidence class is `focused-fixture`. Renderer, audio, and VFX stay detached.
