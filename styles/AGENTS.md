# styles/ agent notes

Frontend iteration (see the screen, then fix it): [`../docs/UI_VISUAL_ITERATION.md`](../docs/UI_VISUAL_ITERATION.md).
`node scripts/ui-bench.mjs --shot=<id>` photographs the real screen over a still. Open that PNG.
The active standard and visual direction: [`../design/frontend/ORRERY.md`](../design/frontend/ORRERY.md)
(handoff: [`../design/frontend/ORRERY_HANDOFF.md`](../design/frontend/ORRERY_HANDOFF.md)).
`THE_BAR.md` and `ONE_PHOTOGRAPH.md` were superseded 2026-09-26 (their no-fake-CSS-material law and
the `12px` type floor in `scripts/check-type-floor.mjs` remain binding).

## One design system — ORRERY over Deckplate

**ORRERY (`src/ui/orrery/`) over Deckplate (`src/ui/deckplate/`) owns tokens, instruments, and screen layouts.**
Every colour, size, duration, face, and instrument recipe on a player surface comes from `--dp-*`
tokens (`src/ui/deckplate/tokens.js` + `src/ui/orrery/tokens.js`) and the `.dp-*` / `.k-*` / `.orr-*`
classes.

- **Never add a token root.** No new `--xx-` prefix. Shared tokens belong in `src/ui/orrery/tokens.js`
  or `src/ui/deckplate/tokens.js`.
- **Honor the `12px` type floor (`node scripts/check-type-floor.mjs`).** Never drop `font-size` below
  `12px` (or relative `em` below `max(12px, ...)`). When a narrow viewport or dial squeezes a label
  or numeral, condense `Archivo`'s variable width (`"wdth" 78–100`) and tighten `letter-spacing`
  rather than shrinking below `12px`.
- **Do not add new standalone screen stylesheets in `styles/`.** Screen compositions belong in
  `src/ui/orrery/*Layouts.js` (or `src/ui/deckplate/screens.js`). Existing sheets in `styles/` are
  maintained in place until retired.

## What still binds

- Preserve station screens, HUD roster/radar/objective/navigation information, accessibility hooks,
  focus behavior, and responsive reachability unless a tested replacement is clearer.
- Accessibility requires legibility, contrast, reduced motion/flash, and usable focus. Deckplate
  carries the reduced-motion and forced-colours variants in the token and layout layers — a
  consumer that re-implements them by hand has gone around the system.
- Measure compositor/layout cost before optimizing. Fix invalidation, allocation, layering, cadence,
  and overdraw without lowering the intended presentation. No `backdrop-filter` in flight.
- Validate with focused UI checks, a11y/contrast, UI performance, and the bench PNG for every
  screen you touched, plus `--walk` on its controls.
