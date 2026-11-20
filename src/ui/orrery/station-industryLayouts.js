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
/* Blueprint list thumbnails, output specimen header, input row thumbnails, and clean blocker badge */
${D} .sx-ind-process__items .sx-ind-row { align-items:center !important; gap:10px !important; }
${D} .sx-ind-process__items .sx-ind-row .sx-ind-row__body { min-width:0 !important; flex:1 1 auto !important; }
${D} .sx-ind-process__items .sx-ind-row .sx-ind-row__thumb { flex:none !important; }
${D} .sx-fab > .sx-fab-head { grid-row:1 / span 3 !important; display:flex !important; align-items:center; gap:16px; margin-bottom:4px; min-width:0; }
${D} .sx-fab-head__copy { display:flex; flex-direction:column; gap:4px; min-width:0; flex:1 1 auto; }
${D} .sx-fab-head__thumb { flex:none; }
${D} .sx-fab-in { grid-template-columns:30px minmax(0, 1fr) auto auto !important; align-items:center !important; column-gap:12px !important; padding:4px 0 !important; }
${D} .sx-fab-in__thumb { grid-column:1; }
${D} .sx-fab-in__name { grid-column:2; min-width:0; }
${D} .sx-fab-in__q { justify-self:end; }
@media (min-width:1101px) and (min-height:801px) {
  ${D} .orr-ind-chain .orr-chain__label:has(> .orr-chain__reason) {
    left:auto !important; right:0 !important; top:-22px !important; width:auto !important; max-width:44% !important;
    white-space:normal !important; text-align:right !important; align-items:flex-end !important;
  }
  ${D} .orr-ind-chain .orr-chain__label:has(> .orr-chain__reason) .orr-chain__verb { align-items:flex-end !important; text-align:right !important; }
  ${D} .orr-ind-chain .orr-chain__label:has(> .orr-chain__reason) .orr-chain__verb > .orr-chain__wayout { margin-left:auto !important; }
  ${D} .orr-ind-chain .orr-chain__reason-leader { display:none !important; }
}
/* dark deckplate: the fabrication reading & blueprint rack wear Recessed Visor Glass Bays */
@media (min-width:651px) {
${FAB} {
  box-sizing:border-box !important; position:relative !important; isolation:isolate;
  border:1px solid rgb(154 198 218 / .32) !important; border-radius:2px !important;
  background:
    linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 140px, rgb(158 220 233 / .14) 140px 100%) top left / 100% 2px no-repeat,
    repeating-linear-gradient(0deg, rgb(158 220 233 / .012) 0 1px, transparent 1px 3px),
    radial-gradient(120% 90% at 18% 0%, rgb(24 54 74 / .34), transparent 62%),
    linear-gradient(160deg, rgb(11 24 35 / .95) 0%, rgb(7 16 24 / .97) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .14), inset 0 -2px 0 rgb(2 6 10 / .85), 0 12px 28px rgb(0 0 0 / .58) !important;
  padding:16px 18px !important; min-width:0; }
${FAB}::before { content:none !important; display:none !important; }
}
${D} .sx-ind > .sx-ind__list {
  background-image:none !important;
}
@media (min-width:901px) and (min-height:641px) {
  ${D} .sx-ind > .sx-ind__list {
    box-sizing:border-box !important;
    border:1px solid rgb(154 198 218 / .32) !important;
    border-radius:2px !important;
    background:
      linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 140px, rgb(158 220 233 / .14) 140px 100%) top left / 100% 2px no-repeat,
      repeating-linear-gradient(0deg, rgb(158 220 233 / .012) 0 1px, transparent 1px 3px),
      radial-gradient(120% 90% at 18% 0%, rgb(24 54 74 / .34), transparent 62%),
      linear-gradient(160deg, rgb(11 24 35 / .95) 0%, rgb(7 16 24 / .97) 100%) !important;
    box-shadow:inset 0 1px 0 rgb(208 238 250 / .14), inset 0 -2px 0 rgb(2 6 10 / .85), 0 12px 28px rgb(0 0 0 / .58) !important;
    padding:12px 14px !important;
  }
}
${D} .sx-ind .sx-ind__list > .orr-extent:not(.orr-extent--foot),
${D} .sx-ind .sx-ind__list .orr-extent:not(.orr-extent--foot),
${D} .sx-ind .sx-ind__list .orr-extent:not(.orr-extent--foot)::before,
${D} .sx-ind .sx-ind__list .orr-extent:not(.orr-extent--foot)::after {
  display:none !important;
  content:none !important;
}
${D} .sx-ind .sx-ind__list .sx-ind-process__items,
${D} .sx-ind .sx-ind__list .sx-ind-process__items:is(:hover, :focus-within) {
  background:none !important;
  background-image:none !important;
}
${D} .sx-ind .sx-ind-process__head {
  padding-left:0 !important;
  padding-bottom:4px !important;
  border-bottom:1px solid rgb(158 220 233 / .20) !important;
}
${D} .sx-ind .sx-ind-process__items .sx-ind-row {
  padding:6px 10px !important;
  border-bottom:1px solid rgb(154 198 218 / .12) !important;
  border-radius:2px !important;
  background:none !important;
  transition:background 120ms ease, box-shadow 120ms ease;
}
@media (min-width:651px) and (max-height:800px), (max-height:600px) {
  ${D} .sx-ind .sx-ind-process__items .sx-ind-row { padding:3px 8px !important; }
}
${D} .sx-ind .sx-ind-process__items .sx-ind-row::before,
${D} .sx-ind .sx-ind-process__items .sx-ind-row::after,
${D} .sx-ind .sx-ind-process__items .sx-ind-row.is-ready::before,
${D} .sx-ind .sx-ind-process__items .sx-ind-row:is(:hover, :focus-visible, :active, .is-active, .is-selected, [aria-selected="true"])::before,
${D} .sx-ind .sx-ind-process__items .sx-ind-row:is(:hover, :focus-visible, :active, .is-active, .is-selected, [aria-selected="true"])::after {
  content:none !important;
  display:none !important;
}
${D} .sx-ind .sx-ind-process__items .sx-ind-row:is(:hover, :focus-visible) {
  background:rgb(158 220 233 / .08) !important;
  box-shadow:inset 2px 0 0 rgb(158 220 233 / .68) !important;
}
${D} .sx-ind .sx-ind-process__items .sx-ind-row:is(.is-active, .is-selected, [aria-selected="true"]) {
  background:linear-gradient(90deg, rgb(224 181 94 / .22) 0%, rgb(224 181 94 / .07) 65%, rgb(14 29 42 / .92) 100%) !important;
  box-shadow:inset 3px 0 0 #e6ca8f, inset 0 1px 0 rgb(255 241 207 / .20) !important;
}
${D} .sx-ind .sx-ind-process__items .sx-ind-row:is(.is-active, .is-selected, [aria-selected="true"]) .sx-ind-row__name {
  color:#fff1cf !important;
}
${D} .sx-ind .sx-ind-process__head .k-caps,
${D} .sx-ind .sx-fab > .k-caps,
${D} .sx-ind .sx-fab-inputs > .k-caps {
  color:#9edce9 !important;
}
${D} .sx-ind .sx-ind-row.is-ready .sx-ind-row__state { color:#9edce9 !important; }
${D} .sx-ind .sx-ind-row.is-short .sx-ind-row__state { color:#f1b059 !important; }
${D} .sx-ind .sx-ind-row.is-locked .sx-ind-row__state { color:rgb(255 113 89 / .78) !important; }
${D} .sx-ind .sx-fab-in {
  border-bottom:1px solid rgb(154 198 218 / .16) !important;
  padding:6px 2px !important;
}
${D} .sx-ind .sx-fab-build.orr-lampkey {
  color:#fff1cf !important;
  font-weight:700 !important;
  letter-spacing:.1em !important;
}
${D} .sx-ind .sx-fab-build.orr-lampkey::before {
  clip-path:polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px)) !important;
  border:1px solid #e6ca8f !important;
  background:linear-gradient(180deg, rgb(224 181 94 / .34) 0%, rgb(224 181 94 / .14) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(255 241 207 / .26), 0 4px 12px rgb(0 0 0 / .45) !important;
}
${D} .sx-ind .sx-fab-build.orr-lampkey:not(:disabled):is(:hover, :focus-visible)::before {
  border-color:#fff1cf !important;
  background:linear-gradient(180deg, rgb(224 181 94 / .48) 0%, rgb(224 181 94 / .22) 100%) !important;
}
/* Keep the chain in its own grid row. A short berth can scroll the recipe card
   instead of squeezing the row under fixed-height gauges and their material labels. */
@media (min-width:651px) and (min-height:641px) {
  ${FAB} {
    height:auto !important; min-height:100%;
    grid-template-rows:auto auto auto minmax(min-content, 1fr) auto auto auto auto auto !important;
  }
}
@media (min-width:651px) and (max-height:820px) { ${FAB} { border-radius:2px !important; } }
@media (min-width:651px) and (max-height:400px) { ${FAB} { border-radius:2px !important; } }
@media (min-width:651px) and (max-width:820px) { ${FAB} { border-radius:2px !important; } }
@media (min-width:651px) and (max-width:760px) { ${FAB} { border-radius:2px !important; } }
@media (min-width:651px) and (max-height:800px) {
  ${FAB} { padding:8px 14px 10px !important; }
  ${FAB} > .sx-fab-head { margin-bottom:2px !important; }
  ${FAB} .orr-chain { max-height:176px !important; }
  ${FAB} .sx-fab-foot { margin-top:4px !important; }
  ${FAB} .sx-fab-build.orr-lampkey { min-height:34px !important; padding:4px 18px !important; }
}
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
