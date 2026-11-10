// src/ui/orrery/clipsLayouts.js — ORRERY short-window densify for the Clips reel
// (ui-polish-378). Base placement stays in styles/ui.css; this sheet only hardens the
// soft foot veil and lifts empty-reel chrome so ghost plates / the how-to legend stop
// painting through FLY TO MAKE ONE at ≤560 tall (and phone ≤560 wide).
//
// Scope: `#screens > .k-screen.orr-clips` only. Selectors/IDs unchanged.

import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-clips-layouts';
const R = 'html body #screens > .k-screen.orr-clips';

const CSS = `
/* ---- opaque lamp curtain + fade apron (always; soft ui.css veil alone left glyphs readable) ----
   The theatrical veil stays a gradient above, but the last band behind FLY TO MAKE ONE is a solid
   curtain so plate names / the how-to legend cannot read through the key. An apron fades content
   that still scrolls into the band. Actions keep z above the apron. */
${R} > .orr-clips__veil-foot {
  background:
    linear-gradient(transparent, rgb(5 7 10 / .55) 28%, rgb(5 7 10 / .92) 62%, rgb(5 7 10 / .98)) !important;
}
${R} > .orr-clips__actions {
  position:absolute !important; z-index:4 !important; isolation:isolate;
}
${R} > .orr-clips__actions::before {
  content:"" !important; position:absolute !important; left:0 !important; right:0 !important;
  bottom:100% !important; height:48px !important; pointer-events:none !important; z-index:0;
  background:linear-gradient(180deg, rgb(5 7 10 / 0), rgb(5 7 10 / .88) 55%, rgb(5 7 10 / .98)) !important;
}
${R} > .orr-clips__actions > * { position:relative; z-index:1; }

/* ---- short densify (ui-polish-378): empty reel clears the lamp band ----
   Existing ui.css rules stop at max-height:460px; 651×461 / 801×461 / 960×500 sit just above
   that cut and still mash ghost names + readout into the soft foot. Extend to ≤560 and lift
   the rail / legend so they seat above the opaque curtain. */
@media (max-height: 560px) {
  ${R}:has(.orr-clip__plate.is-ghost) > .orr-clips__rail { top:10% !important; height:min(300px, 58vh) !important; }
  ${R}:has(.orr-clip__plate.is-ghost) > .orr-clips__readline {
    bottom:88px !important; z-index:3 !important;
    padding:6px 8% !important;
    background:linear-gradient(90deg, rgb(5 7 10 / 0), rgb(5 7 10 / .92) 18%, rgb(5 7 10 / .92) 82%, rgb(5 7 10 / 0)) !important;
  }
  ${R}:has(.orr-clip__plate.is-ghost) .orr-clips__readout {
    max-width:62ch !important; font-size:12px !important; line-height:1.35 !important;
  }
  ${R} > .orr-clips__read .orr-clips__count { font-size:clamp(32px, 5vw, 52px) !important; }
  ${R} > .orr-clips__read .orr-clips__runtime { font-size:15px !important; margin-top:4px !important; }
  ${R} > .orr-clips__actions::before { height:40px !important; }
  ${R} > .orr-clips__veil-foot {
    background:
      linear-gradient(transparent, rgb(5 7 10 / .62) 22%, rgb(5 7 10 / .94) 55%, rgb(5 7 10 / .98)) !important;
  }
}

/* Phone: same curtain, tighter rail so three ghosts clear the legend above FLY TO MAKE ONE. */
@media (max-width: 560px) {
  ${R}:has(.orr-clip__plate.is-ghost) > .orr-clips__rail { top:14% !important; height:min(280px, 42vh) !important; }
  ${R}:has(.orr-clip__plate.is-ghost) > .orr-clips__readline {
    bottom:84px !important; flex-direction:column !important; align-items:center !important; gap:6px !important;
  }
  ${R} .orr-clip__plate.is-ghost .orr-clip__name { font-size:15px !important; }
  ${R} .orr-clip__plate.is-ghost .orr-clip__sub { font-size:12px !important; letter-spacing:.04em !important; }
}
`;

export const CLIPS_LAYOUT_CSS = CSS;

export function injectClipsLayouts(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  injectOrrery(doc);
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
