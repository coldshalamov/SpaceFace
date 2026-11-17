// Title navigation keeps the authored world and puts its verbs on complete, tactile controls.
// A mode's image, padding, edge, name, description and action belong to the SAME native button.
// Main-menu state, save ownership and input intents remain in mainMenu.js.
import { injectOrrery } from './tokens.js';

const img = (name) => new URL('../../../assets/ui/backdrops/' + name, import.meta.url).href;
const ADVENTURE_IMG = img('backdrop-title.jpg');
const SWARM_IMG = img('backdrop-crucible-door.jpg');
const STYLE_ID = 'sf-orrery-title-doors-layouts';
const T = 'html body .of-title.orr-title--doors';
const LI = (action) => `${T} .of-title-actions li:has(> [data-action="${action}"])`;
const DOOR = `${T} .of-title-actions li.of-title-door > button`;
const UTILITY = `${T} .of-title-actions li:not(.of-title-door) > button`;

export const TITLE_DOORS_LAYOUT_CSS = `
${T} {
  --title-ink:var(--dp-ink, #ece6d8); --title-accent:var(--dp-hand, #f2b950);
  --title-line:rgb(206 221 230 / .24); --title-panel:rgb(12 21 30 / .9);
  --dp-margin:clamp(24px, 4vw, 72px);
  user-select:none; -webkit-user-select:none; -webkit-tap-highlight-color:transparent;
}
${T} :is(input, textarea, [contenteditable="true"]) { user-select:text; -webkit-user-select:text; }
${T} .dp-logotype { width:clamp(280px, 37vw, 680px) !important; max-width:100%; }
${T} .dp-title__rule, ${T} .dp-title__eyebrow:empty { display:none !important; }
${T} .dp-title__eyebrow { max-width:60ch; white-space:normal; font:500 14px/1.45 var(--dp-face-body, 'Instrument Sans'), sans-serif; }
${T} > .dp-frame__body { grid-template-columns:minmax(0, 1fr) !important; align-items:center; }
${T} .dp-veil--column { width:72%; background:linear-gradient(90deg, rgb(6 11 17 / .92), rgb(6 11 17 / .58) 62%, transparent); }
${T} .of-title-actions {
  display:grid !important; grid-template-columns:repeat(12, minmax(0, 1fr)) !important;
  gap:10px !important; width:min(570px, 46vw) !important; min-width:0;
  margin:0 !important; padding:4px !important; align-content:start; align-self:center !important;
  position:relative !important; left:auto !important; right:auto !important; top:auto !important;
  bottom:auto !important; transform:none !important; height:auto !important;
  max-height:100%; overflow:hidden auto; overscroll-behavior:contain; scrollbar-width:thin;
}
${T} .of-title-actions::before { display:none !important; }
${T} .of-title-actions > ul:not(.of-title-aside) { display:contents !important; }
${T} .of-title-actions li { margin:0 !important; padding:0 !important; list-style:none; min-width:0; width:auto !important; max-width:none !important; position:relative !important; }
${T} .of-title-actions :is(li[hidden], ul[hidden]) { display:none !important; }
${T} .of-title-actions li.of-title-door { grid-column:1 / -1; order:1; }
${T} .of-title-actions li.of-title-door.is-swarm { order:2; }
${T} .of-title-actions li.of-title-door.is-adventure { --door-image:url("${ADVENTURE_IMG}"); --door-position:70% 55%; }
${T} .of-title-actions li.of-title-door.is-swarm { --door-image:url("${SWARM_IMG}"); --door-position:center 54%; }
${DOOR} {
  appearance:none; box-sizing:border-box; display:flex !important; flex-direction:column; align-items:flex-start;
  justify-content:center; gap:0; position:relative; isolation:isolate; overflow:hidden;
  width:100% !important; min-height:clamp(142px, 18vh, 194px); margin:0 !important;
  padding:20px 70px 20px 26px !important; cursor:pointer; text-align:left; white-space:normal;
  color:var(--title-ink) !important; background:var(--title-panel) !important;
  border:1px solid var(--title-line) !important; border-left:3px solid rgb(206 221 230 / .36) !important;
  border-radius:3px !important; box-shadow:0 9px 26px rgb(0 0 0 / .18) !important;
  font:500 16px/1.4 var(--dp-face-body, 'Instrument Sans'), sans-serif !important;
  letter-spacing:0 !important; text-transform:none !important; text-shadow:0 1px 4px rgb(0 0 0 / .4);
  transition:background-color .16s ease, border-color .16s ease, box-shadow .16s ease;
}
${DOOR}::before {
  content:"" !important; display:block !important; position:absolute !important; inset:0 !important;
  width:auto !important; height:auto !important; margin:0 !important; transform:none !important; z-index:-1;
  background:linear-gradient(90deg, rgb(10 18 27 / .99) 8%, rgb(10 18 27 / .93) 42%, rgb(10 18 27 / .12) 100%), var(--door-image) var(--door-position, center) / cover no-repeat !important;
  opacity:.9 !important; border:0 !important; box-shadow:none !important; border-radius:0 !important; pointer-events:none;
}
${DOOR}::after, ${UTILITY}::after { display:none !important; content:none !important; }
${DOOR}:is(:hover, :focus-visible, [data-awake]) {
  border-color:var(--title-accent) !important; border-left-color:var(--title-accent) !important;
  box-shadow:inset 0 0 0 1px rgb(242 185 80 / .2), 0 10px 28px rgb(0 0 0 / .2) !important;
  background:rgb(24 32 40 / .98) !important; outline:none !important;
}
${DOOR}:focus-visible { outline:2px solid var(--title-accent) !important; outline-offset:2px !important; }
${DOOR}:active { box-shadow:inset 0 0 0 2px var(--title-accent) !important; }
${DOOR}[aria-disabled="true"] { opacity:.55 !important; cursor:progress; }
${DOOR} > * { pointer-events:none; }
${T} .of-title-door-type { font:650 12px/1.3 var(--dp-face-label, 'Archivo'), sans-serif; letter-spacing:.18em; text-transform:uppercase; color:rgb(181 202 218); }
${T} .of-title-door-name { display:block; margin:5px 0 7px; font:800 clamp(25px, 3.5vh, 38px)/1.05 var(--dp-face-display, 'Archivo'), sans-serif; letter-spacing:.02em; text-transform:uppercase; color:var(--title-ink); }
${DOOR} .dp-lit__note {
  display:-webkit-box !important; -webkit-line-clamp:2; -webkit-box-orient:vertical;
  position:static !important; clip:auto !important; clip-path:none !important; width:auto !important; height:auto !important;
  overflow:hidden !important; margin:0 !important; padding:0 !important; max-width:38ch;
  font:400 15px/1.45 var(--dp-face-body, 'Instrument Sans'), sans-serif !important; letter-spacing:0 !important;
  text-transform:none !important; color:rgb(218 226 232) !important;
}
${T} .of-title-door-action { display:block; margin-top:13px; color:var(--title-accent); font:650 13px/1.3 var(--dp-face-label, 'Archivo'), sans-serif; letter-spacing:.05em; }
${T} .of-title-door-arrow { position:absolute; right:24px; top:50%; transform:translateY(-50%); color:var(--title-accent); font:400 28px/1 var(--dp-face-body, 'Instrument Sans'), sans-serif; transition:transform .16s ease; }
${DOOR}:is(:hover, :focus-visible) .of-title-door-arrow { transform:translate(4px, -50%); }
${T} .of-title-actions li.of-title-door-secondary, ${LI('load')} { grid-column:span 6; order:3; }
${T} .of-title-actions:not(.has-save) li:has(> [data-action="load"]) { display:none !important; }
${LI('settings')}, ${LI('help')}, ${LI('quit')} { grid-column:span 4; order:4; }
${T} .of-title-actions:not(.can-quit) li:has(> :is([data-action="settings"], [data-action="help"])) { grid-column:span 6; }
${UTILITY} {
  appearance:none; display:flex !important; align-items:center; justify-content:center;
  box-sizing:border-box; width:100% !important; min-height:46px; margin:0 !important; padding:10px 12px !important;
  font:650 13px/1.35 var(--dp-face-label, 'Archivo'), sans-serif !important; letter-spacing:.06em !important;
  white-space:normal; text-transform:uppercase; text-align:center; color:var(--title-ink) !important;
  background:rgb(12 21 30 / .82) !important; border:1px solid var(--title-line) !important; border-radius:3px !important;
  box-shadow:none !important; cursor:pointer; transition:background-color .16s ease, border-color .16s ease;
}
${UTILITY}::before { display:none !important; content:none !important; }
${UTILITY}:is(:hover, :focus-visible, [data-awake]) { background:rgb(33 44 54 / .96) !important; border-color:var(--title-accent) !important; color:#fff !important; outline:none !important; }
${UTILITY}:focus-visible { outline:2px solid var(--title-accent) !important; outline-offset:2px !important; }
${UTILITY}:active { background:rgb(65 56 38 / .98) !important; }
${UTILITY} :is(.of-title-door-type, .dp-lit__note, .of-title-door-action, .of-title-door-arrow) { display:none !important; }
${UTILITY} .of-title-door-name { margin:0; font:inherit; color:inherit; }
${T} .of-title-actions .of-title-more {
  grid-column:1 / -1; order:5; appearance:none; display:flex; align-items:center; justify-content:space-between;
  min-height:44px; padding:10px 14px !important; cursor:pointer; color:rgb(207 220 229) !important;
  background:rgb(8 16 24 / .65) !important; border:1px solid rgb(206 221 230 / .16) !important; border-radius:3px !important;
  font:600 13px/1.4 var(--dp-face-label, 'Archivo'), sans-serif !important; letter-spacing:.03em !important; text-transform:none;
}
${T} .of-title-more::before { display:none !important; }
${T} .of-title-more::after { content:"+" !important; font-size:20px; position:static !important; background:none !important; width:auto; height:auto; transform:none; opacity:1; }
${T} .of-title-more[aria-expanded="true"]::after { content:"−" !important; }
${T} .of-title-more:is(:hover, :focus-visible) { border-color:var(--title-accent) !important; color:#fff !important; outline:none !important; }
${T} .of-title-more:focus-visible { outline:2px solid var(--title-accent) !important; outline-offset:2px !important; }
${T} .of-title-actions > ul.of-title-aside {
  grid-column:1 / -1; order:6; display:grid !important; grid-template-columns:repeat(2, minmax(0, 1fr));
  gap:8px; list-style:none; margin:0 !important; padding:2px 0 4px !important; width:100% !important;
}
${T} .of-title-actions > ul.of-title-aside[hidden] { display:none !important; }
${T} .of-title-aside li > button { min-height:88px; flex-direction:column; gap:5px; align-items:flex-start; text-align:left; }
${T} .of-title-aside .dp-lit__note {
  display:block !important; position:static !important; clip:auto !important; clip-path:none !important;
  width:auto !important; height:auto !important; padding:0 !important; margin:0 !important;
  font:400 12px/1.4 var(--dp-face-body, 'Instrument Sans'), sans-serif !important;
  letter-spacing:0 !important; text-transform:none !important; color:rgb(192 207 220) !important;
}
${T} .of-title-aside button > * { pointer-events:none; }
${T} .dp-frame__foot { gap:10px; color:rgb(210 220 226) !important; opacity:1 !important; }
${T} .dp-frame__foot :is(button, span) { color:inherit !important; font:600 12px/1.4 var(--dp-face-label, 'Archivo'), sans-serif; }
${T} .dp-frame__foot button { min-height:36px; padding:8px 4px; cursor:pointer; }
${T} .dp-frame__foot button:is(:hover, :focus-visible) { color:var(--title-accent) !important; text-decoration:underline; text-underline-offset:4px; }
@media (max-height:760px) {
  ${T} { --dp-margin:24px; gap:18px; }
  ${T} .dp-logotype { width:clamp(280px, 34vw, 480px) !important; }
  ${DOOR} { min-height:126px; padding:16px 60px 16px 20px !important; }
  ${T} .of-title-door-action { margin-top:8px; }
  ${T} .of-title-door-name { font-size:28px; }
  ${T} .of-title-actions { gap:8px !important; }
}
@media (max-width:850px) {
  ${T} .of-title-actions { width:min(520px, 68vw) !important; }
}
@media (max-width:600px) {
  ${T} { --dp-margin:20px; gap:18px; }
  ${T} .of-title-actions { width:100% !important; align-self:start !important; padding:3px !important; }
  ${T} .dp-logotype { width:100% !important; max-width:400px; }
  ${T} .dp-veil--column { width:100%; background:linear-gradient(90deg, rgb(6 11 17 / .85), rgb(6 11 17 / .62)); }
  ${DOOR} { min-height:150px; padding:18px 48px 18px 18px !important; }
  ${T} .of-title-door-name { font-size:28px; }
  ${DOOR} .dp-lit__note { font-size:14px !important; }
  ${T} .of-title-door-arrow { right:15px; }
  ${T} .dp-frame__foot { gap:6px; }
}
@media (prefers-reduced-motion:reduce) {
  ${T} *, ${T} *::before, ${T} *::after { transition:none !important; animation:none !important; }
}
html.sf-reduce-motion ${T.replace('html body ', '')} *, html.sf-reduce-motion ${T.replace('html body ', '')} *::after { transition:none !important; animation:none !important; }
@media (forced-colors:active) {
  ${DOOR}, ${UTILITY}, ${T} .of-title-more { border:1px solid ButtonText !important; background:Canvas !important; color:ButtonText !important; box-shadow:none !important; }
  ${DOOR}::before { display:none !important; }
  ${DOOR}:focus-visible, ${UTILITY}:focus-visible, ${T} .of-title-more:focus-visible { outline:2px solid Highlight !important; }
  ${T} :is(.of-title-door-name, .of-title-door-type, .of-title-door-action, .of-title-door-arrow), ${DOOR} .dp-lit__note { color:ButtonText !important; }
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
