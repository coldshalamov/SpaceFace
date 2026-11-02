// Station Standard (design/frontend/STATION_STANDARD.md): the organised, dense, legible layer.
//
// Owner 2026-10-30: the ORRERY station read as sloppy -- borderless, monochrome buttons, dials for
// every quantity, tiny tracked caps, clipped names, and a credits figure that did not look like money.
// This sheet is injected AFTER the older composition sheets (stationLayouts / marketLayouts /
// stationTabsLayouts) and out-specifies them, so it can be read as one page: head, market, bar.
// It is a bridge. The right end state is deleting the superseded rules in those sheets; until then do
// NOT add new `!important` stacks for these concerns elsewhere -- change this file.
//
// Tokens only: --dp-* from deckplate/tokens.js plus --dp-face-num (declared here, on the screen root).
const STYLE_ID = 'sf-station-standard';

// Out-specifies `html:root:not([data-sf-mobile="1"]) body #screens > .sx-berth.orr-station` (4 classes).
const P = 'html:root:root:root:not([data-sf-mobile="1"]) body #screens > .sx-berth.orr-station.orr-station';

const BONE = '236 230 216';
const AMBER = '242 185 80';
const LINE = `1px solid rgb(${BONE} / .24)`;
const LINE_SOFT = `1px solid rgb(${BONE} / .12)`;
const PANEL = 'rgb(8 11 16 / .82)';
const UI = 'var(--dp-face-read, "Instrument Sans", system-ui, sans-serif)';
const NUM = 'var(--dp-face-num, "Spline Sans Mono", ui-monospace, Consolas, monospace)';
const TITLE = 'var(--dp-face-display, "Archivo", system-ui, sans-serif)';

const CSS = `
${P} { --dp-face-num: "Spline Sans Mono", ui-monospace, Consolas, monospace; }

/* ---- shared: one label voice, one button voice -------------------------------------------- */
${P} :is(.sxb-berth__ident, .sxb-vital__label, .sxb-event__badge, .sxb-event__title, .sxb-next__t, .so-command-trigger,
  .sx-mkt-browser__mode, .sx-mkt-cat-inline, .sx-mkt-drivers__k, .sx-mkt-table th, .sx-dock *, .of-facility-rail *) {
  font-family:${UI} !important; font-stretch:100% !important; font-variation-settings:normal !important;
  font-weight:600 !important; font-size:13px !important; letter-spacing:.03em !important; }

/* ---- head: ident, finder, handoff ----------------------------------------------------------- */
${P} .sxb-berth__ident { text-transform:uppercase; letter-spacing:.06em !important; color:rgb(${BONE} / .85) !important; }
${P} .sxb-berth__name { font-family:${TITLE} !important; letter-spacing:0 !important; }
${P} .so-command-trigger { display:inline-flex !important; align-items:center; gap:10px !important; height:32px !important;
  padding:0 12px !important; border:${LINE} !important; border-radius:2px !important; background:${PANEL} !important;
  box-shadow:none !important; color:rgb(${BONE} / .92) !important; text-transform:none !important; cursor:pointer; }
${P} .so-command-trigger:is(:hover, :focus-visible) { border-color:rgb(${BONE} / .7) !important; background:rgb(${BONE} / .1) !important; box-shadow:none !important; }
${P} .so-command-trigger .dp-kbd { font-family:${NUM} !important; font-size:12px !important; letter-spacing:0 !important;
  color:rgb(${BONE} / .75) !important; border:${LINE} !important; border-radius:2px !important; padding:1px 6px !important; background:rgb(0 0 0 / .35) !important; }
${P} .so-command-trigger .dp-kbd::before { content:none !important; }

/* handoff: keep sentence and Dismiss button in disjoint columns so they never collide */
${P} .sxb-berth.dp-frame__head > .sxb-handoff { display:grid !important; grid-template-columns:minmax(0, 1fr) auto !important;
  align-items:start !important; column-gap:16px !important; }
${P} .sxb-handoff > .sxb-next { grid-column:1 !important; grid-row:1 !important; padding-right:0 !important;
  display:flex !important; flex-wrap:wrap !important; align-items:baseline !important; gap:2px 8px !important; }
${P} .sxb-next__w { order:3; flex:1 0 100% !important; margin-right:0 !important; padding-left:17px !important;
  white-space:normal !important; overflow:visible !important; text-overflow:clip !important;
  font-family:${UI} !important; font-size:13px !important; letter-spacing:0 !important; color:rgb(${BONE} / .82) !important; }
${P} .sxb-handoff > .sxb-next__x { grid-column:2 !important; grid-row:1 !important; align-self:start !important;
  display:inline-flex !important; align-items:center; height:26px !important; padding:0 10px !important;
  border:${LINE} !important; border-radius:2px !important; background:transparent !important;
  font-family:${UI} !important; font-size:12px !important; font-weight:600 !important; letter-spacing:.03em !important;
  text-transform:none !important; color:rgb(${BONE} / .82) !important; cursor:pointer; }
${P} .sxb-handoff > .sxb-next__x:is(:hover, :focus-visible) { border-color:rgb(${BONE} / .75) !important; background:rgb(${BONE} / .08) !important; color:#fff !important; }

/* ---- the purse: a ledger figure, not a poster ------------------------------------------------ */
${P} .sxb-crown::before { display:none !important; }
${P} .sxb-crown { gap:12px !important; }
${P} .sxb-crown .sxb-purse { position:static !important; display:grid !important; grid-template-columns:auto auto;
  grid-template-areas:"label label" "value delta"; justify-content:end; align-items:baseline; gap:4px 14px !important;
  margin:0 0 0 auto !important; padding:8px 14px 9px !important; min-width:232px; width:max-content;
  border:${LINE} !important; border-radius:2px !important; background:${PANEL} !important; text-align:right; }
${P} .sxb-crown .sxb-purse__label { grid-area:label; justify-self:start; text-align:left !important; font-family:${UI} !important; font-stretch:100% !important;
  font-variation-settings:normal !important; font-weight:600 !important; font-size:12px !important; letter-spacing:.06em !important;
  text-transform:uppercase; color:rgb(${BONE} / .72) !important; padding-bottom:4px; width:100%; border-bottom:${LINE_SOFT}; }
${P} .sxb-crown .sxb-purse__value { grid-area:value; justify-self:end; font-family:${NUM} !important; font-stretch:100% !important;
  font-variation-settings:normal !important; font-weight:500 !important; font-size:28px !important; line-height:1.1 !important;
  letter-spacing:0 !important; color:var(--dp-phos, #dfeeff) !important; text-shadow:none !important; font-variant-numeric:tabular-nums; }
${P} .sxb-crown .sxb-purse__value::before { content:"CR"; font-family:${UI}; font-size:12px; font-weight:600; letter-spacing:.06em;
  color:rgb(${BONE} / .65); margin-right:8px; vertical-align:middle; }
${P} .sxb-crown .so-credit-delta { grid-area:delta; align-self:end; font-family:${NUM} !important; font-size:13px !important;
  letter-spacing:0 !important; }

/* ---- the vitals: a label, a figure, a bar inside a ruled vitals strip ---------------------- */
${P} .sxb-vitals { display:flex !important; flex-wrap:wrap !important; justify-content:flex-end !important; align-items:flex-start !important;
  gap:8px 18px !important; margin:0 !important; padding:7px 14px !important; border:${LINE} !important; border-radius:2px !important; background:${PANEL} !important; }
${P} .sxb-vital { display:block !important; position:relative !important; width:136px !important; min-width:0 !important;
  flex:none !important; padding:0 !important; text-align:left !important; }
${P} .sxb-vital--note { width:168px !important; }
${P} .sxb-vital .orr-vdial, ${P} .sxb-vital .orr-vdial-bare, ${P} .sxb-vital__head > .so-icon { display:none !important; }
${P} .sxb-vital__head { display:flex !important; flex-direction:row !important; flex-wrap:wrap; align-items:baseline !important; width:100% !important;
  min-height:27px !important; padding:0 !important; border:0 !important; background:none !important; text-align:left; gap:0 !important; }
${P} .sxb-vital__label { text-transform:uppercase; color:rgb(${BONE} / .75) !important; line-height:18px !important; }
${P} .sxb-vital__track { order:3 !important; flex:0 0 100% !important; display:block !important; position:relative; width:100% !important;
  height:4px !important; margin:5px 0 0 !important; background:rgb(${BONE} / .16) !important; border-radius:0 !important; overflow:hidden !important; }
${P} .sxb-vital__track > .sxb-vital__fill { display:block !important; height:100% !important; border-radius:0 !important;
  background:rgb(${BONE} / .88) !important; box-shadow:none !important; }
${P} .sxb-vital[data-tone="warn"] .sxb-vital__fill { background:rgb(${AMBER}) !important; }
${P} .sxb-vital[data-tone="bad"] .sxb-vital__fill { background:var(--dp-danger, #ff5038) !important; }
/* override stationLayouts flex-direction:column on .sxb-vital__value so numerator & denominator stay on one line */
${P} .sxb-vital__value { position:absolute !important; top:0 !important; right:0 !important; left:auto !important; margin:0 !important;
  display:inline-flex !important; flex-direction:row !important; align-items:baseline !important; gap:2px !important;
  font-family:${NUM} !important; font-size:13px !important; line-height:18px !important; letter-spacing:0 !important;
  color:var(--dp-phos, #dfeeff) !important; text-shadow:none !important; white-space:nowrap; }
${P} .sxb-vital__value .orr-vnum { display:inline !important; font:inherit !important; font-size:13px !important; letter-spacing:0 !important; margin:0 !important; }
${P} .sxb-vital__value .orr-vden { display:inline !important; font:inherit !important; font-size:12px !important; letter-spacing:0 !important; margin:0 !important; color:rgb(${BONE} / .62) !important; }
${P} .sxb-vital--note .sxb-vital__head { min-height:0 !important; }
${P} .sxb-vital--note .sxb-vital__value { position:static !important; display:block !important; margin:4px 0 0 !important; font-family:${UI} !important;
  font-size:12px !important; font-weight:600; letter-spacing:.03em !important; text-transform:uppercase; }
${P} .sxb-vital--note .sxb-vital__value .orr-vnum.is-word { font-family:${UI} !important; font-size:12px !important; letter-spacing:.03em !important; }
/* give trackless vitals (Munitions) a 4px track rule so all vitals align on the same horizontal grid */
${P} .sxb-vital--muni .sxb-vital__head::after { content:""; order:3; flex:0 0 100%; display:block; width:100%; height:4px; margin-top:5px; background:rgb(${BONE} / .16); }
${P} .sxb-vital__acts { position:static !important; display:flex !important; flex-wrap:wrap; gap:6px !important; margin:7px 0 0 !important;
  width:auto !important; justify-content:flex-start !important; }
${P} .sxb-vital__acts:empty { display:none !important; }
${P} .sxb-vital__acts > button { display:inline-flex !important; align-items:center; gap:0; min-height:26px !important; height:auto !important;
  padding:2px 9px !important; border:${LINE} !important; border-radius:2px !important; background:rgb(8 11 16 / .65) !important; clip-path:none !important;
  font-family:${UI} !important; font-size:12px !important; font-weight:600 !important; letter-spacing:.01em !important;
  text-transform:none !important; color:rgb(${BONE} / .92) !important; cursor:pointer; white-space:nowrap; }
${P} .sxb-vital__acts > button::before, ${P} .sxb-vital__acts > button::after { content:none !important; display:none !important; }
${P} .sxb-vital__acts > button:is(:hover, :focus-visible) { border-color:rgb(${BONE} / .75) !important; background:rgb(${BONE} / .12) !important; outline:none !important; }
${P} .sxb-vital__acts > button:focus-visible { outline:2px solid rgb(${AMBER}) !important; outline-offset:2px !important; }
${P} .sxb-vital__acts > button:disabled { opacity:.45; cursor:not-allowed; }
${P} .sxb-vital__acts .orr-act__sep { display:inline !important; opacity:.5; white-space:pre; }
${P} .sxb-vital__acts .orr-act__cost { font-family:${NUM} !important; font-size:12px !important; letter-spacing:0 !important; }

/* In the short desktop berth, the standard header's fourth track must not consume the station
   body as a flexible spacer. Keep the authored two-column areas and let the five bands size to
   their content; the crown remains in the head's scroll flow when its readings need more height. */
/* On a phone the station name and purse cannot share the same row: the older composition lifts
   the crown to save head height, but the Standard purse has a 232px ledger width. Let it follow the
   title as a compact two-column reading instead of painting across the name. Narrow portrait windows
   (481–650 wide) hit the same collision, so they take the same stacked reading. */
@media (max-width:650px) and (min-height:601px) {
  ${P} .sxb-berth.dp-frame__head > .sxb-crown { margin-top:0 !important; }
  ${P} .so-station-title > .sxb-berth__name { padding-right:0 !important; }
  ${P} .sxb-crown .sxb-purse { min-width:0 !important; width:max-content !important; max-width:100% !important;
    grid-template-columns:auto auto !important; grid-template-areas:"label value" "delta delta" !important;
    justify-content:start !important; align-items:center !important; gap:0 10px !important;
    margin:0 !important; padding:5px 9px !important; text-align:left !important; }
  ${P} .sxb-crown .sxb-purse__label { width:auto !important; border:0 !important; padding:0 !important; }
  ${P} .sxb-crown .sxb-purse__value { font-size:20px !important; line-height:1.1 !important; }
}
/* At phone and narrow-tablet widths, the authored 136px cards otherwise spill into a third row
   and leave too little room for station work. Two compact rows keep readings above the body. */
@media (max-width:650px) and (min-height:601px) {
  /* Two rows keep every reading in the head: the hull and ledger get wide cells; fuel and hold
     have room for their figures, and MUNITIONS keeps its label clear of its value. */
  ${P} .sxb-crown { gap:0 !important; }
  ${P} .sxb-crown .sxb-vitals { margin-top:-8px !important; }
  ${P} .sxb-crown .sxb-vital__head { min-height:22px !important; }
  ${P} .sxb-berth.dp-frame__head { grid-template-rows:max-content max-content max-content max-content max-content !important;
    align-content:start !important; row-gap:2px !important; }
  ${P} .sxb-crown .sxb-vitals { padding-top:0 !important; padding-bottom:0 !important; }
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--fuel, .sxb-vital--hold) .sxb-vital__head {
    min-height:0 !important; }
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--fuel, .sxb-vital--hold) .sxb-vital__value {
    position:static !important; display:inline-flex !important; }
  ${P} .sxb-crown .sxb-vital--muni .sxb-vital__head::after { height:2px !important; margin-top:2px !important; }
  ${P} .sxb-crown .sxb-vital__acts { margin:2px 0 0 !important; gap:2px !important; }
  ${P} .sxb-crown .sxb-vital--hull .sxb-vital__acts { flex-wrap:nowrap !important; }
  ${P} .sxb-crown .sxb-vital__acts > button { min-height:24px !important; padding:1px 2px !important; }
  ${P} .sxb-crown .sxb-vitals { display:grid !important; grid-template-columns:repeat(10, minmax(0, 1fr)) !important;
    grid-template-areas:"hull hull hull hull hull note note note note note" "fuel fuel fuel hold hold hold muni muni muni muni" !important; gap:0 !important; align-items:start !important;
    padding-block:2px 3px !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital { width:auto !important; min-width:0 !important; grid-column:auto !important; grid-row:auto !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--hull { grid-area:hull !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--fuel { grid-area:fuel !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--hold { grid-area:hold !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--note { grid-area:note !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--muni { grid-area:muni !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--note { padding-left:8px !important; box-sizing:border-box !important; }
  ${P} .sxb-crown .sxb-vital--note .sxb-vital__value { white-space:nowrap !important; }
  ${P} .sxb-crown .sxb-vital--note .sxb-vital__acts { flex-wrap:nowrap !important; }
  ${P} .sxb-berth.dp-frame__head { -webkit-mask-image:linear-gradient(to bottom, #000 calc(100% - 2px), transparent) !important;
    mask-image:linear-gradient(to bottom, #000 calc(100% - 2px), transparent) !important; padding-bottom:2px !important; }
}
@media (min-width:901px) and (max-width:1100px) and (min-height:461px) and (max-height:640px) {
  ${P}:has(#sx-panel > .sx-sw:not([hidden])) { grid-template-rows:max-content minmax(0,1fr) max-content !important; }
  ${P}:has(#sx-panel > .sx-sw:not([hidden])) .sxb-berth.dp-frame__head {
    min-height:0 !important; max-height:145px !important; overflow-y:auto !important; overflow-x:hidden !important;
  }
  ${P} .sxb-berth.dp-frame__head { grid-template-rows:auto auto auto auto auto !important; align-content:start !important; row-gap:4px !important; }
  /* Market at 960x540: the exchange needs the body. Let it take the flexible row, and fold the
     ambient bay/wire boards away here so the table and the Buy/Sell stage are not cut to a sliver. */
  ${P}:has(#sx-panel > .sx-mkt) { grid-template-rows:max-content minmax(0,1fr) max-content !important; }
  ${P}:has(#sx-panel > .sx-mkt) .sxb-berth > .sxb-signs { display:none !important; }
  /* The compact head itself is the scrollport. Keep the credit figure inside the crown's flow;
     lifting it above the crown put its label outside the head's top edge at 960x540. */
  ${P} .sxb-berth .sxb-crown { display:flex !important; flex-direction:column !important; align-items:stretch !important; min-width:0 !important; }
  ${P} .sxb-crown .sxb-purse { position:static !important; align-self:flex-end !important; min-width:0 !important; width:max-content !important;
    max-width:100% !important; grid-template-columns:auto auto !important; grid-template-areas:"label value" "delta delta" !important;
    justify-content:start !important; align-items:center !important; gap:0 10px !important; margin:0 !important; padding:3px 8px !important; }
  ${P} .sxb-crown .sxb-purse__label { width:auto !important; border:0 !important; padding:0 !important; }
  ${P} .sxb-crown .sxb-purse__value { font-size:22px !important; line-height:1.1 !important; }
  ${P} .sxb-crown .sxb-vitals { min-width:0 !important; max-width:none !important; width:100% !important;
    display:grid !important; grid-template-columns:repeat(10,minmax(0,1fr)) !important;
    grid-template-areas:"hull hull hull hull hull note note note note note" "fuel fuel fuel hold hold hold muni muni muni muni" !important;
    gap:4px 6px !important; margin:0 !important; padding:0 !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital { display:block !important; min-width:0 !important; width:auto !important;
    max-width:100% !important; flex:none !important; box-sizing:border-box !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--hull { grid-area:hull !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--fuel { grid-area:fuel !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--hold { grid-area:hold !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--note { grid-area:note !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--muni { grid-area:muni !important; }
  ${P} .sxb-crown .sxb-vital__head { min-width:0 !important; max-width:100% !important; }
  ${P} .sxb-crown .sxb-vital__label { font-size:12px !important; letter-spacing:.02em !important; line-height:1.15 !important;
    white-space:normal !important; overflow-wrap:anywhere; }
  ${P} .sxb-crown .sxb-vital--note .sxb-vital__value { position:static !important; display:block !important; width:100% !important;
    max-width:100% !important; margin:2px 0 0 !important; white-space:normal !important; }
  ${P} .sxb-crown .sxb-vital--muni .sxb-vital__value { position:absolute !important; top:0 !important; right:0 !important; left:auto !important; width:auto !important; margin:0 !important; }
  ${P} .sxb-crown .sxb-vital__acts { min-width:0 !important; max-width:100% !important; margin:4px 0 0 !important; gap:3px !important; }
  ${P} .sxb-crown .sxb-vital__acts > button { max-width:100% !important; padding-left:6px !important; padding-right:6px !important; }
  ${P} .sxb-vital__head, ${P} .sxb-vital__value, ${P} .sxb-vital__acts { min-width:0 !important; max-width:100% !important; }
  ${P} .sxb-vital__label { min-width:0 !important; max-width:100% !important; text-align:left !important; }
  ${P} .sxb-ops { flex-wrap:wrap !important; column-gap:10px !important; row-gap:4px !important; }
  ${P} .sxb-ops > .of-facility-rail { flex:0 0 100% !important; max-width:none !important; width:100% !important; }
  ${P} .sxb-ops > .sx-comms { order:2 !important; margin:0 !important; }
  ${P} .sxb-ops > .sxb-launch-seat { order:3 !important; margin:0 0 0 auto !important; }
}
/* Keep the short desktop's two-row crown grid at the same column spacing after its responsive
   overrides; the wider LEDGER/MUNITIONS cells carry their own actions without crowding the other readings. */
@media (min-width:901px) and (max-width:1100px) and (min-height:461px) and (max-height:640px) {
  ${P} .sxb-crown .sxb-vitals { gap:4px 6px !important; }
}

/* ---- the ad-boards: legible, never faint ----------------------------------------------------- */
${P} .sx-adboard, ${P} .sx-adboard * { font-family:${UI} !important; font-size:13px !important; letter-spacing:0 !important;
  text-transform:none !important; color:rgb(${BONE} / .82) !important; }
${P} .sx-adboard .sx-adboard__k { font-weight:600 !important; color:rgb(${BONE} / .6) !important; text-transform:uppercase; letter-spacing:.06em !important; }
${P} .sxb-berth > .sxb-signs { border-top:${LINE_SOFT}; padding-top:6px; }

/* ---- the tab rail and foot ------------------------------------------------------------------- */
${P} .sxb-ops { border-top:${LINE_SOFT} !important; padding-top:6px !important; align-items:center !important; }
${P} .sxb-ops .orr-stationrow__rule { display:none !important; }
${P} .sx-dock { gap:0 !important; }
${P} .sx-dock :is(button, a) { text-transform:none !important; letter-spacing:.02em !important; padding:8px 14px !important; min-height:34px !important;
  height:auto !important; border:0 !important; border-bottom:2px solid transparent !important; border-radius:0 !important; background:none !important; clip-path:none !important;
  color:rgb(${BONE} / .78) !important; }
${P} .sx-dock :is(button, a):is(:hover, :focus-visible) { color:rgb(${BONE}) !important; background:rgb(${BONE} / .07) !important; outline:none !important; }
${P} .sx-dock :is(button, a)[aria-selected="true"], ${P} .sx-dock :is(button, a)[aria-current], ${P} .sx-dock :is(button, a).is-active {
  color:#fff !important; border-bottom-color:rgb(${AMBER}) !important; }
${P} .sxb-help, ${P} .sx-comms__toggle { text-transform:none !important; letter-spacing:.02em !important; font-size:13px !important; font-family:${UI} !important;
  min-height:32px !important; padding:0 12px !important; border:${LINE} !important; border-radius:2px !important; background:${PANEL} !important; clip-path:none !important; }
${P} .sxb-launch__label { font-family:${TITLE} !important; letter-spacing:.04em !important; }
/* Under 581 wide the orbital sheet hides Help's word and the Standard sheet hides its icon, so the ruled key beside
   Comms painted as an empty box: put the word back so both foot keys read as labelled controls. */
@media (max-width:580px) {
  ${P} .sxb-ops .sxb-help > span { display:inline !important; }
}
${P} .sxb-launch__state { font-family:${UI} !important; font-size:13px !important; letter-spacing:.02em !important; }

/* ==== MARKET ================================================================================ */
/* the two columns are ruled panels over a scrim, so no figure sits on the busy world plate */
${P} .sx-mkt__list { box-sizing:border-box; border:${LINE} !important; border-radius:2px; background:${PANEL} !important;
  padding:12px 14px 6px !important; }
${P} .sx-mkt__stage { box-sizing:border-box; border:${LINE} !important; border-radius:2px; background:${PANEL} !important; padding:16px 20px !important; }
${P} .sx-mkt .orr-extent { display:none !important; }
${P} .sx-mkt :is(.k-caps, .fh-legend, .sx-mkt-drivers__k) { font-family:${UI} !important; font-stretch:100% !important;
  font-variation-settings:normal !important; font-weight:600 !important; font-size:13px !important; letter-spacing:.03em !important;
  text-transform:none !important; color:rgb(${BONE} / .78) !important; }
${P} .sx-mkt .sx-mkt-browser { position:relative; }
${P} .sx-mkt .sx-mkt-browser__mode { display:flex; align-items:baseline; gap:8px; margin:0 0 10px !important; padding:4px 0 8px !important;
  border-bottom:${LINE_SOFT}; }

/* filters: a segmented control with a hairline on each segment, amber when active; no striated ruler bars */
${P} .sx-mkt .sx-mkt-browser__filters { display:flex !important; flex-wrap:wrap !important; gap:6px !important; margin:0 0 10px !important; padding:0 !important; background:none !important; }
${P} .sx-mkt .sx-mkt-browser__filters > li { padding:0 !important; margin:0 !important; background:none !important; background-image:none !important; }
${P} .sx-mkt .sx-mkt-browser__filters > li::before, ${P} .sx-mkt .sx-mkt-browser__filters > li::after { content:none !important; display:none !important; }
${P} .sx-mkt .sx-mkt-filter { display:inline-flex !important; align-items:center; justify-content:center; min-height:28px !important; height:auto !important;
  width:auto !important; padding:0 10px !important; border:${LINE} !important; border-radius:2px !important; background:transparent !important;
  clip-path:none !important; font-family:${UI} !important; font-size:13px !important; font-weight:600 !important; letter-spacing:.01em !important;
  text-transform:none !important; color:rgb(${BONE} / .85) !important; cursor:pointer; }
${P} .sx-mkt .sx-mkt-filter::before, ${P} .sx-mkt .sx-mkt-filter::after { content:none !important; display:none !important; }
${P} .sx-mkt .sx-mkt-filter:is(:hover, :focus-visible) { border-color:rgb(${BONE} / .7) !important; background:rgb(${BONE} / .08) !important; outline:none !important; }
${P} .sx-mkt .sx-mkt-filter:focus-visible { outline:2px solid rgb(${AMBER}) !important; outline-offset:2px !important; }
${P} .sx-mkt .sx-mkt-filter:is([aria-pressed="true"], [aria-selected="true"], [aria-current], .is-active, .is-on, .is-selected, .on) {
  border-color:rgb(${AMBER}) !important; background:rgb(${AMBER} / .14) !important; color:#ffd98c !important; }
${P} .sx-mkt .orr-mkt-find { position:static !important; display:block !important; width:100% !important; margin:0 0 10px !important; padding:0 !important;
  background:none !important; background-image:none !important; }
${P} .sx-mkt .sx-mkt-search { box-sizing:border-box !important; width:100% !important; height:32px !important; padding:0 10px !important;
  border:${LINE} !important; border-radius:2px !important; background:rgb(0 0 0 / .35) !important; box-shadow:none !important;
  font-family:${UI} !important; font-size:13px !important; letter-spacing:0 !important; color:rgb(${BONE}) !important; }
${P} .sx-mkt .sx-mkt-search:focus { border-color:rgb(${AMBER}) !important; box-shadow:none !important; outline:none !important; }
${P} .sx-mkt .orr-mkt-find__cursor { display:none !important; }

/* the commodity table: one grid, a header rule, right-aligned mono figures, no ladder spine */
${P} .sx-mkt .k-table-wrap, ${P} .sx-mkt .sx-mkt-browser__rail { margin:0 !important; padding:0 !important; max-width:100% !important;
  box-sizing:border-box !important; border:0 !important; background:none !important; background-image:none !important; overflow-x:hidden !important; }
${P} .sx-mkt .sx-mkt-table { display:table !important; width:100% !important; table-layout:fixed; border-collapse:collapse !important; border-spacing:0 !important;
  background:none !important; background-image:none !important; }
${P} .sx-mkt .sx-mkt-table thead { display:table-header-group !important; background:none !important; }
${P} .sx-mkt .sx-mkt-table tbody { display:table-row-group !important; background:none !important; background-image:none !important; }
${P} .sx-mkt .sx-mkt-table tr { display:table-row !important; background:none !important; }
${P} .sx-mkt .sx-mkt-table :is(th, td) { display:table-cell !important; vertical-align:middle; box-sizing:border-box; }
${P} .sx-mkt .sx-mkt-table :is(th, td):nth-child(5) { display:none !important; }
${P} .sx-mkt .sx-mkt-table th { padding:6px 8px !important; border:0 !important; border-bottom:1px solid rgb(${BONE} / .34) !important; background:none !important;
  text-align:left; text-transform:uppercase !important; letter-spacing:.05em !important; color:rgb(${BONE} / .72) !important; white-space:nowrap; }
${P} .sx-mkt .sx-mkt-table th:first-child { padding-left:10px !important; width:auto; }
${P} .sx-mkt .sx-mkt-table th:nth-child(2) { width:90px; }
${P} .sx-mkt .sx-mkt-table th:nth-child(3) { width:54px; }
${P} .sx-mkt .sx-mkt-table th:nth-child(4) { width:64px; }
${P} .sx-mkt .sx-mkt-table :is(th, td).k-num { text-align:right !important; }
${P} .sx-mkt .sx-mkt-row td { height:32px !important; padding:0 8px !important; border:0 !important; border-bottom:${LINE_SOFT} !important; background:none !important;
  font-family:${NUM} !important; font-size:13px !important; letter-spacing:0 !important; font-variant-numeric:tabular-nums; color:rgb(${BONE} / .92) !important;
  box-shadow:none !important; white-space:nowrap; }
${P} .sx-mkt .sx-mkt-row td.sx-mkt-row__name { padding-left:10px !important; font-family:${UI} !important; font-size:14px !important; font-weight:600; text-align:left;
  white-space:normal !important; overflow:visible !important; text-overflow:clip !important; color:rgb(${BONE}) !important; }
${P} .sx-mkt .sx-mkt-row td.sx-mkt-row__price { color:var(--dp-phos, #dfeeff) !important; font-weight:500; }
${P} .sx-mkt .sx-mkt-row__tr { display:inline-block; margin-left:6px; font-family:${NUM} !important; font-size:12px !important; letter-spacing:0 !important; }
${P} .sx-mkt .sx-mkt-row td.sx-mkt-row__stock, ${P} .sx-mkt .sx-mkt-row td.sx-mkt-row__sell { color:rgb(${BONE} / .8) !important; }
${P} .sx-mkt .sx-mkt-row:hover td { background:rgb(${BONE} / .06) !important; }
${P} .sx-mkt .sx-mkt-row:is(.is-selected, .is-active) td { background:rgb(${AMBER} / .12) !important; }
${P} .sx-mkt .sx-mkt-row:is(.is-selected, .is-active) td:first-child { box-shadow:inset 3px 0 0 rgb(${AMBER}) !important; }
${P} .sx-mkt .sx-mkt-row::before, ${P} .sx-mkt .sx-mkt-row::after, ${P} .sx-mkt .sx-mkt-row td::before, ${P} .sx-mkt .sx-mkt-row td::after { content:none !important; display:none !important; }

/* the stage: no tracked caps anywhere; every legend is a plain 13px word in the UI face */
${P} .sx-mkt__stage :is(span, label, p, summary, small, li, button, div, strong, b) { text-transform:none !important; letter-spacing:.01em !important; }
${P} .sx-mkt__stage :is(span, label, summary, small, button) { font-family:${UI} !important; font-stretch:100% !important; font-variation-settings:normal !important; }
${P} .sx-mkt__stage :is(.k-hero__n, .orr-counter, .orr-counter *, .orr-mkt-totalsuf, .sx-qty__in, .orr-mkt-holdarc__t b, .sx-mkt-instrument__y, .sx-mkt-instrument__avg, .k-row__num) {
  font-family:${NUM} !important; font-variation-settings:normal !important; letter-spacing:0 !important; }
${P} .sx-mkt .sx-mkt-cat-inline { text-transform:capitalize !important; }
${P} .sx-mkt .sx-mkt__hero .k-hero__n { font-family:${NUM} !important; font-variation-settings:normal !important; font-weight:500 !important;
  font-size:48px !important; letter-spacing:0 !important; line-height:1 !important; }
${P} .sx-mkt .sx-mkt__hero .k-hero__w { font-family:${UI} !important; font-size:13px !important; letter-spacing:.02em !important; text-transform:none !important; }
${P} .sx-mkt .sx-mkt-drivers__v { font-family:${UI} !important; font-size:14px !important; font-weight:600 !important; }
${P} .sx-mkt .sx-mkt-instrument :is(.sx-mkt-instrument__y, .sx-mkt-instrument__avg) { font-family:${NUM} !important; font-size:12px !important; letter-spacing:0 !important; }
${P} .sx-mkt .orr-mkt-demand svg { display:none !important; }
${P} .sx-mkt__stage :is(.so-trade-total > span:first-child, .sx-qty__k, .sx-mkt-readouts__item > span:first-child) { color:rgb(${BONE} / .72) !important; font-size:13px !important; font-weight:600 !important; }

/* trade console & quantity stepper: one clean horizontal row for Fewer / input / More / Max */
${P} .sx-mkt .sx-trade { grid-template-columns:max-content minmax(0, 1fr) !important; align-items:start !important; column-gap:28px !important; }
${P} .sx-mkt .sx-qty { display:flex !important; flex-wrap:wrap !important; align-items:center !important; gap:6px !important; width:276px !important; height:auto !important;
  min-height:0 !important; padding:0 !important; position:relative !important; }
${P} .sx-mkt .sx-qty .orr-qdial { display:none !important; }
${P} .sx-mkt .sx-qty__k { flex:0 0 100% !important; position:static !important; transform:none !important; margin:0 0 4px !important; text-align:left !important; width:auto !important; }
${P} .sx-mkt .sx-qty__in { order:2; position:static !important; transform:none !important; width:68px !important; height:36px !important; box-sizing:border-box !important;
  text-align:center !important; font-size:20px !important; font-weight:500 !important; line-height:36px !important; padding:0 !important; border:${LINE} !important; border-radius:2px !important;
  background:rgb(0 0 0 / .35) !important; color:var(--dp-phos, #dfeeff) !important; }
${P} .sx-mkt .sx-qty__in:focus { border-color:rgb(${AMBER}) !important; outline:none !important; }
${P} .sx-mkt .sx-qty__words { display:contents !important; }
${P} .sx-mkt .sx-qty__words > li { display:contents !important; }
${P} .sx-mkt .sx-qty__words > li:nth-child(1) > button { order:1; }
${P} .sx-mkt .sx-qty__words > li:nth-child(2) > button { order:3; }
${P} .sx-mkt .sx-qty__words > li:nth-child(3) > button { order:4; }
${P} .sx-mkt :is(.sx-qty__b, .sx-qty__max, .sx-trade__words > li:not(:first-child) > .sx-trade__go) { display:inline-flex !important; align-items:center; justify-content:center;
  min-height:36px !important; height:36px !important; padding:0 11px !important; border:${LINE} !important; border-radius:2px !important; background:transparent !important;
  clip-path:none !important; font-family:${UI} !important; font-size:13px !important; font-weight:600 !important; letter-spacing:.01em !important; text-transform:none !important;
  color:rgb(${BONE} / .95) !important; cursor:pointer; width:auto !important; }
${P} .sx-mkt :is(.sx-qty__b, .sx-qty__max, .sx-trade__words > li:not(:first-child) > .sx-trade__go):is(:hover, :focus-visible) { border-color:rgb(${BONE} / .8) !important; background:rgb(${BONE} / .1) !important; outline:none !important; }
${P} .sx-mkt :is(.sx-qty__b, .sx-qty__max, .sx-trade__go):focus-visible { outline:2px solid rgb(${AMBER}) !important; outline-offset:2px !important; }
${P} .sx-mkt :is(.sx-qty__b, .sx-qty__max, .sx-trade__go):disabled { opacity:.45; cursor:not-allowed; }
${P} .sx-mkt .so-trade-breakdown > summary { border:0 !important; background:none !important; min-height:24px !important; padding:2px 0 !important; font-size:13px !important;
  font-weight:600 !important; text-decoration:underline; text-underline-offset:3px; color:rgb(${BONE} / .8) !important; cursor:pointer; }
${P} .sx-mkt .orr-mkt-holdarc svg { display:none !important; }
${P} .sx-mkt .sx-trade__words { display:flex !important; align-items:center !important; gap:10px !important; list-style:none; margin:8px 0 0 !important; padding:0 !important; }
${P} .sx-mkt .sx-trade__words > li { display:block !important; }

/* the decision options (repair / fly damaged): real buttons with the consequence underneath */
${P} .sx-mkt .sx-decision__opt { display:block !important; width:100%; box-sizing:border-box; text-align:left !important; margin:0 0 8px !important; padding:9px 12px !important;
  border:${LINE} !important; border-radius:2px !important; background:rgb(${BONE} / .04) !important; clip-path:none !important; height:auto !important; min-height:0 !important; cursor:pointer; }
${P} .sx-mkt .sx-decision__opt::before, ${P} .sx-mkt .sx-decision__opt::after { content:none !important; display:none !important; }
${P} .sx-mkt .sx-decision__opt:is(:hover, :focus-visible) { border-color:rgb(${AMBER}) !important; background:rgb(${AMBER} / .1) !important; outline:none !important; }
${P} .sx-mkt .sx-decision__opt .k-row__name { display:block !important; font-family:${UI} !important; font-size:14px !important; font-weight:600 !important; letter-spacing:.01em !important;
  text-transform:none !important; white-space:normal !important; overflow:visible !important; text-overflow:clip !important; color:rgb(${BONE}) !important; }
${P} .sx-mkt .sx-decision__opt .k-row__sub { display:block !important; margin:2px 0 0 !important; font-family:${UI} !important; font-size:13px !important; line-height:1.35 !important;
  white-space:normal !important; overflow:visible !important; text-overflow:clip !important; color:rgb(${BONE} / .78) !important; }

/* Narrow portrait berths keep the register and selected trade side-by-side. Keep the stage as its
   single scroll surface, and size the dial/action strip to the shallow body above the fixed tabs. */
@media (max-width:650px) and (min-height:601px) {
  ${P} .sx-mkt .sx-mkt-browser { grid-template-columns:minmax(0, 1fr) !important;
    grid-template-rows:auto auto auto minmax(0, 1fr) !important; row-gap:2px !important; }
  ${P} .sx-mkt .sx-mkt-browser__mode { grid-column:1 !important; grid-row:1 !important; min-height:16px !important;
    margin:0 !important; padding:0 !important; line-height:16px !important; }
  ${P} .sx-mkt .orr-mkt-find { grid-column:1 !important; grid-row:2 !important; width:100% !important; margin:0 !important; }
  ${P} .sx-mkt .sx-mkt-browser__filters { grid-column:1 !important; grid-row:3 !important;
    flex-direction:row !important; flex-wrap:nowrap !important; align-items:center !important;
    width:100% !important; min-width:0 !important; max-width:100% !important; overflow-x:auto !important; overflow-y:hidden !important;
    gap:0 10px !important; padding:0 0 2px !important; margin:0 !important; background:none !important; scrollbar-width:thin; }
  ${P} .sx-mkt .sx-mkt-browser__filters > li { flex:none !important; max-width:100% !important; }
  ${P} .sx-mkt .sx-mkt-filter { min-width:max-content !important; max-width:none !important; white-space:nowrap !important; }
  ${P} .sx-mkt .sx-mkt-browser__rail, ${P} .sx-mkt .sx-mkt-browser__empty { grid-column:1 !important; grid-row:4 !important;
    min-height:0 !important; overflow-x:hidden !important; overflow-y:auto !important; }
  ${P} .sx-mkt__stage.dp-work__stage { grid-template-columns:minmax(0, 1fr) !important;
    grid-template-rows:max-content max-content max-content !important; align-content:start !important;
    row-gap:8px !important; padding:4px !important; overflow-x:hidden !important; overflow-y:auto !important; }
  ${P} .sx-mkt__stage.dp-work__stage > .sx-mkt__console { grid-column:1 !important; grid-row:1 !important;
    width:100% !important; min-width:0 !important; max-width:100% !important; max-height:none !important;
    overflow:visible !important; }
  ${P} .sx-mkt__stage.dp-work__stage > .sx-mkt__decision:not(:empty) { grid-column:1 !important; grid-row:2 !important;
    min-width:0 !important; max-height:none !important; }
  ${P} .sx-mkt__stage.dp-work__stage > .sx-mkt__analysis { grid-column:1 !important; grid-row:3 !important;
    min-width:0 !important; overflow:visible !important; }
  ${P} .sx-mkt .sx-trade { grid-template-columns:minmax(0, 1fr) !important;
    grid-template-rows:100px auto auto auto auto !important;
    grid-template-areas:"dial" "total" "verb" "note" "breakdown" !important;
    justify-items:center !important; align-items:start !important; column-gap:0 !important; row-gap:0 !important; }
  ${P} .sx-mkt .sx-trade > .sx-qty { width:108px !important; height:96px !important; max-width:100% !important; box-sizing:border-box !important; }
  ${P} .sx-mkt .sx-qty .orr-qdial { left:12px !important; top:0 !important; width:84px !important; height:84px !important; }
  ${P} .sx-mkt .sx-qty .sx-qty__in { left:33px !important; top:16px !important; width:42px !important; height:26px !important;
    line-height:26px !important; font-size:20px !important; }
  ${P} .sx-mkt .sx-qty { display:block !important; position:relative !important; height:96px !important; }
  ${P} .sx-mkt .sx-qty .sx-qty__k { left:12px !important; top:0 !important; width:84px !important; line-height:13px !important;
    position:absolute !important; text-align:center !important; }
  ${P} .sx-mkt .sx-qty .sx-qty__in { position:absolute !important; left:33px !important; top:18px !important; z-index:2 !important; }
  ${P} .sx-mkt .sx-qty .sx-qty__words { left:0 !important; right:0 !important; top:48px !important; height:30px !important; display:flex !important;
    flex-wrap:nowrap !important; justify-content:space-between !important; gap:0 2px !important; }
  ${P} .sx-mkt :is(.sx-qty__b, .sx-qty__max) { min-width:0 !important; min-height:30px !important; height:30px !important;
    padding:0 1px !important; font-size:12px !important; letter-spacing:0 !important; white-space:nowrap !important; }
  ${P} .sx-mkt .sx-qty :is(.sx-qty__b, .sx-qty__max)::before,
  ${P} .sx-mkt .sx-qty :is(.sx-qty__b, .sx-qty__max)::after { content:none !important; display:none !important; }
  ${P} .sx-mkt .so-trade-total { height:17px !important; min-height:17px !important; line-height:16px !important; }
  ${P} .sx-mkt .sx-trade__words { width:100% !important; flex-wrap:nowrap !important; justify-content:space-between !important;
    gap:0 6px !important; margin:0 !important; }
}

/* At phone widths, use two readable lines per commodity: full name first, then buy / sell / stock. */
@media (max-width:480px) and (min-height:601px) {
  ${P} .sx-mkt .sx-mkt-table, ${P} .sx-mkt .sx-mkt-table > :is(thead, tbody) {
    display:block !important; width:100% !important; table-layout:auto !important; }
  ${P} .sx-mkt .sx-mkt-table tr { display:grid !important; width:100% !important;
    grid-template-columns:minmax(62px, 1fr) 44px 49px !important; column-gap:0 !important; row-gap:1px !important;
    align-items:baseline !important; padding:0 !important; }
  ${P} .sx-mkt .sx-mkt-table :is(th, td) { display:block !important; width:auto !important; min-width:0 !important;
    height:auto !important; block-size:auto !important; box-sizing:border-box !important; padding:0 2px !important; }
  ${P} .sx-mkt .sx-mkt-table thead th:first-child { display:none !important; }
  ${P} .sx-mkt .sx-mkt-table :is(th, td):nth-child(2) { grid-column:1 !important; text-align:left !important; }
  ${P} .sx-mkt .sx-mkt-table :is(th, td):nth-child(3) { grid-column:2 !important; text-align:right !important; }
  ${P} .sx-mkt .sx-mkt-table :is(th, td):nth-child(4) { grid-column:3 !important; text-align:right !important; }
  ${P} .sx-mkt .sx-mkt-table :is(th, td):nth-child(5) { display:none !important; }
  ${P} .sx-mkt .sx-mkt-table thead th { font-size:12px !important; line-height:14px !important; letter-spacing:0 !important;
    white-space:nowrap !important; }
  ${P} .sx-mkt .sx-mkt-table .sx-mkt-row > .sx-mkt-row__name:first-child { grid-column:1 / -1 !important;
    padding-left:4px !important; padding-right:4px !important; font-size:13px !important; line-height:15px !important;
    white-space:normal !important; overflow:visible !important; text-overflow:clip !important; }
  ${P} .sx-mkt .sx-mkt-table .sx-mkt-row { row-gap:1px !important; padding:0 !important; align-content:center !important; }
  ${P} .sx-mkt .sx-mkt-table .sx-mkt-row td { line-height:15px !important; white-space:nowrap !important; }
  ${P} .sx-mkt .sx-mkt-table .sx-mkt-row td:is(.sx-mkt-row__price, .sx-mkt-row__sell, .sx-mkt-row__stock) {
    overflow:visible !important; text-overflow:clip !important; font-variant-numeric:tabular-nums !important; }
  ${P} .sx-mkt .sx-mkt-table .sx-mkt-row__tr { margin-left:2px !important; }
  ${P} .sx-mkt .sx-mkt-table .sx-mkt-row td.sx-mkt-row__name { white-space:normal !important; overflow:visible !important;
    text-overflow:clip !important; }
}

/* Market in the short desktop berth (901–1100 x 461–640): after the rules above so it wins at equal weight. */
@media (min-width:901px) and (max-width:1100px) and (min-height:461px) and (max-height:640px) {
  /* the exchange reads as one column: title and finder on one line, the filters one scrolling row,
     the table under them (the old side column of chips cannot hold the ruled chips); the price,
     sell and stock columns size to their figures so the trend and STOCK read whole */
  ${P} .sx-mkt .sx-mkt-browser { display:grid !important; grid-template-columns:minmax(0, 1fr) minmax(0, 200px) !important;
    grid-template-rows:auto auto minmax(0, 1fr) !important; column-gap:12px !important; row-gap:6px !important; height:100%; }
  ${P} .sx-mkt .sx-mkt-browser__mode { grid-column:1 !important; grid-row:1 !important; margin:0 !important; padding:6px 0 !important; align-self:center; }
  ${P} .sx-mkt .orr-mkt-find { grid-column:2 !important; grid-row:1 !important; margin:0 !important; align-self:center; }
  ${P} .sx-mkt .sx-mkt-browser__filters { grid-column:1 / -1 !important; grid-row:2 !important; flex-direction:row !important; flex-wrap:nowrap !important;
    width:auto !important; min-width:0 !important; height:auto !important; margin:0 !important; overflow-x:auto !important; overflow-y:hidden !important; }
  ${P} .sx-mkt .sx-mkt-browser__filters > li { flex:none !important; }
  ${P} .sx-mkt .sx-mkt-browser__rail { grid-column:1 / -1 !important; grid-row:3 !important; min-height:0 !important; overflow-y:auto !important; }
  ${P} .sx-mkt .sx-mkt-table { table-layout:auto !important; }
  ${P} .sx-mkt .sx-mkt-table :is(th, td) { padding-left:6px !important; padding-right:6px !important; }
  ${P} .sx-mkt .sx-mkt-table :is(th, td):is(:nth-child(2), :nth-child(3), :nth-child(4)) { width:1% !important; }
  /* The short berth gives the trade console a 244px column. Keep its quantity controls within
     that column and flow the quote/actions vertically instead of letting the fixed desktop dial
     track push BUY/SELL past the stage edge. The console remains the stage's own scroll surface. */
  ${P} .sx-mkt__console { min-width:0 !important; max-width:100% !important; overflow-x:hidden !important; overflow-y:auto !important; }
  ${P} .sx-mkt .sx-trade { grid-template-columns:minmax(0,1fr) !important; grid-template-rows:auto auto auto auto auto !important;
    grid-template-areas:"dial" "total" "note" "verb" "breakdown" !important; column-gap:0 !important; row-gap:4px !important; }
  ${P} .sx-mkt .sx-qty { width:100% !important; max-width:100% !important; box-sizing:border-box !important; }
  ${P} .sx-mkt .sx-qty__words, ${P} .sx-mkt .sx-trade__words { flex-wrap:wrap !important; justify-content:flex-start !important; gap:6px !important; }
}

/* ==== BAR =================================================================================== */
${P} .sx-bar__hang { box-sizing:border-box; border:${LINE} !important; border-radius:2px; background:${PANEL} !important; background-image:none !important; padding:9px 12px !important; }
${P} .sx-bar__hang::before, ${P} .sx-bar__hang::after, ${P} .sx-bar__rows::before, ${P} .sx-bar__rows::after,
${P} .sx-bar .sx-lead__rows::before, ${P} .sx-bar .sx-lead__rows::after, ${P} .sx-bar .sx-talk__choices::before, ${P} .sx-bar .sx-talk__choices::after { display:none !important; content:none !important; }
${P} .sx-bar :is(.sx-bar__rows, .sx-lead__rows, .sx-intel__rows, .sx-bar__foot, .sx-talk__choices) { background:none !important; background-image:none !important; }
${P} .sx-bar :is(.k-caps, .fh-legend, .sx-intel__head) { font-family:${UI} !important; font-stretch:100% !important; font-variation-settings:normal !important; font-weight:600 !important;
  font-size:12px !important; letter-spacing:.06em !important; text-transform:uppercase !important; color:rgb(${BONE} / .72) !important;
  margin:0 0 4px !important; padding:0 0 3px 0 !important; border-bottom:${LINE_SOFT}; }
${P} .sx-bar .sx-bar__leads > .k-caps { margin-top:8px !important; }
${P} .sx-bar :is(.sx-bar__keys, .sx-talk__keys) { text-transform:none !important; letter-spacing:.01em !important; border:0 !important; padding:0 !important; margin:3px 0 0 !important;
  font-weight:500 !important; color:rgb(${BONE} / .6) !important; }
${P} .sx-bar .sx-bar__rows { display:flex !important; flex-direction:column !important; gap:2px !important; list-style:none; margin:0 0 2px !important; padding:0 !important; }
${P} .sx-bar .sx-bar-row { display:block !important; width:100% !important; box-sizing:border-box; text-align:left !important; height:auto !important; min-height:0 !important;
  padding:4px 9px !important; border:1px solid transparent !important; border-radius:2px !important; background:none !important; background-image:none !important; clip-path:none !important;
  font-family:${UI} !important; font-size:14px !important; font-weight:600 !important; line-height:1.2 !important; letter-spacing:0 !important; text-transform:none !important;
  color:rgb(${BONE}) !important; white-space:normal !important; cursor:pointer; }
${P} .sx-bar .sx-bar-row::before, ${P} .sx-bar .sx-bar-row::after { content:none !important; display:none !important; }
${P} .sx-bar .sx-bar-row:hover { background:rgb(${BONE} / .06) !important; border-color:${'rgb(' + BONE + ' / .24)'} !important; }
${P} .sx-bar .sx-bar-row.is-active { background:rgb(${AMBER} / .12) !important; border-color:rgb(${AMBER} / .55) !important; box-shadow:inset 3px 0 0 rgb(${AMBER}) !important; }
${P} .sx-bar .sx-bar-row:focus-visible { outline:2px solid rgb(${AMBER}) !important; outline-offset:2px !important; }
${P} .sx-bar .sx-bar-row__role { display:block !important; margin:1px 0 0 !important; max-width:none !important; white-space:normal !important; overflow:visible !important; text-overflow:clip !important;
  font-family:${UI} !important; font-stretch:100% !important; font-variation-settings:normal !important; font-size:12.5px !important; font-weight:500 !important; letter-spacing:.01em !important;
  text-transform:none !important; color:rgb(${BONE} / .72) !important; }
${P} .sx-bar .sx-lead { display:grid !important; grid-template-columns:minmax(0, 1fr) auto !important; align-items:center !important; column-gap:10px !important;
  padding:5px 4px !important; border:0 !important; border-bottom:${LINE_SOFT} !important; background:none !important; background-image:none !important; }
${P} .sx-bar .sx-lead::before, ${P} .sx-bar .sx-lead::after { content:none !important; display:none !important; }
${P} .sx-bar .sx-lead__body { display:flex !important; flex-direction:row !important; align-items:baseline; justify-content:space-between; gap:10px; min-width:0; }
${P} .sx-bar .sx-lead__t { flex:1 1 auto; min-width:0 !important; white-space:normal !important; overflow:visible !important; text-overflow:clip !important;
  font-family:${UI} !important; font-size:13px !important; font-weight:600 !important; line-height:1.25 !important; letter-spacing:0 !important; color:rgb(${BONE}) !important; }
${P} .sx-bar .sx-lead__s { flex:none; font-family:${NUM} !important; font-size:12.5px !important; letter-spacing:0 !important; color:var(--dp-phos, #dfeeff) !important; text-transform:none !important; }
${P} .sx-bar .sx-lead__go { display:inline-flex !important; align-items:center; height:24px !important; padding:0 8px !important;
  border:${LINE} !important; border-radius:2px !important; background:transparent !important;
  font-family:${UI} !important; font-size:12px !important; font-weight:600 !important; letter-spacing:.01em !important; text-transform:none !important; color:rgb(${BONE} / .9) !important; cursor:pointer; }
${P} .sx-bar .sx-lead__go::before, ${P} .sx-bar .sx-lead__go::after { content:none !important; display:none !important; }
${P} .sx-bar .sx-lead__go:is(:hover, :focus-visible) { border-color:rgb(${AMBER}) !important; background:rgb(${AMBER} / .12) !important; color:#fff !important; }
${P} .sx-bar .sx-bar__foot { display:flex !important; flex-wrap:wrap; gap:8px !important; padding:6px 0 0 !important; margin:6px 0 0 !important; list-style:none; }
${P} .sx-bar .sx-bar__foot button { display:inline-flex !important; align-items:center; gap:4px; height:28px !important; padding:0 10px !important;
  border:${LINE} !important; border-radius:2px !important; background:transparent !important;
  font-family:${UI} !important; font-size:12.5px !important; font-weight:600 !important; letter-spacing:.01em !important; text-transform:none !important; color:rgb(${BONE} / .92) !important; cursor:pointer; }
${P} .sx-bar .sx-bar__foot button::before, ${P} .sx-bar .sx-bar__foot button::after { content:none !important; display:none !important; }
${P} .sx-bar :is(.sx-intel) :is(.k-row__name, .k-row__sub, small) { font-family:${UI} !important; font-size:12.5px !important; letter-spacing:.01em !important; text-transform:none !important; }
${P} .sx-bar .sx-intel { padding:4px 0 !important; }

${P} .sx-bar .orr-bardial, ${P} .sx-bar .orr-voicearc { display:none !important; }
${P} .sx-bar .sx-talk__memory, ${P} .sx-bar .sx-talk__reply, ${P} .sx-bar .sx-talk__choices { max-width:min(480px, 100%) !important; }
${P} .sx-bar .sx-talk__choices { display:flex !important; flex-direction:column !important; gap:8px !important; list-style:none; margin:14px 0 6px !important; padding:0 !important; counter-reset:sfch; }
${P} .sx-bar .sx-talk__choices > li { display:block !important; counter-increment:sfch; background:none !important; background-image:none !important; }
${P} .sx-bar .sx-talk__choices > li::before, ${P} .sx-bar .sx-talk__choices > li::after { content:none !important; display:none !important; }
${P} .sx-bar .sx-choice { position:relative; display:block !important; width:100% !important; box-sizing:border-box; text-align:left !important; height:auto !important; min-height:42px !important;
  padding:10px 14px 10px 46px !important; border:${LINE} !important; border-radius:2px !important; background:${PANEL} !important; background-image:none !important; clip-path:none !important;
  font-family:${UI} !important; font-size:15px !important; font-weight:600 !important; letter-spacing:0 !important; text-transform:none !important; color:rgb(${BONE}) !important; cursor:pointer; }
${P} .sx-bar .sx-choice::before { content:counter(sfch) !important; display:grid !important; place-items:center; position:absolute !important; left:12px !important; top:50% !important; bottom:auto !important; width:22px !important; height:22px !important;
  margin:-11px 0 0 !important; padding:0 !important; transform:none !important; translate:none !important; scale:none !important; background:rgb(0 0 0 / .35) !important; border:${LINE} !important; border-radius:2px !important;
  font-family:${NUM} !important; font-size:12px !important; line-height:20px !important; font-weight:500 !important; color:rgb(${BONE} / .85) !important; box-shadow:none !important; }
${P} .sx-bar .sx-choice::after { content:none !important; display:none !important; }
${P} .sx-bar .sx-choice:is(:hover, :focus-visible) { border-color:rgb(${AMBER}) !important; background:rgb(${AMBER} / .14) !important; background-image:none !important; outline:none !important; }
${P} .sx-bar .sx-choice:focus-visible { outline:2px solid rgb(${AMBER}) !important; outline-offset:2px !important; }
${P} .sx-bar .sx-choice:disabled { opacity:.45; cursor:not-allowed; }

/* On a short landscape Market berth the base 136px vital cards lose their compact dock-layout
   sizing: values overlap labels, while the uncapped head leaves only a thin market strip. Keep the
   readings in two readable rows, put priced verbs in the head's scroll flow, and give the exchange
   the remaining viewport. The head scrolls for its secondary tape/signs and any actions below the
   readings; the primary tab rail remains pinned by the existing short-berth layout. */
@media (max-width:650px) and (max-height:400px) {
  /* The generic short-berth rule keeps a 230px tab track and scrolls the whole station. At 320px
     that track extends behind the pinned dock, so this Market gets the actual remaining viewport
     and owns scrolling inside its list and trade stage. */
  ${P}:has(.sx-mkt.orr-market) {
    box-sizing:border-box !important; min-height:0 !important;
    grid-template-rows:max-content minmax(0,1fr) max-content !important;
    overflow-x:hidden !important; overflow-y:hidden !important;
  }
  ${P}:has(.sx-mkt.orr-market) .sxb-ops.dp-frame__foot {
    box-sizing:border-box !important; display:flex !important; flex-wrap:nowrap !important; align-items:center !important; margin-inline:0 !important;
    min-width:0 !important; min-height:0 !important; height:auto !important; padding:3px 8px 5px !important; column-gap:5px !important; row-gap:0 !important;
  }
  ${P}:has(.sx-mkt.orr-market) .sxb-ops.dp-frame__foot > .of-facility-rail {
    box-sizing:border-box !important; flex:1 1 0 !important; width:0 !important; min-width:0 !important; max-width:none !important;
    overflow-x:auto !important; overflow-y:hidden !important; scrollbar-width:thin; overscroll-behavior-x:contain;
  }
  ${P}:has(.sx-mkt.orr-market) .sxb-ops .of-facility-rail :is(.sxb-ops__dock, .sx-dock) {
    box-sizing:border-box !important; width:max-content !important; min-width:100% !important; max-width:none !important;
  }
  ${P}:has(.sx-mkt.orr-market) .sxb-ops .sx-dock__group--nav {
    box-sizing:border-box !important; display:flex !important; flex-wrap:nowrap !important; width:max-content !important; min-width:100% !important;
    min-height:0 !important; height:auto !important; gap:0 5px !important; padding:0 2px !important; overflow:visible !important;
  }
  ${P}:has(.sx-mkt.orr-market) .sxb-ops .sx-dock__group--nav > li { flex:none !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-ops .sx-tile { box-sizing:border-box !important; min-height:28px !important; height:28px !important; padding:3px 2px !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-ops .sx-tile__label { font-size:12px !important; line-height:18px !important; letter-spacing:0 !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-ops > .sx-comms { display:flex !important; flex:0 0 auto !important; flex-direction:row !important; align-items:center !important; gap:0 4px !important; margin:0 !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-ops :is(.sx-comms__toggle, .sxb-help) { flex:0 0 auto !important; min-height:28px !important; height:28px !important; padding:2px 3px !important; font-size:12px !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-ops > .sxb-launch-seat { flex:0 0 auto !important; margin:0 !important; padding:0 !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-launch { min-height:28px !important; height:28px !important; padding:2px !important; gap:3px !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-launch__label { font-size:12px !important; letter-spacing:0 !important; }
  /* Arrival/trade receipts are live player feedback. Give one its own temporary footer row rather
     than positioning its long sentence over the first commodity rows. */
  ${P}:has(.sx-mkt.orr-market) .sxb-ops.dp-frame__foot:has(> .sx-comms > .sx-receipt:not([hidden])) { flex-wrap:wrap !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-ops.dp-frame__foot:has(> .sx-comms > .sx-receipt:not([hidden])) > .sx-comms { display:contents !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-ops.dp-frame__foot > .sx-comms > .sx-receipt:not([hidden]) {
    box-sizing:border-box !important; position:static !important; order:-1 !important; flex:1 0 100% !important; width:100% !important; max-width:100% !important;
    left:auto !important; right:auto !important; top:auto !important; bottom:auto !important; padding:2px 0 !important;
    max-height:42px !important; overflow-y:auto !important; overscroll-behavior:contain;
    flex-wrap:wrap !important; white-space:normal !important; gap:2px 8px !important; line-height:14px !important;
  }
  ${P}:has(.sx-mkt.orr-market) .sxb-ops.dp-frame__foot > .sx-comms > .sx-receipt:not([hidden]) > * {
    min-width:0 !important; max-width:100% !important; white-space:normal !important; overflow-wrap:anywhere !important; font-size:12px !important; line-height:14px !important;
  }
  ${P}:has(.sx-mkt.orr-market) > .dp-frame__body--station,
  ${P}:has(.sx-mkt.orr-market) .dp-frame__body--station > .sx-screen__body {
    box-sizing:border-box !important; min-width:0 !important; min-height:0 !important;
    height:100% !important; overflow:hidden !important;
  }
  ${P}:has(.sx-mkt.orr-market) .sxb-berth.dp-frame__head {
    box-sizing:border-box !important; min-height:0 !important; max-height:96px !important; overflow-x:hidden !important; overflow-y:auto !important;
    grid-template-columns:minmax(0,1fr) auto !important;
    grid-template-areas:"title purse" "vitals vitals" "tape tape" "handoff handoff" "signs signs" "trig trig" !important;
    grid-template-rows:max-content max-content max-content max-content max-content max-content !important;
    align-content:start !important; row-gap:3px !important; padding-bottom:4px !important;
    -webkit-mask-image:linear-gradient(180deg,#000 calc(100% - 4px),transparent) !important;
    mask-image:linear-gradient(180deg,#000 calc(100% - 4px),transparent) !important;
  }
  ${P}:has(.sx-mkt.orr-market) .sxb-berth.dp-frame__head > .sxb-crown { display:contents !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-crown > .sxb-purse {
    grid-area:purse !important; min-width:0 !important; max-width:100% !important; width:max-content !important;
    grid-template-columns:max-content max-content !important; grid-template-areas:"label value" "delta delta" !important;
    align-items:center !important; gap:0 8px !important; margin:0 !important; padding:2px 7px !important;
  }
  ${P}:has(.sx-mkt.orr-market) .sxb-crown .sxb-purse__label { width:auto !important; padding:0 !important; border:0 !important;
    display:inline-block !important; min-width:max-content !important; white-space:nowrap !important; font-size:12px !important; line-height:16px !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-crown .sxb-purse__value { font-size:18px !important; line-height:1.1 !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-crown .sxb-vitals {
    grid-area:vitals !important; display:flex !important; flex-wrap:nowrap !important; align-items:flex-start !important;
    width:100% !important; min-width:0 !important; max-width:none !important; justify-content:flex-start !important; overflow-x:auto !important; overflow-y:hidden !important;
    gap:2px 4px !important; margin:0 !important; padding:2px 0 !important; scrollbar-width:thin; overscroll-behavior-x:contain;
  }
  ${P}:has(.sx-mkt.orr-market) .sxb-crown .sxb-vitals > .sxb-vital {
    box-sizing:border-box !important; grid-area:auto !important; flex:0 0 88px !important; width:88px !important;
    min-width:88px !important; max-width:88px !important; min-height:0 !important; height:auto !important; padding:0 !important;
  }
  ${P}:has(.sx-mkt.orr-market) .sxb-crown .sxb-vitals > .sxb-vital--note {
    flex-basis:150px !important; width:150px !important; min-width:150px !important; max-width:150px !important;
  }
  ${P}:has(.sx-mkt.orr-market) .sxb-crown .sxb-vital__head { min-width:0 !important; min-height:20px !important; flex-wrap:nowrap !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-crown .sxb-vitals > .sxb-vital { min-height:0 !important; height:auto !important; padding:0 !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-crown .sxb-vital__label { min-width:0 !important; font-size:12px !important; line-height:18px !important; letter-spacing:0 !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-crown .sxb-vital:not(.sxb-vital--note) .sxb-vital__value {
    position:static !important; display:inline-flex !important; flex:none !important; margin-left:auto !important; font-size:12px !important; line-height:18px !important;
  }
  ${P}:has(.sx-mkt.orr-market) .sxb-crown .sxb-vital--note .sxb-vital__value { margin-top:0 !important; font-size:12px !important; line-height:16px !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-crown .sxb-vital__track { margin-top:1px !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-crown .sxb-vital__acts { display:flex !important; flex-direction:row !important; flex-wrap:wrap !important;
    align-items:center !important; justify-content:flex-start !important; min-width:0 !important; min-height:0 !important; width:100% !important;
    margin-top:1px !important; gap:1px 3px !important; line-height:14px !important; }
  ${P}:has(.sx-mkt.orr-market) .sxb-crown .sxb-vital__acts > button { box-sizing:border-box !important; flex:0 1 auto !important;
    min-width:0 !important; max-width:100% !important; min-height:22px !important; height:auto !important; padding:1px 3px !important; font-size:12px !important; line-height:16px !important; }
  /* The general Standard console reserves a 276px stepper and 28px gap. This stage has ~193px:
     keep the real dial/quantity controls in an 80px rail, with quote and Buy/Sell in the adjacent
     column. The stage itself scrolls when the breakdown or note needs more height. */
  ${P}:has(.sx-mkt.orr-market) .sx-mkt__stage { box-sizing:border-box !important; min-width:0 !important; min-height:0 !important;
    overflow-x:hidden !important; overflow-y:auto !important; padding:4px !important; }
  ${P}:has(.sx-mkt.orr-market) .sx-mkt__stage > .sx-mkt__console { box-sizing:border-box !important; min-width:0 !important;
    max-width:100% !important; width:100% !important; overflow-x:hidden !important; overflow-y:visible !important; }
  ${P}:has(.sx-mkt.orr-market) .sx-mkt .sx-trade { box-sizing:border-box !important; min-width:0 !important; width:100% !important;
    grid-template-columns:80px minmax(0,1fr) !important; grid-template-rows:max-content max-content max-content max-content !important;
    grid-template-areas:"dial total" "dial verb" "dial note" "dial breakdown" !important;
    column-gap:4px !important; row-gap:4px !important; align-items:start !important; }
  ${P}:has(.sx-mkt.orr-market) .sx-mkt .sx-qty { box-sizing:border-box !important; display:block !important; position:relative !important;
    grid-area:dial !important; width:80px !important; max-width:80px !important; min-width:0 !important; height:110px !important; padding:0 !important; overflow:visible !important; }
  ${P}:has(.sx-mkt.orr-market) .sx-mkt .sx-qty .orr-qdial { display:block !important; position:absolute !important;
    left:0 !important; top:0 !important; width:80px !important; height:80px !important; }
  ${P}:has(.sx-mkt.orr-market) .sx-mkt .sx-qty__in { position:absolute !important; left:20px !important; top:18px !important;
    width:40px !important; height:26px !important; line-height:26px !important; padding:0 !important; font-size:18px !important; }
  ${P}:has(.sx-mkt.orr-market) .sx-mkt .sx-qty__k { position:absolute !important; left:0 !important; top:46px !important;
    width:80px !important; margin:0 !important; text-align:center !important; font-size:12px !important; line-height:16px !important; }
  ${P}:has(.sx-mkt.orr-market) .sx-mkt .sx-qty__words { position:absolute !important; display:flex !important; flex-wrap:wrap !important;
    align-content:start !important; justify-content:space-between !important; gap:2px !important; left:0 !important; right:0 !important;
    top:82px !important; width:80px !important; margin:0 !important; padding:0 !important; }
  ${P}:has(.sx-mkt.orr-market) .sx-mkt .sx-qty__words > li { display:block !important; flex:1 1 34px !important; min-width:0 !important; }
  ${P}:has(.sx-mkt.orr-market) .sx-mkt .sx-qty__words button { box-sizing:border-box !important; width:100% !important; min-width:0 !important;
    min-height:24px !important; height:auto !important; padding:2px !important; font-size:12px !important; line-height:16px !important; }
  ${P}:has(.sx-mkt.orr-market) .sx-mkt .sx-trade__words { box-sizing:border-box !important; display:flex !important; flex-wrap:wrap !important;
    width:100% !important; min-width:0 !important; gap:3px !important; margin:0 !important; padding:0 !important; }
  ${P}:has(.sx-mkt.orr-market) .sx-mkt .sx-trade__words > li { display:block !important; flex:1 1 46px !important; min-width:0 !important; }
  ${P}:has(.sx-mkt.orr-market) .sx-mkt .sx-trade__words .sx-trade__go { box-sizing:border-box !important; width:100% !important;
    min-width:0 !important; min-height:28px !important; height:auto !important; padding:3px 2px !important; font-size:12px !important; }
  ${P}:has(.sx-mkt.orr-market) .sx-mkt .so-trade-total, ${P}:has(.sx-mkt.orr-market) .sx-mkt .so-trade-breakdown { min-width:0 !important; max-width:100% !important; }
}
`;

export function injectStationStandard(doc = globalThis.document) {
  if (!doc || typeof doc.createElement !== 'function') return;
  if (typeof doc.getElementById === 'function' && doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(style);
  // setActive may have scrolled the selected facility before this short-berth rail's final
  // one-line geometry was applied. Re-align the existing roving tab after the stylesheet lands so
  // the selected destination remains visible on the first paint.
  const revealSelectedFacility = () => {
    const selected = doc.querySelector?.('.of-facility-rail [role="tab"][aria-selected="true"]');
    selected?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  };
  if (typeof doc.defaultView?.requestAnimationFrame === 'function') doc.defaultView.requestAnimationFrame(revealSelectedFacility);
  else revealSelectedFacility();
}

export const STATION_STANDARD_CSS = CSS;
