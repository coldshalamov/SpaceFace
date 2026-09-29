# FB-099 — Three shipped settings controls stop being dead, and a check keeps new ones honest

**Kind:** CHECK · **Lane:** THE INSTRUMENT · **Routing:** open
**Seam tags:** seam: settings.js, seam: feel.js, seam: gameState.js
**Write-set:** `src/ui/screens/settings.js`, `src/render/feel.js`, `src/core/gameState.js`, `scripts/fb-check-settings-keys.mjs`, `test/fb-settings-keys-live.test.mjs`
**Neighbours (extend, never restate):** SFQ-B225

## The gap
The Screen Shake slider writes `video.screenShake`, whose only reader is the cosmetic preview in
`src/ui/orrery/settingsPreview.js`; `feel.js` and `camera.js` never read it. The Damage numbers toggle writes
`gameplay.damageNumbers`, which has zero readers (the live key is root `showDamageNumbers`, read by
`floatingText.js`). `settings.keybinds` is an empty root bag nothing reads or writes.

## Why this direction
Reproduce first: each is a control a player can move with no effect. Then wire, repoint, delete, and add a
static check so the class cannot recur.

## Reproduction gate
- Reproduction gate: set `video.screenShake` to 0 and run a scripted slam on seed 4242; assert trauma is
  unchanged (today). Toggle damage numbers off; assert `showDamageNumbers` unchanged (today).
- Fix: thread `screenShake` into `feel.js` beside `motionReduce` as a 0..1 trauma multiplier; repoint the
  damage-numbers row at `showDamageNumbers`; delete `keybinds` from `defaultSettings()`.
- Add `scripts/fb-check-settings-keys.mjs`: every key written by `settings.js` has a reader outside
  `src/ui/orrery/`; wire it into the baseline list.

## Done when
`test/fb-settings-keys-live.test.mjs`: shake 0 yields zero trauma on the slam, the toggle flips the live key;
the new check passes on the tree and fails on a planted dead key; `settings-controller-label-truth.test.mjs`
stays green.

## Do not
Do not add settings in this packet. Do not restyle the screen (ORRERY). Do not read `screenShake` in the sim.

## Focus test starting points
- `test/settings-controller-label-truth.test.mjs`
- `test/renderer-settings-runtime-truth.test.mjs`
- Run `node scripts/check-settings-profile-persistence.mjs`.
