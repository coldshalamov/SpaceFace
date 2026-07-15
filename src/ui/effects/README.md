# src/ui/effects/ — the command-deck effect layer

**Status:** implemented — nine primitives + `effectRuntime.js` (shared helpers) + `index.js` (barrel +
registry), linted by `scripts/check-ui-effects.mjs` (`npm run check:ui-effects`, also wired into the
`check` / `check:ci` aggregates). **Not yet wired into any screen** — this pass ships the reusable
  reusable effect modules only; screen adoption is the next lane. This directory is the current shared
  home for the visual-effect grammar described in
[`design/revamp/COMMAND_DECK_EFFECTS_AND_GAMEPLAY_BIBLE.md`](../../../design/revamp/COMMAND_DECK_EFFECTS_AND_GAMEPLAY_BIBLE.md).

Read that reference §1 for candidate effects, then follow root `AGENTS.md` and the owning screen's
player-facing evidence. The reference does not impose fixed palette, motion, or dependency bans.

## What lives here
Vanilla DOM/CSS/`<canvas>` reimplementations of the screen effects. Shipped:

| Module | Effect | Backing |
|---|---|---|
| `flickerGrid.js` | Scanner Grid | `<canvas>` + self-parking rAF |
| `rippleField.js` | Ping Ripple | SVG + self-parking rAF |
| `glyphMatrix.js` | Anomaly Glyph Matrix | `<canvas>` + self-parking rAF |
| `hexPattern.js` | Hex Sector Lattice | SVG, CSS `fill` recolour (no rAF) |
| `routeBeam.js` | Route Beam | SVG, class-gated marching dash (no rAF) |
| `circularGauge.js` | Ring Gauge | SVG, CSS `stroke-dashoffset` (no rAF) |
| `dockRail.js` | Service Dock | DOM/CSS, transform-scale magnify (no rAF) |
| `morphLabel.js` | Readout Morph | DOM, CSS crossfade animation (no rAF) |
| `supplyTree.js` | Dependency Spindle | SVG, class-gated marching edge (no rAF) |

Deferred (the reference names them but they are not in this slice): **Console Key** (hover button),
**Nav Globe** (globe) — add them as new registered modules when a screen needs them. Magic UI is one
reference; use or replace dependencies only when license, bundle/performance, accessibility, and
maintenance evidence supports the result.

## The rules
1. Keep one coherent effect/runtime seam. A new dependency must materially improve the result and
   carry the repository's required license, bundle/performance, accessibility, and maintenance record.
2. Isolated & view-only: an effect module never imports a screen, never mutates `gameState`, never
   imports the sim. Screens import effect factories.
3. **No idle rAF when hidden** — start on `setActive(true)`, cancel on `setActive(false)`/`dispose()`.
   A loop running behind a closed screen is a defect (`check-ui-frame-sleep` is the precedent).
4. `motionReduce` respected — degrade to a legible static state (never blank).
5. Preserve learnable semantic color and accessibility. Existing tokens are useful defaults, not a
   closed hue list; new color needs a clear screen role and representative contrast review.
6. Green on `check:ui:perf`, `check:ui-a11y`, `check:wcag-contrast`, `check:bundle` (if the import
   graph changes), `check:launch-policy`.

## Module contract
Each factory returns its own verbs (`reveal` / `ping` / `setValue` / `resolve` / `set` / `setPath` /
`setCells` / `setItems` …) **plus** the universal three, and carries a static `cue`:
```js
// createRouteBeam(mountEl, opts) — pattern after Magic UI "animated beam"; SpaceFace: directed flow.
export const CUE = { effect: 'routeBeam', screens: [...], triggers: [...], maxMs, loop, activeGated };
export function createRouteBeam(mountEl, opts = {}) {
  return {
    setPath(points, o) { /* the effect's own verb(s) */ },
    update(state)      { /* re-read game state; recolor/redraw on change, not per-frame */ },
    setActive(on)      { /* start/stop rAF AND drop animating classes; MUST cancel on false */ },
    dispose()          { /* remove DOM/canvas, cancel rAF, drop listeners */ },
    cue: CUE,
  };
}
```
Same shape as `src/ui/shipPreviewMount.js`. Every primitive is registered in `index.js`'s `EFFECTS`
array (`{ name, create, cue }`) and its `cue` joins `EFFECT_CUES`. `scripts/check-ui-effects.mjs` walks
that registry to prove: import-safe with no DOM, mounts→renders→**self-parks**→disposes with no rAF
left pending, a bounded reduced-motion path, and source-level bans (no hex/rgb/hsl/named colour, no
`backdrop-filter`, no `Math.random`/wall-clock, tokens on the palette allowlist). Add a new effect =
add a module + register it, or the check fails (no silent orphans).

## Do not
Ship an effect with no game state behind it (decoration is forbidden — spec2/00 §3), animate at rest,
introduce a hue, or copy GPL game code. Effects express state; that is the whole job.
