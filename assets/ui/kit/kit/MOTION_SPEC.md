# Motion spec — Field Hardware

`kit/motion.js` (classic script, `window.FH.motion`) + `kit/motion.css`.
Numbers come from `tokens/tokens.json` → `tokens.css`, so this table and the code cannot drift.

## The three rules

1. **Nothing runs unasked.** Every function takes the state that justifies it and returns a
   cancel handle. There is no ambient loop. `drift` and `parallax` are the only continuous
   motions; `drift` parks its `requestAnimationFrame` when cancelled or when the tab hides,
   and `parallax` has no loop at all (it writes two custom properties on pointer move).
2. **Reduced motion is a cut.** Not a shorter animation: every transition completes instantly,
   ambient drift stops, parallax is off. Honoured twice — the media query, and the library's
   own `setReducedMotion()` switch so a demo can show it without changing an OS setting.
3. **Registers do not share a language.** A screen in one register must not move like a screen
   in another, for the same reason they must not share a silhouette.

## POSTER — cinematic, with mass

| Motion | Trigger state | Duration | Easing | Reduced | DOM it may touch |
|---|---|---|---:|---|---|
| `reveal(el, {register:'poster', index})` | screen entered | stagger **40 ms** × index, settle **280 ms** (240–320) | `cubic-bezier(0.2, 0.8, 0.2, 1)` | cut to final | `transform`, `opacity`, `filter` |
| hero type stamp (`from:'stamp'`) | the same reveal on a ≥ 96 px element | 280 ms | as above | cut | `transform` (scale 1.035 → 1), `filter` (1.5 px blur → 0) |
| `drift(el, {degPerSec})` | screen is paused **and** reduced motion is off | continuous, **≤ 0.5 °/s** | linear | **stops** | `--fh-drift-x/y` |
| `parallax(root, {max})` | pointer over the screen | pointer-driven, **≤ 6 px** | 120 ms linear catch-up | **off** | `--fh-par-x/y` |

## BENCH — mechanical, with a one-frame overshoot

| Motion | Trigger state | Duration | Easing | Reduced | DOM |
|---|---|---|---:|---|---|
| `slide(el, {from, weight})` | a plate arrives | **200 ms** (180–220), overshoot to −2 px at 78 % | `cubic-bezier(0.2, 0.8, 0.2, 1)` | cut | `transform`, `opacity` |
| `light(el, on)` | the thing became live / went to rest / was disabled | **100 ms** (80–120) | linear | cut | `data-fh-lit`, `--fh-lit-level` |
| `press(el)` | pointer down on a key | **60 ms** down, **120 ms** up | `cubic-bezier(0.2, 0.8, 0.2, 1)` | no motion | `transform: translateY(2px)` |
| `reveal(..., {register:'bench'})` | screen entered | stagger 24 ms, settle 200 ms | as above | cut | `transform`, `opacity` |

`light()` never swaps a colour. It moves `--fh-lit-level`, which the components multiply their
backlight by — so a disabled control reads as unlit hardware rather than as grey text. That is
§4's "the *light* is the state, not a colour swap" expressed as a number.

## EDGE — instrument

| Motion | Trigger state | Duration | Easing | Reduced | DOM |
|---|---|---|---:|---|---|
| `value(el, to)` | a reading changed | **120 ms** | cubic ease-out, rAF, parks on arrival | set immediately | `textContent` or a supplied `apply` |
| `pulse(el)` | an alert became true | **400 ms**, **once**, then holds | `cubic-bezier(0.33, 0, 0.15, 1)` | suppressed | `filter: brightness` |
| `reveal(..., {register:'edge'})` | instrument mounted | 120 ms, no stagger | as above | cut | `opacity` |

**Nothing loops in flight.** There is no `animation-iteration-count` above 1 anywhere in
`motion.css`, and the EDGE alert is one pulse that holds — `check-ui-effects` and
`check-ui-frame-sleep` both read this as compliant.

## API

```js
FH.motion.reveal(el, { register, index, from })   // -> { cancel() }
FH.motion.group(els, { register, from })          // staggered reveal, one cancel for all
FH.motion.settle(el)                              // land a reveal immediately
FH.motion.light(el, on, { rest })                 // on | rest | off
FH.motion.press(el)
FH.motion.slide(el, { from, weight })
FH.motion.pulse(el)                               // EDGE only, once
FH.motion.value(el, to, { from, apply })
FH.motion.drift(el, { degPerSec, ampPx })         // paused screens only
FH.motion.parallax(root, { max })                 // <= 6 px
FH.motion.setReducedMotion(true | false | null)   // null = follow the media query
FH.motion.prefersReducedMotion()
```

`from` values: `stamp` (POSTER hero type), `below`, `above`, `left`, `right`, `cut`.

## What this spec does not do

It does not restate the art direction. Every row above is a number a reviewer can measure off a
capture, which is the difference between a spec and a summary.
