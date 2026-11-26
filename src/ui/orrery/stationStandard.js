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
const PA = 'html:root:root:root body #screens > .sx-berth.orr-station.orr-station';
// The phone sheet (data-sf-mobile="1") styles the berth at three ids (mobileScreenLayouts.js); its
// four-places and clean-exchange rules restate here at four so a phone gets the same station.
const PM = 'html:root:root[data-sf-mobile="1"] body #screens#screens#screens#screens > .sx-berth.orr-station.orr-station';

const BONE = '236 230 216';
const AMBER = '242 185 80';
const ICE = '#9edce9';
const GOLD = '#e6ca8f';
const LINE = '1px solid rgb(154 198 218 / .34)';
const LINE_SOFT = '1px solid rgb(154 198 218 / .18)';
const PANEL = 'linear-gradient(160deg, rgb(11 24 35 / .95) 0%, rgb(7 16 24 / .97) 100%)';
const GUNMETAL_BG = 'linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 140px, rgb(158 220 233 / .14) 140px 100%) top left / 100% 2px no-repeat, linear-gradient(180deg, rgb(25 36 47 / .96) 0%, rgb(14 21 29 / .98) 100%)';
const GUNMETAL_SHADOW = 'inset 0 1px 0 rgb(215 238 248 / .20), inset 0 -2px 0 rgb(2 5 8 / .88), inset 0 0 0 1px rgb(14 28 40 / .75), 0 12px 30px rgb(0 0 0 / .62)';
const VISOR_BAY_BG = 'linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 140px, rgb(158 220 233 / .14) 140px 100%) top left / 100% 2px no-repeat, repeating-linear-gradient(0deg, rgb(158 220 233 / .012) 0 1px, transparent 1px 3px), radial-gradient(120% 90% at 18% 0%, rgb(24 54 74 / .34), transparent 62%), linear-gradient(160deg, rgb(11 24 35 / .95) 0%, rgb(7 16 24 / .97) 100%)';
const VISOR_BAY_BORDER = '1px solid rgb(154 198 218 / .30)';
const VISOR_BAY_SHADOW = 'inset 0 1px 0 rgb(208 238 250 / .14), inset 0 -2px 0 rgb(2 6 10 / .85), 0 12px 28px rgb(0 0 0 / .58)';
const KEYCAP_BG = 'linear-gradient(180deg, rgb(28 43 56 / .95), rgb(14 23 32 / .98))';
const KEYCAP_BORDER = '1px solid rgb(158 220 233 / .38)';
const KEYCAP_SHADOW = 'inset 0 1px 0 rgb(220 242 252 / .18), 0 1px 2px rgb(0 0 0 / .6)';
const UI = 'var(--dp-face-read, "Instrument Sans", system-ui, sans-serif)';
const NUM = 'var(--dp-face-num, "Spline Sans Mono", ui-monospace, Consolas, monospace)';
const TITLE = 'var(--dp-face-display, "Archivo", system-ui, sans-serif)';

const CSS = `
/* Figures read in the body face with tabular numerals (one type system, 2026-11-23); the mono face
   is for key caps only (see FOUR PLACES at the end of this sheet). */
${P} { --dp-face-num: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif; font-variant-numeric: tabular-nums; }

/* ---- shared: one label voice, one button voice -------------------------------------------- */
${P} :is(.sxb-berth__ident, .sxb-vital__label, .sxb-event__badge, .sxb-event__title, .sxb-next__t, .so-command-trigger,
  .sx-mkt-browser__mode, .sx-mkt-cat-inline, .sx-mkt-drivers__k, .sx-mkt-table th, .sx-dock *, .of-facility-rail *) {
  font-family:${UI} !important; font-stretch:100% !important; font-variation-settings:normal !important;
  font-weight:600 !important; font-size:13px !important; letter-spacing:.03em !important; }

/* ---- head: ident, finder, advisory strip, handoff ------------------------------------------- */
${P} .sxb-berth__ident { text-transform:uppercase; letter-spacing:.06em !important; color:#9edce9 !important; }
${P} .sxb-berth__ident::before { background:#f2b950 !important; box-shadow:0 0 6px rgb(242 185 80 / .45) !important; }
${P} .sxb-berth__name { font-family:${TITLE} !important; letter-spacing:.01em !important; color:#edf2ef !important; }
${P} .dp-title__rule { background:linear-gradient(90deg, #f2b950 0 32px, rgb(158 220 233 / .55) 32px 200px, transparent 100%) !important; height:2px !important; box-shadow:none !important; }
${P} .sxb-tape .sxb-event__badge { color:#f2b950 !important; font-weight:700 !important; }
${P} .sxb-tape .sxb-event__title { color:#edf2ef !important; font-weight:700 !important; }
${P} .sxb-tape .sxb-event__body { color:rgb(218 236 244 / .88) !important; font-family:${UI} !important; font-size:12.5px !important; line-height:1.3 !important; }
${P} .sxb-next__bead { background:#9edce9 !important; box-shadow:0 0 8px rgb(158 220 233 / .55) !important; }
${P} .sxb-next__n { font-family:${NUM} !important; font-size:12px !important; color:#9edce9 !important; }
@media (min-width:901px) and (min-height:641px) {
  ${P} .sxb-berth.dp-frame__head > .so-station-title {
    box-sizing:border-box !important;
    width:100% !important; max-width:min(680px, 100%) !important;
    padding:7px 14px 8px !important;
    border:1px solid rgb(154 198 218 / .26) !important;
    border-left:2px solid #f2b950 !important;
    border-radius:2px !important;
    background:
      linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .45) 28px 140px, rgb(158 220 233 / .12) 140px 100%) top left / 100% 2px no-repeat,
      linear-gradient(160deg, rgb(12 24 35 / .86), rgb(7 15 23 / .92)) !important;
    box-shadow:inset 0 1px 0 rgb(208 238 250 / .12), 0 8px 20px rgb(0 0 0 / .46) !important;
  }
  ${P} .sxb-berth.dp-frame__head > .sxb-tape:has(> :not([hidden]):not(:empty)),
  ${P} .sxb-berth.dp-frame__head > .sxb-handoff:not([hidden]):not(:empty) {
    box-sizing:border-box !important;
    width:100% !important; max-width:min(680px, 100%) !important;
    margin:6px 0 0 !important;
    padding:7px 12px !important;
    border:1px solid rgb(154 198 218 / .26) !important;
    border-left:2px solid #9edce9 !important;
    border-radius:2px !important;
    background:linear-gradient(160deg, rgb(12 24 35 / .86), rgb(7 15 23 / .92)) !important;
    box-shadow:inset 0 1px 0 rgb(208 238 250 / .10), 0 6px 18px rgb(0 0 0 / .44) !important;
  }
}
@media (min-width:901px) and (max-width:1440px) {
  ${P} .sxb-berth.dp-frame__head > .so-station-title {
    padding:5px 10px 6px !important;
  }
  ${P} .sxb-berth.dp-frame__head > .so-station-title .sxb-berth__name,
  ${P} .sxb-berth.dp-frame__head > .so-station-title .dp-title__name {
    font-size:clamp(20px, 2.0vw, 27px) !important;
    line-height:1.05 !important;
    letter-spacing:0 !important;
    white-space:nowrap !important;
  }
  ${P} .sxb-berth.dp-frame__head > .so-station-title .sxb-berth__ident {
    font-size:12px !important;
    letter-spacing:.02em !important;
    white-space:normal !important;
    overflow:visible !important;
    text-overflow:clip !important;
  }
}
@media (min-width:901px) and (min-height:641px) and (max-height:800px) {
  ${P} .sxb-berth.dp-frame__head > .so-station-title { padding:4px 10px 5px !important; }
  ${P} .sxb-berth.dp-frame__head > .sxb-tape:has(> :not([hidden]):not(:empty)),
  ${P} .sxb-berth.dp-frame__head > .sxb-handoff:not([hidden]):not(:empty) {
    margin:3px 0 0 !important;
    padding:4px 10px !important;
  }
  ${P} .sxb-crown { padding:6px 12px !important; gap:4px !important; }
  ${P} .sxb-crown .sxb-purse { padding:4px 10px !important; }
}
${P} .so-command-trigger { display:inline-flex !important; align-items:center; gap:10px !important; height:32px !important;
  padding:0 12px !important; border:${LINE} !important; border-radius:2px !important;
  background:linear-gradient(180deg, rgb(25 36 47 / .96) 0%, rgb(14 21 29 / .98) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(215 238 248 / .18), 0 4px 12px rgb(0 0 0 / .45) !important;
  color:#edf2ef !important; text-transform:none !important; cursor:pointer; }
${P} .so-command-trigger:is(:hover, :focus-visible) { border-color:#e6ca8f !important; background:linear-gradient(180deg, rgb(224 181 94 / .22) 0%, rgb(18 29 40 / .96) 100%) !important; color:#fff1cf !important; box-shadow:inset 0 1px 0 rgb(255 241 207 / .25) !important; }
${P} .so-command-trigger .dp-kbd { font-family:${NUM} !important; font-size:12px !important; letter-spacing:0 !important;
  color:#9edce9 !important; border:${KEYCAP_BORDER} !important; border-radius:2px !important; padding:1px 6px !important;
  background:${KEYCAP_BG} !important; box-shadow:${KEYCAP_SHADOW} !important; }
${P} .so-command-trigger:is(:hover, :focus-visible) .dp-kbd { color:#fff1cf !important; border-color:#e6ca8f !important; }
${P} .so-command-trigger .dp-kbd::before { content:none !important; }

/* handoff: keep sentence and Dismiss button in disjoint columns so they never collide */
${P} .sxb-berth.dp-frame__head > .sxb-handoff:not([hidden]) { display:grid !important; grid-template-columns:minmax(0, 1fr) auto !important;
  align-items:start !important; column-gap:16px !important; }
${P} .sxb-handoff > .sxb-next { grid-column:1 !important; grid-row:1 !important; padding-right:0 !important;
  display:flex !important; flex-wrap:wrap !important; align-items:baseline !important; gap:2px 8px !important; }
${P} .sxb-next__w { order:3; flex:1 0 100% !important; margin-right:0 !important; padding-left:17px !important;
  white-space:normal !important; overflow:visible !important; text-overflow:clip !important;
  font-family:${UI} !important; font-size:13px !important; letter-spacing:0 !important; color:rgb(${BONE} / .86) !important; }
${P} .sxb-handoff > .sxb-next__x { grid-column:2 !important; grid-row:1 !important; align-self:start !important;
  display:inline-flex !important; align-items:center; height:26px !important; padding:0 10px !important;
  border:${LINE} !important; border-radius:2px !important; background:linear-gradient(180deg, rgb(24 37 49 / .92), rgb(13 21 30 / .96)) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .14) !important;
  font-family:${UI} !important; font-size:12px !important; font-weight:600 !important; letter-spacing:.04em !important;
  text-transform:uppercase !important; color:#9edce9 !important; cursor:pointer; }
${P} .sxb-handoff > .sxb-next__x:is(:hover, :focus-visible) { border-color:#e6ca8f !important; background:linear-gradient(180deg, rgb(224 181 94 / .24), rgb(224 181 94 / .08)) !important; color:#fff1cf !important; }

/* ---- the crown: unified ruggedized metallic terminal header fascia (no double-box glitch) ----- */
${P} .sxb-crown::before { display:none !important; }
${P} .sxb-crown { display:flex !important; flex-direction:column !important; align-items:stretch !important; gap:8px !important;
  padding:10px 14px !important; border:${LINE} !important; border-radius:2px !important;
  background:${GUNMETAL_BG} !important; box-shadow:${GUNMETAL_SHADOW} !important; }
${P} .sxb-crown .sxb-purse { position:static !important; display:grid !important; grid-template-columns:1fr auto auto;
  grid-template-areas:"label value delta"; justify-content:space-between; align-items:baseline; gap:4px 14px !important;
  margin:0 !important; padding:6px 14px !important; min-width:232px; width:100%; box-sizing:border-box !important;
  border:1px solid rgb(230 202 143 / .45) !important; border-radius:2px !important;
  background:linear-gradient(90deg, rgb(224 181 94 / .16) 0%, rgb(13 28 40 / .94) 45%, rgb(8 18 28 / .97) 100%) !important;
  box-shadow:inset 3px 0 0 #e6ca8f, inset 0 1px 0 rgb(255 241 207 / .16) !important; text-align:right; }
${P} .sxb-crown:has(> .sxb-law-fine:not([hidden])) .sxb-purse { width:max-content !important; margin:0 0 0 auto !important;
  grid-template-columns:auto auto; grid-template-areas:"label label" "value delta"; }
${P} .sxb-crown .sxb-purse__label { grid-area:label; justify-self:start; align-self:center; text-align:left !important; font-family:${UI} !important; font-stretch:100% !important;
  font-variation-settings:normal !important; font-weight:700 !important; font-size:12px !important; letter-spacing:.08em !important;
  text-transform:uppercase; color:#e6ca8f !important; padding-bottom:0; width:auto; border-bottom:0; }
${P} .sxb-crown .sxb-purse__value { grid-area:value; justify-self:end; font-family:${NUM} !important; font-stretch:100% !important;
  font-variation-settings:normal !important; font-weight:600 !important; font-size:26px !important; line-height:1.1 !important;
  letter-spacing:0 !important; color:#fff1cf !important; text-shadow:0 0 14px rgb(230 202 143 / .22) !important; font-variant-numeric:tabular-nums; }
${P} .sxb-crown .sxb-purse__value::before { content:"CR"; font-family:${UI}; font-size:12px; font-weight:700; letter-spacing:.08em;
  color:#9edce9; margin-right:8px; vertical-align:middle; }
${P} .sxb-crown .so-credit-delta { grid-area:delta; align-self:end; font-family:${NUM} !important; font-size:13px !important;
  letter-spacing:0 !important; }

/* ---- the vitals: 5-cell diagnostic strip with skewed/segmented visor telemetry bars --------- */
${P} .sxb-vitals { display:flex !important; flex-wrap:wrap !important; justify-content:flex-end !important; align-items:flex-start !important;
  gap:8px 18px !important; margin:0 !important; padding:8px 14px !important;
  border:1px solid rgb(154 198 218 / .26) !important; border-radius:2px !important;
  background:linear-gradient(160deg, rgb(10 22 32 / .95), rgb(6 14 22 / .97)) !important;
  box-shadow:inset 0 1px 0 rgb(158 220 233 / .10) !important; }
${P} .sxb-vital { display:block !important; position:relative !important; width:136px !important; min-width:0 !important;
  flex:none !important; padding:0 !important; text-align:left !important; }
${P} .sxb-vital--note { width:168px !important; }
${P} .sxb-vital .orr-vdial, ${P} .sxb-vital .orr-vdial-bare, ${P} .sxb-vital__head > .so-icon { display:none !important; }
${P} .sxb-vital__head { display:flex !important; flex-direction:row !important; flex-wrap:wrap; align-items:baseline !important; width:100% !important;
  min-height:27px !important; padding:0 !important; border:0 !important; background:none !important; text-align:left; gap:0 !important; }
${P} .sxb-vital__label { text-transform:uppercase; color:#9edce9 !important; line-height:18px !important; }
${P} .sxb-vital__track { order:3 !important; flex:0 0 100% !important; display:block !important; position:relative; width:100% !important;
  height:6px !important; margin:5px 0 0 !important; box-sizing:border-box !important;
  background:repeating-linear-gradient(90deg, rgb(158 220 233 / .15) 0 8px, rgb(6 14 22 / .95) 8px 10px) !important;
  border:1px solid rgb(158 220 233 / .24) !important; border-radius:1px !important; overflow:hidden !important; }
${P} .sxb-vital__track > .sxb-vital__fill { display:block !important; height:100% !important; border-radius:0 !important;
  background:repeating-linear-gradient(90deg, #92d9eb 0 8px, rgb(8 20 30 / .92) 8px 10px) !important;
  box-shadow:0 0 8px rgb(146 217 235 / .32) !important; }
${P} .sxb-vital[data-tone="warn"] .sxb-vital__fill {
  background:repeating-linear-gradient(90deg, #f1b059 0 8px, rgb(8 20 30 / .92) 8px 10px) !important;
  box-shadow:0 0 8px rgb(241 176 89 / .35) !important; }
${P} .sxb-vital[data-tone="bad"] .sxb-vital__fill {
  background:repeating-linear-gradient(90deg, #ff7159 0 8px, rgb(8 20 30 / .92) 8px 10px) !important;
  box-shadow:0 0 8px rgb(255 113 89 / .4) !important; }
/* override stationLayouts flex-direction:column on .sxb-vital__value so numerator & denominator stay on one line */
${P} .sxb-vital__value { position:absolute !important; top:0 !important; right:0 !important; left:auto !important; margin:0 !important;
  display:inline-flex !important; flex-direction:row !important; align-items:baseline !important; gap:2px !important;
  font-family:${NUM} !important; font-size:13px !important; line-height:18px !important; letter-spacing:0 !important;
  color:#edf2ef !important; text-shadow:none !important; white-space:nowrap; }
${P} .sxb-vital__value .orr-vnum { display:inline !important; font:inherit !important; font-size:13px !important; letter-spacing:0 !important; margin:0 !important; }
${P} .sxb-vital__value .orr-vden { display:inline !important; font:inherit !important; font-size:12px !important; letter-spacing:0 !important; margin:0 !important; color:rgb(158 220 233 / .68) !important; }
${P} .sxb-vital--note .sxb-vital__head { min-height:0 !important; }
${P} .sxb-vital--note .sxb-vital__value { position:static !important; display:block !important; margin:4px 0 0 !important; font-family:${UI} !important;
  font-size:12px !important; font-weight:600; letter-spacing:.03em !important; text-transform:uppercase; color:#e6ca8f !important; }
${P} .sxb-vital--note .sxb-vital__value .orr-vnum.is-word { font-family:${UI} !important; font-size:12px !important; letter-spacing:.03em !important; color:#e6ca8f !important; }
/* give trackless vitals (Munitions) a 6px segmented track rule so all vitals align on the same horizontal grid */
${P} .sxb-vital--muni .sxb-vital__head::after { content:""; order:3; flex:0 0 100%; display:block; width:100%; height:6px; margin-top:5px; box-sizing:border-box;
  background:repeating-linear-gradient(90deg, rgb(158 220 233 / .15) 0 8px, rgb(6 14 22 / .95) 8px 10px);
  border:1px solid rgb(158 220 233 / .24); border-radius:1px; }
${P} .sxb-vital__acts { position:static !important; display:flex !important; flex-wrap:wrap; gap:6px !important; margin:7px 0 0 !important;
  width:auto !important; justify-content:flex-start !important; }
${P} .sxb-vital__acts:empty { display:none !important; }
${P} .sxb-vital__acts > button { display:inline-flex !important; align-items:center; gap:0; min-height:26px !important; height:auto !important;
  padding:2px 9px !important; border:1px solid rgb(158 220 233 / .34) !important; border-radius:2px !important;
  background:linear-gradient(180deg, rgb(24 38 50 / .94), rgb(13 22 31 / .97)) !important;
  box-shadow:inset 0 1px 0 rgb(210 238 250 / .14) !important; clip-path:none !important;
  font-family:${UI} !important; font-size:12px !important; font-weight:600 !important; letter-spacing:.02em !important;
  text-transform:none !important; color:#edf2ef !important; cursor:pointer; white-space:nowrap; }
${P} .sxb-vital__acts > button::before, ${P} .sxb-vital__acts > button::after { content:none !important; display:none !important; }
${P} .sxb-vital__acts > button:is(:hover, :focus-visible) { border-color:#e6ca8f !important; background:linear-gradient(180deg, rgb(224 181 94 / .24), rgb(224 181 94 / .10)) !important; color:#fff1cf !important; outline:none !important; }
${P} .sxb-vital__acts > button:focus-visible { outline:2px solid #e6ca8f !important; outline-offset:2px !important; }
${P} .sxb-vital__acts > button:disabled { opacity:.45; cursor:not-allowed; }
${P} .sxb-vital__acts .orr-act__sep { display:inline !important; opacity:.5; white-space:pre; }
${P} .sxb-vital__acts .orr-act__cost { font-family:${NUM} !important; font-size:12px !important; letter-spacing:0 !important; color:#e6ca8f !important; }

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
  /* Put the purse beside the palette trigger so the full vitals strip retains its own row. */
  ${P} .sxb-berth.dp-frame__head > .sxb-crown { display:contents !important; }
  ${P} .sxb-berth.dp-frame__head > .sxb-crown .sxb-purse { grid-area:trigger !important; justify-self:start !important; align-self:center !important; }
  ${P} .sxb-berth.dp-frame__head > .sxb-crown .sxb-vitals { grid-area:crown !important; margin-top:0 !important; }
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
  /* ui-polish-492: the cells ran edge to edge, so HULL's 86 / 100 printed against LEDGER and the hold bar ran into
     MUNITIONS. Each cell stops 10px short of its neighbour, and the right-hand cells (ledger, munitions) open on a hairline. */
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--hull, .sxb-vital--fuel, .sxb-vital--hold) { padding-right:10px !important; box-sizing:border-box !important; }
  ${P} .sxb-crown .sxb-vital--hull .sxb-vital__value { right:10px !important; }
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--note, .sxb-vital--muni) { padding-left:10px !important; box-sizing:border-box !important;
    border-left:1px solid rgb(236 230 216 / .16) !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--muni { padding-left:8px !important; }
  /* hold's reading is the shortest, so it gives munitions a column-and-a-half for its label and value plus the hairline */
  ${P} .sxb-crown .sxb-vitals { grid-template-columns:repeat(20, minmax(0, 1fr)) !important;
    grid-template-areas:"hull hull hull hull hull hull hull hull hull hull note note note note note note note note note note" "fuel fuel fuel fuel fuel fuel hold hold hold hold hold muni muni muni muni muni muni muni muni muni" !important; }
  ${P} .sxb-berth.dp-frame__head { -webkit-mask-image:linear-gradient(to bottom, #000 calc(100% - 2px), transparent) !important;
    mask-image:linear-gradient(to bottom, #000 calc(100% - 2px), transparent) !important; padding-bottom:2px !important; }
}
@media (min-width:901px) and (max-width:1100px) and (min-height:461px) and (max-height:640px) {
  /* The active handoff needs its complete instruction above the tab body. Keep the compact
     Market and Shipworks allocations below; other tabs can use the available head room. */
  ${P}:not(:has(#sx-panel > .sx-mkt)):not(:has(#sx-panel > .sx-sw:not([hidden]))) {
    grid-template-rows:minmax(0, 40vh) minmax(200px, 1fr) max-content !important;
  }
  ${P}:not(:has(#sx-panel > .sx-mkt)):not(:has(#sx-panel > .sx-sw:not([hidden]))) .sxb-berth.dp-frame__head {
    max-height:40vh !important;
  }
  ${P}:not(:has(#sx-panel > .sx-mkt)):not(:has(#sx-panel > .sx-sw:not([hidden]))) .sxb-berth > .sxb-signs {
    padding-top:0 !important;
  }
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
/* 901-1100 wide x 461-640 tall: the head is a 32vh scrollport, and the handoff's sentence, held to the column left of
   Dismiss (~275px), took a second line that fell under the Market panel ("Hold is empty. Check Market prices or" and
   then nothing). Dismiss only needs the title's row, so the sentence runs the full width under it and reads on one
   line. The crown beside it spans the tape and handoff rows and its extra height was shared between them, which
   pushed a one-line brief 14px down again; the handoff row is the flexible one now, so the tape and brief pack under
   the title and the whole sentence ends ~8px inside the head's visible band at 960x540. Dismiss stays on top in its own cell; the title row
   still ends before it, and Dismiss sits 4px up so its frame clears the sentence's ascenders.
   The tape row keeps its content height (a fixed 0 max, floored at min-content) and the title's second row takes only the
   title's own second line (~28px; a taller title spills into row 1 instead), so the crown's extra height all lands in the
   handoff row, under the brief. The rows stay intrinsic, so the crown still sizes them: a 1fr
   handoff row was skipped by the spanning crown, which then ran its frame through the Bay screen / Station wire text on
   Station, Bar and (scrolled) Shipworks. */
@media (min-width:901px) and (max-width:1100px) and (min-height:461px) and (max-height:640px) {
  ${P} .sxb-berth.dp-frame__head { grid-template-rows:auto minmax(min-content,29px) minmax(min-content,0px) auto auto !important; }
  ${P} .sxb-handoff > .sxb-next { grid-column:1 / -1 !important; }
  ${P} .sxb-handoff > .sxb-next__x { position:relative; top:-4px; z-index:1; }
  ${P} .sxb-handoff > .sxb-next > .sxb-next__t { max-width:calc(100% - 120px) !important; }
}
/* ...and on the Market at 461-500 tall the head's fold still cut the sentence (3px at 960x500, 15px at 960x461): the head's
   rows close up (no row gap) so the brief rises into the band. */
@media (min-width:901px) and (max-width:1100px) and (min-height:461px) and (max-height:500px) {
  ${P}:has(#sx-panel > .sx-mkt) .sxb-berth.dp-frame__head { row-gap:0 !important; }
}
/* 960–1100 wide × 461–640 tall: the seven tabs (glyphs folded, 6px keys) are ~560px, so tabs, COMMS · HELP and UNDOCK
   (~860px with gaps) stand on ONE row of the 896px+ foot instead of the tab rail taking a row of its own. The row it
   gave back (~70px) goes to the body, so the Market's Buy/Sell stage and table are no longer cut to a sliver at 960x540.
   901–959 keeps the two-row foot above, where the single row does not fit. */
@media (min-width:960px) and (max-width:1100px) and (min-height:461px) and (max-height:640px) {
  ${P} .sxb-ops { flex-wrap:nowrap !important; column-gap:10px !important; }
  ${P} .sxb-ops > .of-facility-rail { flex:0 1 auto !important; min-width:0 !important; width:auto !important; max-width:none !important; }
  ${P} .sxb-ops .sx-dock__group--nav { gap:0 6px !important; }
  ${P} .sxb-ops .sx-dock :is(button, a) { padding-left:6px !important; padding-right:6px !important; }
  ${P} .sxb-ops .sx-tile .dust-tab-glyph { display:none !important; }
  /* The crown is ~493–587px here: the five readings fit ONE row (hull, fuel, hold, ledger, munitions), so FUEL, HOLD and
     MUNITIONS stand in the head's visible band. In the two-row grid above they sat on a second row under the head's
     32vh scrollport (ships: 145px), so a player at 960x540 saw only the hull and ledger. Absolute side-by-side values
     (base .sxb-vital__value) need ~92px for "Fuel"+"100 / 100" but the fuel/hold fr tracks land ~83–84px, so the figure
     printed on top of its label (ui-bench tangled at 960×540). Stack the three tight cells' figures under their labels —
     same densify as the 651–800 short-berth one-row crown — so every reading stays in the visible band without tangled ink.
     Hull keeps the absolute figure (short label + Repair key already set the cell width). */
  ${P} .sxb-crown .sxb-vitals { grid-template-columns:minmax(0,106fr) minmax(0,100fr) minmax(0,98fr) minmax(0,116fr) minmax(0,134fr) !important;
    grid-template-areas:"hull fuel hold note muni" !important; }
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--fuel, .sxb-vital--hold, .sxb-vital--muni) .sxb-vital__label {
    font-size:12px !important; letter-spacing:.02em !important; line-height:1.15 !important;
    max-width:100% !important; overflow:visible !important; text-overflow:unset !important; }
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--fuel, .sxb-vital--hold, .sxb-vital--muni) .sxb-vital__value {
    position:static !important; inset:auto !important; width:max-content !important; max-width:100% !important;
    display:inline-flex !important; flex-direction:row !important; align-items:baseline !important; gap:2px !important;
    margin:2px 0 0 !important; white-space:nowrap !important; font-size:12px !important; }
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--fuel, .sxb-vital--hold, .sxb-vital--muni) .sxb-vital__value .orr-vnum,
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--fuel, .sxb-vital--hold, .sxb-vital--muni) .sxb-vital__value .orr-vden { font-size:12px !important; }
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--fuel, .sxb-vital--hold) .sxb-vital__head { min-height:0 !important; }
}
/* …and at that ~493px strip a figure beside its word did not fit: FUEL ran 8px into "100 / 100", HOLD 5px into
   "0 / 40 u", MUNITIONS 3px into "0 / 100", and HULL kept 4px. Here each reading is a small stat: the word, its
   figure under it, then the track and the verb. Stacked, the figures need only their own ink, so the cells give
   their width to the verbs (HULL's Repair/Insure and LEDGER's Draw no longer run past their cell) and to 10px gutters,
   so LEDGER's CREDIT LINE OPEN no longer reads on into MUNITIONS' figure. The figure stands in the cell's flow (the
   track is drawn under it), so a longer one ("120 / 120 u") widens its column instead of printing over the next.
   1024-1100 keeps the side-by-side cells: they fit there, and stacking would only cost the head 14px. */
@media (min-width:960px) and (max-width:1023px) and (min-height:461px) and (max-height:640px) {
  ${P} .sxb-crown .sxb-vitals { grid-template-columns:minmax(min-content,92fr) minmax(min-content,62fr) minmax(min-content,53fr)
    minmax(min-content,129fr) minmax(min-content,117fr) !important; column-gap:10px !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--note :is(.sxb-vital__value, .orr-vnum.is-word) { text-align:left !important; }
  /* The cell is a four-row grid (word, figure, track, verbs). The word and its track live in the head (the Hold head is the
     manifest button), so the head spans rows 1-3 as a subgrid and the figure takes row 2 between them: the track sits
     under the figure in flow, and a figure that wraps or grows pushes the track and verbs down instead of being crossed. */
  ${P} .sxb-crown .sxb-vitals > .sxb-vital:not(.sxb-vital--note) { display:grid !important; grid-template-columns:minmax(0,1fr) !important;
    grid-template-rows:auto auto auto auto !important; align-content:start !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital:not(.sxb-vital--note) > .sxb-vital__head { grid-area:1 / 1 / 4 / 2 !important; display:grid !important;
    grid-template-columns:minmax(0,1fr) !important; grid-template-rows:subgrid !important; min-height:0 !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital:not(.sxb-vital--note) .sxb-vital__label { grid-row:1 !important; min-height:18px !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital:not(.sxb-vital--note) > .sxb-vital__value { grid-area:2 / 1 !important; position:static !important;
    display:flex !important; width:max-content !important; max-width:none !important; margin:0 0 4px !important; line-height:18px !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital:not(.sxb-vital--note) .sxb-vital__track,
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--muni .sxb-vital__head::after { grid-row:3 !important; position:relative !important; top:auto !important;
    left:auto !important; width:100% !important; margin:0 !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital:not(.sxb-vital--note) > .sxb-vital__acts { grid-area:4 / 1 !important; margin-top:0 !important; }
}
/* At 461-508 tall the head's fold is ~173px and the stacked cell's extra line put Repair and Rearm under it (960x461).
   Win the 14px back (and LEDGER's Draw sits 1px under its figure, so its foot clears the fold too): the word and figure rows close to their ink (15px), the track thins to 2px with the verbs 1px under it,
   and the credit plate above the readings loses 2px of padding top and bottom.
   Through 508 tall this also keeps Station/Bar HULL Insure above the fold at 960-1023 x 501-507 (it sat 3px under at 501). */
@media (min-width:960px) and (max-width:1023px) and (min-height:461px) and (max-height:508px) {
  ${P} .sxb-crown .sxb-vitals > .sxb-vital:not(.sxb-vital--note) .sxb-vital__label { min-height:15px !important; line-height:15px !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital:not(.sxb-vital--note) > .sxb-vital__value { margin:0 !important; padding-top:2px !important; line-height:15px !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital:not(.sxb-vital--note) .sxb-vital__track,
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--muni .sxb-vital__head::after { height:2px !important; margin:0 0 1px !important; }
  ${P} .sxb-crown .sxb-purse { padding-top:1px !important; padding-bottom:1px !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--note > .sxb-vital__acts { margin-top:1px !important; }
}
/* The same compact cell on the Market and Shipworks tabs at 509-640 tall, whose heads stay short (Market 195-220px,
   Shipworks 145px): stacked at full rhythm, HULL's Insure fell 4px under the fold at Market 1000x620 and only the top
   6px of Repair/Rearm showed on Shipworks. Station and Bar keep the full rhythm in their 40vh heads above 508. */
@media (min-width:960px) and (max-width:1023px) and (min-height:509px) and (max-height:640px) {
  ${P}:is(:has(#sx-panel > .sx-mkt), :has(#sx-panel > .sx-sw:not([hidden]))) .sxb-crown .sxb-vitals > .sxb-vital:not(.sxb-vital--note) .sxb-vital__label {
    min-height:15px !important; line-height:15px !important; }
  ${P}:is(:has(#sx-panel > .sx-mkt), :has(#sx-panel > .sx-sw:not([hidden]))) .sxb-crown .sxb-vitals > .sxb-vital:not(.sxb-vital--note) > .sxb-vital__value {
    margin:0 !important; padding-top:2px !important; line-height:15px !important; }
  ${P}:is(:has(#sx-panel > .sx-mkt), :has(#sx-panel > .sx-sw:not([hidden]))) .sxb-crown .sxb-vitals > .sxb-vital:not(.sxb-vital--note) .sxb-vital__track,
  ${P}:is(:has(#sx-panel > .sx-mkt), :has(#sx-panel > .sx-sw:not([hidden]))) .sxb-crown .sxb-vitals > .sxb-vital--muni .sxb-vital__head::after {
    height:2px !important; margin:0 0 1px !important; }
  ${P}:is(:has(#sx-panel > .sx-mkt), :has(#sx-panel > .sx-sw:not([hidden]))) .sxb-crown .sxb-purse { padding-top:1px !important; padding-bottom:1px !important; }
  ${P}:is(:has(#sx-panel > .sx-mkt), :has(#sx-panel > .sx-sw:not([hidden]))) .sxb-crown .sxb-vitals > .sxb-vital--note > .sxb-vital__acts { margin-top:1px !important; }
}
/* The head here is a 145-173px scrollport, so its fold cut the verbs (and the next step's sentence) mid-line.
   While more head lies below, its foot fades over the last 8px (resting verbs, 8px up at Market 960x540, stay at full contrast), driven by the head's own scroll; with no
   overflow the timeline is inactive and the head stays fully opaque. */
@property --sxb-head-foot { syntax:"<number>"; inherits:false; initial-value:1; }
@keyframes sxb-head-foot { from { --sxb-head-foot:.06; } 96% { --sxb-head-foot:.9; } to { --sxb-head-foot:1; } }
@supports (animation-timeline: scroll()) {
  @media (min-width:960px) and (max-width:1100px) and (min-height:461px) and (max-height:640px) {
    ${P} .sxb-berth.dp-frame__head {
      -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 8px), rgb(0 0 0 / var(--sxb-head-foot)) 100%) !important;
      mask-image:linear-gradient(180deg, #000 calc(100% - 8px), rgb(0 0 0 / var(--sxb-head-foot)) 100%) !important;
      animation:sxb-head-foot linear both; animation-timeline:scroll(self block); }
  }
}

/* 901-959 wide x 461-640 tall: the foot is still two rows here, so the head's 167px scrollport shows only the hull and
   ledger of the two-row crown grid. Put the five readings on ONE row, as 960+ does, trimmed to the ~530px crown: values go
   to 12px, the cells follow each reading's own ink, so FUEL, HOLD and MUNITIONS stand in the visible band. */
@media (min-width:901px) and (max-width:959px) and (min-height:461px) and (max-height:640px) {
  /* Same one-row densify as 960–1100: the ~530px crown is even tighter, so absolute side-by-side figures tangle.
     Stack fuel/hold/muni figures under their labels (651–800 pattern). */
  ${P} .sxb-crown .sxb-vitals { grid-template-columns:minmax(0,91fr) minmax(0,85fr) minmax(0,83fr) minmax(0,125fr) minmax(0,125fr) !important;
    grid-template-areas:"hull fuel hold note muni" !important; gap:4px 5px !important; }
  ${P} .sxb-crown .sxb-vital__head { column-gap:4px !important; }
  ${P} .sxb-crown .sxb-vital:not(.sxb-vital--note) .sxb-vital__value { font-size:12px !important; }
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--fuel, .sxb-vital--hold, .sxb-vital--muni) .sxb-vital__label {
    font-size:12px !important; letter-spacing:.02em !important; line-height:1.15 !important;
    max-width:100% !important; overflow:visible !important; text-overflow:unset !important; }
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--fuel, .sxb-vital--hold, .sxb-vital--muni) .sxb-vital__value {
    position:static !important; inset:auto !important; width:max-content !important; max-width:100% !important;
    display:inline-flex !important; flex-direction:row !important; align-items:baseline !important; gap:2px !important;
    margin:2px 0 0 !important; white-space:nowrap !important; }
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--fuel, .sxb-vital--hold, .sxb-vital--muni) .sxb-vital__value .orr-vnum,
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--fuel, .sxb-vital--hold, .sxb-vital--muni) .sxb-vital__value .orr-vden { font-size:12px !important; }
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--fuel, .sxb-vital--hold) .sxb-vital__head { min-height:0 !important; }
}

/* 901-1100 wide x 461-640 tall: the one-row crown gives each reading 80-115px, too narrow for a label and a right-hung
   figure on one line, so FUEL ran into 100, HOLD into 0 and MUNITIONS into 0. Each gauge stacks instead: label and bar,
   then the figure, then its key. The hull and ledger cells (with their keys) are still the tallest, so the row keeps its height. */
@media (min-width:901px) and (max-width:1100px) and (min-height:461px) and (max-height:640px) {
  ${P} .sxb-crown .sxb-vitals > .sxb-vital:not(.sxb-vital--note) { display:flex !important; flex-direction:column !important; align-items:stretch !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital:not(.sxb-vital--note) > .sxb-vital__head { order:0; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital:not(.sxb-vital--note) > .sxb-vital__value { order:1; position:static !important; align-self:flex-start !important;
    width:auto !important; margin:1px 0 3px !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital:not(.sxb-vital--note) > .sxb-vital__acts { order:3; }
}

/* ---- the ad-boards & station wire: sleek metallic comms ticker bar below the crown ------------ */
${P} .sx-adboard, ${P} .sx-adboard * { font-family:${UI} !important; font-size:13px !important; letter-spacing:0 !important;
  text-transform:none !important; color:rgb(${BONE} / .88) !important; }
${P} .sx-adboard .sx-adboard__k, ${P} .sxb-wire__lead { font-weight:700 !important; color:${ICE} !important; text-transform:uppercase !important;
  letter-spacing:.08em !important; }
${P} .sxb-berth > .sxb-signs, ${P} .sxb-wire { border:1px solid rgb(154 198 218 / .26) !important;
  background:linear-gradient(90deg, rgb(14 25 36 / .95), rgb(9 18 27 / .97)) !important;
  box-shadow:inset 3px 0 0 ${ICE}, inset 0 1px 0 rgb(208 238 250 / .10) !important;
  padding:5px 14px !important; border-radius:2px !important; }

/* ---- bottom facility control dock: tight single-row machined metal control deck --------------- */
${P} .sxb-ops, ${P} .sxb-rail { border:${LINE} !important; border-radius:2px !important;
  background:${GUNMETAL_BG} !important; box-shadow:${GUNMETAL_SHADOW} !important;
  padding:6px 12px !important; min-height:44px !important; align-items:center !important; }
${P} .sxb-ops .orr-stationrow__rule { display:none !important; }
${P} .sxb-ops .sx-dock__group--nav, ${P} .sxb-strip { counter-reset:sxdock; gap:0 6px !important; align-items:center !important; }
@media (min-width:901px) {
  ${P} .sx-tile__gloss { display:none !important; }
  ${P} .sxb-ops .sx-dock__group--nav { padding-top:0 !important; padding-bottom:0 !important; margin-bottom:0 !important; }
}
${P} .sx-dock { gap:0 !important; }
${P} .sx-dock :is(button, a), ${P} .sx-tile { text-transform:uppercase !important; letter-spacing:.05em !important;
  padding:7px 11px !important; min-height:34px !important; height:auto !important;
  border:1px solid rgb(154 198 218 / .26) !important; border-radius:2px !important;
  background:linear-gradient(180deg, rgb(22 35 46 / .94), rgb(12 20 29 / .97)) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .12), 0 1px 2px rgb(0 0 0 / .45) !important;
  clip-path:none !important; color:rgb(${BONE} / .84) !important; transition:border-color 120ms ease, background 120ms ease, color 120ms ease; }
${P} .sx-dock :is(button, a):is(:hover, :focus-visible), ${P} .sx-tile:is(:hover, :focus-visible) {
  color:#fff !important; border-color:rgb(158 220 233 / .62) !important;
  background:linear-gradient(180deg, rgb(30 49 64 / .96), rgb(16 28 40 / .98)) !important; outline:none !important; }
${P} .sx-dock :is(button, a)[aria-selected="true"], ${P} .sx-dock :is(button, a)[aria-current], ${P} .sx-dock :is(button, a).is-active,
${P} .sx-tile.is-active {
  color:#fff1cf !important; border-color:rgb(230 202 143 / .85) !important;
  background:linear-gradient(180deg, rgb(224 181 94 / .25) 0%, rgb(224 181 94 / .08) 100%) !important;
  box-shadow:inset 0 2px 0 ${GOLD}, inset 0 1px 0 rgb(255 241 207 / .20), 0 0 12px rgb(224 181 94 / .20) !important; }
${P} .sx-tile__num { display:inline-grid !important; place-items:center !important; min-width:18px !important; height:18px !important;
  padding:0 4px !important; border:${KEYCAP_BORDER} !important; border-radius:2px !important;
  background:${KEYCAP_BG} !important; box-shadow:${KEYCAP_SHADOW} !important;
  font-family:${NUM} !important; font-size:12px !important; font-weight:600 !important; color:${ICE} !important; }
${P} .sx-tile.is-active .sx-tile__num { color:#f3d178 !important; border-color:${GOLD} !important;
  background:linear-gradient(180deg, rgb(64 49 22 / .95), rgb(34 25 11 / .98)) !important; }
${P} .sx-tile__name, ${P} .sx-tile__label { font-weight:700 !important; letter-spacing:.05em !important; }
${P} .sx-tile__stat, ${P} .sx-tile__badge { font-family:${NUM} !important; font-size:12px !important; font-weight:600 !important;
  color:${ICE} !important; }
${P} .sx-tile.is-active :is(.sx-tile__stat, .sx-tile__badge) { color:#f3d178 !important; }
/* Neutralize styles/station.css onboarding bead on .sx-tile[data-dp-next]::before (which hijacked
   position:absolute; left:50%; translate:-50% 0 over the Market tab label) and replace it with a
   clean cyan terminal highlight border/glow. */
${P} .sxb-ops .sx-tile[data-dp-next]::before,
${P} .sxb-ops .sx-tile[data-dp-next="1"]::before {
  content:none !important; display:none !important; position:static !important;
  left:auto !important; top:auto !important; right:auto !important; bottom:auto !important;
  transform:none !important; translate:none !important; width:auto !important; height:auto !important;
  margin:0 !important; }
${P} .sxb-ops .sx-tile[data-dp-next]::after,
${P} .sxb-ops .sx-tile[data-dp-next="1"]::after { display:none !important; }
${P} .sxb-ops .sx-tile[data-dp-next]:not([aria-selected="true"]):not(.is-active) {
  color:#edf2ef !important; border-color:rgb(158 220 233 / .64) !important;
  box-shadow:inset 0 2px 0 rgb(158 220 233 / .82), inset 0 1px 0 rgb(208 238 250 / .16), 0 0 10px rgb(158 220 233 / .20) !important; }
@media (min-width:1360px) {
  ${P} .sxb-ops .sx-dock__group--nav > li { counter-increment:sxdock; }
  ${P} .sxb-ops .sx-tile::before,
  ${P} .sxb-ops .sx-tile[data-dp-next]::before,
  ${P} .sxb-ops .sx-tile[data-dp-next="1"]::before {
    content:counter(sxdock) !important; display:inline-grid !important; place-items:center !important;
    position:static !important; left:auto !important; top:auto !important; right:auto !important; bottom:auto !important;
    transform:none !important; translate:none !important; width:auto !important; flex:none !important;
    min-width:18px !important; height:18px !important; margin:0 6px 0 0 !important; padding:0 4px !important;
    border:${KEYCAP_BORDER} !important; border-radius:2px !important; background:${KEYCAP_BG} !important;
    box-shadow:${KEYCAP_SHADOW} !important; font-family:${NUM} !important; font-size:12px !important; line-height:16px !important;
    font-weight:600 !important; color:${ICE} !important; }
  ${P} .sxb-ops .sx-tile:is([aria-selected="true"], .is-active)::before,
  ${P} .sxb-ops .sx-tile[data-dp-next]:is([aria-selected="true"], .is-active)::before,
  ${P} .sxb-ops .sx-tile[data-dp-next="1"]:is([aria-selected="true"], .is-active)::before {
    color:#f3d178 !important; border-color:${GOLD} !important;
    background:linear-gradient(180deg, rgb(64 49 22 / .95), rgb(34 25 11 / .98)) !important; }
}
${P} .sxb-help, ${P} .sx-comms__toggle { text-transform:uppercase !important; letter-spacing:.05em !important; font-size:12px !important;
  font-weight:600 !important; font-family:${UI} !important; min-height:34px !important; padding:0 12px !important;
  border:${KEYCAP_BORDER} !important; border-radius:2px !important; background:${KEYCAP_BG} !important;
  box-shadow:${KEYCAP_SHADOW} !important; color:rgb(${BONE} / .9) !important; clip-path:none !important; }
${P} .sxb-help:is(:hover, :focus-visible), ${P} .sx-comms__toggle:is(:hover, :focus-visible) {
  border-color:${GOLD} !important; color:#fff1cf !important; }
${P} .sxb-ops > .sx-comms, ${P} .sxb-ops > .sxb-launch-seat { align-self:center !important; margin-top:0 !important; }
${P} .sxb-launch { clip-path:polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px)) !important;
  border:1px solid ${GOLD} !important; border-radius:2px !important;
  background:linear-gradient(180deg, rgb(224 181 94 / .28) 0%, rgb(224 181 94 / .12) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(255 241 207 / .26), 0 4px 12px rgb(0 0 0 / .48) !important;
  color:#fff1cf !important; padding:6px 14px !important; min-height:34px !important; }
${P} .sxb-launch:is(:hover, :focus-visible) {
  background:linear-gradient(180deg, rgb(224 181 94 / .40) 0%, rgb(224 181 94 / .18) 100%) !important;
  border-color:#fff1cf !important; color:#fff !important; }
${P} .sxb-launch__copy { flex-direction:row !important; align-items:baseline !important; gap:8px !important; }
${P} .sxb-launch__label { font-family:${TITLE} !important; font-weight:700 !important; letter-spacing:.08em !important; color:#fff1cf !important; }
/* Under 581 wide the orbital sheet hides Help's word and the Standard sheet hides its icon, so the ruled key beside
   Comms painted as an empty box: put the word back so both foot keys read as labelled controls. */
@media (max-width:580px) {
  ${P} .sxb-ops .sxb-help > span { display:inline !important; }
}
/* 901–1199 wide (641+ tall under 1101): the seven tabs (~850px at this sheet's 14px key padding) were capped at 58–64vw and shrunk
   further by flex, so LEDGER (and at 901–1100 BAR, at 901–960 even FACTIONS) ran on under COMMS · HELP and UNDOCK, which
   took their clicks: a click on LEDGER at 1101×720 opened Help. The keys close up (6px padding, 6px gaps), COMMS drops its
   48px lead, and the rail keeps its words' width: rail, COMMS · HELP and UNDOCK stand on one row, and
   where they cannot, the keys step down a row instead of standing on the tabs. (901–1100 × 461–640 already gives the
   rail its own row, above.) */
@media (min-width:901px) and (max-width:1100px) and (min-height:641px), (min-width:1101px) and (max-width:1199px) and (min-height:461px) {
  ${P} .sxb-ops { flex-wrap:wrap !important; column-gap:12px !important; row-gap:4px !important; }
  ${P} .sxb-ops > .of-facility-rail { flex:0 0 auto !important; min-width:max-content !important; max-width:none !important; }
  ${P} .sxb-ops .sx-dock__group--nav { gap:0 5px !important; }
  ${P} .sxb-ops .sx-dock :is(button, a) { padding-left:6px !important; padding-right:6px !important; }
  ${P} .sxb-ops > .sx-comms { margin-left:0 !important; }
}
/* …and under 1080 the tab glyphs step aside (the words still name each tab), so the foot keeps one row down to ~960 and
   the Market's Buy key keeps its place above it */
@media (min-width:901px) and (max-width:1079px) and (min-height:641px) {
  ${P} .sxb-ops .sx-tile .dust-tab-glyph { display:none !important; }
}
/* …and at 901–959 the row is still ~45px over (rail 559 + COMMS · HELP 137 + UNDOCK 161 + gaps against an 837px foot), so the
   foot wrapped to two rows and the Market panel lost a row: its Buy key and price dial fell under the foot. The keys close
   up again (3px padding, 4px gaps) and the foot keeps one row to 901 and down to the band's 641px-tall edge. */
@media (min-width:901px) and (max-width:959px) and (min-height:641px) {
  ${P} .sxb-ops { column-gap:6px !important; }
  ${P} .sxb-ops .sx-dock__group--nav { gap:0 4px !important; }
  ${P} .sxb-ops .sx-dock :is(button, a) { padding-left:3px !important; padding-right:3px !important; }
}
${P} .sxb-launch__state { font-family:${NUM} !important; font-size:12px !important; letter-spacing:.04em !important; color:#f3d178 !important; }

/* Bound the facility rail through the entire 651–900 band. Its own horizontal scrollport
   keeps later tabs reachable without painting beneath Comms, Help or Undock. */
@media (min-width:651px) and (max-width:900px) and (max-height:800px) {
  ${P} .sxb-ops { flex-wrap:wrap !important; gap:2px 8px !important; }
  ${P} .sxb-ops > .of-facility-rail { flex:0 0 100% !important; width:100% !important; min-width:0 !important; max-width:100% !important;
    overflow-x:auto !important; overflow-y:hidden !important; scrollbar-width:thin; }
  ${P} .sxb-ops .of-facility-rail :is(.sxb-ops__dock, .sx-dock, .sx-dock__group--nav) { width:max-content !important; min-width:100% !important; max-width:none !important; }
  ${P} .sxb-ops .sx-dock__group--nav { flex-wrap:nowrap !important; gap:0 3px !important; }
  ${P} .sxb-ops .sx-dock :is(button, a) { padding-left:5px !important; padding-right:5px !important; }
  ${P} .sxb-ops .sx-tile .dust-tab-glyph { display:none !important; }
  ${P} .sxb-ops > .sx-comms { order:2 !important; flex:0 0 auto !important; flex-direction:row !important; gap:4px !important; margin:0 !important; }
  ${P} .sxb-ops > .sxb-launch-seat { order:3 !important; flex:0 0 auto !important; margin-left:auto !important; }
}
/* The 461–800 tall window cannot spare the 57px two-line UNDOCK on a row of its own: UNDOCK and its READY line sit side by
   side and COMMS · HELP centre on them, so the second row is the keys' own 32px instead of ~57px under a 20px gap. */
@media (min-width:651px) and (max-width:900px) and (min-height:461px) and (max-height:800px) {
  ${P} .sxb-ops > .sx-comms { align-self:center !important; margin-top:0 !important; }
  ${P} .sxb-ops > .sxb-launch-seat { align-self:center !important; margin-top:0 !important; }
  ${P} .sxb-launch__copy { flex-direction:row !important; align-items:baseline !important; gap:10px !important; }
  /* the tabs' one-line gloss painted nothing here but its 26px of reserved padding still held a blank band under the keys, a gap above COMMS · HELP */
  ${P} .sxb-ops .sx-tile__gloss { display:none !important; }
  ${P} .sxb-ops .sx-dock__group--nav { padding-top:0 !important; padding-bottom:0 !important; }
}
/* 801–900 wide × 461–800 tall: the head stacked four bands (name, a 232px purse card over the vitals strip, which
   wrapped LEDGER and MUNITIONS to a second row, then the mechanic's note, the next step and both signs), ~520px of head,
   so at 801×461 the tab body was 0px tall and at 860×720 ~77px. The purse rides the name's row beside the palette key,
   the five readings stand on ONE ruled row with their keys inline, the note and the next step share a row, and the
   signs run on one clamped line (folded away at ≤540 tall, as the Market does at 960×540): the head is ~234px. */
@media (min-width:801px) and (max-width:900px) and (min-height:461px) and (max-height:800px) {
  ${P} .sxb-berth.dp-frame__head { position:relative !important; grid-template-columns:minmax(0, 1fr) minmax(0, 1fr) !important;
    grid-template-areas:"title purse" "crown crown" "tape handoff" "signs signs" !important;
    grid-template-rows:max-content max-content max-content max-content !important; align-content:start !important;
    column-gap:12px !important; row-gap:6px !important; max-height:none !important; }
  ${P} .sxb-berth.dp-frame__head > .so-command-trigger { position:absolute !important; top:0 !important; right:0 !important; }
  ${P} .sxb-berth.dp-frame__head > .sxb-crown { display:contents !important; }
  ${P} .sxb-berth.dp-frame__head > .sxb-crown .sxb-purse { grid-area:purse !important; align-self:start !important; justify-self:end !important;
    min-width:0 !important; width:max-content !important; grid-template-columns:auto auto !important; grid-template-areas:"label value" "delta delta" !important;
    align-items:center !important; gap:0 10px !important; margin:0 94px 0 0 !important; padding:3px 10px !important; }
  ${P} .sxb-crown .sxb-purse__label { width:auto !important; border:0 !important; padding:0 !important; }
  ${P} .sxb-crown .sxb-purse__value { font-size:22px !important; line-height:1.1 !important; }
  ${P} .sxb-berth.dp-frame__head > .sxb-crown .sxb-vitals { grid-area:crown !important; display:grid !important;
    grid-template-columns:minmax(0,190fr) minmax(0,105fr) minmax(0,100fr) minmax(0,132fr) minmax(0,130fr) !important;
    grid-template-areas:"hull fuel hold note muni" !important; gap:4px 14px !important; margin:0 !important; padding:6px 12px 7px !important;
    width:auto !important; max-width:none !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital { width:auto !important; min-width:0 !important; max-width:100% !important; box-sizing:border-box !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--hull { grid-area:hull !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--fuel { grid-area:fuel !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--hold { grid-area:hold !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--note { grid-area:note !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--muni { grid-area:muni !important; }
  ${P} .sxb-crown .sxb-vital__acts { flex-direction:row !important; flex-wrap:nowrap !important; align-items:center !important; justify-content:flex-start !important;
    margin:4px 0 0 !important; gap:4px !important; }
  ${P} .sxb-crown .sxb-vital__acts > button { min-height:24px !important; padding:1px 6px !important; }
  ${P} .sxb-crown .sxb-vital--note, ${P} .sxb-crown .sxb-vital--note .sxb-vital__value { text-align:left !important; align-items:flex-start !important; }
  ${P} .sxb-crown .sxb-vital--note .sxb-vital__value { margin:0 !important; white-space:nowrap !important; }
  ${P} .sxb-berth.dp-frame__head > .sxb-tape { grid-area:tape !important; margin:0 !important; padding:0 !important; }
  ${P} .sxb-berth.dp-frame__head > .sxb-handoff { grid-area:handoff !important; margin:0 !important; padding:0 !important; }
  ${P} .sxb-berth.dp-frame__head > .sxb-signs { grid-area:signs !important; display:flex !important; gap:0 32px !important; padding-top:4px !important; }
  ${P} .sxb-signs > .sx-adboard { flex:1 1 0 !important; min-width:0 !important; margin:0 !important; padding:0 !important;
    display:-webkit-box !important; -webkit-box-orient:vertical; -webkit-line-clamp:1; overflow:hidden !important; }
  ${P} .sxb-signs .sx-adboard__text { display:inline !important; margin:0 0 0 8px !important; }
}
@media (min-width:801px) and (max-width:900px) and (min-height:461px) and (max-height:540px) {
  ${P} .sxb-berth.dp-frame__head > .sxb-signs { display:none !important; }
  ${P} .sxb-berth.dp-frame__head {
    min-height:0 !important; max-height:150px !important; overflow-y:auto !important; overflow-x:hidden !important; scrollbar-width:thin; }
}

@media (min-width:651px) and (max-width:800px) and (min-height:461px) and (max-height:800px) {
  ${P} .sxb-berth.dp-frame__head { position:relative !important; grid-template-columns:minmax(0, 1.15fr) minmax(0, 0.85fr) !important;
    grid-template-areas:"title purse" "crown crown" "tape handoff" "signs signs" !important;
    grid-template-rows:max-content max-content max-content max-content !important; align-content:start !important;
    column-gap:10px !important; row-gap:5px !important; max-height:none !important; }
  ${P} .sxb-berth .so-station-title .dp-title__name,
  ${P} .sxb-berth .sxb-berth__name { font-size:26px !important; line-height:1.05 !important; }
  ${P} .sxb-berth .so-station-title .sxb-berth__ident { letter-spacing:0 !important;
    white-space:normal !important; overflow:visible !important; text-overflow:clip !important;
    overflow-wrap:anywhere; line-height:1.3 !important; }
  ${P} .sxb-berth .so-station-title { width:100% !important; max-width:100% !important; min-width:0 !important; }
  ${P} .sxb-berth .so-station-title .dp-title__name { min-width:0; max-width:100%; white-space:normal !important;
    overflow-wrap:anywhere; }
  ${P} .sxb-berth.dp-frame__head > .so-command-trigger { position:absolute !important; top:0 !important; right:0 !important; }
  ${P} .sxb-berth.dp-frame__head > .sxb-crown { display:contents !important; }
  ${P} .sxb-berth.dp-frame__head > .sxb-crown .sxb-purse { grid-area:purse !important; align-self:start !important; justify-self:end !important;
    min-width:0 !important; width:max-content !important; grid-template-columns:auto auto !important; grid-template-areas:"label value" "delta delta" !important;
    align-items:center !important; gap:0 8px !important; margin:0 92px 0 0 !important; padding:3px 9px !important; }
  ${P} .sxb-crown .sxb-purse__label { width:auto !important; border:0 !important; padding:0 !important; }
  ${P} .sxb-crown .sxb-purse__value { font-size:20px !important; line-height:1.1 !important; }
  ${P} .sxb-berth.dp-frame__head > .sxb-crown .sxb-vitals { grid-area:crown !important; display:grid !important;
    grid-template-columns:minmax(0,150fr) minmax(0,108fr) minmax(0,102fr) minmax(0,110fr) minmax(0,130fr) !important;
    grid-template-areas:"hull fuel hold note muni" !important; gap:3px 8px !important; margin:0 !important; padding:5px 10px 6px !important;
    width:auto !important; max-width:none !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital { width:auto !important; min-width:0 !important; max-width:100% !important; box-sizing:border-box !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--hull { grid-area:hull !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--fuel { grid-area:fuel !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--hold { grid-area:hold !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--note { grid-area:note !important; }
  ${P} .sxb-crown .sxb-vitals > .sxb-vital--muni { grid-area:muni !important; }
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--fuel, .sxb-vital--hold, .sxb-vital--muni) .sxb-vital__label {
    font-size:12px !important; letter-spacing:.02em !important; line-height:1.15 !important;
    max-width:100% !important; overflow:visible !important; text-overflow:unset !important; }
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--fuel, .sxb-vital--hold, .sxb-vital--muni) .sxb-vital__value {
    position:static !important; inset:auto !important; width:max-content !important; max-width:100% !important;
    display:inline-flex !important; flex-direction:row !important; align-items:baseline !important; gap:2px !important;
    margin:2px 0 0 !important; white-space:nowrap !important; }
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--fuel, .sxb-vital--hold, .sxb-vital--muni) .sxb-vital__value,
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--fuel, .sxb-vital--hold, .sxb-vital--muni) .sxb-vital__value .orr-vnum,
  ${P} .sxb-crown .sxb-vitals > :is(.sxb-vital--fuel, .sxb-vital--hold, .sxb-vital--muni) .sxb-vital__value .orr-vden { font-size:12px !important; }
  ${P} .sxb-crown .sxb-vital__acts { flex-direction:row !important; flex-wrap:wrap !important; align-items:center !important; justify-content:flex-start !important;
    max-width:100% !important; margin:3px 0 0 !important; gap:3px !important; }
  ${P} .sxb-crown .sxb-vital__acts > button { min-height:22px !important; padding:1px 5px !important;
    max-width:100% !important; box-sizing:border-box !important; flex-wrap:wrap !important; white-space:normal !important; }
  ${P} .sxb-crown .sxb-vital--note, ${P} .sxb-crown .sxb-vital--note .sxb-vital__value { text-align:left !important; align-items:flex-start !important; }
  ${P} .sxb-crown .sxb-vital--note .sxb-vital__value { margin:0 !important; white-space:nowrap !important; }
  ${P} .sxb-berth.dp-frame__head > .sxb-tape { grid-area:tape !important; margin:0 !important; padding:0 !important; }
  ${P} .sxb-berth.dp-frame__head > .sxb-handoff { grid-area:handoff !important; margin:0 !important; padding:0 !important; }
  ${P} .sxb-berth.dp-frame__head > .sxb-signs { grid-area:signs !important; display:flex !important; gap:0 24px !important; padding-top:3px !important; }
  ${P} .sxb-signs > .sx-adboard { flex:1 1 0 !important; min-width:0 !important; margin:0 !important; padding:0 !important;
    display:-webkit-box !important; -webkit-box-orient:vertical; -webkit-line-clamp:1; overflow:hidden !important; }
  ${P} .sxb-signs .sx-adboard__text { display:inline !important; margin:0 0 0 8px !important; }
}
@media (min-width:651px) and (max-width:800px) and (min-height:461px) and (max-height:540px) {
  ${P} .sxb-berth.dp-frame__head > .sxb-signs { display:none !important; }
  ${P} .sxb-berth.dp-frame__head {
    min-height:0 !important; max-height:150px !important; overflow-y:auto !important; overflow-x:hidden !important; scrollbar-width:thin; }
}

/* ==== SHARED RECESSED VISOR GLASS BAYS (Left-Hand Rails & Right-Hand Workspaces) ============ */
${P} :is(.sx-mkt__list, .sx-mkt__stage, .sx-mkt__book, .sx-ct__sheet, .sx-ind__chamber, .sx-bar__hang, .sx-bar__stage, .sx-bar-stage, .sx-bar-cast, .sx-ldg-main, .sx-sw__inspect) {
  box-sizing:border-box; border:${VISOR_BAY_BORDER} !important; border-radius:2px !important;
  background:${VISOR_BAY_BG} !important; box-shadow:${VISOR_BAY_SHADOW} !important; }

/* ==== MARKET ================================================================================ */
/* Both left commodity register and right order/telemetry stage sit in recessed visor glass bays */
${P} .sx-mkt__list { padding:12px 14px 8px !important; }
${P} .sx-mkt__stage { padding:14px 18px !important; }
/* the register hides the ladder's cursor marker (the Standard's own hover/selection carries it) —
   but only the cursor: the MORE foot cue (scrollExtent.js) is the overflow affordance and stays */
${P} .sx-mkt .orr-extent:not(.orr-extent--foot) { display:none !important; }
${P} .sx-mkt :is(.k-caps, .fh-legend, .sx-mkt-drivers__k) { font-family:${UI} !important; font-stretch:100% !important;
  font-variation-settings:normal !important; font-weight:700 !important; font-size:12px !important; letter-spacing:.06em !important;
  text-transform:uppercase !important; color:${ICE} !important; }
${P} .sx-mkt .sx-mkt-browser { position:relative; }
${P} .sx-mkt .sx-mkt-browser__mode { display:flex; align-items:baseline; gap:8px; margin:0 0 10px !important; padding:4px 0 8px !important;
  border-bottom:1px solid rgb(158 220 233 / .24); }

/* filters: machined metallic filter switches, gold-amber when active */
${P} .sx-mkt .sx-mkt-browser__filters { display:flex !important; flex-wrap:wrap !important; gap:6px !important; margin:0 0 10px !important; padding:0 !important; background:none !important; }
${P} .sx-mkt .sx-mkt-browser__filters > li { padding:0 !important; margin:0 !important; background:none !important; background-image:none !important; }
${P} .sx-mkt .sx-mkt-browser__filters > li::before, ${P} .sx-mkt .sx-mkt-browser__filters > li::after { content:none !important; display:none !important; }
${P} .sx-mkt .sx-mkt-filter { display:inline-flex !important; align-items:center; justify-content:center; min-height:28px !important; height:auto !important;
  width:auto !important; padding:0 10px !important; border:1px solid rgb(154 198 218 / .30) !important; border-radius:2px !important;
  background:linear-gradient(180deg, rgb(22 36 48 / .92), rgb(12 21 30 / .96)) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .12) !important;
  clip-path:none !important; font-family:${UI} !important; font-size:12px !important; font-weight:700 !important; letter-spacing:.05em !important;
  text-transform:uppercase !important; color:rgb(${BONE} / .88) !important; cursor:pointer; }
${P} .sx-mkt .sx-mkt-filter::before, ${P} .sx-mkt .sx-mkt-filter::after { content:none !important; display:none !important; }
${P} .sx-mkt .sx-mkt-filter:is(:hover, :focus-visible) { border-color:rgb(158 220 233 / .68) !important; background:rgb(28 48 64 / .95) !important; color:#fff !important; outline:none !important; }
${P} .sx-mkt .sx-mkt-filter:focus-visible { outline:2px solid rgb(${AMBER}) !important; outline-offset:2px !important; }
${P} .sx-mkt .sx-mkt-filter:is([aria-pressed="true"], [aria-selected="true"], [aria-current], .is-active, .is-on, .is-selected, .on) {
  border-color:rgb(230 202 143 / .82) !important;
  background:linear-gradient(180deg, rgb(224 181 94 / .26) 0%, rgb(224 181 94 / .10) 100%) !important;
  box-shadow:inset 0 2px 0 ${GOLD} !important; color:#fff1cf !important; }
${P} .sx-mkt .orr-mkt-find { position:static !important; display:block !important; width:100% !important; margin:0 0 10px !important; padding:0 !important;
  background:none !important; background-image:none !important; }
${P} .sx-mkt .sx-mkt-search { box-sizing:border-box !important; width:100% !important; height:32px !important; padding:0 10px !important;
  border:1px solid rgb(154 198 218 / .34) !important; border-radius:2px !important;
  background:linear-gradient(180deg, rgb(6 14 21 / .92), rgb(10 21 31 / .95)) !important;
  box-shadow:inset 0 1px 3px rgb(0 0 0 / .65) !important;
  font-family:${UI} !important; font-size:13px !important; letter-spacing:0 !important; color:rgb(${BONE}) !important; }
${P} .sx-mkt .sx-mkt-search:focus { border-color:${GOLD} !important; box-shadow:inset 0 1px 3px rgb(0 0 0 / .65), 0 0 8px rgb(224 181 94 / .24) !important; outline:none !important; }
${P} .sx-mkt .orr-mkt-find__cursor { display:none !important; }

/* the commodity table: high-contrast data register with tabular figures */
${P} .sx-mkt .k-table-wrap, ${P} .sx-mkt .sx-mkt-browser__rail { margin:0 !important; padding:0 !important; max-width:100% !important;
  box-sizing:border-box !important; border:0 !important; background:none !important; background-image:none !important; overflow-x:hidden !important; }
${P} .sx-mkt .sx-mkt-browser__rail[data-overflow="1"] { padding-bottom:28px !important; }
${P} .sx-mkt .sx-mkt-table { display:table !important; width:100% !important; table-layout:fixed; border-collapse:collapse !important; border-spacing:0 !important;
  background:none !important; background-image:none !important; }
${P} .sx-mkt .sx-mkt-table thead { display:table-header-group !important; background:none !important; }
${P} .sx-mkt .sx-mkt-table tbody { display:table-row-group !important; background:none !important; background-image:none !important; }
${P} .sx-mkt .sx-mkt-table tr { display:table-row !important; background:none !important; }
${P} .sx-mkt .sx-mkt-table :is(th, td) { display:table-cell !important; vertical-align:middle; box-sizing:border-box; }
${P} .sx-mkt .sx-mkt-table :is(th, td):nth-child(5) { display:none !important; }
${P} .sx-mkt .sx-mkt-table th { padding:7px 8px !important; border:0 !important;
  border-bottom:1px solid rgb(158 220 233 / .38) !important;
  background:linear-gradient(180deg, rgb(18 35 49 / .88), rgb(11 23 34 / .94)) !important;
  text-align:left; text-transform:uppercase !important; font-size:12px !important; font-weight:700 !important;
  letter-spacing:.07em !important; color:${ICE} !important; white-space:nowrap; }
${P} .sx-mkt .sx-mkt-table th:first-child { padding-left:10px !important; width:auto; }
${P} .sx-mkt .sx-mkt-table th:nth-child(2) { width:90px; }
${P} .sx-mkt .sx-mkt-table th:nth-child(3) { width:54px; }
${P} .sx-mkt .sx-mkt-table th:nth-child(4) { width:64px; }
${P} .sx-mkt .sx-mkt-table :is(th, td).k-num { text-align:right !important; }
${P} .sx-mkt .sx-mkt-row td { height:30px !important; padding:0 8px !important; border:0 !important;
  border-bottom:1px solid rgb(154 198 218 / .14) !important; background:none !important;
  font-family:${NUM} !important; font-size:13px !important; letter-spacing:0 !important; font-variant-numeric:tabular-nums; color:rgb(${BONE} / .92) !important;
  box-shadow:none !important; white-space:nowrap; }
${P} .sx-mkt .sx-mkt-row td.sx-mkt-row__name { padding-left:10px !important; font-family:${UI} !important; font-size:14px !important; font-weight:600; text-align:left;
  white-space:normal !important; overflow:visible !important; text-overflow:clip !important; color:rgb(${BONE}) !important; }
${P} .sx-mkt .sx-mkt-row td.sx-mkt-row__price { color:#e8f6fb !important; font-weight:600; }
${P} .sx-mkt .sx-mkt-row__tr { display:inline-block; margin-left:6px; font-family:${NUM} !important; font-size:12px !important; letter-spacing:0 !important; }
${P} .sx-mkt .sx-mkt-row td.sx-mkt-row__stock, ${P} .sx-mkt .sx-mkt-row td.sx-mkt-row__sell { color:rgb(${BONE} / .82) !important; }
${P} .sx-mkt .sx-mkt-row:hover td { background:rgb(158 220 233 / .08) !important; }

/* the stage: telemetry readouts & order console */
${P} .sx-mkt__stage :is(span, label, p, summary, small, li, button, div, strong, b) { text-transform:none !important; letter-spacing:.01em !important; }
${P} .sx-mkt__stage :is(span, label, summary, small, button) { font-family:${UI} !important; font-stretch:100% !important; font-variation-settings:normal !important; }
${P} .sx-mkt__stage :is(.k-hero__n, .orr-counter, .orr-counter *, .orr-mkt-totalsuf, .sx-qty__in, .orr-mkt-holdarc__t b, .sx-mkt-instrument__y, .sx-mkt-instrument__avg, .k-row__num) {
  font-family:${NUM} !important; font-variation-settings:normal !important; letter-spacing:0 !important; }
${P} .sx-mkt .sx-mkt-cat-inline { text-transform:uppercase !important; letter-spacing:.06em !important; color:${ICE} !important; font-weight:700 !important; }
${P} .sx-mkt .sx-mkt__hero .k-hero__n { font-family:${NUM} !important; font-variation-settings:normal !important; font-weight:600 !important;
  font-size:46px !important; letter-spacing:0 !important; line-height:1 !important; color:#f3d178 !important;
  text-shadow:0 0 18px rgb(224 181 94 / .22); }
${P} .sx-mkt .sx-mkt__hero .k-hero__w { font-family:${UI} !important; font-size:13px !important; letter-spacing:.04em !important; text-transform:uppercase !important; color:${ICE} !important; }
${P} .sx-mkt .sx-mkt-drivers__v { font-family:${UI} !important; font-size:14px !important; font-weight:600 !important; }
${P} .sx-mkt .sx-mkt-instrument :is(.sx-mkt-instrument__y, .sx-mkt-instrument__avg) { font-family:${NUM} !important; font-size:12px !important; letter-spacing:0 !important; }
${P} .sx-mkt .orr-mkt-demand svg { display:none !important; }
${P} .sx-mkt__stage :is(.so-trade-total > span:first-child, .sx-qty__k, .sx-mkt-readouts__item > span:first-child) {
  color:${ICE} !important; font-size:12px !important; font-weight:700 !important; text-transform:uppercase !important; letter-spacing:.06em !important; }

/* trade console & quantity stepper: machined stepper controls & chamfered execution keys */
${P} .sx-mkt .sx-trade { grid-template-columns:max-content minmax(0, 1fr) !important; align-items:start !important; column-gap:28px !important; }
${P} .sx-mkt .sx-qty { display:flex !important; flex-wrap:wrap !important; align-items:center !important; gap:6px !important; width:276px !important; height:auto !important;
  min-height:0 !important; padding:0 !important; position:relative !important; }
${P} .sx-mkt .sx-qty .orr-qdial { display:none !important; }
${P} .sx-mkt .sx-qty__k { flex:0 0 100% !important; position:static !important; transform:none !important; margin:0 0 4px !important; text-align:left !important; width:auto !important; }
${P} .sx-mkt .sx-qty__in { order:2; position:static !important; transform:none !important; width:68px !important; height:36px !important; box-sizing:border-box !important;
  text-align:center !important; font-size:20px !important; font-weight:600 !important; line-height:36px !important; padding:0 !important;
  border:1px solid rgb(158 220 233 / .42) !important; border-radius:2px !important;
  background:linear-gradient(180deg, rgb(6 14 21 / .95), rgb(11 23 34 / .95)) !important;
  box-shadow:inset 0 1px 4px rgb(0 0 0 / .7) !important; color:#fff1cf !important; }
${P} .sx-mkt .sx-qty__in:focus { border-color:${GOLD} !important; outline:none !important; }
${P} .sx-mkt .sx-qty__words { display:contents !important; }
${P} .sx-mkt .sx-qty__words > li { display:contents !important; }
${P} .sx-mkt .sx-qty__words > li:nth-child(1) > button { order:1; }
${P} .sx-mkt .sx-qty__words > li:nth-child(2) > button { order:3; }
${P} .sx-mkt .sx-qty__words > li:nth-child(3) > button { order:4; }
${P} .sx-mkt :is(.sx-qty__b, .sx-qty__max) { display:inline-flex !important; align-items:center; justify-content:center;
  min-height:36px !important; height:36px !important; padding:0 11px !important;
  border:${KEYCAP_BORDER} !important; border-radius:2px !important; background:${KEYCAP_BG} !important;
  box-shadow:${KEYCAP_SHADOW} !important; clip-path:none !important;
  font-family:${UI} !important; font-size:13px !important; font-weight:600 !important; letter-spacing:.02em !important; text-transform:none !important;
  color:rgb(${BONE} / .95) !important; cursor:pointer; width:auto !important; }
${P} .sx-mkt :is(.sx-qty__b, .sx-qty__max):is(:hover, :focus-visible) {
  border-color:${GOLD} !important; background:linear-gradient(180deg, rgb(38 56 72 / .96), rgb(20 34 46 / .98)) !important; color:#fff1cf !important; outline:none !important; }
${P} .sx-mkt .sx-trade__words > li > .sx-trade__go,
${P} .sx-mkt .sx-trade__go.orr-lampkey {
  position:relative !important; isolation:isolate;
  display:inline-flex !important; align-items:center; justify-content:center;
  min-height:38px !important; height:38px !important; padding:0 20px !important;
  clip-path:polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px)) !important;
  border:1px solid ${GOLD} !important; border-radius:2px !important;
  background:linear-gradient(180deg, rgb(224 181 94 / .34) 0%, rgb(224 181 94 / .16) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(255 241 207 / .28), 0 4px 12px rgb(0 0 0 / .48) !important;
  font-family:${UI} !important; font-size:15px !important; font-weight:700 !important; letter-spacing:.02em !important;
  text-transform:none !important; color:#fff1cf !important; text-shadow:none !important; cursor:pointer; }
${P} .sx-mkt .sx-trade__go.orr-lampkey::before,
${P} .sx-mkt .sx-trade__go.orr-lampkey::after {
  content:none !important; display:none !important; }
${P} .sx-mkt .sx-trade__words > li > .sx-trade__go:not([data-go]),
${P} .sx-mkt .sx-trade__words > li:not(:first-child) > .sx-trade__go:not(.orr-lampkey) {
  clip-path:none !important;
  border:1px solid rgb(158 220 233 / .55) !important;
  background:linear-gradient(180deg, rgb(32 58 76 / .88) 0%, rgb(16 32 45 / .94) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .16) !important;
  color:#e8f6fb !important; }
${P} .sx-mkt .sx-trade__words > li > .sx-trade__go:not([data-go])::after {
  content:none !important; display:none !important; }
${P} .sx-mkt .sx-trade__go.orr-lampkey:not(:disabled):is(:hover, :focus-visible, :active),
${P} .sx-mkt .sx-trade__words > li > .sx-trade__go:not(:disabled):is(:hover, :focus-visible) {
  border-color:#fff1cf !important;
  background:linear-gradient(180deg, rgb(224 181 94 / .48) 0%, rgb(224 181 94 / .24) 100%) !important;
  color:#fff !important; outline:none !important; }
${P} .sx-mkt :is(.sx-qty__b, .sx-qty__max, .sx-trade__go):focus-visible { outline:2px solid rgb(${AMBER}) !important; outline-offset:2px !important; }
${P} .sx-mkt :is(.sx-qty__b, .sx-qty__max, .sx-trade__go):disabled,
${P} .sx-mkt .sx-trade__go.orr-lampkey:disabled {
  opacity:.46 !important; cursor:not-allowed !important;
  border-color:rgb(154 198 218 / .26) !important;
  background:linear-gradient(180deg, rgb(22 35 46 / .78), rgb(12 20 29 / .86)) !important;
  color:rgb(${BONE} / .62) !important; }
${P} .sx-mkt .so-trade-breakdown > summary { border:0 !important; background:none !important; min-height:24px !important; padding:2px 0 !important; font-size:13px !important;
  font-weight:600 !important; text-decoration:underline; text-underline-offset:3px; color:${ICE} !important; cursor:pointer; }
${P} .sx-mkt .orr-mkt-holdarc svg { display:none !important; }
${P} .sx-mkt .sx-trade__words { display:flex !important; align-items:center !important; gap:10px !important; list-style:none; margin:8px 0 0 !important; padding:0 !important; }
${P} .sx-mkt .sx-trade__words > li { display:block !important; }

/* the decision options (repair / fly damaged): machined action cards with consequence underneath */
${P} .sx-mkt .sx-decision__opt { display:block !important; width:100%; box-sizing:border-box; text-align:left !important; margin:0 0 8px !important; padding:9px 12px !important;
  border:1px solid rgb(154 198 218 / .30) !important; border-radius:2px !important;
  background:linear-gradient(180deg, rgb(18 33 46 / .90), rgb(11 21 31 / .95)) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .12) !important;
  clip-path:none !important; height:auto !important; min-height:0 !important; cursor:pointer; }
${P} .sx-mkt .sx-decision__opt::before, ${P} .sx-mkt .sx-decision__opt::after { content:none !important; display:none !important; }
${P} .sx-mkt .sx-decision__opt:is(:hover, :focus-visible) { border-color:${GOLD} !important; background:rgb(224 181 94 / .14) !important; outline:none !important; }
${P} .sx-mkt .sx-decision__opt .k-row__name { display:block !important; font-family:${UI} !important; font-size:14px !important; font-weight:600 !important; letter-spacing:.01em !important;
  text-transform:none !important; white-space:normal !important; overflow:visible !important; text-overflow:clip !important; color:rgb(${BONE}) !important; }
${P} .sx-mkt .sx-decision__opt .k-row__sub { display:block !important; margin:2px 0 0 !important; font-family:${UI} !important; font-size:13px !important; line-height:1.35 !important;
  white-space:normal !important; overflow:visible !important; text-overflow:clip !important; color:rgb(${BONE} / .78) !important; }

/* ui-polish-498: the stepper row was a fixed 276px, but at 1280x720 the trade plate is only ~216px wide, so Max
   ran past the plate's right edge onto its border. The row now shrinks to the plate (max 276px): Max rides the
   Quantity caption's line at the right, and Fewer / input / More share the row under it. Phones and the
   901-1100 short band keep their own stepper grids. */
@media (min-width:1101px) and (min-height:641px) {
  ${P} .sx-mkt .sx-trade { grid-template-columns:minmax(0, max-content) minmax(0, 1fr) !important; }
  ${P} .sx-mkt .sx-qty { width:auto !important; max-width:276px !important; min-width:0 !important; row-gap:4px !important; }
  ${P} .sx-mkt .sx-qty > .sx-qty__k { flex:1 1 auto !important; order:0; margin:0 !important; }
  ${P} .sx-mkt .sx-qty__words > li:nth-child(3) > .sx-qty__max { order:0; flex:none !important; height:24px !important; min-height:24px !important; padding:0 10px !important; font-size:12px !important; }
  ${P} .sx-mkt .sx-qty__words > li:not(:nth-child(3)) > .sx-qty__b { flex:1 1 0 !important; min-width:0 !important; padding:0 8px !important; }
  ${P} .sx-mkt .sx-qty__words > li:nth-child(1) > .sx-qty__b { order:2; }
  ${P} .sx-mkt .sx-qty > .sx-qty__in { flex:0 0 68px !important; order:3; }
  ${P} .sx-mkt .sx-qty__words > li:nth-child(2) > .sx-qty__b { order:4; }
  /* the caption line ends at Max, so the input row starts on a fresh line */
  ${P} .sx-mkt .sx-qty::after { content:""; order:1; flex:0 0 100%; height:0; }
}

/* Narrow portrait berths keep the register and selected trade side-by-side. Keep the stage as its
   single scroll surface, and size the dial/action strip to the shallow body above the fixed tabs. */
@media (max-width:650px) and (min-height:601px), (min-width:651px) and (max-width:900px) and (min-height:461px) and (max-height:800px) {
  ${P} .sx-mkt .sx-mkt-browser { display:grid !important; height:100% !important; min-height:0 !important; grid-template-columns:minmax(0, 1fr) !important;
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
}
@media (max-width:650px) and (min-height:601px) {
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
    grid-template-rows:auto auto auto auto auto !important;
    grid-template-areas:"dial" "total" "verb" "note" "breakdown" !important;
    justify-items:stretch !important; align-items:start !important; column-gap:0 !important; row-gap:6px !important; }
  /* One compact grid owns every quantity control. The older absolute-positioned dial
     put three words in a 108px row; font and viewport changes made them collide. */
  ${P} .sx-mkt .sx-trade > .sx-qty { display:grid !important; position:relative !important;
    grid-template-columns:repeat(2, minmax(0, 1fr)) !important;
    grid-template-areas:"label label" "value max" "fewer more" !important;
    width:100% !important; max-width:100% !important; height:auto !important; gap:4px !important; box-sizing:border-box !important; }
  ${P} .sx-mkt .sx-qty .sx-qty__k { grid-area:label !important; position:static !important;
    width:auto !important; margin:0 !important; text-align:left !important; line-height:16px !important; }
  ${P} .sx-mkt .sx-qty .sx-qty__in { grid-area:value !important; position:static !important;
    width:100% !important; min-width:0 !important; height:40px !important; line-height:40px !important; font-size:20px !important; }
  ${P} .sx-mkt .sx-qty .sx-qty__words, ${P} .sx-mkt .sx-qty .sx-qty__words > li { display:contents !important; }
  ${P} .sx-mkt .sx-qty__words > li:nth-child(1) > button { grid-area:fewer !important; }
  ${P} .sx-mkt .sx-qty__words > li:nth-child(2) > button { grid-area:more !important; }
  ${P} .sx-mkt .sx-qty__words > li:nth-child(3) > button { grid-area:max !important; }
  ${P} .sx-mkt .sx-qty :is(.sx-qty__b, .sx-qty__max) { width:100% !important; min-width:0 !important;
    min-height:40px !important; height:40px !important; box-sizing:border-box !important;
    padding:0 4px !important; font-size:12px !important; letter-spacing:0 !important; white-space:nowrap !important; }
  ${P} .sx-mkt .sx-qty :is(.sx-qty__b, .sx-qty__max)::before,
  ${P} .sx-mkt .sx-qty :is(.sx-qty__b, .sx-qty__max)::after { content:none !important; display:none !important; }
  ${P} .sx-mkt .so-trade-total { height:17px !important; min-height:17px !important; line-height:16px !important; }
  ${P} .sx-mkt .sx-trade__words { width:100% !important; flex-wrap:nowrap !important; justify-content:space-between !important;
    gap:0 6px !important; margin:0 !important; }
}

/* At phone widths the list has the screen's width (it stands over the trade, see CLEAN EXCHANGE),
   so each commodity is one line: name, buy, sell. Stock and held yield (held shows in the bag). */
@media (max-width:480px) and (min-height:601px) {
  ${P} .sx-mkt .sx-mkt-table, ${P} .sx-mkt .sx-mkt-table > :is(thead, tbody) {
    display:block !important; width:100% !important; table-layout:auto !important; }
  ${P} .sx-mkt .sx-mkt-table tr { display:grid !important; width:100% !important;
    grid-template-columns:minmax(0, 1fr) 52px 52px !important; column-gap:8px !important; row-gap:0 !important;
    align-items:center !important; padding:0 !important; }
  ${P} .sx-mkt .sx-mkt-table :is(th, td) { display:block !important; width:auto !important; min-width:0 !important;
    height:auto !important; block-size:auto !important; box-sizing:border-box !important; padding:0 2px !important; }
  ${P} .sx-mkt .sx-mkt-table :is(th, td):nth-child(1) { grid-column:1 !important; text-align:left !important; }
  ${P} .sx-mkt .sx-mkt-table :is(th, td):nth-child(2) { grid-column:2 !important; text-align:right !important; }
  ${P} .sx-mkt .sx-mkt-table :is(th, td):nth-child(3) { grid-column:3 !important; text-align:right !important; }
  ${P} .sx-mkt .sx-mkt-table :is(th, td):nth-child(n+4) { display:none !important; }
  ${P} .sx-mkt .sx-mkt-table thead th { font-size:12px !important; line-height:14px !important; letter-spacing:.04em !important;
    white-space:nowrap !important; }
  ${P} .sx-mkt .sx-mkt-table .sx-mkt-row > .sx-mkt-row__name:first-child { grid-column:1 !important;
    padding-left:4px !important; padding-right:0 !important; font-size:14px !important; line-height:18px !important;
    white-space:nowrap !important; overflow:hidden !important; text-overflow:ellipsis !important; }
  ${P} .sx-mkt .sx-mkt-table .sx-mkt-row { padding:6px 0 !important; align-content:center !important; }
  ${P} .sx-mkt .sx-mkt-table .sx-mkt-row td { line-height:18px !important; white-space:nowrap !important; }
  ${P} .sx-mkt .sx-mkt-table .sx-mkt-row td:is(.sx-mkt-row__price, .sx-mkt-row__sell) {
    overflow:visible !important; text-overflow:clip !important; font-variant-numeric:tabular-nums !important; }
  ${P} .sx-mkt .sx-mkt-table .sx-mkt-row__tr { margin-left:2px !important; }
  /* the thumbnail squeezed to a sliver at this width read as a stray bracket: the name stands alone */
  ${P} .sx-mkt .sx-mkt-table .sx-mkt-row :is(.sx-mkt-row__commodity, .sx-mkt-row__thumb) { display:none !important; }
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
    width:auto !important; min-width:0 !important; height:auto !important; margin:0 !important; overflow-x:auto !important; overflow-y:hidden !important;
    scrollbar-width:none; padding-right:24px !important;
    -webkit-mask-image:linear-gradient(90deg, #000 calc(100% - 40px), transparent calc(100% - 10px)) !important;
    mask-image:linear-gradient(90deg, #000 calc(100% - 40px), transparent calc(100% - 10px)) !important; }
  /* the row holds five of the eight families; the fifth stopped on a hard cut that read as a broken
     chip. It fades at the right edge instead, like the narrow bands' family strip, and the last
     family scrolls clear of the fade (ui-polish-429) */
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

/* Numeric columns size to their actual readings in the narrow register; a fixed 44px
   stock cell clipped both the heading and three-digit amounts. */
@media (min-width:481px) and (max-width:650px) and (min-height:601px), (min-width:651px) and (max-width:900px) and (min-height:461px) and (max-height:800px) {
  ${P} .sx-mkt .sx-mkt-table { table-layout:auto !important; width:100% !important; }
  ${P} .sx-mkt .sx-mkt-table :is(th, td) { padding-left:4px !important; padding-right:4px !important; }
  ${P} .sx-mkt .sx-mkt-table :is(th, td):is(:nth-child(2), :nth-child(3), :nth-child(4)) { width:1% !important; white-space:nowrap !important; }
  ${P} .sx-mkt .sx-mkt-table .sx-mkt-row__name { min-width:0 !important; max-width:none !important; white-space:normal !important; }
}

/* Market at 651–900 × 461–800: the Standard 276px Fewer/qty/More/Max strip is wider than the
   compact berth's ~146px console column beside the analysis (marketLayouts), so Max hung ~57px
   past the glass and BUY/SELL clipped the right edge once the densified head left a real body.
   Same fix as 901–1100 × 461–640: keep the stepper inside the console and stack quote/actions. */
@media (min-width:651px) and (max-width:900px) and (min-height:461px) and (max-height:800px) {
  ${P} .sx-mkt__console { min-width:0 !important; max-width:100% !important; overflow-x:hidden !important; overflow-y:auto !important; }
  ${P} .sx-mkt .sx-trade { grid-template-columns:minmax(0,1fr) !important; grid-template-rows:auto auto auto auto auto !important;
    grid-template-areas:"dial" "total" "note" "verb" "breakdown" !important; column-gap:0 !important; row-gap:4px !important; }
  ${P} .sx-mkt .sx-qty { width:100% !important; max-width:100% !important; box-sizing:border-box !important; }
  ${P} .sx-mkt .sx-qty__words, ${P} .sx-mkt .sx-trade__words { flex-wrap:wrap !important; justify-content:flex-start !important; gap:6px !important; }
}

/* The portrait Market shares one compact console through 650px. On short phones its
   trade controls remain inside a local scrollport; action and quote labels keep whole words. */
@media (max-width:650px) and (min-height:601px) {
  ${P} .sx-mkt__console { box-sizing:border-box !important; min-width:0 !important; min-height:0 !important;
    max-width:100% !important; max-height:100% !important; overflow-x:hidden !important; overflow-y:auto !important; }
  ${P} .sx-mkt .sx-trade { grid-template-columns:minmax(0, 1fr) !important; column-gap:0 !important; min-width:0 !important; }
  ${P} .sx-mkt .sx-trade__words { width:100% !important; gap:6px !important; }
  ${P} .sx-mkt .sx-trade__words > li { flex:1 1 0 !important; min-width:0 !important; }
  ${P} .sx-mkt .sx-trade__words > li > .sx-trade__go { width:100% !important; height:36px !important; min-height:36px !important;
    box-sizing:border-box !important; padding:0 6px !important; justify-content:center !important; white-space:nowrap !important;
    word-break:normal !important; overflow-wrap:normal !important; hyphens:none !important; }
  ${P} .sx-mkt .so-trade-breakdown, ${P} .sx-mkt .so-trade-breakdown *,
  ${P} .sx-mkt__console :is(.k-row__name, .k-row__sub) { word-break:normal !important; overflow-wrap:normal !important; hyphens:none !important; }
}

/* Short portrait windows keep the transaction above the fold. Seven facilities fit
   two rows once decorative glyphs and the repeated tab gloss yield their space. */
@media (max-width:650px) and (min-height:601px) and (max-height:720px) {
  ${P} .sxb-ops .sx-dock__group--nav { display:grid !important; grid-template-columns:repeat(4, minmax(0, 1fr)) !important;
    gap:2px 4px !important; width:100% !important; padding:0 !important; }
  ${P} .sxb-ops .sx-dock :is(button, a) { box-sizing:border-box !important; min-width:0 !important; width:100% !important;
    min-height:32px !important; padding:4px 2px !important; font-size:12px !important; letter-spacing:0 !important; }
  ${P} .sxb-ops :is(.dust-tab-glyph, .sx-tile__gloss) { display:none !important; }
}

/* ==== BAR =================================================================================== */
${P} .sx-bar__hang { box-sizing:border-box; border:${VISOR_BAY_BORDER} !important; border-radius:2px !important;
  background:${VISOR_BAY_BG} !important; box-shadow:${VISOR_BAY_SHADOW} !important; padding:12px 14px !important; }
${P} .sx-bar__stage { box-sizing:border-box; border:${VISOR_BAY_BORDER} !important; border-radius:2px !important;
  background:${VISOR_BAY_BG} !important; box-shadow:${VISOR_BAY_SHADOW} !important; padding:14px 18px !important; }
${P} .sx-bar__hang > .orr-extent:not(.orr-extent--foot), ${P} .sx-bar__hang > .orr-extent::before,
${P} .sx-bar__hang::before, ${P} .sx-bar__hang::after, ${P} .sx-bar__rows::before, ${P} .sx-bar__rows::after,
${P} .sx-bar .sx-lead__rows::before, ${P} .sx-bar .sx-lead__rows::after, ${P} .sx-bar .sx-talk__choices::before, ${P} .sx-bar .sx-talk__choices::after { display:none !important; content:none !important; }
${P} .sx-bar :is(.sx-bar__rows, .sx-lead__rows, .sx-intel__rows, .sx-bar__foot, .sx-talk__choices) { background:none !important; background-image:none !important; }
${P} .sx-bar :is(.k-caps, .fh-legend, .sx-intel__head) { font-family:${UI} !important; font-stretch:100% !important; font-variation-settings:normal !important; font-weight:700 !important;
  font-size:12px !important; letter-spacing:.07em !important; text-transform:uppercase !important; color:${ICE} !important;
  margin:0 0 6px !important; padding:0 0 4px 0 !important; border-bottom:1px solid rgb(158 220 233 / .24); }
${P} .sx-bar .sx-bar__leads > .k-caps { margin-top:10px !important; }
${P} .sx-bar :is(.sx-bar__keys, .sx-talk__keys) { text-transform:none !important; letter-spacing:.01em !important; border:0 !important; padding:0 !important; margin:3px 0 0 !important;
  font-weight:500 !important; color:rgb(${BONE} / .64) !important; }
${P} .sx-bar .sx-bar__rows { display:flex !important; flex-direction:column !important; gap:4px !important; list-style:none; margin:0 0 4px !important; padding:0 !important; }
${P} .sx-bar .sx-bar-row { display:block !important; width:100% !important; box-sizing:border-box; text-align:left !important; height:auto !important; min-height:0 !important;
  padding:7px 11px !important; border:1px solid rgb(154 198 218 / .22) !important; border-radius:2px !important;
  background:linear-gradient(160deg, rgb(14 29 42 / .82), rgb(9 19 28 / .88)) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .08) !important; clip-path:none !important;
  font-family:${UI} !important; font-size:14px !important; font-weight:600 !important; line-height:1.25 !important; letter-spacing:0 !important; text-transform:none !important;
  color:rgb(${BONE}) !important; white-space:normal !important; cursor:pointer; }
${P} .sx-bar .sx-bar-row::before, ${P} .sx-bar .sx-bar-row::after { content:none !important; display:none !important; }
${P} .sx-bar .sx-bar-row:hover { background:linear-gradient(160deg, rgb(20 42 58 / .92), rgb(12 26 38 / .95)) !important; border-color:rgb(158 220 233 / .52) !important; }
${P} .sx-bar .sx-bar-row.is-active {
  border-color:rgb(230 202 143 / .78) !important;
  background:linear-gradient(90deg, rgb(224 181 94 / .20) 0%, rgb(224 181 94 / .06) 65%, rgb(14 29 42 / .92) 100%) !important;
  box-shadow:inset 3px 0 0 ${GOLD}, inset 0 1px 0 rgb(255 241 207 / .22), 0 4px 14px rgb(0 0 0 / .42) !important;
  color:#fff1cf !important; }
${P} .sx-bar .sx-bar-row:focus-visible { outline:2px solid rgb(${AMBER}) !important; outline-offset:2px !important; }
${P} .sx-bar .sx-bar-row__role { display:block !important; margin:2px 0 0 !important; max-width:none !important; white-space:normal !important; overflow:visible !important; text-overflow:clip !important;
  font-family:${UI} !important; font-stretch:100% !important; font-variation-settings:normal !important; font-size:12.5px !important; font-weight:500 !important; letter-spacing:.01em !important;
  text-transform:none !important; color:rgb(190 220 235 / .78) !important; }
${P} .sx-bar .sx-bar-row.is-active .sx-bar-row__role { color:#f3d178 !important; }
${P} .sx-bar .sx-lead { display:grid !important; grid-template-columns:minmax(0, 1fr) auto !important; align-items:center !important; column-gap:10px !important;
  padding:6px 8px !important; border:1px solid rgb(154 198 218 / .18) !important; border-radius:2px !important;
  background:rgb(10 21 31 / .62) !important; margin-bottom:4px !important; }
${P} .sx-bar .sx-lead::before, ${P} .sx-bar .sx-lead::after { content:none !important; display:none !important; }
${P} .sx-bar .sx-lead__body { display:flex !important; flex-direction:row !important; align-items:baseline !important; justify-content:space-between !important; gap:8px !important; min-width:0 !important; }
${P} .sx-bar .sx-lead__t { flex:1 1 auto; min-width:0 !important; white-space:normal !important; overflow:visible !important; text-overflow:clip !important;
  font-family:${UI} !important; font-size:13px !important; font-weight:600 !important; line-height:1.25 !important; letter-spacing:0 !important; color:rgb(${BONE}) !important; }
${P} .sx-bar .sx-lead__s { flex:none !important; white-space:nowrap !important; visibility:visible !important; font-family:${NUM} !important; font-size:12.5px !important; letter-spacing:0 !important; color:${ICE} !important; text-transform:none !important; }
${P} .sx-bar .sx-lead:is(:hover, :focus-within) .sx-lead__s { visibility:visible !important; }
${P} .sx-bar .sx-lead__go { position:static !important; inset:auto !important; left:auto !important; right:auto !important; top:auto !important; bottom:auto !important;
  transform:none !important; opacity:1 !important; pointer-events:auto !important; visibility:visible !important; flex:none !important;
  display:inline-flex !important; align-items:center; justify-content:center; height:24px !important; padding:0 9px !important;
  border:${KEYCAP_BORDER} !important; border-radius:2px !important; background:${KEYCAP_BG} !important;
  box-shadow:${KEYCAP_SHADOW} !important;
  font-family:${UI} !important; font-size:12px !important; font-weight:700 !important; letter-spacing:.05em !important; text-transform:uppercase !important; color:${ICE} !important; cursor:pointer; }
${P} .sx-bar .sx-lead__go::before, ${P} .sx-bar .sx-lead__go::after { content:none !important; display:none !important; }
${P} .sx-bar .sx-lead__go:is(:hover, :focus-visible) { border-color:${GOLD} !important; background:rgb(224 181 94 / .18) !important; color:#fff1cf !important; }
${P} .sx-bar .sx-bar__foot { display:flex !important; flex-wrap:wrap; gap:8px !important; padding:6px 0 0 !important; margin:6px 0 0 !important; list-style:none; }
${P} .sx-bar .sx-bar__foot button { display:inline-flex !important; align-items:center; gap:4px; height:28px !important; padding:0 10px !important;
  border:${KEYCAP_BORDER} !important; border-radius:2px !important; background:${KEYCAP_BG} !important; box-shadow:${KEYCAP_SHADOW} !important;
  font-family:${UI} !important; font-size:12.5px !important; font-weight:600 !important; letter-spacing:.03em !important; text-transform:uppercase !important; color:rgb(${BONE} / .92) !important; cursor:pointer; }
${P} .sx-bar .sx-bar__foot button::before, ${P} .sx-bar .sx-bar__foot button::after { content:none !important; display:none !important; }
${P} .sx-bar :is(.sx-intel) :is(.k-row__name, .k-row__sub, small) { font-family:${UI} !important; font-size:12.5px !important; letter-spacing:.01em !important; text-transform:none !important; }
${P} .sx-bar .sx-intel { padding:4px 0 !important; }

${P} .sx-bar .orr-bardial, ${P} .sx-bar .orr-voicearc { display:none !important; }
${P} .sx-bar .sx-talk__memory, ${P} .sx-bar .sx-talk__reply, ${P} .sx-bar .sx-talk__choices { max-width:min(520px, 100%) !important; }
${P} .sx-bar .sx-talk__choices { display:flex !important; flex-direction:column !important; gap:8px !important; list-style:none; margin:14px 0 6px !important; padding:0 !important; counter-reset:sfch; }
${P} .sx-bar .sx-talk__choices > li { display:block !important; counter-increment:sfch; background:none !important; background-image:none !important; }
${P} .sx-bar .sx-talk__choices > li::before, ${P} .sx-bar .sx-talk__choices > li::after { content:none !important; display:none !important; }
${P} .sx-bar .sx-choice { position:relative; display:block !important; width:100% !important; box-sizing:border-box; text-align:left !important; height:auto !important; min-height:42px !important;
  padding:10px 14px 10px 46px !important; border:1px solid rgb(154 198 218 / .34) !important; border-radius:2px !important;
  background:linear-gradient(160deg, rgb(13 28 40 / .94), rgb(8 18 27 / .97)) !important;
  box-shadow:inset 3px 0 0 rgb(158 220 233 / .45), inset 0 1px 0 rgb(208 238 250 / .12), 0 4px 12px rgb(0 0 0 / .45) !important;
  clip-path:none !important; font-family:${UI} !important; font-size:15px !important; font-weight:600 !important; letter-spacing:0 !important; text-transform:none !important; color:rgb(${BONE}) !important; cursor:pointer; }
${P} .sx-bar .sx-choice::before { content:counter(sfch) !important; display:grid !important; place-items:center; position:absolute !important; left:12px !important; top:50% !important; bottom:auto !important; width:22px !important; height:22px !important;
  margin:-11px 0 0 !important; padding:0 !important; transform:none !important; translate:none !important; scale:none !important;
  background:${KEYCAP_BG} !important; border:${KEYCAP_BORDER} !important; box-shadow:${KEYCAP_SHADOW} !important; border-radius:2px !important;
  font-family:${NUM} !important; font-size:12px !important; line-height:20px !important; font-weight:700 !important; color:${ICE} !important; }
${P} .sx-bar .sx-choice::after { content:none !important; display:none !important; }
/* ui-polish-443: a reply carries its price and standing in one line ("File the Lost Ledger with Concord
   (3,500 cr · Concord +14 · Meridian −…)"), and the button kit's nowrap cut it at the 480px measure
   with no ellipsis (ui-bench station-bar-story-buyer, 960×540 and 1280×720). Replies wrap instead. */
${P} .sx-bar .sx-choice { white-space:normal !important; overflow-wrap:anywhere; text-wrap:pretty; line-height:1.3 !important; }
${P} .sx-bar .sx-choice:is(:hover, :focus-visible) {
  border-color:rgb(230 202 143 / .82) !important;
  background:linear-gradient(90deg, rgb(224 181 94 / .20) 0%, rgb(224 181 94 / .06) 65%, rgb(14 29 42 / .94) 100%) !important;
  box-shadow:inset 3px 0 0 ${GOLD}, inset 0 1px 0 rgb(255 241 207 / .22), 0 4px 14px rgb(0 0 0 / .48) !important;
  color:#fff1cf !important; outline:none !important; }
${P} .sx-bar .sx-choice:is(:hover, :focus-visible)::before {
  border-color:${GOLD} !important; color:#f3d178 !important;
  background:linear-gradient(180deg, rgb(64 49 22 / .95), rgb(34 25 11 / .98)) !important; }
${P} .sx-bar .sx-choice:focus-visible { outline:2px solid rgb(${AMBER}) !important; outline-offset:2px !important; }
${P} .sx-bar .sx-choice:disabled { opacity:.45; cursor:not-allowed; }
/* ui-polish-494: on a phone the reply list shrink-wrapped to its longest reply (230px of a 366px stage at 390×844),
   so the numbered keys stood as a narrow ragged column under the full-width contact card. They take the stage's width. */
@media (max-width:650px) {
  ${P} .sx-bar .sx-talk__choices { width:100% !important; align-self:stretch !important; box-sizing:border-box; }
}

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
/* Bar on short desktop windows (≥901 wide, ≤800 tall): the stage is ~280px at 1280×720 and ~200px at
   960×540, and three 44px replies under the speaker plate ran past it, so the third (or second) reply
   stood cut under the tab rail. The replies close up to 36px rows 6px apart and sit 8px under the
   plate, so the whole set reads inside the stage (ui-polish-430) */
@media (min-width:901px) and (max-height:800px) {
  ${P} .sx-bar .sx-talk__choices { gap:6px !important; margin:8px 0 0 !important; }
  ${P} .sx-bar .sx-choice { min-height:36px !important; padding-top:7px !important; padding-bottom:7px !important; }
}

/* ==== CONCOURSE (SCREENS-1-STATION Part A) ================================================== */
/* Calm arrival page over the lit 3D berth: hides the dense dashboard header and redundant rail
   so the station name, character line, one news line, service bar, and five doors breathe. */
${PA}[data-operation="concourse"] {
  grid-template-areas:"body" "foot" !important;
  grid-template-rows:minmax(0, 1fr) max-content !important;
  row-gap:10px !important;
}
${PA}[data-operation="concourse"] .sxb-berth.dp-frame__head {
  display:none !important;
}
${PA}[data-operation="concourse"] .dp-frame__body--station,
${PA}[data-operation="concourse"] .sx-screen__body {
  background:none !important; border:0 !important; box-shadow:none !important;
  padding:0 !important; min-height:0 !important; height:100% !important; overflow:visible !important;
}
${PA}[data-operation="concourse"] .sxb-ops > .of-facility-rail {
  display:none !important;
}
${PA}[data-operation="concourse"] .sxb-ops {
  justify-content:space-between !important;
  background:linear-gradient(180deg, rgb(14 23 32 / .82), rgb(8 14 21 / .92)) !important;
}
${PA} .sx-concourse {
  box-sizing:border-box;
  display:flex; flex-direction:column; gap:10px;
  height:100%; min-height:0;
  padding:4px 0 2px;
  font-family:${UI}; color:rgb(${BONE});
}
${PA} .sx-cc__hero {
  display:flex; flex-wrap:wrap; align-items:flex-start; justify-content:space-between; gap:14px 24px;
  padding:14px 20px;
  border:${VISOR_BAY_BORDER}; border-left:3px solid #f2b950; border-radius:2px;
  background:
    linear-gradient(90deg, #f2b950 0 36px, rgb(158 220 233 / .45) 36px 180px, rgb(158 220 233 / .12) 180px 100%) top left / 100% 2px no-repeat,
    linear-gradient(155deg, rgb(10 22 33 / .88) 0%, rgb(6 14 22 / .82) 100%);
  box-shadow:${VISOR_BAY_SHADOW};
}
${PA} .sx-cc__identity { flex:1 1 420px; min-width:0; }
${PA} .sx-cc__eyebrow {
  margin:0 0 4px;
  font-family:${UI}; font-size:12px; font-weight:700; letter-spacing:.09em; text-transform:uppercase;
  color:${ICE};
}
${PA} .sx-cc__eyebrow .sf-entity-link { color:${ICE}; text-decoration:none; border-bottom:1px dotted rgb(158 220 233 / .45); }
${PA} .sx-cc__eyebrow .sf-entity-link:is(:hover, :focus-visible) { color:#fff1cf; border-bottom-color:${GOLD}; }
${PA} .sx-cc__name {
  margin:0;
  font-family:${TITLE}; font-size:clamp(26px, 2.8vw, 38px); font-weight:700; line-height:1.08;
  letter-spacing:.01em; color:#f4f7f5;
}
${PA} .sx-cc__name .sf-entity-link { color:inherit; text-decoration:none; border-bottom:0; }
${PA} .sx-cc__note {
  margin:6px 0 0; max-width:68ch;
  font-family:${UI}; font-size:14px; font-weight:500; line-height:1.4;
  text-transform:none !important; letter-spacing:.01em !important;
  color:rgb(${BONE} / .86);
}
${PA} .sx-cc__purse {
  flex:0 0 auto; display:flex; flex-direction:column; align-items:flex-end; gap:6px;
  padding:8px 14px;
  border:1px solid rgb(230 202 143 / .38); border-radius:2px;
  background:linear-gradient(135deg, rgb(224 181 94 / .14) 0%, rgb(10 21 31 / .90) 60%);
}
${PA} .sx-cc__credits { display:flex; align-items:baseline; gap:10px; }
${PA} .sx-cc__credits-k {
  font-family:${UI}; font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
  color:${GOLD};
}
${PA} .sx-cc__credits-v {
  font-family:${NUM}; font-size:24px; font-weight:600; line-height:1.1; font-variant-numeric:tabular-nums;
  color:#fff1cf;
}
${PA} .sx-cc__credits-unit {
  font-family:${UI}; font-size:12px; font-weight:700; letter-spacing:.06em; color:${ICE}; margin-right:6px;
}
${PA} .sx-cc__vitals {
  display:flex; flex-wrap:wrap; gap:6px 14px;
  font-family:${NUM}; font-size:12.5px; color:rgb(${BONE} / .78);
}
${PA} .sx-cc__vital b { color:#edf2ef; font-weight:600; }
${PA} .sx-cc__vital.is-warn b { color:#f2b950; }

/* Single news line */
${PA} .sx-cc__news {
  display:flex; align-items:center; gap:12px; min-height:36px; padding:7px 14px;
  border:1px solid rgb(154 198 218 / .24); border-left:3px solid ${ICE}; border-radius:2px;
  background:linear-gradient(90deg, rgb(12 24 35 / .86), rgb(7 16 24 / .80));
}
${PA} .sx-cc__news[data-priority="ambient"] {
  border-color:rgb(154 198 218 / .16); border-left-color:rgb(158 220 233 / .40);
  background:linear-gradient(90deg, rgb(10 20 29 / .72), rgb(7 15 22 / .66));
}
${PA} .sx-cc__news[data-priority="urgent"] {
  border-color:rgb(255 113 89 / .55); border-left-color:#ff7159;
  background:linear-gradient(90deg, rgb(52 18 18 / .88), rgb(18 14 20 / .86));
}
${PA} .sx-cc__news[data-priority="high"] {
  border-color:rgb(230 202 143 / .45); border-left-color:#f2b950;
}
${PA} .sx-cc__news-tag {
  flex:none; font-family:${UI}; font-size:12px; font-weight:700; letter-spacing:.07em; text-transform:uppercase;
  color:${ICE}; white-space:nowrap;
}
${PA} .sx-cc__news[data-priority="ambient"] .sx-cc__news-tag { color:rgb(158 220 233 / .70); }
${PA} .sx-cc__news[data-priority="urgent"] .sx-cc__news-tag { color:#ff9d8a; }
${PA} .sx-cc__news[data-priority="high"] .sx-cc__news-tag { color:#f3d178; }
${PA} .sx-cc__news-text {
  flex:1 1 auto; min-width:0; margin:0;
  font-family:${UI}; font-size:13px; line-height:1.35; color:rgb(${BONE} / .90);
}
${PA} .sx-cc__news[data-priority="ambient"] .sx-cc__news-text { color:rgb(${BONE} / .72); }
${PA} .sx-cc__news-go {
  flex:none; min-height:28px; padding:0 12px;
  border:${KEYCAP_BORDER}; border-radius:2px; background:${KEYCAP_BG};
  font-family:${UI}; font-size:12px; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
  color:#fff1cf; cursor:pointer;
}
${PA} .sx-cc__news-go:is(:hover, :focus-visible) { border-color:${GOLD}; outline:none; }

/* Open middle window over the 3D berth art */
${PA} .sx-cc__spacer { flex:1 1 24px; min-height:12px; }

/* Lower concourse deck: optional 1-card teaching, service strip, and the 5 doors */
${PA} .sx-cc__lower {
  flex:none; display:flex; flex-direction:column; gap:10px;
}

/* First-visit teaching: one card at a time, in flow, never covering a door */
${PA} .sx-cc__teach {
  display:flex; align-items:center; gap:12px; padding:8px 14px;
  max-width:720px;
  border:1px solid rgb(158 220 233 / .38); border-left:3px solid ${ICE}; border-radius:2px;
  background:linear-gradient(90deg, rgb(14 31 44 / .92), rgb(9 19 29 / .90));
  box-shadow:0 6px 18px rgb(0 0 0 / .44);
}
${PA} .sx-cc__teach-go {
  flex:1 1 auto; min-width:0; display:flex; flex-wrap:wrap; align-items:baseline; gap:2px 10px;
  padding:0; border:0; background:none; text-align:left; cursor:pointer; color:rgb(${BONE});
}
${PA} .sx-cc__teach-step {
  font-family:${NUM}; font-size:12px; font-weight:600; color:${ICE}; white-space:nowrap;
}
${PA} .sx-cc__teach-title {
  font-family:${UI}; font-size:13.5px; font-weight:700; color:#fff1cf;
}
${PA} .sx-cc__teach-text {
  flex:1 0 100%; font-family:${UI}; font-size:13px; line-height:1.35; color:rgb(${BONE} / .84);
}
${PA} .sx-cc__teach-x {
  flex:none; min-height:28px; padding:0 10px;
  border:${LINE}; border-radius:2px; background:${KEYCAP_BG};
  font-family:${UI}; font-size:12px; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
  color:${ICE}; cursor:pointer;
}
${PA} .sx-cc__teach-x:is(:hover, :focus-visible),
${PA} .sx-cc__teach-go:is(:hover, :focus-visible) { color:#fff1cf; border-color:${GOLD}; outline:none; }

/* One Service Card: primary "Service ship · N cr" button + 3 itemised controls beneath */
${PA} .sx-cc__service {
  display:flex; flex-direction:column; gap:8px; padding:12px 16px;
  border:${VISOR_BAY_BORDER}; border-radius:2px;
  background:linear-gradient(160deg, rgb(12 25 36 / .92), rgb(7 15 23 / .94));
  box-shadow:${VISOR_BAY_SHADOW};
}
${PA} .sx-cc-svc__top {
  display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px 18px;
}
${PA} .sx-cc-svc__primary {
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  min-height:42px; padding:8px 22px;
  clip-path:polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 9px 100%, 0 calc(100% - 9px));
  border:1px solid ${GOLD}; border-radius:2px;
  background:linear-gradient(180deg, rgb(224 181 94 / .34) 0%, rgb(224 181 94 / .16) 100%);
  box-shadow:inset 0 1px 0 rgb(255 241 207 / .28), 0 4px 12px rgb(0 0 0 / .44);
  font-family:${TITLE}; font-size:15px; font-weight:700; letter-spacing:.06em; text-transform:uppercase;
  color:#fff1cf; cursor:pointer; transition:border-color 120ms ease, background 120ms ease;
}
${PA} .sx-cc-svc__primary:not([aria-disabled="true"]):is(:hover, :focus-visible) {
  border-color:#fff1cf;
  background:linear-gradient(180deg, rgb(224 181 94 / .48) 0%, rgb(224 181 94 / .24) 100%);
  color:#fff; outline:none;
}
${PA} .sx-cc-svc__primary:focus-visible { outline:2px solid #f2b950; outline-offset:2px; }
${PA} .sx-cc-svc__primary.is-ready {
  clip-path:none;
  border-color:rgb(146 217 180 / .42);
  background:linear-gradient(180deg, rgb(24 44 40 / .72), rgb(12 26 24 / .86));
  color:#c8f0d8; cursor:default;
}
${PA} .sx-cc-svc__primary.is-blocked {
  clip-path:none;
  border-color:rgb(154 198 218 / .26);
  background:linear-gradient(180deg, rgb(22 33 43 / .76), rgb(12 20 28 / .88));
  color:rgb(${BONE} / .66); cursor:not-allowed;
}
${PA} .sx-cc-svc__status {
  font-family:${NUM}; font-size:13px; color:rgb(${BONE} / .80);
}
${PA} .sx-cc-svc__items {
  display:flex; flex-wrap:wrap; align-items:stretch; gap:8px;
}
${PA} .sx-cc-svc__item {
  flex:1 1 160px; display:flex; align-items:center; justify-content:space-between; gap:10px;
  min-height:36px; padding:6px 12px;
  border:1px solid rgb(154 198 218 / .26); border-radius:2px;
  background:linear-gradient(180deg, rgb(20 33 45 / .90), rgb(11 20 29 / .95));
  font-family:${UI}; font-size:13px; font-weight:600; text-transform:none !important; letter-spacing:.01em !important;
  color:rgb(${BONE} / .92);
  cursor:pointer; text-align:left;
}
${PA} .sx-cc-svc__item:not([aria-disabled="true"]):is(:hover, :focus-visible) {
  border-color:${GOLD}; background:linear-gradient(180deg, rgb(224 181 94 / .22), rgb(16 28 39 / .96));
  color:#fff1cf; outline:none;
}
${PA} .sx-cc-svc__item:focus-visible { outline:2px solid #f2b950; outline-offset:2px; }
${PA} .sx-cc-svc__item.is-done {
  border-color:rgb(154 198 218 / .16); background:rgb(10 20 29 / .62);
  color:rgb(${BONE} / .64); cursor:default;
}
${PA} .sx-cc-svc__item.is-blocked {
  border-color:rgb(255 113 89 / .30); background:rgb(24 18 22 / .72);
  color:rgb(${BONE} / .72); cursor:not-allowed;
}
${PA} .sx-cc-svc__item-price {
  font-family:${NUM}; font-size:12.5px; font-weight:600; color:${GOLD}; white-space:nowrap;
}
${PA} .sx-cc-svc__item.is-done .sx-cc-svc__item-price { color:#9edce9; opacity:.8; }
${PA} .sx-cc-svc__item.is-blocked .sx-cc-svc__item-price { color:#ff9d8a; }
${PA} .sx-cc-svc__note {
  margin:0; font-family:${UI}; font-size:12.5px; color:${ICE};
}
${PA} .sx-cc-svc__note.is-warn { color:#ffb088; }

/* The Five Doors: large, calm, informative cards */
${PA} .sx-cc__doors {
  display:grid; gap:10px;
  grid-template-columns:repeat(4, minmax(0, 1fr));
}
${PA} .sx-cc__doors[data-count="5"] {
  grid-template-columns:repeat(5, minmax(0, 1fr));
}
${PA} .sx-cc-door {
  box-sizing:border-box;
  display:flex; flex-direction:column; justify-content:space-between; gap:10px;
  min-height:102px; padding:14px 16px;
  border:1px solid rgb(154 198 218 / .34); border-top:2px solid rgb(158 220 233 / .45); border-radius:2px;
  background:
    radial-gradient(120% 80% at 15% 0%, rgb(26 56 76 / .36), transparent 64%),
    linear-gradient(165deg, rgb(14 28 40 / .94) 0%, rgb(8 17 26 / .97) 100%);
  box-shadow:inset 0 1px 0 rgb(215 240 250 / .14), 0 10px 24px rgb(0 0 0 / .50);
  text-align:left; cursor:pointer;
  transition:border-color 140ms ease, transform 140ms ease, background 140ms ease;
}
${PA} .sx-cc-door:is(:hover, :focus-visible):not([data-sx-quiet-focus]) {
  border-color:${GOLD}; border-top-color:#f2b950;
  background:
    radial-gradient(120% 90% at 15% 0%, rgb(224 181 94 / .22), transparent 65%),
    linear-gradient(165deg, rgb(22 38 52 / .96) 0%, rgb(11 21 31 / .98) 100%);
  transform:translateY(-2px); outline:none;
}
${PA} .sx-cc-door:focus-visible:not([data-sx-quiet-focus]) { outline:2px solid #f2b950; outline-offset:2px; }
${PA} .sx-cc-door[data-sx-quiet-focus]:focus { outline:none !important; box-shadow:inset 0 1px 0 rgb(215 240 250 / .14), 0 10px 24px rgb(0 0 0 / .50) !important; }
${PA} .sx-cc-door.is-urgent {
  border-color:rgb(255 113 89 / .62); border-top-color:#ff7159;
}
${PA} .sx-cc-door.is-attention, ${PA} .sx-cc-door.is-next {
  border-top-color:#f2b950;
}
${PA} .sx-cc-door__head {
  display:flex; align-items:center; gap:9px; min-width:0;
}
${PA} .sx-cc-door__key {
  flex:none; display:inline-grid; place-items:center;
  min-width:24px; height:24px; padding:0 5px;
  border:${KEYCAP_BORDER}; border-radius:2px; background:${KEYCAP_BG}; box-shadow:${KEYCAP_SHADOW};
  font-family:${NUM}; font-size:12px; font-weight:700; color:${ICE};
}
${PA} .sx-cc-door:is(:hover, :focus-visible) .sx-cc-door__key {
  border-color:${GOLD}; color:#f3d178;
}
${PA} .sx-cc-door__title {
  flex:1 1 auto; min-width:0; display:inline-flex; align-items:center;
  font-family:${TITLE}; font-size:17px; font-weight:700; letter-spacing:.03em; text-transform:uppercase;
  color:#f4f7f5;
}
${PA} .sx-cc-door:is(:hover, :focus-visible) .sx-cc-door__title { color:#fff1cf; }
${PA} .sx-cc-door__badge {
  flex:none; padding:2px 7px; border-radius:2px;
  font-family:${NUM}; font-size:12px; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
  background:rgb(224 181 94 / .22); border:1px solid rgb(230 202 143 / .62); color:#fff1cf;
}
${PA} .sx-cc-door__badge.is-urgent {
  background:rgb(255 80 56 / .24); border-color:rgb(255 113 89 / .75); color:#ffd2c8;
}
${PA} .sx-cc-door__summary {
  font-family:${UI}; font-size:13px; font-weight:500; line-height:1.4;
  text-transform:none !important; letter-spacing:.01em !important;
  color:rgb(${BONE} / .84);
}
${PA} .sx-cc__teach-text, ${PA} .sx-cc__news-text {
  text-transform:none !important; letter-spacing:.01em !important;
}
@media (max-width:1180px) {
  ${PA} .sx-cc__doors[data-count="5"] { grid-template-columns:repeat(3, minmax(0, 1fr)); }
}
@media (max-width:980px) {
  ${PA} .sx-cc__doors, ${PA} .sx-cc__doors[data-count="5"] { grid-template-columns:repeat(2, minmax(0, 1fr)); }
  ${PA} .sx-concourse { overflow-y:auto; }
}
@media (max-width:600px) {
  ${PA} .sx-cc__doors, ${PA} .sx-cc__doors[data-count="5"] { grid-template-columns:1fr; }
  ${PA} .sx-cc__hero { padding:12px 14px; }
  ${PA} .sx-cc__purse { align-items:flex-start; width:100%; }
}

/* ==== FOUR PLACES (08_INTERFACE §7, 2026-11-23) ==============================================
   The station is four places plus Undock, everywhere. Inside a door the head is one slim plate in
   the hub's voice (.sx-dh) and the foot is Back, the four places, and Undock. Retired from the
   player's view: the Ctrl+K palette, the bay screen and station wire crawls, the news tape, the
   vitals dials with their service verbs and the credit line (service is the hub's one strip),
   Comms and Help keys. One type system: figures are the body face in tabular numerals; only key
   caps stay in the mono face. */
${PA} {
  --dp-face-num: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  font-variant-numeric: tabular-nums;
}
${PA} :is(kbd, .dp-kbd, .sx-cc-door__key, .sx-tile__key, .sx-dock__back-key) {
  font-family:"Spline Sans Mono", ui-monospace, monospace !important; font-variant-numeric:normal;
}
${PA} .sx-cc__vitals { font-family:${UI}; font-size:13px; }
${PA} .sx-cc__credits-v { font-family:${UI}; font-weight:700; letter-spacing:.01em; }

/* -- the door head ------------------------------------------------------------------------ */
${PA}:not([data-operation="concourse"]):not([data-operation=""]) .sxb-berth.sxb-berth.dp-frame__head.dp-frame__head {
  display:flex !important; flex-wrap:wrap !important; align-items:stretch !important; gap:12px !important;
  grid-template-columns:none !important; grid-template-areas:none !important;
  height:auto !important; min-height:0 !important; padding:0 !important; margin:0 !important;
  background:none !important; border:0 !important; box-shadow:none !important;
}
${PA}:not([data-operation="concourse"]):not([data-operation=""]) .sxb-berth.sxb-berth.dp-frame__head.dp-frame__head > :is(.so-station-mark, .so-station-title, .so-command-trigger, .sxb-tape, .sxb-signs, .sxb-handoff, .sxb-berth__lamp) {
  display:none !important;
}
${PA}:not([data-operation="concourse"]) .sxb-crown > :is(.sxb-purse, .sxb-vitals) { display:none !important; }
${PA}:not([data-operation="concourse"]) .sxb-crown:not(:has(> .sxb-law-fine:not([hidden]))) { display:none !important; }
${PA}:not([data-operation="concourse"]) .sxb-crown:has(> .sxb-law-fine:not([hidden])) {
  position:static !important; flex:0 1 auto !important; width:auto !important; max-width:min(520px, 100%) !important;
  margin:0 !important; padding:12px 16px !important; display:flex !important; align-items:center !important;
}
${PA}[data-operation="concourse"] .sx-dh { display:none !important; }
${PA} .sx-dh {
  box-sizing:border-box; flex:1 1 520px; min-width:0;
  display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 24px;
  padding:12px 20px;
  border:${VISOR_BAY_BORDER}; border-left:3px solid #f2b950; border-radius:2px;
  background:
    linear-gradient(90deg, #f2b950 0 36px, rgb(158 220 233 / .45) 36px 180px, rgb(158 220 233 / .12) 180px 100%) top left / 100% 2px no-repeat,
    linear-gradient(155deg, rgb(10 22 33 / .90) 0%, rgb(6 14 22 / .86) 100%);
  box-shadow:${VISOR_BAY_SHADOW};
  font-family:${UI}; color:rgb(${BONE});
}
${PA} .sx-dh__where { min-width:0; display:flex; flex-direction:column; gap:2px; }
${PA} .sx-dh__station {
  margin:0; font-family:${UI}; font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:${ICE};
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
${PA} .sx-dh__door {
  margin:0; font-family:${TITLE}; font-size:28px; font-weight:700; line-height:1.05; letter-spacing:.01em; color:#f4f7f5;
}
${PA} .sx-dh__purse { display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
${PA} .sx-dh__credits { margin:0; display:flex; align-items:baseline; gap:10px; }
${PA} .sx-dh__credits-k { font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:${GOLD}; }
${PA} .sx-dh__credits-v { font-family:${UI}; font-size:24px; font-weight:700; line-height:1; color:#fff1cf; font-variant-numeric:tabular-nums; }
${PA} .sx-dh__vitals { margin:0; display:flex; flex-wrap:wrap; justify-content:flex-end; gap:4px 16px; font-size:13px; color:rgb(${BONE} / .78); }
${PA} .sx-dh__vital b { color:#edf2ef; font-weight:600; font-variant-numeric:tabular-nums; }
${PA} .sx-dh__vital.is-warn b { color:#f2b950; }
${PA} button.sx-dh__vital {
  text-transform:none; letter-spacing:0; min-height:0;
  margin:0; padding:0 0 1px; border:0; border-bottom:1px dotted rgb(158 220 233 / .45); border-radius:0; background:none;
  font:inherit; color:inherit; cursor:pointer; transition:color 140ms ease-out, border-color 140ms ease-out;
}
${PA} button.sx-dh__vital:is(:hover, :focus-visible) { color:#fff1cf; border-bottom-color:${GOLD}; outline:none; }
${PA} button.sx-dh__vital:focus-visible { outline:2px solid #f2b950; outline-offset:3px; }

/* -- the foot: Back, the four places, Undock ----------------------------------------------- */
${PA} .sxb-ops .sx-comms__toggle, ${PA} .sxb-ops .sxb-help, ${PA} .so-berth-status { display:none !important; }
${PA} .sx-dock { display:flex !important; align-items:center !important; gap:12px !important; }
/* The rail's old counter caps (::before, at 1360+ wide) would print a second key beside .sx-tile__key. */
${PA} .sxb-ops.sxb-ops .sx-tile.sx-tile.sx-tile::before { content:none !important; display:none !important; }
${PA} .sx-tile__key {
  display:inline-grid; place-items:center; min-width:18px; height:18px; margin:0 8px 0 0; padding:0 4px; box-sizing:border-box;
  border:${KEYCAP_BORDER}; border-radius:2px; background:${KEYCAP_BG}; box-shadow:${KEYCAP_SHADOW};
  font-size:12px; font-weight:600; line-height:16px; color:${ICE};
}
${PA} .sx-tile.is-active .sx-tile__key { color:#f3d178; border-color:${GOLD}; }
/* In People the number keys answer the person in front of you (1-3), so the rail prints no door
   keys there: a "1" on Jobs would promise a key that picks a reply instead. */
${PA}[data-operation="bar"] .sx-dock .sx-tile__key { display:none !important; }
${PA} .sx-tile { display:inline-flex !important; align-items:center !important; }
${PA} .sx-dock__back {
  display:inline-flex; align-items:center; gap:6px; min-height:34px; padding:0 12px 0 8px; box-sizing:border-box;
  border:1px solid rgb(154 198 218 / .22); border-radius:2px; background:transparent;
  font-family:${UI}; font-size:13px; font-weight:600; letter-spacing:.03em; color:rgb(${BONE} / .80); cursor:pointer;
  transition:color 140ms ease-out, border-color 140ms ease-out, background 140ms ease-out;
}
${PA} .sx-dock__back:is(:hover, :focus-visible) { color:#fff1cf; border-color:${GOLD}; background:rgb(224 181 94 / .10); outline:none; }
${PA} .sx-dock__back:focus-visible { outline:2px solid #f2b950; outline-offset:2px; }
${PA} .sx-dock__back:active, ${PA} .sx-tile:active { transform:translateY(1px); }
${PA} .sx-dock__back-key {
  display:inline-grid; place-items:center; min-width:26px; height:18px; padding:0 4px; margin-left:2px; box-sizing:border-box;
  border:1px solid rgb(158 220 233 / .26); border-radius:2px; font-size:11px; line-height:16px; color:rgb(158 220 233 / .80);
}
@media (prefers-reduced-motion: reduce) {
  ${PA} :is(.sx-dock__back, .sx-tile, button.sx-dh__vital) { transition:none !important; }
  ${PA} .sx-dock__back:active, ${PA} .sx-tile:active { transform:none !important; }
}
/* Phone foot: the four places are one row of tabs (glyph over word, a thumb's width each) and Back
   and Undock share the row under them. It was Back beside a four-high stack of places, a caption
   and Undock: 233px of a 844px screen, which left the market two rows. Key caps hide (no keys). */
@media (max-width:600px) {
  ${PA} .sxb-ops.sxb-ops.dp-frame__foot {
    display:grid !important; grid-template-columns:repeat(4, minmax(0, 1fr)) !important; grid-template-rows:auto auto !important;
    grid-template-areas:none !important; align-items:stretch !important; gap:8px !important;
    height:auto !important; min-height:0 !important; padding:8px 12px 12px !important;
  }
  ${PA} .sxb-ops.sxb-ops.dp-frame__foot :is(.of-facility-rail, .sxb-ops__dock, .sx-dock, .sx-dock__group--nav) {
    display:contents !important;
  }
  /* the hub has its own four doors: its foot is Undock alone, full width */
  ${PA}[data-operation="concourse"] .sxb-ops.sxb-ops.dp-frame__foot > .of-facility-rail { display:none !important; }
  ${PA}[data-operation="concourse"] .sxb-ops.sxb-ops.dp-frame__foot .sxb-launch-seat { grid-row:1 !important; grid-column:1 / -1 !important; }
  ${PA} .sxb-ops.sxb-ops.dp-frame__foot .sx-dock__group--nav > li { grid-row:1 !important; display:flex !important; min-width:0 !important; margin:0 !important; }
  ${PA} .sxb-ops.sxb-ops.dp-frame__foot .sx-dock__group--nav > li > .sx-tile.sx-tile {
    width:100% !important; min-width:0 !important; min-height:48px !important; height:auto !important; margin:0 !important; padding:6px 4px !important;
    display:flex !important; flex-direction:column !important; align-items:center !important; justify-content:center !important; gap:4px !important;
  }
  ${PA} .sxb-ops.sxb-ops.dp-frame__foot .sx-tile .sx-tile__label {
    display:flex !important; flex-direction:column !important; align-items:center !important; gap:4px !important;
    font-size:12px !important; letter-spacing:.04em !important; white-space:nowrap !important;
  }
  ${PA} .sxb-ops.sxb-ops.dp-frame__foot .sx-tile .sx-tile__key,
  ${PA} .sxb-ops.sxb-ops.dp-frame__foot .sx-tile__gloss { display:none !important; }
  ${PA} .sxb-ops.sxb-ops.dp-frame__foot .sx-tile .sx-tile__badge { position:absolute !important; top:4px !important; right:6px !important; }
  ${PA} .sxb-ops.sxb-ops.dp-frame__foot .sx-tile { position:relative !important; }
  ${PA} .sxb-ops.sxb-ops.dp-frame__foot .sx-dock__back { grid-row:2 !important; grid-column:1 !important; justify-content:center !important; min-height:44px !important; margin:0 !important; }
  ${PA} .sxb-ops.sxb-ops.dp-frame__foot .sxb-launch-seat { grid-row:2 !important; grid-column:2 / -1 !important; display:flex !important; margin:0 !important; width:auto !important; }
  ${PA} .sxb-ops.sxb-ops.dp-frame__foot .sxb-launch-seat > .sxb-launch { width:100% !important; min-height:44px !important; }
}
@media (max-width:600px) {
  ${PA} .sx-dh { padding:10px 14px; }
  ${PA} .sx-dh__door { font-size:22px; }
  ${PA} .sx-dh__purse { align-items:flex-start; width:100%; }
  ${PA} .sx-dh__vitals { justify-content:flex-start; }
  ${PA} .sx-dock__back-key { display:none; }
}

/* ==== CLEAN EXCHANGE (08_INTERFACE §7, 2026-11-23) ===========================================
   The market is a list, a detail and a trade: what it costs, what it pays, how many, Buy or Sell.
   What has no data is not shown, and the analyst furniture leaves the detail: the chart's key
   words (estimated/observed/forecast), the driver words (Local/Spread/Sector), the spread
   bracket, the regime/age readout, the market-pulse ledger, the dockside notice, the quote
   breakdown and the "Price history unavailable" placeholder. The price line itself stays. */
${PA} .sx-mkt.orr-market :is(.sx-mkt-chart-key, .orr-mkt-subkey, .orr-mkt-spread, .sx-mkt-cone-read, .so-trade-breakdown, [data-ad-board], .orr-mkt-demand-key) {
  display:none !important;
}
${PA} .sx-mkt.orr-market .sx-mkt__quote > p.k-empty { display:none !important; }
${PA} .sx-mkt.orr-market .so-route-disclosure:has(> .sx-mkt__pulse) { display:none !important; }
${PA} .sx-mkt.orr-market .sx-mkt-cause { font-family:${UI} !important; font-size:13px !important; color:rgb(${BONE} / .78) !important; }
${PA} .sx-mkt.orr-market .sx-mkt-row__stock { white-space:nowrap !important; }
/* Phone (<=600 wide): one column. The list takes the screen's height with each good on one line
   (name, buy, sell), and the chosen good's price and the trade sit side by side under it. Two
   squeezed columns (204px list, 150px console) wrapped every row onto two lines. */
@media (max-width:600px) {
  ${PA} .k-panel.sx-mkt.orr-market {
    grid-template-columns:minmax(0, 1fr) !important; grid-template-rows:minmax(0, 1fr) auto !important; row-gap:8px !important;
  }
  ${PA} .k-panel.sx-mkt.orr-market > .sx-mkt__list { grid-row:1 !important; grid-column:1 !important; min-height:0 !important; width:auto !important; }
  ${PA} .k-panel.sx-mkt.orr-market > .sx-mkt__stage {
    grid-row:2 !important; grid-column:1 !important; width:auto !important; min-height:0 !important; height:auto !important;
    grid-template-columns:minmax(0, 1fr) minmax(0, 1fr) !important; grid-template-rows:auto !important; align-items:start !important;
    column-gap:12px !important; overflow:visible !important;
  }
  ${PA} .k-panel.sx-mkt.orr-market > .sx-mkt__stage > .sx-mkt__analysis { grid-column:1 !important; grid-row:1 !important; min-width:0 !important; }
  ${PA} .k-panel.sx-mkt.orr-market > .sx-mkt__stage > .sx-mkt__console { grid-column:2 !important; grid-row:1 !important; min-width:0 !important; }
  ${PA} .k-panel.sx-mkt.orr-market > .sx-mkt__stage > .sx-mkt__decision { grid-column:1 / -1 !important; }
  ${PA} .sx-mkt.orr-market .sx-mkt-browser { grid-template-columns:minmax(0, 1fr) !important; width:auto !important; }
  /* the list's MORE pill hung over the trade's first line; the list's own fade says there is more */
  ${PA} .sx-mkt.orr-market .sx-mkt__list .orr-extent--foot { display:none !important; }
}
/* No column of zeros: when no row has stock to show, STOCK yields (its cells would all read a dash). */
${P} .sx-mkt.orr-market .sx-mkt__list.is-stockless .sx-mkt-table :is(th, td):nth-child(4) { display:none !important; }
/* 601-719 tall desktops (1366x650) set the quantity beside the total, and the stepper's width
   pushed TOTAL COST off the right of the glass. The slim door head leaves the height, so the
   console stacks as it does at 720+: quantity, total, Buy / Sell. */
@media (min-width:1101px) and (min-height:461px) and (max-height:719px) {
  ${PA} .sx-mkt.orr-market .sx-trade {
    grid-template-columns:minmax(0, 1fr) !important; grid-template-rows:none !important;
    grid-template-areas:"dial" "total" "note" "verb" "breakdown" !important;
    justify-content:stretch !important; justify-items:start !important; row-gap:6px !important;
  }
}

/* ==== THE BAY IS THE PICTURE (hub) ===========================================================
   On the hub every reading sits on its own plate (hero, Service strip, doors), so the berth does
   not need the work-column veil the doors use: that grade sat at 54-90% black over the bay and
   left the player's own ship a silhouette. The hub keeps only a soft edge vignette, so the lit
   bay and the hull read between the hero and the lower deck. The foot under the doors drops its
   empty plate: Undock stands alone at the right. */
${PA}[data-operation="concourse"] .sxb-veil {
  background:
    radial-gradient(120% 100% at 50% 42%, transparent 0%, transparent 48%, rgb(6 7 10 / .30) 78%, rgb(6 7 10 / .58) 100%),
    linear-gradient(180deg, rgb(6 7 10 / .28) 0%, transparent 22%, transparent 58%, rgb(6 7 10 / .42) 100%) !important;
}
${PA}[data-operation="concourse"] .sxb-ops {
  background:none !important; border-color:transparent !important; box-shadow:none !important;
}

/* ==== THE JOB BOARD READS AS A LIST (2026-11-23) =============================================
   A row was "PASSENGER TRANSPORT Transport a passenger to Customs Gate 1,963" run together on one
   wrapped line. The kind of job now sits on its own quiet line above the job's own words, and
   the pay stands at the right. */
${PA} .sx-ct__rows .sx-ct-row .sx-ct-row__title > .sx-ct-row__type {
  display:flex !important; width:max-content; margin:0 0 2px !important;
  font-size:12px !important; letter-spacing:.08em !important; opacity:.7 !important;
}
${PA} .sx-ct__rows .sx-ct-row .sx-ct-row__title { white-space:normal !important; }
/* The route card's caption is one line in the label voice: "1 JUMP · TO TETHYS JUNCTION". Its
   number was a 24-26px display numeral that hung off the card's left edge like a stray "1". */
${PA} :is(.sx-dossier .orr-route__caption, .sx-ct-tether__caption) {
  font-family:${UI} !important; font-stretch:100% !important; font-size:12px !important; font-weight:700 !important;
  letter-spacing:.08em !important; gap:6px !important; color:rgb(${BONE} / .72) !important;
}
${PA} :is(.sx-dossier .orr-route__caption, .sx-ct-tether__caption) > .orr-route__jumps {
  font-family:${UI} !important; font-stretch:100% !important; font-size:12px !important; font-weight:700 !important;
  letter-spacing:0 !important; line-height:inherit !important; color:#f4f7f5 !important;
}
${PA} :is(.sx-dossier .orr-route__caption, .sx-ct-tether__caption) > .orr-route__via {
  font-family:${UI} !important; font-stretch:100% !important; font-size:12px !important; font-weight:700 !important; letter-spacing:.08em !important;
}

/* ==== FOUR PLACES ON A PHONE (2026-11-23) =====================================================
   A touch phone (data-sf-mobile="1") still drew the old dashboard inside every door: the bay screen
   and station wire crawls, the vitals dials with Repair / Insure / Draw, the credit line and a second
   credits figure, and a foot whose four places ran together ("JOBSMARKETSHIPYARDPEOPLE"). Inside a
   door the phone now gets what the desktop gets: the slim door head, the door's body, and a foot
   of four tabs over Back and Undock. */
${PM}:not([data-operation="concourse"]):not([data-operation=""]) header.sxb-berth.sxb-berth {
  display:flex !important; flex-wrap:wrap !important; grid-template-areas:none !important; grid-template-columns:none !important;
  gap:8px !important; padding:0 !important; background:none !important; border:0 !important; box-shadow:none !important;
}
${PM}:not([data-operation="concourse"]):not([data-operation=""]) header.sxb-berth.sxb-berth > :is(.so-station-mark, .so-station-title, .so-command-trigger, .sxb-tape, .sxb-signs, .sxb-handoff, .sxb-berth__lamp) {
  display:none !important;
}
${PM}:not([data-operation="concourse"]) .sxb-crown > :is(.sxb-purse, .sxb-vitals) { display:none !important; }
${PM}:not([data-operation="concourse"]) .sxb-crown:not(:has(> .sxb-law-fine:not([hidden]))) { display:none !important; }
${PM}:not([data-operation="concourse"]) header.sxb-berth > .sx-dh { flex:1 1 100% !important; width:100% !important; }
${PM} .sxb-ops .sx-comms__toggle, ${PM} .sxb-ops .sxb-help, ${PM} .so-berth-status { display:none !important; }
${PM} .sx-mkt.orr-market :is(.so-trade-breakdown, .sx-mkt-chart-key, .orr-mkt-subkey, .orr-mkt-spread, .sx-mkt-cone-read, [data-ad-board], .orr-mkt-demand-key, .orr-mkt-tape) { display:none !important; }
${PM} .sxb-ops.sxb-ops .sxb-launch-seat > .sxb-launch {
  justify-content:center !important; gap:12px !important;
  border:1px solid ${GOLD} !important; border-radius:2px !important;
  background:linear-gradient(180deg, rgb(224 181 94 / .30) 0%, rgb(224 181 94 / .14) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(255 241 207 / .24), 0 4px 12px rgb(0 0 0 / .45) !important; color:#fff1cf !important;
}
${PM} .sxb-ops.sxb-ops .sxb-launch-seat > .sxb-launch .sxb-launch__copy { flex-direction:row !important; align-items:baseline !important; gap:10px !important; }
${PM} .sxb-ops.sxb-ops.dp-frame__foot {
  display:grid !important; grid-template-columns:repeat(4, minmax(0, 1fr)) !important; grid-template-rows:auto auto !important;
  grid-template-areas:none !important; align-items:stretch !important; gap:8px !important; flex-wrap:nowrap !important;
  height:auto !important; min-height:0 !important; padding:8px 12px 12px !important;
}
${PM} .sxb-ops.sxb-ops.dp-frame__foot :is(.of-facility-rail, .sxb-ops__dock, .sx-dock, .sx-dock__group--nav) { display:contents !important; }
${PM} .sxb-ops.sxb-ops.dp-frame__foot .sx-dock__group--nav > li { grid-row:1 !important; display:flex !important; min-width:0 !important; margin:0 !important; }
${PM} .sxb-ops.sxb-ops.dp-frame__foot .sx-dock__group--nav > li > .sx-tile.sx-tile {
  position:relative !important; width:100% !important; min-width:0 !important; min-height:48px !important; height:auto !important; margin:0 !important; padding:6px 4px !important;
  display:flex !important; flex-direction:column !important; align-items:center !important; justify-content:center !important; gap:4px !important;
  border:1px solid rgb(154 198 218 / .22) !important; border-radius:2px !important; background:rgb(10 20 30 / .72) !important;
}
${PM} .sxb-ops.sxb-ops.dp-frame__foot .sx-dock__group--nav > li > .sx-tile.sx-tile.is-active { border-color:${GOLD} !important; background:rgb(224 181 94 / .14) !important; }
${PM} .sxb-ops.sxb-ops.dp-frame__foot .sx-tile .sx-tile__label {
  display:flex !important; flex-direction:column !important; align-items:center !important; gap:4px !important;
  font-family:${UI} !important; font-size:12px !important; font-weight:700 !important; letter-spacing:.04em !important; white-space:nowrap !important; text-transform:uppercase !important;
}
${PM} .sxb-ops.sxb-ops.dp-frame__foot .sx-tile .dust-tab-glyph { display:block !important; }
${PM} .sxb-ops.sxb-ops.dp-frame__foot .sx-tile :is(.sx-tile__key, .orr-stationrow__rule), ${PM} .sxb-ops.sxb-ops.dp-frame__foot .sx-tile__gloss { display:none !important; }
${PM} .sxb-ops.sxb-ops.dp-frame__foot .sx-tile .sx-tile__badge:not([hidden]) { position:absolute !important; top:4px !important; right:6px !important; }
${PM} .sxb-ops.sxb-ops.dp-frame__foot .sx-dock__back { grid-row:2 !important; grid-column:1 !important; justify-content:center !important; min-height:44px !important; margin:0 !important; }
${PM} .sxb-ops.sxb-ops.dp-frame__foot .sxb-launch-seat { grid-row:2 !important; grid-column:2 / -1 !important; display:flex !important; margin:0 !important; width:auto !important; }
${PM} .sxb-ops.sxb-ops.dp-frame__foot .sxb-launch-seat > .sxb-launch { width:100% !important; min-height:44px !important; }
/* the hub on a phone: its own hero, Service strip and four doors, so the old berth header (crawls,
   dials, credit line, second purse) and the foot's rail stay hidden as they are on a desktop; the
   foot is Undock alone */
${PM}[data-operation="concourse"] header.sxb-berth.sxb-berth { display:none !important; }
${PM}[data-operation="concourse"] .sxb-ops.sxb-ops.dp-frame__foot > .of-facility-rail { display:none !important; }
${PM}[data-operation="concourse"] .sxb-ops.sxb-ops.dp-frame__foot .sxb-launch-seat { grid-row:1 !important; grid-column:1 / -1 !important; }

/* ==== A RECEIPT IS A TOAST (2026-11-23) ======================================================
   "Job taken", "Part fitted", "Hull repaired": the receipt used to take its own row at the head of
   the foot, which pushed Back, the four places and Undock down under the frame's edge for its 3.6 s,
   exactly when the player wants Undock. It now stands on its own small plate above the foot's
   right end (over Undock's column), never in the foot's flow, and clicks pass through it. */
${PA} .sxb-ops.sxb-ops > .sx-comms.sx-comms { display:contents !important; }
${PA} .sxb-ops.sxb-ops .sx-receipt.sx-receipt {
  position:absolute !important; z-index:6 !important; order:0 !important; flex:none !important;
  top:auto !important; left:auto !important; right:0 !important; bottom:calc(100% + 12px) !important;
  width:auto !important; max-width:min(460px, 100%) !important; box-sizing:border-box !important;
  display:grid !important; grid-template-columns:auto minmax(0, 1fr) !important; grid-template-areas:"kind title" "kind delta" !important;
  align-items:baseline !important; column-gap:12px !important; row-gap:2px !important;
  padding:10px 16px !important; margin:0 !important;
  border:${VISOR_BAY_BORDER} !important; border-left:3px solid #f2b950 !important; border-radius:2px !important;
  background:linear-gradient(155deg, rgb(12 25 36 / .97) 0%, rgb(7 15 23 / .98) 100%) !important;
  box-shadow:${VISOR_BAY_SHADOW} !important;
  white-space:normal !important; pointer-events:none !important; isolation:auto !important;
  font-family:${UI} !important; text-transform:none !important;
}
${PA} .sxb-ops.sxb-ops .sx-receipt.sx-receipt[hidden] { display:none !important; }
${PA} .sxb-ops.sxb-ops .sx-receipt.sx-receipt::before { content:none !important; display:none !important; }
${PA} .sxb-ops.sxb-ops .sx-receipt.sx-receipt > .so-transfer { display:none !important; }
${PA} .sxb-ops.sxb-ops .sx-receipt.sx-receipt > .sx-receipt__kind {
  grid-area:kind; align-self:start; padding-top:2px;
  font-family:${UI} !important; font-stretch:100% !important; font-size:12px !important; font-weight:700 !important;
  letter-spacing:.08em !important; text-transform:uppercase !important; color:${GOLD} !important; white-space:nowrap !important;
}
${PA} .sxb-ops.sxb-ops .sx-receipt.sx-receipt > .sx-receipt__title {
  grid-area:title; min-width:0;
  font-family:${UI} !important; font-stretch:100% !important; font-size:14px !important; font-weight:700 !important; line-height:1.3 !important;
  letter-spacing:0 !important; text-transform:none !important; color:#f4f7f5 !important; overflow-wrap:anywhere !important; white-space:normal !important;
}
${PA} .sxb-ops.sxb-ops .sx-receipt.sx-receipt > .sx-receipt__delta {
  grid-area:delta; min-width:0; margin:0 !important;
  font-family:${UI} !important; font-size:13px !important; font-weight:500 !important; letter-spacing:0 !important; text-transform:none !important;
  color:rgb(${BONE} / .80) !important; font-variant-numeric:tabular-nums; white-space:normal !important;
}
${PA} .sxb-ops.sxb-ops .sx-receipt.sx-receipt > .sx-receipt__delta:empty { display:none !important; }
${PA} .sxb-ops.sxb-ops .sx-receipt.sx-receipt.is-live { animation:sf-receipt-in 160ms ease-out both; }
@keyframes sf-receipt-in { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
@media (prefers-reduced-motion: reduce) {
  ${PA} .sxb-ops.sxb-ops .sx-receipt.sx-receipt.is-live { animation:none !important; }
}
@media (max-width:600px) {
  ${PA} .sxb-ops.sxb-ops .sx-receipt.sx-receipt { left:0 !important; right:0 !important; max-width:none !important; bottom:calc(100% + 8px) !important; }
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
