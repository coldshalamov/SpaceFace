# FB-025 — Arena and wave intros are real windows that say what is coming

**Kind:** build · **Lane:** THE FIGHT · **Routing:** open
**Seam tags:** seam: survivalRun.js, seam: survivalAnnounce.js, seam: survivalHud.js
**Write-set:** `src/systems/survivalRun.js`, `src/systems/survivalAnnounce.js`, `src/ui/survivalHud.js`, `test/fb-wave-intro-window.test.mjs`
**Neighbours (extend, never restate):** SFQ-B057, NXI-067

## The gap
`survivalRun.js` listens for `run:arenaIntroComplete` and `run:waveIntroComplete`, which nothing emits; the
phase machine falls through on `SURVIVAL_ARENA_INTRO_TICKS = 1`. So there is no intro beat.
`survivalAnnounce.js` already composes `waveOpeningLine` and `hintTextFor` from the plan and the roster's
`counterHint`, and the HUD shows only alive/total counts and a clock.

## Why this direction
A cinematic was rejected. A 2 s window in which the opening line is spoken and the roster silhouettes are
named is the whole beat; it also gives the telegraph packet (FB-016) its first read.

## Mechanism
- Emit `run:arenaIntroComplete`/`run:waveIntroComplete` from `survivalAnnounce.js` after the opening line, and
  raise the intro tick constants to a real beat (120 ticks arena, 90 ticks wave) with the player free to move.
- Render `waveOpeningLine(wave, plan)` on the survival HUD during the window (minimal functional edit,
  ORRERY-consistent), then clear.
- Pin the window length and that spawns wait for the edge.

## Done when
`test/fb-wave-intro-window.test.mjs`: on seed 4242 the first spawn of wave 2 lands ≥ 90 ticks after
`run:wavePlanned` and the opening line was published; `crucible-announce.test.mjs` stays green.

## Do not
Do not freeze the player. Do not add a countdown UI redesign (ORRERY). Do not exceed 2 s.

## Focus test starting points
- `test/crucible-announce.test.mjs`
- `test/crucible-wave-materialization.test.mjs`
