# src/ui/effects/ — the command-deck effect layer

**Status:** implemented registry and shared runtime, linted by `scripts/check-ui-effects.mjs`
(`npm run check:ui-effects`, also wired into the `check` / `check:ci` aggregates). Effects are used by
the HUD, engineering stage, Market, Station Hub, Outfitting, and Shipyard; inspect current imports
before changing lifecycle or registration. `index.js` is the live inventory rather than a fixed
primitive-count promise.

This directory is the shared view-only effect seam. The former command-deck bible is retained as a
concept/reference quarry:
[`design/revamp/COMMAND_DECK_EFFECTS_AND_GAMEPLAY_BIBLE.md`](../../../design/revamp/COMMAND_DECK_EFFECTS_AND_GAMEPLAY_BIBLE.md).
It is not a mandatory visual recipe, palette, or completion checklist.

Its §1 may be consulted for candidate effects. Root `AGENTS.md`, the owning screen, current checks,
and player-facing evidence govern implementation; the reference imposes no fixed palette, motion, or
dependency recipe.

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

Reference-only concepts not currently registered include **Console Key** and **Nav Globe**. They are
not required backlog items. Add a registered module only when a current screen problem and
player-facing evidence justify it. Magic UI is one reference; use or replace dependencies only when
license, bundle/performance, accessibility, and maintenance evidence supports the result.

## The rules
1. Keep one coherent effect/runtime seam. A new dependency must materially improve the result and
   carry the repository's required license, bundle/performance, accessibility, and maintenance record.
2. Isolated & view-only: an effect module never imports a screen, never mutates `gameState`, never
   imports the sim. Screens import effect factories.
3. **No idle rAF when hidden** — start on `setActive(true)`, cancel on `setActive(false)`/`dispose()`.
   A loop running behind a closed screen is a defect (`check-ui-frame-sleep` is the precedent).
4. `motionReduce` respected — degrade to a legible static state (never blank).
5. Choose color and compositor technique from the owning screen's semantics and current evidence.
   Existing tokens are useful defaults, not a palette allowlist. Validate accessibility, contrast,
   readability, and representative performance rather than forbidding new hues or blur universally.
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
left pending, a bounded reduced-motion path, deterministic runtime sources, registry/file coverage,
and cue/lifecycle structure. It intentionally does not enforce palette, blur, dependency, primitive
count, or cue-duration taste. Add a new effect factory + registry row together so no silent orphan is
shipped.

## Do not
Mutate simulation/game state, animate behind a hidden or inactive surface, leave listeners/DOM/rAF
alive after disposal, erase the reduced-motion static state, ship unmeasured expensive compositor
work, obscure readable information, or copy incompatibly licensed code. Atmospheric and decorative
effects are allowed when they support the owning composition and pass accessibility and measured
performance review.
