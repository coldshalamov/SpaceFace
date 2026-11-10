// ORRERY composition for the station's Bar tab (design/frontend/ORRERY.md §6 Station — Bar).
// The tab's shared grammar (the contacts ladder, the portrait, the voice arc) lives in stationTabsLayouts.js;
// this sheet owns only the talk reading's plate: who you are talking to reads as one card.
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-station-bar';
const T = 'html body #screens > .sx-berth.orr-station';
// the same warm bone the station tabs' grammar is drawn with (stationTabsLayouts.js)
const BONE = '236 230 216';
// deeper than stationTabsLayouts.js's talk rules (T/D … .sx-talk__id, D … .sx-talk__head > .sx-talk__id),
// so same-property overrides win without editing that file
const ID = `html:root ${T.slice(5)} .sx-bar .sx-talk > .sx-talk__head > .sx-talk__id`;

const CSS = `
/* ui-polish-405: the talk reading (role · name · memory) wears the promise-scale hairline card (1px bone ~18% /
   radius 10 / faint fill / padded), the dossier, factions and ledger grammar (ui-polish-401…403). The shade-pool
   ::before that stationTabsLayouts.js paints under it stands down. Densify radius 8→6 and the padding tightens
   on short stages. */
${ID} {
  box-sizing:border-box !important; position:relative !important; isolation:isolate;
  background:rgb(${BONE} / .025) !important; border:1px solid rgb(${BONE} / .18) !important;
  border-radius:10px; box-shadow:none !important; padding:16px 18px !important; min-width:0; }
${ID}::before { content:none !important; display:none !important; }
@media (max-height:820px) { ${ID} { border-radius:8px; } }
@media (max-height:400px) { ${ID} { border-radius:6px; } }
@media (max-width:820px) { ${ID} { border-radius:8px; } }
@media (max-height:800px) { ${ID} { padding:10px 14px !important; } }
@media (max-height:600px) { ${ID} { padding:8px 12px !important; } }
/* on a short stage the card pays for its padding out of the reading's own rhythm (10px between role, name and
   memory in stationTabsLayouts.js), so the questions below keep their seat */
@media (min-height:601px) and (max-height:800px) { ${ID} > * + * { margin-top:5px !important; } }
@media (max-height:460px) { ${ID} { padding:6px 10px !important; } }
@media (max-width:650px) { ${ID} { padding:12px 14px !important; } }
/* 801–1100 × ≤600: the reading is a strip beside the portrait (stationTabsLayouts.js caps it at 100% - 250px); the card
   gives back the width its padding took, so the memory keeps its two lines instead of wrapping a third */
@media (min-width:801px) and (max-width:1100px) and (min-height:461px) and (max-height:600px) {
  ${ID} { max-width:calc(100% - 226px) !important; } }
/* the tall screen's eyeline drop (stationTabsLayouts.js pads the reading's top) moves outside the card,
   so the plate starts where the words do instead of carrying an empty band above them */
@media (min-width:1500px) and (min-height:900px) {
  ${ID} { padding-top:16px !important; margin-top:clamp(0px, calc((100vh - 900px) * .45 - 16px), 68px) !important; } }
`;

export function injectOrreryStationBar(doc = globalThis.document) {
  if (!doc?.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
