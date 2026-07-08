// src/ui/effects/index.js — the command-deck effect layer barrel.
//
// The ONLY sanctioned home for the visual-effect grammar in
// design/revamp/COMMAND_DECK_EFFECTS_AND_GAMEPLAY_BIBLE.md §1. Screens import effect FACTORIES from
// here; effects never import screens, never import the sim, never touch THREE (view-only).
//
// Every factory has the same contract shape (shipPreviewMount precedent): its own verbs PLUS
// `setActive(bool)` (start/stop any rAF — MUST cancel on false) and `dispose()` (tear down DOM, cancel
// rAF). Each also carries a static `cue` describing where/when it may fire and its max duration — the
// EFFECT_CUES table below is the lint surface (scripts/check-ui-effects.mjs walks it, the way
// vfxCues lints the 3D layer).
import { createFlickerGrid, CUE as FLICKER_GRID_CUE } from './flickerGrid.js';
import { createRippleField, CUE as RIPPLE_FIELD_CUE } from './rippleField.js';
import { createHexPattern, CUE as HEX_PATTERN_CUE } from './hexPattern.js';
import { createRouteBeam, CUE as ROUTE_BEAM_CUE } from './routeBeam.js';
import { createCircularGauge, CUE as CIRCULAR_GAUGE_CUE } from './circularGauge.js';
import { createGlyphMatrix, CUE as GLYPH_MATRIX_CUE } from './glyphMatrix.js';
import { createDockRail, CUE as DOCK_RAIL_CUE } from './dockRail.js';
import { createMorphLabel, CUE as MORPH_LABEL_CUE } from './morphLabel.js';
import { createSupplyTree, CUE as SUPPLY_TREE_CUE } from './supplyTree.js';

export { createFlickerGrid } from './flickerGrid.js';
export { createRippleField } from './rippleField.js';
export { createHexPattern } from './hexPattern.js';
export { createRouteBeam } from './routeBeam.js';
export { createCircularGauge } from './circularGauge.js';
export { createGlyphMatrix } from './glyphMatrix.js';
export { createDockRail } from './dockRail.js';
export { createMorphLabel } from './morphLabel.js';
export { createSupplyTree } from './supplyTree.js';

// Shared, view-only helpers (deterministic RNG, token resolution, rAF driver, reduced-motion, CSS
// injection). Re-exported so screens/effects share one source of truth.
export {
  EFFECT_TOKENS, KIND_TOKEN, tokenForKind, resolveToken, prefersReducedMotion,
  makeRng, createRafDriver, ensureFxCss, svgEl, clamp01, SVG_NS,
} from './effectRuntime.js';

// The registry: one row per primitive. Adding a new effect means adding a row here — and the check
// iterates this array, so a primitive that is not registered is a failing check, not a silent orphan.
export const EFFECTS = Object.freeze([
  { name: 'flickerGrid', create: createFlickerGrid, cue: FLICKER_GRID_CUE },
  { name: 'rippleField', create: createRippleField, cue: RIPPLE_FIELD_CUE },
  { name: 'hexPattern', create: createHexPattern, cue: HEX_PATTERN_CUE },
  { name: 'routeBeam', create: createRouteBeam, cue: ROUTE_BEAM_CUE },
  { name: 'circularGauge', create: createCircularGauge, cue: CIRCULAR_GAUGE_CUE },
  { name: 'glyphMatrix', create: createGlyphMatrix, cue: GLYPH_MATRIX_CUE },
  { name: 'dockRail', create: createDockRail, cue: DOCK_RAIL_CUE },
  { name: 'morphLabel', create: createMorphLabel, cue: MORPH_LABEL_CUE },
  { name: 'supplyTree', create: createSupplyTree, cue: SUPPLY_TREE_CUE },
]);

// The lint table (effect → allowed screens / triggers / max duration). Mirrors src/data/vfxCues for
// the 3D layer: a check can assert every effect declares where it fires and stays within its budget.
export const EFFECT_CUES = Object.freeze(EFFECTS.map((e) => e.cue));
