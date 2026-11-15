// TITLE-01 — the title as two doors (design/game/20_THE_FIRST_HOUR.md storyboard, 0:09 "Title"):
// ADVENTURE and SWARM side by side over the live hero scene, a small row under them (Settings, Help,
// Quit) and everything else behind one quiet "More". Layout and type only: the buttons, their
// data-action hooks, aria names and DOM order are the title's own (mainMenu.js, which also marks the two
// door items `of-title-door` + `is-adventure` / `is-swarm`); this sheet sets them out. The Adventure door is
// New Game for a new player and Continue when a save exists, in which case New Game stands on the door as its
// secondary key (`of-title-door-secondary`), never behind More. No dial and no menu over the ship: the doors
// stand in the lower left, clear of the hero.
import { injectOrrery } from './tokens.js';

const img = (name) => {
  try { return new URL('../../../assets/ui/backdrops/' + name, import.meta.url).href; } catch { return '../assets/ui/backdrops/' + name; }
};
const ADVENTURE_IMG = img('backdrop-title.jpg');
const SWARM_IMG = img('backdrop-crucible-door.jpg');
const STYLE_ID = 'sf-orrery-title-doors-layouts';
const T = 'html body .of-title.orr-title--doors';
const BONE = '236 230 216';
const LI = (action) => `${T} .of-title-actions li:has(> [data-action="${action}"])`;
const MORE_ACTIONS = ['load', 'crucible', 'archive', 'circuits', 'sandbox', 'physics'];
const MORE_LI = MORE_ACTIONS.map(LI).join(',\n');
const MORE_LI_OPEN = MORE_ACTIONS
  .map((a) => `${T} .of-title-actions.is-more-open li:has(> [data-action="${a}"])`).join(',\n');
const DOOR_LI = `${T} .of-title-actions li.of-title-door`;
const DOOR_BTN = `${DOOR_LI} > button`;
const SECOND_LI = `${T} .of-title-actions li.of-title-door-secondary`;
const ROW_BTN = `${T} .of-title-actions :is(li:has(> [data-action="settings"]), li:has(> [data-action="help"]), li:has(> [data-action="quit"]), li.of-title-door-secondary) > button`;
// the door word fits its own door: cqw is the door's inner width (ADVENTURE is ~6.1em of Archivo 800)
const DOOR_FONT = "800 clamp(28px, min(6vh, 15cqw), 58px)/1 var(--dp-face-display, 'Archivo')";

export const TITLE_DOORS_LAYOUT_CSS = `
/* the column becomes one grid: two doors (twelve of twenty-four columns each), then a row of small words */
${T} .of-title-actions {
  display:grid !important; grid-template-columns:repeat(24, minmax(0, 1fr)) !important; gap:14px 0 !important; column-gap:0 !important;
  width:min(600px, 46vw) !important; margin:0 !important; align-content:end; justify-items:stretch;
  position:absolute !important; left:48px !important; right:auto !important; top:auto !important;
  bottom:clamp(56px, 10vh, 110px) !important; transform:none !important;
  padding:0 !important; max-width:none !important; min-height:0 !important; height:auto !important; }
${T} .of-title-actions > ul { display:contents !important; list-style:none; margin:0; padding:0; }
${T} .of-title-actions li { margin:0 !important; padding:0 !important; list-style:none; min-width:0; position:static !important; width:auto !important; max-width:none !important; }
${T} .of-title-actions li[hidden] { display:none !important; }
/* no tech words on the way in: the standing line is empty, so its lamp goes too */
${T} .dp-title__eyebrow:empty { display:none !important; }
/* the doors */
${DOOR_LI}.is-adventure { grid-column:1 / span 12; grid-row:1; margin:0 7px 0 0 !important; --door-img:url("${ADVENTURE_IMG}"); }
${DOOR_LI}.is-swarm { grid-column:13 / span 12; grid-row:1; margin:0 0 0 7px !important; --door-img:url("${SWARM_IMG}"); }
${SECOND_LI} { grid-column:1 / span 12; grid-row:2; margin:0 7px 0 0 !important; }
/* the door is the list item: image, border and the notch on it; the word and its line sit inside in flow */
${DOOR_LI} {
  display:flex !important; flex-direction:column; justify-content:flex-end; min-height:clamp(210px, 34vh, 330px);
  padding:20px 26px 22px !important; box-sizing:border-box; position:relative !important; container-type:inline-size;
  background:linear-gradient(0deg, rgb(6 8 12 / .88) 0%, rgb(6 8 12 / .5) 40%, rgb(6 8 12 / 0) 100%), var(--door-img) center / cover no-repeat;
  border:1px solid rgb(${BONE} / .34); border-radius:2px;
  clip-path:polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%);
  transition:border-color .16s linear, box-shadow .16s linear; }
${DOOR_LI}:is(:hover, :focus-within) {
  border-color:var(--dp-hand, #f2b950); box-shadow:0 0 26px rgb(242 185 80 / .25);
  background:linear-gradient(0deg, rgb(20 14 6 / .92) 0%, rgb(14 10 6 / .5) 42%, rgb(6 8 12 / .05) 100%), var(--door-img) center / cover no-repeat; }
${DOOR_BTN} {
  display:block !important; width:100% !important; padding:0 !important; margin:0 !important; text-align:left; cursor:pointer;
  color:rgb(248 244 234) !important; background:none !important; border:0 !important; border-radius:0 !important; box-shadow:none !important;
  font:${DOOR_FONT} !important; letter-spacing:.02em !important; text-transform:uppercase; text-shadow:0 1px 0 rgb(0 0 0 / .6); }
/* the button's own text is the core copy (New Game / Continue); the door draws ADVENTURE from its data-door-label */
${DOOR_BTN}[data-door-label] { font-size:0 !important; line-height:0 !important; letter-spacing:0 !important; }
${DOOR_BTN}[data-door-label]::before { content:attr(data-door-label); display:block !important; position:static !important; inset:auto !important; width:auto !important; height:auto !important;
  margin:0 !important; padding:0 !important; background:none !important; border:0 !important; border-radius:0 !important; box-shadow:none !important; transform:none !important; opacity:1 !important;
  font:${DOOR_FONT}; letter-spacing:.02em; text-transform:uppercase; color:inherit; }
${DOOR_BTN}:is(:hover, :focus, :focus-visible, [data-awake]) { background:none !important; outline:none !important; box-shadow:none !important; }
/* the attention lamp's bracket round the word is not wanted on a door (the door itself lights) */
${DOOR_BTN}::after, ${DOOR_LI} .dp-lit__item::after { display:none !important; content:none !important; }
html body #screens .of-title.orr-title--doors .of-title-actions li.of-title-door > button.dp-lit__item:is(:focus, :focus-visible) { outline:0 solid transparent !important; outline-offset:0 !important; }
${DOOR_LI} .dp-lit__note {
  display:block !important; position:static !important; clip:auto !important; clip-path:none !important; width:auto !important; height:auto !important;
  overflow:visible !important; margin:10px 0 0 !important; font:400 15px/1.4 var(--dp-face-body, 'Instrument Sans'), sans-serif !important;
  letter-spacing:0 !important; text-transform:none; color:rgb(${BONE} / .82) !important; }
/* with a save: the door's line is a short Continue summary (two lines), and New Game's own line steps aside */
${DOOR_LI}.is-adventure .dp-lit__note { display:-webkit-box !important; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden !important; }
${SECOND_LI} .dp-lit__note { display:none !important; }
/* the fine line under the doors: readable on the lit scene */
${T} .dp-frame__foot, ${T} .dp-frame__foot * { color:rgb(${BONE} / .9) !important; text-shadow:0 1px 6px rgb(0 0 0 / .85); }
/* the small row (Settings, Help, Quit) is centred by mainMenu.js from how many words show; these are the full-row defaults */
${LI('settings')} { grid-column:1 / span 8; grid-row:2; }
${LI('help')} { grid-column:9 / span 8; grid-row:2; }
${LI('quit')} { grid-column:17 / span 8; grid-row:2; }
${T} .of-title-actions :is(li:has(> [data-action="settings"]), li:has(> [data-action="help"]), li:has(> [data-action="quit"])) { padding:0 5px !important; }
${ROW_BTN} {
  width:100% !important; min-height:44px; padding:8px 12px !important; text-align:center; justify-content:center;
  font:600 14px var(--dp-face-label, 'Archivo') !important; letter-spacing:.12em !important; text-transform:uppercase;
  color:rgb(${BONE} / .9) !important; background:rgb(8 10 14 / .6) !important; border:1px solid rgb(${BONE} / .22) !important; border-radius:2px !important;
  text-shadow:0 1px 0 rgb(0 0 0 / .6); }
${ROW_BTN}:is(:hover, :focus-visible, [data-awake]) { color:#fff !important; border-color:rgb(${BONE} / .6) !important; outline:none !important; }
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
  ${T} .of-title-actions { bottom:clamp(40px, 7vh, 70px) !important; gap:10px 0 !important; }
  ${DOOR_LI} { min-height:clamp(180px, 33vh, 230px); padding:16px 22px 18px !important; }
}
/* the phone: the two doors stacked, then the small row; More behind its toggle as on the desktop */
@media (max-width:700px) {
  ${T} .of-title-actions { position:relative !important; left:auto !important; right:auto !important; top:auto !important; bottom:auto !important; width:100% !important; margin:18px 0 0 !important; transform:none !important; gap:14px 0 !important; }
  ${DOOR_LI}.is-adventure, ${DOOR_LI}.is-swarm { grid-column:1 / -1 !important; margin:0 !important; min-height:clamp(132px, 19vh, 172px); clip-path:none; }
  ${T} .dp-logotype { margin-bottom:6px; }
  ${T} .of-title-more { margin-top:4px; }
  ${DOOR_LI}.is-adventure { grid-row:1 !important; }
  ${DOOR_LI}.is-swarm { grid-row:2 !important; }
  ${SECOND_LI} { grid-column:1 / -1 !important; grid-row:auto !important; margin:0 !important; }
  ${LI('settings')}, ${LI('help')}, ${LI('quit')} { grid-column:span 12 !important; grid-row:auto !important; }
  ${T} .of-title-actions { align-content:start !important; }
  ${LI('settings')}, ${LI('help')}, ${LI('quit')} { order:1; }
  ${T} .of-title-actions { column-gap:10px !important; }
  ${T} .of-title-actions :is(li:has(> [data-action="settings"]), li:has(> [data-action="help"]), li:has(> [data-action="quit"])) { padding:0 !important; }
  ${MORE_LI_OPEN} { grid-column:span 12 !important; order:2; padding:0 !important; }
  :is(${MORE_LI_OPEN}) .dp-lit__note { display:none !important; }
  ${T} .of-title-more { order:3; }
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
