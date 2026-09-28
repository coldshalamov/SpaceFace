# CR-CHAIN-1 — braid 3/5: clothesline on existing rocks

**Built:** encounter 352, THE SLOT (`src/data/encounters/352-the-slot.js`).

## The braid

A blockade runner is pinned in a rock pocket with the press on it. At fire time the
runtime scans the field for two real belt asteroids forming a gate (170–430 WU apart,
≥60 WU of clear gap, within 700 WU of the anchor) and stages the chase so the pursuit
corridor IS the slot: the runner is pinned just past the gap on the corridor axis fleeing
out through it, the raiders press from astern fanned along the gate line so every juke
routes through the same corridor.

Nothing is strung — the rope is the player's verb. `stuntRecognition` already pays the
`clothesline` grade for a two-edge line crossed by an interceptor; the encounter supplies
the honest situation: real anchorable rocks, a live chase crossing one corridor, and a
runner who says exactly what the gap wants.

No gate, no encounter: where no rock pair exists the runtime aborts (`no_gate`) rather
than faking the corridor with props.

## Resolutions

- `runner_saved` — press broken: MTS rep + thanks grant, runner keeps running.
- `runner_down` — cast released unstamped.
- `runner_escaped` — outran past 1400 WU.
- `press_over` — 100 s deadline.

## Validation

`test/cr-chain-1-the-slot.test.mjs` — 4/4 green:

- Shape registered (`minor`/`combat`, hunt × mining_belt/derelict_field × corsair_raider).
- Honest abort when no gate exists — no live record, no fake corridor.
- Braid materializes through the found slot: runner beyond the gap on the corridor axis
  with corridor-aligned flee velocity, raiders pressing from the far side committed onto
  the runner, gate records the real spawned rocks' ids.
- `runner_saved` pays rep and releases the runner unstamped.
