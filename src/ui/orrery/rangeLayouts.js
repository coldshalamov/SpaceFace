// src/ui/orrery/rangeLayouts.js — densify overlays for The Range (screens/range.js).
// Range keeps its canvas/kit sheet in range.js (KIT_SPEC §12 one local style block). This file
// owns short-desktop composition that the in-file ≤460 densify missed by one pixel: densify
// short heights 461–500 (651×461 / 700×461 / 801×461) still left RULES / BESTIARY / CLOSE and
// the run gauge below the frame, and squeezed the course (k-stage) to 0px. Raising the
// very-short band to ≤500 and stacking the run under the drawer tabs restores the tabs on
// glass and hands the course its leftover band. Desktop only — phones keep the mobile sheet.
// Injected from range.js after the local sheet so these rules win by document order.
//
// Do NOT floor the stage with minmax() here: pin(foot) sets flex-wrap:wrap !important, so a
// height-bound column foot spills the tabs into a second column past the right edge. Compress
// the title and ladder instead; the grid's minmax(0,1fr) stage takes whatever is left.

const STYLE_ID = 'sf-orrery-range-layouts';

const R = 'html:root:not([data-sf-mobile="1"])';
const S = `${R} body #screens #sf-range`;
const T = `${R} #sf-range`;

const CSS = `
/* ui-polish-365: densify short desktop ≤1100 × ≤500 (covers 651/700/801×461). The in-file
   very-short band stopped at max-height:460, so 461 kept the ≤640 packing — title ~185px and a
   five-row ladder — and pushed RULES / BESTIARY / CLOSE + the run gauge off the foot while the
   course collapsed to 0px. Same compressions as the ≤460 band, plus a ladder height bound and
   the run stacked under the drawer tabs so Rules/Bestiary/Close stay inside the foot width. */
@media (max-width: 1100px) and (max-height: 500px) {
  ${S} { padding: 10px 24px 6px; row-gap: 4px; }
  ${S} > .k-corner { top: 10px; right: 24px; }
  ${T} .k-title { padding-right: 120px; }
  ${T} .k-hero__n { font-size: 26px; line-height: 1; }
  ${T} .k-title > p {
    font-size: 12px; line-height: 15px;
    display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
  }
  ${T} .k-title > p + p { font-size: 12px; line-height: 15px; }
  ${T} .sf-range__verbs { margin-top: 2px; column-gap: 14px; }
  ${T} .sf-range__verbs .orr-lampkey { min-height: 28px !important; font-size: 12px !important; }
  ${T} .k-foot { row-gap: 3px; min-height: 0; }
  ${T} .sf-range__ladder {
    column-gap: 8px;
    max-height: max(56px, calc(100dvh - 300px));
    /* Wide ladders wrap into rows; narrow ladders run horizontally. Both axes must remain
       scrollable once height is bounded, otherwise later wrapped rungs cannot be reached. */
    overflow: auto;
    scroll-padding: 6px;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    min-height: 0;
  }
  ${T} .sf-range__ladder::before { height: 6px; margin-bottom: 0; }
  ${T} .sf-range__ladder > li { padding-bottom: 5px; }
  ${T} .sf-range__ladder > li::before { height: 5px; bottom: 0; }
  ${T} .sf-range__ladder .sf-range__word { min-height: 28px; padding: 1px 0; letter-spacing: .04em; font-size: 12px; }
  ${T} .sf-range__dossier { padding: 2px 2px; font-size: 12px; gap: 12px; letter-spacing: .08em; }
  ${T} .sf-range__tabs {
    display: flex; flex-wrap: wrap; align-items: center;
    width: 100%; max-width: 100%; box-sizing: border-box;
    column-gap: 14px; row-gap: 4px;
  }
  ${T} .sf-range__run {
    flex: 1 0 100%;
    margin-left: 0 !important;
    max-width: 100%;
    box-sizing: border-box;
    font-size: 12px; gap: 6px; padding: 0;
    letter-spacing: .06em;
    justify-content: flex-start;
  }
  ${T} .sf-range__run svg { width: 28px; height: 28px; }
  ${T} .sf-range__run .sf-range__run-best {
    flex: 1 1 auto; min-width: 0; white-space: normal; line-height: 14px;
  }
  ${S} .sf-range__drawer { width: 240px; }
  ${T} .k-stage:has(> .sf-range__drawer.is-open) .sf-range__box { right: calc(240px + var(--k-gap)); }
}
`;

/** Idempotent: the Range mounts once per bench/session; the densify sheet lands once per doc. */
export function injectRangeLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
