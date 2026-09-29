# FB-005 — Rumble has its own setting and a per-verb pulse table, no longer silenced by reduce-motion

**Kind:** build · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: gamepad.js, seam: gameState.js
**Write-set:** `src/systems/gamepad.js`, `src/core/gameState.js`, `src/ui/screens/settings.js`, `test/fb-haptic-verbs.test.mjs`
**Neighbours (extend, never restate):** SFQ-B226, PQ-164

## The gap
`computeHapticFrame` runs four continuous channels (momentum, line, slam, boost) and one duration; it returns
an all-zero frame when `reduceMotion` is set, so a vestibular preference kills rumble, which is a different
axis. There is no settings row and `saveSystem.js` omits `haptics` from the default bag. No discrete pulse
exists for latch, cut, release grade, snare catch, charge detonate or cloak, though every one of those events
fires.

## Why this direction
Coupling rumble to motion reduction is wrong: a reduce-motion player often wants more haptic substitution. An
event→{strong, weak, ms} table next to the existing constants reuses the same `bus.on` sites.

## Mechanism
- Add `+accessibility.haptics` (off/low/full) to `defaultSettings()` and a Controls row; stop reading
  `reduceMotion` in `computeHapticFrame`.
- Add a discrete pulse table for `tether:latched`, `tether:cut`, `tether:releaseRated` (by band),
  `massline:snareCaught`, `charge:detonated`, `cloak:engaged`, applied through the existing `_applyHaptics` path
  with the one-shot reset.
- Pin that low halves both motors and off produces a zero frame with no `playEffect` call.

## Done when
`test/fb-haptic-verbs.test.mjs`: six events produce six distinct pulses, reduce-motion alone no longer zeroes
the frame, `pq-164-03-haptics.test.mjs` stays green.

## Do not
Do not pulse on NPC events. Do not exceed one pulse per 80 ms. Do not persist haptics inside a save (profile
only).

## Focus test starting points
- `test/pq-164-03-haptics.test.mjs`
- `test/accessibility-settings-parity.test.mjs`
