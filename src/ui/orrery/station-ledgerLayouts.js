// ORRERY composition for the station's Ledger tab (design/frontend/ORRERY.md §6 Station — Ledger).
// The tab's shared grammar (the tape, the ladder, the reading's spine) lives in stationTabsLayouts.js;
// this sheet owns only the reading's plate: the entry under the pointer or focus reads as one card.
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-station-ledger';
const T = 'html body #screens > .sx-berth.orr-station';
// the same warm bone the station tabs' grammar is drawn with (stationTabsLayouts.js)
const BONE = '236 230 216';
// deeper than stationTabsLayouts.js's desktop reading rules (D … .sx-ledger__row > .sx-ledger__read:not([hidden])),
// so same-property overrides win without editing that file
const READ = `html:root ${T.slice(5)} .sx-ledger .sx-ledger__right .sx-ledger__read.fh-plate:not([hidden])`;

const CSS = `
/* ui-polish-403: the ledger reading wears the promise-scale hairline card (1px bone ~18% / radius 10 /
   faint fill / padded), the factions (ui-polish-401) and contracts (ui-polish-402) grammar. The shade-pool
   ::before that stationTabsLayouts.js paints under the reading stands down; its spine ::after stays.
   Densify radius 8→6 and the padding tightens on short stages. */
${READ} {
  box-sizing:border-box !important; position:relative !important; isolation:isolate;
  background:rgb(${BONE} / .025) !important; border:1px solid rgb(${BONE} / .18) !important;
  border-radius:10px; box-shadow:none !important; padding:16px 18px !important; min-width:0; }
${READ}::before { content:none !important; display:none !important; }
@media (max-height:820px) { ${READ} { border-radius:8px; } }
@media (max-height:460px) { ${READ} { border-radius:8px; } }
@media (max-height:400px) { ${READ} { border-radius:6px; } }
@media (max-width:760px) { ${READ} { border-radius:8px; } }
@media (max-width:820px) { ${READ} { border-radius:8px; } }
@media (max-height:600px) { ${READ} { padding:12px 14px !important; } }
@media (max-height:540px) { ${READ} { padding:10px 12px !important; } }
@media (max-height:460px) { ${READ} { padding:8px 10px !important; } }
@media (max-width:650px) { ${READ} { padding:14px 16px !important; } }
/* a wide desktop reading spans to the stage frame: the card stands off its right edge instead of doubling its hairline */
@media (min-width:1101px) { ${READ} { margin-right:14px !important; } }
/* the tape's leader runs along the kicker line to a fixed end tick (ledgerTape.js): where it does, the kicker keeps
   master's seat (26px down, 12px in) so the leader still clears its last glyph */
@media (min-width:1101px) and (min-height:601px) { ${READ} { padding:25px 18px 16px 11px !important; } }
@media (min-width:1101px) and (max-height:540px) { ${READ} { margin-right:6px !important; } }
/* 651–1100 × ≤640: the reading is one band (figure | what · where) beside the purse; the card gives back the width
   its padding took, so the kicker holds one line and the line keeps its place name */
@media (min-width:651px) and (max-width:1100px) and (max-height:640px) {
  ${READ} { padding:8px 6px 8px 10px !important; column-gap:8px !important; } }
@media (min-width:651px) and (max-width:900px) and (max-height:640px) { ${READ} { padding:8px 4px 8px 8px !important; column-gap:6px !important; } }
`;

export function injectOrreryStationLedger(doc = globalThis.document) {
  if (!doc?.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
