# src/balance/

Measurement harnesses, not a registered system and not a second wallet. `careerCohorts` and the courier, hunter, and prospector public routes drive the live economy, cargo, missions, and ships. Travel, mine, and TTK durations are labeled adapters.

- Do not retune `src/data` or mission and economy constants because a horizon is outside its band. Pacing knobs that belong to the harness stay in this folder.
- Credits and cargo move only through the registered writers. No direct `player.credits` or `player.cargo` writes and no manual `simTime` skips.
- Block `Math.random` and `Date.now` while a run is measuring.
- Each horizon is its own run, not three samples of one career.
