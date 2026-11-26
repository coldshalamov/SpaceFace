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
/* ==== RUGGEDIZED METAL-AND-GLASS BAR COMMS TERMINAL ======================================== */
${ID} {
  box-sizing:border-box !important; position:relative !important; isolation:isolate;
  border:1px solid rgb(154 198 218 / .34) !important; border-radius:2px !important;
  background:
    linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 140px, rgb(158 220 233 / .14) 140px 100%) top left / 100% 2px no-repeat,
    repeating-linear-gradient(0deg, rgb(158 220 233 / .012) 0 1px, transparent 1px 3px),
    radial-gradient(120% 90% at 18% 0%, rgb(24 54 74 / .34), transparent 62%),
    linear-gradient(160deg, rgb(11 24 35 / .95) 0%, rgb(7 16 24 / .97) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .14), inset 0 -2px 0 rgb(2 6 10 / .85), 0 10px 26px rgb(0 0 0 / .56) !important;
  padding:16px 18px !important; min-width:0; }
${ID}::before { content:none !important; display:none !important; }
${ID} .sx-talk__role { color:#9edce9 !important; font-weight:700 !important; letter-spacing:.08em !important; }
${ID} .sx-talk__name { color:#f4f9fc !important; }
${T} .sx-bar .sx-talk__reply {
  border-left:2px solid #e6ca8f !important;
  padding-left:12px !important;
  color:rgb(238 247 251 / .95) !important;
}
${T} .sx-bar .sx-bar-offer {
  border:1px solid rgb(230 202 143 / .55) !important;
  border-radius:2px !important;
  background:linear-gradient(160deg, rgb(16 32 46 / .94), rgb(9 19 28 / .97)) !important;
  box-shadow:inset 3px 0 0 #e6ca8f, inset 0 1px 0 rgb(255 241 207 / .18), 0 6px 18px rgb(0 0 0 / .5) !important;
  padding:10px 14px !important;
}
/* Lead rows: keep reward figure and Inspect micro-button in strictly disjoint static columns so
   Inspect never overlaps/buries the credit value in any hover/focus/rest state. */
${T} .sx-bar .sx-lead {
  display:grid !important;
  grid-template-columns:minmax(0, 1fr) auto !important;
  align-items:center !important;
  column-gap:10px !important;
}
${T} .sx-bar .sx-lead__body {
  display:flex !important;
  flex-direction:row !important;
  align-items:baseline !important;
  justify-content:space-between !important;
  gap:8px !important;
  min-width:0 !important;
}
${T} .sx-bar .sx-lead__s {
  visibility:visible !important;
  flex:none !important;
  white-space:nowrap !important;
}
${T} .sx-bar .sx-lead:is(:hover, :focus-within) .sx-lead__s {
  visibility:visible !important;
}
${T} .sx-bar .sx-lead__go {
  position:static !important;
  inset:auto !important;
  left:auto !important;
  right:auto !important;
  top:auto !important;
  bottom:auto !important;
  transform:none !important;
  opacity:1 !important;
  pointer-events:auto !important;
  visibility:visible !important;
  flex:none !important;
}
@media (max-height:820px) { ${ID} { border-radius:2px !important; } }
@media (max-height:400px) { ${ID} { border-radius:2px !important; } }
@media (max-width:820px) { ${ID} { border-radius:2px !important; } }
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
/* the hang is the tab body's scroll window: when its content runs past the glass it folds at the
   rim (the house dissolve, scrollExtent.js) instead of guillotining whatever stands there — the
   foot's board verbs were cut mid-glyph at rest (bench 1440x900). The paired pad keeps the fold on
   empty column at scroll end, so the verbs read whole when scrolled to (the ladder's RC-49 pairing).
   The bar screens wire syncScrollExtent on the hang each render. */
${T} .sx-bar__hang[data-overflow="1"] { -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 32px), rgb(0 0 0 / .45) calc(100% - 13px), transparent) !important; mask-image:linear-gradient(180deg, #000 calc(100% - 32px), rgb(0 0 0 / .45) calc(100% - 13px), transparent) !important; }
/* the pad rides the standard sheet's own escalation prefix (stationStandard.js P: triple :root,
   doubled .orr-station) plus the overflow attribute, so it beats that sheet's 9px/12px padding
   shorthand — the fold must land on empty column at scroll end (RC-49) */
html:root:root:root:not([data-sf-mobile="1"]) body #screens > .sx-berth.orr-station.orr-station .sx-bar__hang[data-overflow="1"] { padding-bottom:32px !important; }
${T} .sx-bar__hang[data-overflow="0"] { -webkit-mask-image:none !important; mask-image:none !important; }
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
