# FB-004 — Mouse sensitivity and invert, pad response curves and per-stick deadzones exist

**Kind:** build · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: gamepad.js, seam: input.js, seam: gameState.js
**Write-set:** `src/systems/gamepad.js`, `src/systems/input.js`, `src/core/gameState.js`, `src/ui/screens/settings.js`, `test/fb-aim-pad-response.test.mjs`
**Neighbours (extend, never restate):** SFQ-B224, NXB-055

## The gap
`applyDeadzone` is linear and one `DEFAULT_DEADZONE` (0.12) covers all four axes from one slider. There is no
response curve, no outer deadzone, no per-stick deadzone and no aim-vs-fly sensitivity split (the terms curve,
expo and sensitivity have zero hits in `gamepad.js` and `settings.js`). The mouse path maps `mouseNdc` to aim
with no multiplier and no invert. Every modern shooter ships these.

## Why this direction
Mature parity, and it fits: the settings profile already persists the whole `controls` subtree, so any key
inside it survives for free. Curves are pure functions on the normalized axis.

## Mechanism
- Add `+controls.gamepad.curve` (linear/expo), `+deadzoneRight`, `+sensitivityAim`, `+sensitivityFly` and
  `+controls.mouse.sensitivity`/`+controls.mouse.invertY` to `defaultSettings()`, consumed where axes are
  normalized in `gamepad.js` and where aim is derived in `input.js`.
- Add the rows under Controls using the existing `rowSlider`/`rowSelect` builders (functional edit,
  ORRERY-consistent).
- Pin the curve math and that raw axes reach `state.input` unchanged (the curve applies to the derived intent
  only).

## Done when
`test/fb-aim-pad-response.test.mjs`: expo curve monotonic, right-stick deadzone independent of left, mouse
invert flips aim sign, raw axes untouched; `settings-controller-label-truth.test.mjs` and
`check-settings-profile-persistence` stay green.

## Do not
Do not filter raw axes. Do not change the default feel (defaults reproduce today's numbers). Do not edit
`input.js` without the focused input validation named above.

## Focus test starting points
- `test/settings-controller-label-truth.test.mjs`
- `test/input-lifecycle.test.mjs`
- Run `node scripts/check-settings-profile-persistence.mjs`.
