// TITLE-01 — the title as two doors (design/game/20_THE_FIRST_HOUR.md storyboard, 0:09 "Title"):
// ADVENTURE and SWARM side by side over the live hero scene, a small row under them (Continue,
// Settings, Help, Quit) and everything else behind one quiet "More". Layout and type only: the
// buttons, their data-action hooks, aria names and DOM order are the title's own (mainMenu.js);
// this sheet sets them out. Scoped to the desktop title (`.orr-title--doors`); the phone keeps its
// own column. No dial and no menu over the ship: the doors stand in the lower third, clear of the
// logotype.
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-title-doors-layouts';
const T = 'html body .of-title.orr-title--doors';
const BONE = '236 230 216';
const LI = (action) => `${T} .of-title-actions li:has(> [data-action="${action}"])`;
const MORE_ACTIONS = ['load', 'crucible', 'archive', 'circuits', 'sandbox', 'physics'];
const MORE_LI = MORE_ACTIONS.map(LI).join(',\n');
const MORE_LI_OPEN = MORE_ACTIONS
  .map((a) => `${T} .of-title-actions.is-more-open li:has(> [data-action="${a}"])`).join(',\n');
const DOOR_LI = `${T} .of-title-actions :is(li:has(> [data-action="newGame"]), li:has(> [data-action="swarm"]))`;
const DOOR_BTN = `${T} .of-title-actions :is(li:has(> [data-action="newGame"]), li:has(> [data-action="swarm"])) > button`;
const ROW_BTN = `${T} .of-title-actions :is(li:has(> [data-action="continue"]), li:has(> [data-action="settings"]), li:has(> [data-action="help"]), li:has(> [data-action="quit"])) > button`;

export const TITLE_DOORS_LAYOUT_CSS = `
/* the column becomes one grid: two doors (two columns each), then a row of four small words */
${T} .of-title-actions {
  display:grid !important; grid-template-columns:repeat(24, minmax(0, 1fr)) !important; gap:14px 0 !important; column-gap:0 !important;
  width:min(560px, 44vw) !important; margin:0 !important; align-content:end; justify-items:stretch;
  position:absolute !important; left:48px !important; right:auto !important; top:auto !important;
  bottom:clamp(56px, 10vh, 110px) !important; transform:none !important;
  padding:0 !important; max-width:none !important; min-height:0 !important; height:auto !important; }
${T} .of-title-actions > ul { display:contents !important; list-style:none; margin:0; padding:0; }
${T} .of-title-actions li { margin:0 !important; padding:0 !important; list-style:none; min-width:0; position:static !important; width:auto !important; max-width:none !important; }
${T} .of-title-actions li[hidden] { display:none !important; }
/* the doors */
${LI('newGame')} { grid-column:1 / span 12; grid-row:1; padding-right:7px !important; }
${LI('swarm')} { grid-column:13 / span 12; grid-row:1; padding-left:7px !important; }
${DOOR_BTN} {
  display:flex !important; flex-direction:column; align-items:flex-start; justify-content:flex-end; gap:6px;
  width:100% !important; min-height:clamp(132px, 21vh, 190px); padding:18px 22px 50px !important; box-sizing:border-box;
  text-align:left; cursor:pointer; color:rgb(248 244 234) !important;
  background:linear-gradient(0deg, rgb(8 10 14 / .86), rgb(8 10 14 / .5)) !important;
  border:1px solid rgb(${BONE} / .34) !important; border-radius:2px !important;
  clip-path:polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%);
  font:800 clamp(30px, 4.4vh, 44px)/1 var(--dp-face-display, 'Archivo') !important; letter-spacing:.03em !important; text-transform:uppercase;
  text-shadow:0 1px 0 rgb(0 0 0 / .6);
  transition:border-color .16s linear, background .16s linear, box-shadow .16s linear; }
${DOOR_BTN}:is(:hover, :focus-visible, [data-awake]) {
  border-color:var(--dp-hand, #f2b950) !important; box-shadow:0 0 22px rgb(242 185 80 / .2);
  background:linear-gradient(0deg, rgb(26 20 10 / .88), rgb(8 10 14 / .55)) !important; outline:none !important; }
${DOOR_LI} { position:relative !important; }
${DOOR_LI} .dp-lit__note {
  display:block !important; position:absolute !important; left:23px !important; right:20px !important; bottom:14px !important; z-index:1; pointer-events:none; clip:auto !important; clip-path:none !important; width:auto !important; height:auto !important;
  overflow:visible !important; margin:0 !important; font:400 14px/1.4 var(--dp-face-body, 'Instrument Sans'), sans-serif !important;
  letter-spacing:0 !important; text-transform:none; color:rgb(${BONE} / .82) !important; }
/* the small row: Continue, Settings, Help, Quit */
/* the small row is centred by mainMenu.js (it sets each visible word's column from how many show);
   these are the full-row defaults */
${LI('continue')} { grid-column:1 / span 6; grid-row:2; }
${LI('settings')} { grid-column:7 / span 6; grid-row:2; }
${LI('help')} { grid-column:13 / span 6; grid-row:2; }
${LI('quit')} { grid-column:19 / span 6; grid-row:2; }
${T} .of-title-actions :is(li:has(> [data-action="continue"]), li:has(> [data-action="settings"]), li:has(> [data-action="help"]), li:has(> [data-action="quit"])) { padding:0 5px !important; }
${ROW_BTN} {
  width:100% !important; min-height:44px; padding:8px 12px !important; text-align:center; justify-content:center;
  font:600 14px var(--dp-face-label, 'Archivo') !important; letter-spacing:.12em !important; text-transform:uppercase;
  color:rgb(${BONE} / .9) !important; background:rgb(8 10 14 / .6) !important; border:1px solid rgb(${BONE} / .22) !important; border-radius:2px !important;
  text-shadow:0 1px 0 rgb(0 0 0 / .6); }
${ROW_BTN}:is(:hover, :focus-visible, [data-awake]) { color:#fff !important; border-color:rgb(${BONE} / .6) !important; outline:none !important; }
${T} .of-title-actions li:has(> [data-action="continue"]) .dp-lit__note { display:block; font:400 12px/1.3 var(--dp-face-body, 'Instrument Sans'), sans-serif !important; letter-spacing:0; text-transform:none; color:rgb(${BONE} / .75) !important; }
/* More: everything else, closed until asked */
${MORE_LI} { display:none !important; }
${MORE_LI_OPEN} { display:list-item !important; grid-row:auto; grid-column:auto / span 8; padding:0 5px !important; }
${T} .of-title-actions :is(${MORE_ACTIONS.map((a) => `[data-action="${a}"]`).join(', ')}) { width:100% !important; min-height:40px; padding:6px 12px !important; text-align:left;
  font:500 13px var(--dp-face-label, 'Archivo') !important; letter-spacing:.1em !important; text-transform:uppercase; color:rgb(${BONE} / .85) !important;
  background:rgb(8 10 14 / .6) !important; border:1px solid rgb(${BONE} / .16) !important; border-radius:2px !important; }
${T} .of-title-more { grid-column:1 / -1; justify-self:center; min-height:32px; padding:4px 14px !important;
  font:500 12px var(--dp-face-label, 'Archivo') !important; letter-spacing:.14em !important; text-transform:uppercase; color:rgb(${BONE} / .7) !important;
  background:none !important; border:0 !important; border-bottom:1px solid rgb(${BONE} / .3) !important; cursor:pointer; }
${T} .of-title-more:is(:hover, :focus-visible) { color:#fff !important; outline:none !important; border-bottom-color:var(--dp-hand, #f2b950) !important; }
/* the reference line that rode under the dial has no place here: its words live behind More */
${T} .of-title-aside { display:contents !important; }
@media (max-height:700px) {
  ${T} .of-title-actions { bottom:clamp(44px, 8vh, 80px); gap:10px; }
  ${DOOR_BTN} { min-height:104px; padding:12px 18px 12px !important; }
}
`;

export function injectTitleDoorsLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = TITLE_DOORS_LAYOUT_CSS;
  doc.head.appendChild(style);
}
