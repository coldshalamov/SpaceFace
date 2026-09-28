# CR-ANVIL-1 — sling variants for Vesta belt / Veil lanes

**Built:** two authored encounters that turn two more big places into toys the rope and
the fields already know — both staged on machines that exist and move mass for real,
both taught by bodies that are visibly *waiting* on the cycle rather than by a tooltip.
Row 50 closes.

## 355 — THE WINNOW THROW (`src/data/encounters/355-the-winnow-throw.js`)

The Vesta Feedstock Belt's ore winnow (`environmentalMachinery.js` — gather well →
warning → discharge cone → calm) becomes the sling variant: a DMC longshore pair
loiters on the throat while five real `cmdty_ore_copper` pods sit inside the live
gather well. Claim-jumpers run the discharge lane inbound — they want the throw, not
the crew. The runtime reads `vestaWinnowPhase(simTime)` and narrates the cycle edges
("Throat's live", "THERE GOES THE BATCH"); the gather/discharge forces are the
machine's own registered fields, so pods are herded and hurled by physics, not script.
The player can tow a pod out mid-gather, ride the throw, feed a jumper to the cone,
or break the claim.

- Pinned to `sector_vesta_forge` via `gates.sectorIds` + `mining_belt` (the belt's only
  match there is `zone_vesta_belt`); layout anchors on `VESTA_ORE_WINNOW.globalPos`, not
  the zone marker — a starved-planer relocation aborts honest (`site_moved`).
- Resolutions: `claim_broken` (jumpers down → grant + DMC rep), `crew_down`,
  `batch_away` (a full discharge physically cleared the throat), `shift_ended` (deadline).
- `test/cr-anvil-1-winnow-throw.test.mjs` — 7/7 green, including the cycle-edge bark
  assertions driven by real sim time.

## 356 — THE SURGE LINE (`src/data/encounters/356-the-surge-line.js`)

The Blind Nebula's storm lane (`veil_storm_lane` — a surge-cycled debris-current sheet)
is the conveyor variant: a Free Frontier courier *waits inside the lane mouth* between
waves, three helium-3 pods drift in the sheet beside it, and Vael catchers hold inside
the same lane near the exit on `loiter` + `hold_fire`. When `weatherPhase` crosses to
`surge`, the sheet throws everyone inside downrange — the catchers flip to
`attack_run` and ride the same wave onto the courier. Hunters and hunted share one
engine; the player reads the whole braid as bodies queued for a throw.

- Pinned by `zoneTypes: ['nebula_fog']` + `gates.sectorIds: ['sector_veil_nebula']` —
  Blind Nebula's center is the lane's authored position, so the plan anchor lands on
  the site; `site_moved`/`no_lane` aborts stay honest.
- Resolutions: `line_held` (catchers down → grant + Free rep), `rider_down`,
  `rode_the_surge` (courier crosses the exit line under its own drift + the wave),
  `storm_passed` (deadline).
- `test/cr-anvil-1-surge-line.test.mjs` — 6/6 green, including `pointInsideWeatherVolume`
  placement assertions and the surge-edge doctrine flip verified against the real
  12 s cycle.

## Validation

`node --test test/encounter*.test.mjs test/cr-chain-1-*.test.mjs test/cr-anvil-1-*.test.mjs
test/e6-*.test.mjs` — 97/97 green; catalog validation, barks, E6 planner walks all pass.
Encounter index regenerated (69 modules, additive).
