# Stranger Lab report

Entry command: `node tools/agentic/stranger-lab/cli.mjs prove`

That command reproduced canary seed 7 (first-time pilot, flight, `drop-thrust`) twice with fingerprint `6dac271ca0aee863277fa3f5d8f5e2f00b1b55884bc72bd73bbdd47092352804`, replayed the same tape to the same digest, kept the green control free of fabricated failures, and shrank the canary from 120 ticks to 9.

Sweep: `node tools/agentic/stranger-lab/cli.mjs sweep` — 12 journeys × 12 seeds = 144 headless runs, 144 pass, 0 infra, 0 confirmed product defects. None were invented to fill a quota.

## What the journeys actually did (seed 7, default persona)

| Journey | Evidence |
|---|---|
| Launch / flight | Ship accelerates under thrust. Dropped thrust is the canary, not a product bug. |
| Tether attach/cut | `tether:attached` and `tether:cut` |
| Heavy object | Line starts on the rock and stays active while reeling |
| Mining | `mining:yield` |
| Docking | Corridor phase `approach` (not a claimed berth) |
| Buy/refit | `economy:tradeCompleted` through the station writer |
| Scan | `scan:completed` |
| Mission | `mission:accepted` then `mission:failed` on abandon. Completion is not claimed unless the live objective is already met. |
| Combat | `projectile:hit`. This window did not emit `player:death`, so recovery was not exercised. |
| Crucible | `run:waveStarted` and `run:waveCleared` for wave 1 |
| Save/continue | `jump:arrive` in `sector_ceres_belt`, then save/load restored sector, credits, and position |

## Ranked remaining risks

1. Combat death and the recovery berth were not reached in the bounded window. Retry is wired to `combat.recoverPendingPlayer` and only runs after a wreck. Not counted as a defect.
2. Docking reaches the live corridor approach and does not claim a berth the pilot has not captured.
3. Headed browser, GPU frame time, and a physical phone are unverified. `simulated-touch` is a 390×844 quantized stick. `fpsClaimed` is false.
4. Evidence class is `focused-fixture` on the authoritative runtime. Renderer, audio, and VFX stay detached.

A station-contact thrust that stops the ship is a negative control, not an unresponsive command.
