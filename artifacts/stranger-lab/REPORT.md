# Stranger Lab report

Entry command: `node tools/agentic/stranger-lab/cli.mjs prove`

The 120-tick canary (seed 7, first-time pilot, flight, `drop-thrust`) fingerprint is `1fa2b9dde58ddc9c15a8f0a47f4f4067553055cd770e1d59a3a5f4ccc1653bde`. Prove replays that tape with the fault injector off, keeps the green control free of fabricated failures, and writes the shrunk sample.

`artifacts/stranger-lab/sample-failure.json` is the 9-frame shrunk tape. Replaying it reproduces fingerprint `35c547e6b523044e876f2fa691eff4171ec35e64335c64c40fedeee7598364a9`.

Sweep: `node tools/agentic/stranger-lab/cli.mjs sweep` — 12 journeys × 12 seeds = 144 runs, rotating through all eight personas. Counts: 47 pass, 97 incomplete, 0 fail, 0 confirmed product defects. None were invented to fill a quota. A failing row keeps its tape in `sweep.json` so the finding can be replayed.

## Headed limit

Chrome at 390×844 steps recorded axes through the focused flight bundle (`runBrowserLabScenarioInternal` on the lab host page). That is not a combat replay and not a docking-corridor replay. Rows for `combat-death-retry` and `docking` are `unverified` with that reason. `deviceTested` is false. No frame rate is claimed.

## What the default competent route did

Launch leaves a berth through the committed undock. Docking reaches the manifest berth in the headless sim. Mission accept completes a recon contract and then fails a second offer. Combat death and `combat.recoverPendingPlayer` ran for the reckless persona. The other personas are in the sweep so a detector can fire when their route does not. Incomplete is not a pass.

Evidence class is `focused-fixture`. Renderer, audio, and VFX stay detached.
