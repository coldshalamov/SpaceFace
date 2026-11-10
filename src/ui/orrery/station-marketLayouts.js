// Station Market tab — the screen's own layout home for market-scoped placement and arrival
// rules the shared sheets do not carry (design/frontend/ORRERY.md §6 Market; screens compose
// through `*Layouts.js`). Scoped to the market screen only — `.orr-market` under the berth —
// so the shared station chrome and the other six tabs are untouched.
//
// Three rules live here today:
//   1. THE BERTH RECEIPT'S LANE ON TALL WIDE SCREENS. The shared sheet's default lane
//      (src/ui/orrery/stationLayouts.js: "left:calc(100% + 40px)", nowrap, beside COMMS)
//      runs the receipt straight through the UNDOCK key once the viewport is ≥1501 px wide
//      and ≥801 px tall — measured 1920×1080: receipt x1418–1792 vs UNDOCK x1714–1888, and
//      ui-bench --walk reports UNDOCK "UNREACHABLE … centre hit reaches span.sx-receipt__delta".
//      The ≤1500-wide and ≤800-tall bands already have their own lanes (stationLayouts.js,
//      marketLayouts.js); this is the band nothing handled. The line lifts one row above the
//      comms row — clear of UNDOCK's top edge, still in the empty floor beside the trade —
//      and wraps instead of overrunning the frame edge.
//   2. ARRIVAL. Rows and the reading settle in on the choreography's terms instead of just
//      appearing when the register rebuilds (a filter, a search, a mode change, a selection).
//      The controller marks the reading `.is-arriving` only when the lot actually changed;
//      price ticks patch the same row nodes and re-write the quote bare, so quiet ticks
//      replay nothing. Both obey the game's reduce-motion setting the way the library sheets
//      do (html.sf-reduce-motion), never a hand-rolled query.
//   3. THE READING AT THE FOLD. The analysis (station.css) is a scroll region whose last 26 px
//      fade — and at rest on tall screens the fade used to slice the readouts grid's DEMAND
//      label mid-glyph (the arc below it never showed) while at ≤880-tall heights it cut the
//      ticker tape's glyphs in half. The controller now draws the demand arc on the trace's key
//      line (market.js syncDemandKey, aria-hidden twin of the grid), so here the grid stands
//      down above 880 px and the tape — pure motion, the register already carries the prices —
//      stands down at and below 880 px: nothing readable straddles the fade at rest.
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-station-market';

/* desktop only — phones carry data-sf-mobile and their own sheet (mobileScreenLayouts.js) */
const DESKTOP = 'html:root:not([data-sf-mobile="1"]) body #screens > .sx-berth.orr-station';
const M = `${DESKTOP} .sx-mkt.orr-market`;

const CSS = `
/* ---- the berth receipt clears the UNDOCK key on tall wide screens ----------------------------- */
@media (min-width:1501px) and (min-height:801px) {
  ${DESKTOP}:has(.sx-mkt.orr-market) .sxb-ops .sx-receipt {
    top:auto !important; bottom:calc(100% + 22px) !important;
    left:calc(100% + 40px) !important; right:auto !important;
    white-space:normal !important; flex-wrap:wrap !important;
    max-width:min(560px, 36vw) !important;
  }
}
/* ---- arrival: the register and the reading settle in, nothing just appears -------------------- */
@keyframes sf-mkt-row-in { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
@keyframes sf-mkt-quote-in { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:none; } }
${M} .sx-mkt-row { animation:sf-mkt-row-in .3s var(--dp-ease-out, ease-out) backwards;
  animation-delay:calc(min(var(--sf-i, 0), 12) * 20ms); }
${M} .sx-mkt__quote.is-arriving > *, ${M} .sx-mkt__decision.is-arriving > * {
  animation:sf-mkt-quote-in .34s var(--dp-ease-out, ease-out) backwards; }
${M} .sx-mkt__quote.is-arriving > :nth-child(2) { animation-delay:36ms; }
${M} .sx-mkt__quote.is-arriving > :nth-child(3) { animation-delay:60ms; }
${M} .sx-mkt__quote.is-arriving > :nth-child(n+4) { animation-delay:84ms; }
html.sf-reduce-motion ${M} .sx-mkt-row,
html.sf-reduce-motion ${M} .sx-mkt__quote.is-arriving > *,
html.sf-reduce-motion ${M} .sx-mkt__decision.is-arriving > * { animation:none; }

/* ---- the demand arc rides the trace's key line (market.js syncDemandKey draws the twin) ------- */
/* The key spans set the case; the label inherits their colour, so only the composition lives here. */
${M} .orr-mkt-demand-key { display:inline-flex; align-items:center; gap:10px; margin-left:24px; }
${M} .orr-mkt-demand-key .orr-mkt-demand svg { width:56px; height:34px; }
/* Above 880 px the readouts grid stood at the scroll fold — its DEMAND label sliced by the
   analysis fade, its arc out of sight. The key now carries the reading; the grid keeps it for
   assistive technology and the checks, off the scroll flow. (Below 880 the shared sheet already
   hides it.) */
@media (min-height:881px) {
  ${M} .sx-mkt__quote > .sx-mkt-readouts { display:none !important; }
}
/* At and below 880 px the tape foots the analysis in the fade's own band: its 12px caps cut in
   half mid-glyph. The ≤1100-wide band already stands it down; the register 300px away carries
   the same prices. */
@media (max-height:880px) {
  ${M} .orr-mkt-tape { display:none !important; }
}
`;

export function injectStationMarketLayouts(doc = globalThis.document) {
  if (!doc?.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  injectOrrery(doc);
  if (typeof doc.getElementById === 'function' && doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
