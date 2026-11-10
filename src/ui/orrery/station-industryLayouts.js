// ORRERY composition for the station's Industry tab (design/frontend/ORRERY.md §6 Station — Industry).
// The tab's shared grammar (the ladder, the chain, the fab foot) lives in stationTabsLayouts.js;
// this sheet owns only the fabrication reading's plate: the selected blueprint reads as one card.
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-station-industry';
// desktop only — phones carry data-sf-mobile and their own sheet (mobileScreenLayouts.js);
// narrow ≤650 windows keep the unbound strip so the stacked fab is not padded into a 90px card
const D = 'html:root:not([data-sf-mobile="1"]) body #screens > .sx-berth.orr-station';
// the same warm bone the station tabs' grammar is drawn with (stationTabsLayouts.js)
const BONE = '236 230 216';
// deeper than stationTabsLayouts.js's .sx-fab rules (T … .sx-fab), so same-property overrides win
// without editing that file. min-width:651 keeps phones / stacked strips out of the card.
const FAB = `${D} .sx-ind .sx-ind__stage > .sx-fab`;

const CSS = `
/* ui-polish-407: the industry fabrication reading wears the promise-scale hairline card
   (1px bone ~18% / radius 10 / faint fill / padded), the bar, ledger, factions and shipworks
   grammar (ui-polish-401…406). No shade-pool ::before lives on .sx-fab today; kill it anyway so
   a future stationTabsLayouts paint cannot sit under the plate. Densify radius 8→6 and the
   padding tightens on short stages so the chain beam and FABRICATE key keep their seats.
   Phones / ≤650 wide are left alone (mobileScreenLayouts + the stacked strip). */
@media (min-width:651px) {
${FAB} {
  box-sizing:border-box !important; position:relative !important; isolation:isolate;
  background:rgb(${BONE} / .025) !important; border:1px solid rgb(${BONE} / .18) !important;
  border-radius:10px; box-shadow:none !important; padding:16px 18px !important; min-width:0; }
${FAB}::before { content:none !important; display:none !important; }
}
@media (min-width:651px) and (max-height:820px) { ${FAB} { border-radius:8px; } }
@media (min-width:651px) and (max-height:400px) { ${FAB} { border-radius:6px; } }
@media (min-width:651px) and (max-width:820px) { ${FAB} { border-radius:8px; } }
@media (min-width:651px) and (max-width:760px) { ${FAB} { border-radius:8px; } }
@media (min-width:651px) and (max-height:800px) { ${FAB} { padding:12px 14px !important; } }
@media (min-width:651px) and (max-height:600px) { ${FAB} { padding:10px 12px !important; } }
@media (min-width:651px) and (max-height:540px) { ${FAB} { padding:8px 10px !important; } }
@media (min-width:651px) and (max-height:460px) { ${FAB} { padding:6px 8px !important; } }
/* a wide desktop stage: stand the card off the stage's right edge instead of doubling a hairline */
@media (min-width:1101px) { ${FAB} { margin-right:14px !important; } }
@media (min-width:1101px) and (max-height:540px) { ${FAB} { margin-right:6px !important; } }
/* short dense stages already pad the fab bottom for the absolute foot (stationTabsLayouts.js);
   the card pays for its own pad by trimming that extra so FABRICATE stays reachable */
@media (min-width:651px) and (max-width:1100px) and (max-height:640px) {
  ${FAB} { padding:8px 10px 40px !important; } }
`;

export function injectOrreryStationIndustry(doc = globalThis.document) {
  if (!doc?.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
