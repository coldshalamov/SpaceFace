// ORRERY composition for the station's Missions (contracts) tab (design/frontend/ORRERY.md §6
// Station — Contracts). The tab's shared grammar (the rail, the Hand, the commit verb, the
// dossier's ledger) lives in stationTabsLayouts.js; this sheet owns only what is this screen's
// own: the reading column's last line. The commit word rests IN FLOW under the terms it binds —
// never a pinned band over them (the legacy `#screens .sx-dossier__foot { position: sticky;
// bottom: 0; background: … }` in styles/orbital.css over-painted COLLATERAL / FOLLOW-UP whenever
// the stage shortened, which the ui-bench measured as buried rows). A static foot cannot overlap
// its own reading at any frame of the arrival, and an offer too tall for the stage scrolls
// honestly instead of hiding under the key.
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-station-contracts';
const T = 'html body #screens > .sx-berth.orr-station';
// the same warm bone the station tabs' grammar is drawn with (stationTabsLayouts.js)
const BONE = '236 230 216';
// one class deeper than stationTabsLayouts.js selectors, so same-property overrides win ties
const TAB = `${T} .k-panel.sx-ct`;
// the same tab in a desktop window (a phone's mobile sheet owns its own one-scroll column)
const DTAB = 'html:root:not([data-sf-mobile="1"]) body #screens > .sx-berth.orr-station .k-panel.sx-ct';

const CSS = `
/* the commit under its terms: in flow, unplated, nothing over-paints the reading */
${TAB} .sx-dossier__foot { position: static !important; bottom: auto !important; background: none !important;
  z-index: auto !important; padding-block: 0 !important; }
/* short desktop stages (1080/900 with the arrival notice band mounted): the reading, verb last,
   keeps its air above the stage's foot — margins the shell's band media did not close */
@media (min-width:1101px) and (min-height:801px) and (max-height:1140px) {
  ${TAB} .orr-ct-scales { margin-top: 8px !important; }
  ${TAB} .sx-dossier__terms > li { padding: 5px 0 !important; }
  ${TAB} .sx-dossier__foot { margin-top: 12px !important; }
}
/* a narrow desktop window 601–660 tall (420×601) leaves the board 66px: the 22px ladder gap under POSTED HERE and the 16px
   fade left the only job row in view half-faded. The gap closes to 4px and the fade to 6px, so that row reads whole */
@media (max-width:480px) and (min-height:601px) and (max-height:660px) {
  ${DTAB} .sx-ct__hang > .sx-ct__board { padding-top: 4px !important; }
  ${DTAB} .sx-ct__hang { -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 6px), transparent) !important;
    mask-image: linear-gradient(180deg, #000 calc(100% - 6px), transparent) !important; }
}
/* the consequence scales' unpainted parts (the svg carries classes only, no colour literals):
   the risk band is the bone track under the lit stretch; the blade is bone, threat-red at the
   high stops — red stays threat only (ORRERY.md §3.3) */
${TAB} .orr-ct-scale__band { stroke: rgb(${BONE} / .27); }
${TAB} .orr-ct-scale__blade rect { fill: rgb(248 244 234); }
${TAB} .orr-ct-scale__blade.is-high rect { fill: var(--dp-danger, #ff5038); }
`;

export function injectOrreryStationContracts(doc = globalThis.document) {
  if (!doc?.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
