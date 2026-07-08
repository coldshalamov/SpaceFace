# First-15 Proof Ritual

Status: live proof surface for BP-05.1 `PKT-RITUAL`, refreshed 2026-07-08.

The first-15 proof ritual is the shipped opening sequence that proves the player
has touched the whole SpaceFace loop once without a lecture. It is implemented by
`src/systems/onboarding.js` using `BEATS` B0-B5, `SILENCE_S`, `player.hints`,
and the global `voiceArbiter`/toast floor.

## Beats

| Beat | Runtime proof |
|---|---|
| B0 Wake | Player thrusts to the 47-A beacon/anomaly. |
| B1 Derelict | Onboarding spawns a derelict through `helpers.spawnEntity`; player latches, reels, and cuts the tether. |
| B2 Seam | Player scans and mines the first seam; AUD-06 supplies the seam/vent signature. |
| B3 Snare | Onboarding spawns a weak Reach pirate through `helpers.spawnEntity`; the pirate tolls, then flees at low hull and drops stolen goods. |
| B4 Dock | Player docks at Helios, sells, and sees one job. |
| B5 Choice | Player picks the work that fits and exits tutorial mode into story tracking. |

## Success Test

- Exactly one objective voice owns the floor at a time.
- At least `SILENCE_S` passes between beat success and the next tutorial line.
- B1 and B3 runtime content is helper-spawned, not hand-mutated into state.
- B3 teaches mercy: reducing the tutorial pirate to low hull sets the flee flag,
  drops a cargo lesson payload, and completes the snare beat without requiring a kill.

`npm run check:proof-ritual` is the headless backend check for these seams.
`npm run check:first-15-runtime` remains the browser release-bar probe for T9.
