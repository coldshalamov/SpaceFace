# FB-003 — A pad player can reach every bound flight verb, not two-thirds of them

**Kind:** build · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: gamepad.js, seam: input.js, seam: fields.js
**Write-set:** `src/systems/gamepad.js`, `src/systems/input.js`, `src/ui/screens/settings.js`, `test/fb-pad-covers-the-hand.test.mjs`
**Neighbours (extend, never restate):** SFQ-B224, NXB-055, NXI-217

## The gap
`GAMEPAD_DEFAULT_BINDINGS` carries 21 pad actions against ~30 keyboard flight verbs. `scanPulse`, `cruise`,
`bulletTime`, `cloak`, `deployMassSeed`, `deployWell`, `toggleClearingCone`, `toggleSkimCollector`,
`chargeThrow`, `siteBeam`, `jettisonLot`, `deployBeacon` and `autoFire` have no pad route, and
`GAMEPAD_REBINDABLE` mirrors the shortfall. Half the Hand is keyboard-only.

## Why this direction
A pad radial menu (modal) was rejected as the primary answer: it stops the hand. Chords on the free d-pad and
stick-click space cover the verbs without a menu; a `POWER_ROSTER`-fed radial is the fallback only for the
deployables. Editing `input.js` needs task ownership plus focused input/rebind/sim validation, which this
packet names.

## Mechanism
- Add default chords (hold LB/RB + d-pad/face) for the thirteen verbs in `GAMEPAD_DEFAULT_BINDINGS`, honouring
  the designed context shares checked by `findGamepadBindConflict`.
- Extend `GAMEPAD_REBINDABLE` so every pad action, chords included, is capturable in settings; keep the 30 s
  capture timeout.
- Pin raw-axis and action semantics unchanged for all existing pad actions (input contract).

## Done when
`test/fb-pad-covers-the-hand.test.mjs`: every id in `VERB_BINDINGS` that has a keyboard code has a pad route;
conflict check passes on the default table; `pq-164-01-glyphs-remap.test.mjs` and the input lifecycle suites
stay green.

## Do not
Do not change any existing default pad binding. Do not add a modal radial as the only route. Do not alter
`state.input.actions` semantics.

## Focus test starting points
- `test/pq-164-01-glyphs-remap.test.mjs`
- `test/input-lifecycle.test.mjs`
- `test/pq-164-03-haptics.test.mjs`
