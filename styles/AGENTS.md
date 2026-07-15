# styles/ agent notes

CSS implements the current UI; it is not a design constitution. Product intent comes from the active
UI/UX spec and current player-facing evidence.

- Preserve station screens, HUD roster/radar/objective/navigation information, accessibility hooks,
  focus behavior, and responsive reachability unless a tested replacement is clearer.
- Do not impose universal palette, opacity, blur, radius, typography, animation, or panel recipes.
- Accessibility requires legibility, contrast, reduced motion/flash, and usable focus—not a blanket
  ban on depth, transparency, imagery, or effects.
- Measure compositor/layout cost before optimizing. Fix invalidation, allocation, layering, cadence,
  and overdraw without lowering the intended presentation.
- Reuse semantic tokens where they help consistency, but extend or replace them when the activated
  design and evidence support a stronger result.
- Validate with focused UI checks, a11y/contrast, UI performance, and representative screenshots.
