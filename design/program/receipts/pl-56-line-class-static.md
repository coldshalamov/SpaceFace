# PL-56: Your Line goes up a class → Static reports

Plant row: `| PL-56 | Your Line goes up a class | "New rope in the lanes. Mind your cargo." |`

## Before

`lineProgression` already emits `line:classChanged` when the class ladder moves up —
nothing on the Band ever heard of it. Tuning the Static and classing up produced only
the ordinary rotation.

## After

- `deriveBandEventKeys('line:classChanged')` opens `player.line_class_up`
  (src/systems/bandRadio.js — the event only fires on class-up).
- `the_static` carries the authored line: `static_75` "New rope in the lanes. Mind
  your cargo." (src/data/flavor/040-band.js) — off the rotation until the key opens.
- Aired once per save via the existing deed-key one-airing path.

## Proof

`node --test test/inf-radio-line-class.test.mjs` — 3 tests: key opens on the event,
the voice queue airs "New rope" exactly once on the tuned channel, and the line stays
out of rotation unopened. Band suite green (8 related test files re-run).
