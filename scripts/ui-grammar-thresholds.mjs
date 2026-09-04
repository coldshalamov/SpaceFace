// ui-grammar-thresholds.mjs — PQ-180 .01 "The floor, written."
//
// ONE file holds every number the grammar matrix judges a surface by. The matrix check reads it;
// design/frontend/INSTRUMENT_GRAMMAR.md §12 quotes it; nothing else may re-declare a floor.
// If a number here is wrong, it is wrong in exactly one place.
//
// Provenance of each number (never invent one — cite it):
//   12 px            INSTRUMENT_GRAMMAR §12.2 "nothing below 12 px"
//   +40 %            INSTRUMENT_GRAMMAR §12.11 "every label still reads at +40 % string length"
//   1280/1920/2560   INSTRUMENT_GRAMMAR §12.8 capture matrix widths (already the capture viewports)
//   1500 DOM nodes   PQ-180 .01 done-when (per surface subtree, not the document)
//   2 ms UI frame    PQ-180 .01 done-when; the UI frame budget in design/PERF_BUDGET.md terms
//   4 data states    INSTRUMENT_GRAMMAR §12.9 EMPTY / LOADING / ERROR / DENIED

/** Minimum computed font size, in CSS px, for any VISIBLE text-bearing node on a surface. */
export const MIN_FONT_PX = 12;

/** Pseudo-localization growth the layout must absorb without clipping (qps-ploc boot). */
export const PSEUDO_LOC_GROWTH = 0.40;

/** The three widths every surface is measured and captured at. */
export const RESPONSIVE_WIDTHS = Object.freeze([1280, 1920, 2560]);

/** Maximum element count inside one surface root subtree. */
export const MAX_SURFACE_DOM_NODES = 1500;

/** Maximum UI frame cost attributable to an open surface, in milliseconds. */
export const MAX_UI_FRAME_MS = 2;

/** The four data states every surface must name (INSTRUMENT_GRAMMAR §12.9). */
export const REQUIRED_DATA_STATES = Object.freeze(['EMPTY', 'LOADING', 'ERROR', 'DENIED']);

/**
 * Clipping tolerance, in CSS px, before scrollWidth > clientWidth counts as a clip. Sub-pixel
 * layout rounding routinely reports 0.5 px of overflow on a correct box; 1 px is the smallest
 * value that does not fire on rounding alone. This is a rounding guard, not a quality allowance.
 */
export const CLIP_TOLERANCE_PX = 1;

/**
 * Ultrawide safe box: at 2560 the content must clamp rather than stretch corner to corner.
 * A surface whose content box fills more than this fraction of a 2560 viewport is "stretched".
 * Derived from INSTRUMENT_GRAMMAR §12.12 ("clamps to a centred safe box"); the value is the
 * loosest clamp that still fails a full-bleed stretch.
 */
export const ULTRAWIDE_MAX_CONTENT_FRACTION = 0.98;
export const ULTRAWIDE_WIDTH = 2560;

/** Per-surface measurement wall-clock ceiling (PQ-180 "Performance and quality budget"). */
export const MAX_SURFACE_MEASURE_MS = 5000;

/** Minimum number of surfaces the manifest must carry (PQ-180 .00 done-when: "≥ 30 surfaces"). */
export const MIN_MANIFEST_SURFACES = 30;

/**
 * Fraction of PSEUDO_LOC_GROWTH that must be observed in the measured text before the pseudo pass
 * counts as witnessed. qps-ploc expands strings but not every glyph on a screen is a translated
 * string (figures, keycaps, IDs stay put), so requiring the full +40% on TOTAL characters would fail
 * correct surfaces. Half of it is enough to prove the locale really applied and is not a fallback.
 */
export const PSEUDO_LOC_WITNESS_FRACTION = 0.5;

export const THRESHOLDS = Object.freeze({
  pseudoLocWitnessFraction: PSEUDO_LOC_WITNESS_FRACTION,
  minFontPx: MIN_FONT_PX,
  pseudoLocGrowth: PSEUDO_LOC_GROWTH,
  responsiveWidths: RESPONSIVE_WIDTHS,
  maxSurfaceDomNodes: MAX_SURFACE_DOM_NODES,
  maxUiFrameMs: MAX_UI_FRAME_MS,
  requiredDataStates: REQUIRED_DATA_STATES,
  clipTolerancePx: CLIP_TOLERANCE_PX,
  ultrawideMaxContentFraction: ULTRAWIDE_MAX_CONTENT_FRACTION,
  ultrawideWidth: ULTRAWIDE_WIDTH,
  maxSurfaceMeasureMs: MAX_SURFACE_MEASURE_MS,
  minManifestSurfaces: MIN_MANIFEST_SURFACES,
});

export default THRESHOLDS;
