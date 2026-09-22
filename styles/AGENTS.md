# styles/ agent notes

Frontend iteration (see the screen, then fix it): [`../docs/UI_VISUAL_ITERATION.md`](../docs/UI_VISUAL_ITERATION.md).
`node scripts/ui-bench.mjs --shot=<id>` photographs the real screen over a still. Open that PNG.
The standard you are judging it against: [`../design/frontend/THE_BAR.md`](../design/frontend/THE_BAR.md).

## There is one design system, and this directory is not it

**Deckplate (`src/ui/deckplate/`) is the design system.** Tokens, materials, components, hardware,
layout. Every colour, size, radius, duration, face and panel recipe on a player surface comes from
`--dp-*` and the `.dp-*` classes. A screen assembles them; it does not restyle them.

This file used to say the opposite — *"Do not impose universal palette, opacity, blur, radius,
typography, animation, or panel recipes"* — and that sentence is the written cause of what the
tree looks like today: four complete token roots stacked on each other (`--k-` 926 declarations,
`--sf-` 501, `--fh-` 420, `--dp-` 112), plus ~700 more in one-screen roots, 274 custom properties
and four type faces, with no two screens agreeing on anything. Owner direction on 2026-09-22
replaced it. Consistency is now the requirement, not the hazard.

- **Never add a token root.** No new `--xx-` prefix. If Deckplate lacks something, add it to
  Deckplate once, in `src/ui/deckplate/`, and every screen gets it.
- **Never hand-mix a value.** No literal hex, no one-off `cubic-bezier`, no `border-radius: 8px`,
  no `font-family` that is not a `--dp-face-*`.
- **A new stylesheet in this directory is a defect.** Screen-specific CSS is *placement* — grid
  positions, spans, sizes — and it belongs in `src/ui/deckplate/screens.js` next to the rest of the
  placement layer. Material never goes in a screen sheet.
- The sheets still here are being retired as their screens migrate. Progress and order:
  [`../design/frontend/UNIFICATION_LEDGER.md`](../design/frontend/UNIFICATION_LEDGER.md). Do not
  extend one; migrate the screen instead.

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
