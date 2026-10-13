# Stranger Lab report

Entry command: `node tools/agentic/stranger-lab/cli.mjs prove`

The 120-tick canary (seed 7, first-time pilot, flight, `drop-thrust`) fingerprint is `1fa2b9dde58ddc9c15a8f0a47f4f4067553055cd770e1d59a3a5f4ccc1653bde`. Prove replays that tape with the fault injector off and keeps the green control free of fabricated failures.

`artifacts/stranger-lab/sample-failure.json` is the 9-frame shrunk tape. Replaying it reproduces fingerprint `35c547e6b523044e876f2fa691eff4171ec35e64335c64c40fedeee7598364a9`.

Sweep: `node tools/agentic/stranger-lab/cli.mjs sweep` — 12 journeys × 12 seeds = 144 runs. Every persona is in the rotation, and each one attempts that journey's cue. Counts: 144 pass, 0 incomplete, 0 fail, 0 confirmed product defects. None were invented. Incomplete is reserved for a cue that was issued and still missed its milestone; every non-pass row keeps its tape. This sweep has no incomplete or fail rows, so `sweep.json` stores no tapes. A detector confirmation exits 1. Route misses exit 3 and are not hidden by the headed status. Seed 7 meticulous docking with `drop-thrust` still fails `unresponsive-commands` (applied thrust frames 0).

## Headed

`node tools/agentic/stranger-lab/cli.mjs sweep` loaded `public/journeyHostPage.html` in Chrome at 390×844 (measured 390×844) and stepped all 25 selected tapes with `replayJourneyTape`. `browserStatus` is `pass` only when that journey's systems and world evidence were present. `deviceTested` is false. No frame rate is claimed.

The 25 were launch (docking corridor and a station, 160 ticks), flight (flight bundle, 120), tether attach/cut (tether gameplay and an asteroid, 140), heavy-object (tether gameplay and the payload, 140), mining (mining system and an asteroid, 120), docking (docking corridor and a station, 600), buy/refit (economy, cargo, ships, 60), scan (scanner and the payload contact, 90), mission (missions, 90), and combat (tactical AI, combat, three hostiles, 1800). Crucible and save/continue were not in this selection of 25, so the sweep does not call them browser-replayed. `browserScenarioHost.js` stays flight-only. A stripped flight playback is not recorded as a replay of another journey.

Evidence class is `focused-fixture`. Renderer, audio, and VFX stay detached.
