# Stranger Lab report

Entry command: `node tools/agentic/stranger-lab/cli.mjs prove`

The 120-tick canary (seed 7, first-time pilot, flight, `drop-thrust`) fingerprint is `1fa2b9dde58ddc9c15a8f0a47f4f4067553055cd770e1d59a3a5f4ccc1653bde`. Prove replays that tape with the fault injector off and keeps the green control free of fabricated failures.

`artifacts/stranger-lab/sample-failure.json` is the 9-frame shrunk tape. Replaying it reproduces fingerprint `35c547e6b523044e876f2fa691eff4171ec35e64335c64c40fedeee7598364a9`.

Sweep: `node tools/agentic/stranger-lab/cli.mjs sweep` — 12 journeys × 12 seeds = 144 runs. Personas rotate, and each run uses only that persona's own policy. Counts: 47 pass, 36 incomplete, 61 fail, 3 confirmed product defects. The confirmed rows are `unresponsive-commands` on docking for massline seed 7, first-time seed 101, and massline seed 1601: forward thrust did not move the ship and the station contact did not cut the speed. A persona that never takes the route is a miss. Every non-pass row keeps its tape (97 tapes). A detector confirmation exits 1. Route misses are not hidden by the headed status. Seed 7 meticulous docking with `drop-thrust` still fails `unresponsive-commands` with no applied closure thrust.

## Headed

The same sweep command loaded `public/journeyHostPage.html` in Chrome at 390×844 (measured 390×844) and stepped 25 tapes with `replayJourneyTape`. The 25 include every journey: launch, flight, tether, heavy-object, mining, docking, buy/refit, scan, mission, combat, crucible, and save/continue. Fourteen of them are simulated-touch. `browserStatus` is `pass` only when that journey's systems and world evidence were present. `deviceTested` is false. No frame rate is claimed. `browserScenarioHost.js` stays flight-only.

Evidence class is `focused-fixture`. Renderer, audio, and VFX stay detached.
