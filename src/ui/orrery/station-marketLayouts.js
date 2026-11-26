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
/* ---- the selected commodity's specimen portrait sits beside its title & clears the sale line -- */
@media (min-width:901px) {
  ${M} .sx-mkt__quote:has(> .sx-mkt__specimen) {
    grid-template-columns:76px minmax(0, 1fr) auto !important;
    column-gap:18px !important;
  }
  ${M} .sx-mkt__quote:has(> .sx-mkt__specimen) > * {
    grid-column:1 / -1 !important;
  }
  ${M} .sx-mkt__quote > .sx-mkt__specimen {
    grid-column:1 !important;
    grid-row:1 / span 2 !important;
    align-self:center !important;
  }
  ${M} .sx-mkt__quote:has(> .sx-mkt__specimen) > .sx-mkt-cat-inline {
    grid-column:2 !important;
    grid-row:1 !important;
    align-self:end !important;
  }
  ${M} .sx-mkt__quote:has(> .sx-mkt__specimen) > .sx-mkt-title {
    grid-column:2 !important;
    grid-row:2 !important;
    align-self:start !important;
  }
  ${M} .sx-mkt__quote:has(> .sx-mkt__specimen) > .sx-mkt__hero {
    grid-column:3 !important;
    grid-row:1 / span 2 !important;
  }
  ${M} .sx-mkt__quote:has(> .sx-mkt__specimen) > .sx-mkt-instrument {
    grid-column:1 / -1 !important;
  }
}
${M} .sx-mkt__quote > .sx-mkt-instrument { margin-top:8px !important; }
${M} .sx-mkt-instrument__plot { height:clamp(84px, 10.5vh, 142px) !important; }
${M} .sx-mkt__analysis { padding-bottom:10px !important; }
${M} .sx-mkt__quote > .sx-mkt-sale { margin-top:6px !important; margin-bottom:2px !important; }
@media (max-width:900px) {
  ${M} .sx-mkt__quote:has(> .sx-mkt__specimen) > .sx-mkt__specimen { display:none !important; }
}

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

/* ==== RUGGEDIZED METAL-AND-GLASS MARKET EXCHANGE TELEMETRY ================================= */
/* Active commodity row in register: gold-amber command highlight */
${M} .sx-mkt-browser__rail[data-overflow="1"] {
  padding-bottom:28px !important;
}
${M} .sx-mkt-row .sx-mkt-row__thumb {
  width:24px !important;
  height:24px !important;
  --sf-thumb-size:24px;
}
${M} .sx-mkt-row:is(.is-active, .is-selected, [aria-selected="true"]) {
  background:linear-gradient(90deg, rgb(224 181 94 / .22) 0%, rgb(224 181 94 / .07) 65%, rgb(14 29 42 / .92) 100%) !important;
  box-shadow:inset 3px 0 0 #e6ca8f, inset 0 1px 0 rgb(255 241 207 / .20) !important;
}
${M} .sx-mkt-row:is(.is-active, .is-selected, [aria-selected="true"]) td.sx-mkt-row__name {
  color:#fff1cf !important;
}
${M} .sx-mkt-row:is(.is-active, .is-selected, [aria-selected="true"]) td.sx-mkt-row__price {
  color:#f3d178 !important;
}

/* Primary Buy / Sell commit key: chamfered gold-amber hardware command key (replaces solid pastel pill) */
${M} .sx-trade__go.orr-lampkey {
  position:relative !important;
  isolation:isolate;
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  min-height:38px !important;
  height:38px !important;
  padding:0 20px !important;
  clip-path:polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px)) !important;
  border:1px solid #e6ca8f !important;
  border-radius:2px !important;
  background:linear-gradient(180deg, rgb(224 181 94 / .34) 0%, rgb(224 181 94 / .16) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(255 241 207 / .28), 0 4px 12px rgb(0 0 0 / .48) !important;
  color:#fff1cf !important;
  font-weight:700 !important;
  letter-spacing:.08em !important;
  text-transform:uppercase !important;
  text-shadow:none !important;
}
${M} .sx-trade__go.orr-lampkey::before,
${M} .sx-trade__go.orr-lampkey::after {
  content:none !important;
  display:none !important;
}
${M} .sx-trade__go.orr-lampkey:not(:disabled):is(:hover, :focus-visible, :active) {
  border-color:#fff1cf !important;
  background:linear-gradient(180deg, rgb(224 181 94 / .48) 0%, rgb(224 181 94 / .24) 100%) !important;
  color:#ffffff !important;
}
${M} .sx-trade__go.orr-lampkey:disabled {
  border-color:rgb(154 198 218 / .26) !important;
  background:linear-gradient(180deg, rgb(22 35 46 / .78), rgb(12 20 29 / .86)) !important;
  color:rgb(236 230 216 / .62) !important;
}

/* Specimen housing, price trace oscilloscope bay, and route intelligence diagnostic cards */
${M} .sx-mkt__specimen {
  border:1px solid rgb(154 198 218 / .34) !important;
  border-radius:2px !important;
  background:linear-gradient(160deg, rgb(15 31 44 / .94), rgb(8 17 26 / .98)) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .16), 0 4px 12px rgb(0 0 0 / .48) !important;
}
${M} .sx-mkt-title {
  color:#f4f9fc !important;
  letter-spacing:.02em !important;
}
${M} .sx-mkt-instrument__plot {
  box-sizing:border-box !important;
  border:1px solid rgb(154 198 218 / .26) !important;
  border-radius:2px !important;
  background:
    repeating-linear-gradient(0deg, rgb(158 220 233 / .028) 0 1px, transparent 1px 18px),
    repeating-linear-gradient(90deg, rgb(158 220 233 / .028) 0 1px, transparent 1px 36px),
    linear-gradient(180deg, rgb(6 14 22 / .92), rgb(10 21 31 / .96)) !important;
  box-shadow:inset 0 1px 5px rgb(0 0 0 / .68) !important;
  padding:6px 10px !important;
}
${M} .so-route-disclosure {
  box-sizing:border-box !important;
  border:1px solid rgb(154 198 218 / .24) !important;
  border-radius:2px !important;
  background:linear-gradient(180deg, rgb(14 28 40 / .88), rgb(9 18 27 / .94)) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .08) !important;
  padding:6px 10px !important;
  margin-top:6px !important;
}
${M} .so-route-disclosure > summary {
  color:#9edce9 !important;
  font-weight:700 !important;
}
${M} .sx-mkt__console {
  border-top:1px solid rgb(158 220 233 / .26) !important;
  padding-top:10px !important;
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
