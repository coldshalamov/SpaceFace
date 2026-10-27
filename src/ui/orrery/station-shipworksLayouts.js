// Shipworks-only composition rules (the station dock host) that the shared sheet
// (`src/ui/orrery/shipworksLayouts.js`) does not carry. That sheet is read by THE SHIP screen
// too (ship/shipScreen.js shares the stage), so dock-only refinements live here rather than
// growing the shared file. Same scope key, one style block, injected once.
const STYLE_ID = 'sf-orrery-station-shipworks';
// The shared sheet's own scope: the station berth's shipworks panel only.
const W = 'html body #screens > .sx-berth.orr-station .sx-sw';
const BONE = '236 230 216';

const CSS = `
/* the Record ledger (the Record verb swaps it in for the band's detail): ten static readings on
   the band rows' hairline, at the condensed register the readouts ladder already uses — the
   kit's 34px interactive row token and its pointer cursor do not apply to a static reading */
${W} .sx-sw-record { margin-top:8px !important; }
${W} .sx-sw-record .sx-sw-band__label { margin:0 0 2px !important; }
${W} .sx-sw-record__grid { row-gap:0 !important; }
/* the stats column's kit rows are fixed-width flex: restore the two-ended ledger read
   (name left, figure right on the hairline) at the condensed register the readouts ladder
   already uses — the kit's 34px interactive row token and pointer cursor are not a reading */
${W} .sx-sw-record__grid .k-row { min-height:0 !important; padding:2px 0 !important; cursor:default; line-height:1.15;
  display:flex !important; justify-content:space-between !important; align-items:baseline !important; width:100% !important;
  column-gap:12px; border-top-color:rgb(${BONE} / .1); }
${W} .sx-sw-record__grid .k-row__name { flex:0 1 auto !important; letter-spacing:.12em !important; font-size: 12px !important; }
${W} .sx-sw-record__grid .k-row__num { flex:none !important; font-size: 12px !important; color:rgb(248 244 234) !important; font-variant-numeric:tabular-nums; }
/* the open Record verb reads lit-bone against its rest .8, the way the mode words say which is open */
${W} .sx-sw-verb.is-active { color:rgb(248 244 234) !important; }
/* the roster column is a fixed ~236px rail at every window width, so the row's role line wraps
   against the flag column: condense it on the width axis and tracking (ORRERY §3.4's sanctioned
   squeeze — the 12px floor holds) so "STARTER SCOUT · T0" spends two lines, not three, between
   the tab words and the hero numeral's fixed seat */
${W} .sx-sw-row .k-row__sub { font-stretch:94%; font-variation-settings:"wdth" 94, "wght" 650 !important; letter-spacing:.09em !important; line-height:1.25 !important; }
${W} .sx-sw-row .sx-sw-row__flag { font-variation-settings:"wdth" 94, "wght" 650 !important; letter-spacing:.14em !important; }
/* hover and focus-visible lean the tick in and brighten the name; active press snaps tick to amber */
${W} .sx-sw-row:not(.is-active, .is-selected, .is-viewed, [aria-pressed='true'], [aria-current='true']):is(:hover, :focus-visible)::before {
  left:2px !important; width:11px !important; height:2px !important; background:rgb(${BONE} / .45) !important; box-shadow:0 0 8px rgb(${BONE} / .45) !important;
}
${W} .sx-sw-row:is(:hover, :focus-visible) .k-row__name { color:rgb(255 250 240) !important; text-shadow:0 0 10px rgb(255 250 236 / .3); }
${W} .sx-sw-row:active::before {
  background:var(--dp-hand, #f2b950) !important; box-shadow:0 0 8px rgb(242 185 80 / .55) !important;
}

`;

export function injectOrreryStationShipworks(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
