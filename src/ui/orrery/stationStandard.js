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
   their content; the crown readings share their available column without wrapping. */
@media (min-width:901px) and (max-width:1100px) and (min-height:461px) and (max-height:640px) {
  ${P}:has(#sx-panel > .sx-sw:not([hidden])) { grid-template-rows:max-content minmax(0,1fr) max-content !important; }
  ${P}:has(#sx-panel > .sx-sw:not([hidden])) .sxb-berth.dp-frame__head {
    min-height:0 !important; max-height:145px !important; overflow-y:auto !important; overflow-x:hidden !important;
  }
  ${P} .sxb-berth.dp-frame__head { grid-template-rows:auto auto auto auto auto !important; align-content:start !important; row-gap:4px !important; }
  ${P} .sxb-crown .sxb-purse { position:absolute !important; top:-44px !important; left:28px !important; right:auto !important; margin:0 !important; }
  ${P} .sxb-crown .sxb-vitals { min-width:0 !important; max-width:none !important; width:100% !important;
    flex-wrap:nowrap !important; justify-content:space-between !important; gap:8px !important; margin-top:32px !important; }
  ${P} .sxb-vital { flex:1 1 0 !important; min-width:0 !important; width:auto !important; max-width:none !important; box-sizing:border-box; }
  ${P} .sxb-vital__head, ${P} .sxb-vital__value, ${P} .sxb-vital__acts { min-width:0 !important; max-width:100% !important; }
  ${P} .sxb-vital__label { min-width:0 !important; max-width:100% !important; font-size:12px !important; letter-spacing:0 !important;
    line-height:1.15 !important; white-space:normal !important; overflow-wrap:anywhere; text-align:center !important; }
  ${P} .sxb-vital--muni .sxb-vital__head { justify-content:center !important; }
  ${P} .sxb-vital--muni .sxb-vital__value { position:static !important; width:100% !important; margin:0 !important; }
  ${P} .sxb-ops { flex-wrap:wrap !important; column-gap:10px !important; row-gap:4px !important; }
  ${P} .sxb-ops > .of-facility-rail { flex:0 0 100% !important; max-width:none !important; width:100% !important; }
  ${P} .sxb-ops > .sx-comms { order:2 !important; margin:0 !important; }
  ${P} .sxb-ops > .sxb-launch-seat { order:3 !important; margin:0 0 0 auto !important; }
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

/* narrow portrait (481–650 wide, ≥601 tall): the console column is ~146px, so the stepper sets Fewer + count on one row and
   More / Max on the next, and Buy / Sell share the column width instead of hanging past the right edge */
@media (min-width:481px) and (max-width:650px) and (min-height:601px) {
  ${P} .sx-mkt .sx-trade { grid-template-columns:minmax(0, 1fr) !important; column-gap:0 !important; }
  ${P} .sx-mkt .sx-qty { width:100% !important; box-sizing:border-box !important; }
  ${P} .sx-mkt .sx-qty__words > li:nth-child(1) > button { flex:0 0 auto !important; }
  ${P} .sx-mkt .sx-qty__in { flex:1 1 40px !important; min-width:0 !important; width:auto !important; }
  ${P} .sx-mkt .sx-qty__words > li:nth-child(n+2) > button { flex:1 1 40% !important; min-width:0 !important; padding:0 6px !important; }
  ${P} .sx-mkt .sx-trade__words { width:100% !important; gap:6px !important; }
  ${P} .sx-mkt .sx-trade__words > li { flex:1 1 0 !important; min-width:0 !important; }
  ${P} .sx-mkt .sx-trade__words > li:is(:first-child, :not(:first-child)) > .sx-trade__go { width:100% !important; height:36px !important; min-height:36px !important;
    box-sizing:border-box !important; padding:0 6px !important; justify-content:center !important; }
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
`;

export function injectStationStandard(doc = globalThis.document) {
  if (!doc || typeof doc.createElement !== 'function') return;
  if (typeof doc.getElementById === 'function' && doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

export const STATION_STANDARD_CSS = CSS;
