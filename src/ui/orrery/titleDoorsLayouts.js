// TITLE-02 — the title is two doors (design/overhaul/08_INTERFACE.md §2; ledger A3, A11, A12): SWARM and
// ADVENTURE side by side over the live hero scene, a small row of plain words under them (Load, Settings,
// Help, Quit — and New Game when a save owns the Adventure door), the fine line (version, Credits,
// Achievements) at the foot. The same composition at every size: the doors stand in the lower left,
// clear of the hero; on a narrow screen they stack under the name.
//
// Layout and type only. The buttons, their data-action hooks, aria names and DOM order are the title's own
// (src/ui/screens/mainMenu.js). mainMenu marks the door items `of-title-door` + `is-adventure` / `is-swarm`
// and dresses each door button with `.of-door__art/__kicker/__name/__line/__go` spans; a door that steps
// down into the small row (New Game with a save) carries `of-title-row-item` and shows `.of-door__plain`.
//
// Type: Archivo (display) for the two door names only; Instrument Sans (read) for every other word.
// Grid: 4 px steps; doors pad 20/24; one radius (4 px). Motion: 160 ms ease-out, none under reduced motion.
import { injectOrrery } from './tokens.js';

const asset = (path) => {
  try { return new URL('../../../' + path, import.meta.url).href; } catch { return '../' + path; }
};
const ADVENTURE_IMG = asset('assets/ui/generated/stations/station_helios.webp');
const SWARM_IMG = asset('assets/ui/kit/assets/tiles/tile.mode.swarm@2x.png');
const STYLE_ID = 'sf-orrery-title-doors-layouts';
const T = 'html body #screens .of-title.orr-title--doors';
const BONE = '236 230 216';
const GOLD = 'var(--dp-hand, #f2b950)';
const READ = "var(--dp-face-read, 'Instrument Sans'), system-ui, sans-serif";
const DISPLAY = "var(--dp-face-display, 'Archivo'), system-ui, sans-serif";
const EASE = 'cubic-bezier(.16, 1, .3, 1)';
const LIST = `${T} .of-title-actions > ul.dp-lit:not(.of-title-aside)`;
const DOOR_LI = `${LIST} > li.of-title-door`;
const DOOR = `${DOOR_LI} > button.of-door`;
const ROW_LI = `${LIST} > li:not(.of-title-door)`;
const ROW_BTN = `${ROW_LI} > button`;
const LAB = `${T} .of-title-actions > ul.of-title-aside`;

export const TITLE_DOORS_LAYOUT_CSS = `
/* the stage: one column in the lower left — the doors, then the row. The frame (fixed, inset 0) is its
   containing block, so the body box must not claim it. */
${T} > .dp-frame__body { position:static !important; transform:none !important; contain:none !important; }
${T} .of-title-actions {
  position:absolute !important; left:48px !important; right:auto !important; top:auto !important;
  bottom:clamp(72px, 12vh, 104px) !important; transform:none !important;
  display:flex !important; flex-direction:column !important; gap:12px !important;
  width:min(600px, 48vw, calc(100vw - 96px)) !important; max-width:none !important; min-height:0 !important; height:auto !important;
  margin:0 !important; padding:0 !important; z-index:2; }
${T} .dp-title__eyebrow:empty { display:none !important; }
${T} .of-title-strap { margin:12px 0 0 !important; max-width:44ch; font:500 clamp(15px, 2.2vh, 18px)/1.4 ${READ}; letter-spacing:.01em;
  color:rgb(${BONE} / .9); text-shadow:0 1px 3px rgb(0 0 0 / .95), 0 0 12px rgb(0 0 0 / .7); }
/* the attention pool and lamp beads of the light kit say "awake" a second time; the doors say it themselves */
${T} .of-title-actions::before, ${T} .of-title-actions .dp-lit::before { display:none !important; }
${LIST} {
  display:flex !important; flex-wrap:wrap !important; align-items:stretch; gap:12px !important;
  margin:0 !important; padding:0 !important; list-style:none; width:100% !important; }
${LIST} > li { margin:0 !important; padding:0 !important; list-style:none; position:static !important; min-width:0; width:auto !important; max-width:none !important; }
${LIST} > li[hidden], ${LAB} > li[hidden], ${LAB}[hidden] { display:none !important; }
${LIST} > li.of-title-door { flex:1 1 calc(50% - 6px) !important; }
${LIST} > li.of-title-door.is-swarm { order:0; }
${LIST} > li.of-title-door.is-adventure { order:1; }
${ROW_LI} { order:2; flex:0 0 auto !important; }

/* ── THE DOORS ─────────────────────────────────────────────────────────────────────────────── */
${DOOR} {
  position:relative !important; isolation:isolate; overflow:hidden !important; container-type:inline-size;
  display:flex !important; flex-direction:column !important; justify-content:safe flex-end !important; align-items:flex-start !important;
  width:100% !important; height:clamp(188px, 34vh, 300px) !important; min-height:0 !important;
  margin:0 !important; padding:52px 24px 20px !important; box-sizing:border-box;
  text-align:left !important; white-space:normal !important; cursor:pointer;
  color:rgb(248 244 234) !important; background:#0a0c10 !important;
  border:1px solid rgb(${BONE} / .26) !important; border-radius:4px !important; outline:none !important;
  box-shadow:0 10px 32px rgb(0 0 0 / .45) !important; text-shadow:none !important;
  font:inherit !important; letter-spacing:0 !important; text-transform:none !important;
  transform:none !important; opacity:1 !important;
  transition:border-color .16s ${EASE}, box-shadow .16s ${EASE}, transform .16s ${EASE} !important; }
${DOOR}::before, ${DOOR}::after { display:none !important; content:none !important; }
/* the picture is a clipped frame (the art span) around a painted plate (its ::before), so the awake zoom
   stays inside the frame: a scaled frame used to widen the door's scroll box by ~7px, which read as a
   horizontal clip to the layout checks */
${DOOR} > .of-door__art { position:absolute; inset:0; z-index:-1; pointer-events:none; overflow:hidden; border-radius:inherit; }
${DOOR} > .of-door__art::before {
  content:""; position:absolute; inset:0;
  background:
    linear-gradient(0deg, rgb(5 6 9 / .95) 0%, rgb(5 6 9 / .84) 30%, rgb(5 6 9 / .46) 62%, rgb(5 6 9 / .22) 100%),
    var(--door-img) var(--door-img-pos, center) / cover no-repeat;
  filter:saturate(.82) brightness(.84);
  transform:scale(1.0); transform-origin:50% 60%;
  transition:transform .32s ${EASE}, filter .16s ${EASE}; }
${DOOR}[data-door="swarm"] > .of-door__art { --door-img:url("${SWARM_IMG}"); --door-img-pos:50% 42%; }
${DOOR}[data-door="adventure"] > .of-door__art { --door-img:url("${ADVENTURE_IMG}"); --door-img-pos:58% 46%; }
${DOOR} > .of-door__kicker {
  position:absolute; top:16px; left:20px; max-width:calc(100% - 40px); box-sizing:border-box; overflow-wrap:anywhere; padding:4px 8px; border-radius:2px;
  font:600 12px/1 ${READ}; letter-spacing:.14em; text-transform:uppercase;
  color:rgb(${BONE} / .92); background:rgb(6 8 12 / .72); border:1px solid rgb(${BONE} / .16); }
${DOOR} > .of-door__name {
  display:block; max-width:100%; font:800 clamp(28px, min(5.6vh, 14cqw), 52px)/1 ${DISPLAY}; letter-spacing:.015em; text-transform:uppercase;
  color:rgb(250 247 239); text-shadow:0 2px 12px rgb(0 0 0 / .55);
  /* a longer translation breaks inside the word before it can run past the card's clip */
  overflow-wrap:anywhere; hyphens:auto; }
${DOOR} > .of-door__line {
  display:-webkit-box !important; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden !important;
  position:static !important; clip:auto !important; clip-path:none !important; width:auto !important; height:auto !important;
  max-width:36ch; min-height:2.8em; margin:8px 0 0 !important; padding:0 !important; overflow-wrap:anywhere;
  font:400 15px/1.4 ${READ} !important; letter-spacing:0 !important; text-transform:none !important;
  color:rgb(${BONE} / .9) !important; opacity:1 !important; text-shadow:0 1px 6px rgb(0 0 0 / .7) !important; }
${DOOR} > .of-door__go {
  display:inline-flex; align-items:center; gap:8px; margin-top:16px; padding:8px 12px 8px 14px; border-radius:2px;
  font:600 13px/1 ${READ}; letter-spacing:.12em; text-transform:uppercase;
  color:rgb(${BONE} / .92); background:rgb(${BONE} / .08); border:1px solid rgb(${BONE} / .24);
  transition:color .16s ${EASE}, background-color .16s ${EASE}, border-color .16s ${EASE}; }
${DOOR} > .of-door__go::after { content:"\\2192"; font-size:15px; letter-spacing:0; transition:transform .16s ${EASE}; }
${DOOR} > .of-door__plain { display:none !important; }
/* awake — the pointer moves focus, so exactly one door is ever lit */
${DOOR}:is(:hover, :focus, [data-awake]) {
  border-color:${GOLD} !important;
  box-shadow:0 0 0 1px ${GOLD}, 0 14px 40px rgb(0 0 0 / .55), 0 0 36px rgb(242 185 80 / .2) !important; }
${DOOR}:is(:hover, :focus, [data-awake]) > .of-door__art::before { transform:scale(1.045); filter:saturate(1) brightness(.98); }
${DOOR}:is(:hover, :focus, [data-awake]) > .of-door__go { color:#1a1208; background:${GOLD}; border-color:${GOLD}; }
${DOOR}:is(:hover, :focus, [data-awake]) > .of-door__go::after { transform:translateX(3px); }
${DOOR}:focus-visible { box-shadow:0 0 0 2px ${GOLD}, 0 0 0 5px rgb(242 185 80 / .28), 0 14px 40px rgb(0 0 0 / .55) !important; }
${DOOR}:active { transform:scale(.985) !important; transition-duration:.08s !important; }
${DOOR}[aria-disabled="true"] { cursor:progress; }
${DOOR}[aria-disabled="true"] > .of-door__go { opacity:.6; }

/* ── THE SMALL ROW ─────────────────────────────────────────────────────────────────────────── */
${ROW_BTN} {
  position:relative !important; display:inline-flex !important; align-items:center !important; justify-content:center !important;
  min-height:40px !important; height:40px; padding:0 16px !important; margin:0 !important; box-sizing:border-box;
  font:600 13px/1 ${READ} !important; letter-spacing:.1em !important; text-transform:uppercase !important; white-space:nowrap;
  color:rgb(${BONE} / .94) !important; background:rgb(8 10 14 / .72) !important;
  border:1px solid rgb(${BONE} / .24) !important; border-radius:4px !important; outline:none !important;
  box-shadow:none !important; text-shadow:none !important; transform:none !important; opacity:1 !important; cursor:pointer;
  transition:color .16s ${EASE}, background-color .16s ${EASE}, border-color .16s ${EASE}, transform .16s ${EASE} !important; }
${ROW_BTN}::before, ${ROW_BTN}::after { display:none !important; content:none !important; }
${ROW_BTN} .dp-lit__note { display:none !important; }
${ROW_BTN}:is(:hover, :focus, [data-awake]) { color:#fff !important; background:rgb(22 25 32 / .9) !important; border-color:rgb(${BONE} / .72) !important; }
${ROW_BTN}:focus-visible { box-shadow:0 0 0 2px ${GOLD} !important; border-color:${GOLD} !important; }
${ROW_BTN}:active { transform:scale(.97) !important; transition-duration:.08s !important; }
${ROW_BTN}.dp-lit__item--danger:is(:hover, :focus) { color:#ffd2c8 !important; border-color:rgb(255 122 92 / .7) !important; }
${ROW_BTN}[aria-disabled="true"] { color:rgb(${BONE} / .5) !important; cursor:progress; }
/* New Game in the row (a save owns the Adventure door): the plain word, none of the door's art */
${ROW_LI}.of-title-row-item > button.of-door { height:40px !important; padding:0 16px !important; display:inline-flex !important; width:auto !important; flex-direction:row !important; isolation:auto; }
${ROW_LI}.of-title-row-item > button.of-door > :not(.of-door__plain) { display:none !important; }
${ROW_LI}.of-title-row-item > button.of-door > .of-door__plain { display:inline !important; }

/* ── THE LAB ROW (dev switch only: ?titleLab=1) ────────────────────────────────────────────── */
${LAB} { display:flex !important; flex-wrap:wrap; gap:8px !important; margin:0 !important; padding:8px 0 0 !important; border-top:1px dashed rgb(${BONE} / .2); list-style:none; }
${LAB} > li { margin:0 !important; list-style:none; position:static !important; }
${LAB} .dp-lit__item { min-height:32px; padding:0 12px !important; font:500 12px/1 ${READ} !important; letter-spacing:.08em !important; text-transform:uppercase;
  color:rgb(${BONE} / .8) !important; background:rgb(8 10 14 / .6) !important; border:1px dashed rgb(${BONE} / .3) !important; border-radius:4px !important; }
${LAB} .dp-lit__item::before, ${LAB} .dp-lit__item::after { display:none !important; }
${LAB} .dp-lit__note { display:none !important; }
${LAB} .dp-lit__item:is(:hover, :focus) { color:#fff !important; border-color:rgb(${BONE} / .7) !important; }

/* ── THE FINE LINE ─────────────────────────────────────────────────────────────────────────── */
${T} > .dp-frame__foot { grid-area:auto !important; position:absolute !important; left:48px !important; right:48px !important; bottom:clamp(20px, 4vh, 32px) !important; top:auto !important; margin:0 !important; padding:0 !important;
  display:flex !important; flex-wrap:wrap; align-items:center; gap:4px 8px; font:500 12px/1.4 ${READ} !important; letter-spacing:.06em !important; text-transform:uppercase; opacity:1 !important; }
/* Credits · Achievements on the left; the build string stands apart at the far right, quieter and in
   tabular figures, so the line reads as two links and a stamp rather than one run-on sentence */
${T} > .dp-frame__foot > .of-title-foot__dot { opacity:.6; }
${T} > .dp-frame__foot > .of-title-build { margin-left:auto; display:inline-flex; align-items:center; gap:8px;
  font:500 12px/1.4 ${READ}; letter-spacing:.06em; font-variant-numeric:tabular-nums; }
${T} > .dp-frame__foot > .of-title-build, ${T} > .dp-frame__foot > .of-title-build * { color:rgb(${BONE} / .62) !important; }
${T} > .dp-frame__foot, ${T} > .dp-frame__foot * { color:rgb(${BONE} / .86) !important; text-shadow:0 1px 3px rgb(0 0 0 / .95), 0 0 10px rgb(0 0 0 / .8); }
${T} > .dp-frame__foot .dp-menu__item--fine { font:600 12px/1 ${READ} !important; letter-spacing:.06em !important; min-height:28px; padding:4px 6px !important;
  border-radius:2px; transition:color .16s ${EASE}; background:none !important; border:0 !important; cursor:pointer; }
${T} > .dp-frame__foot .dp-menu__item--fine:is(:hover, :focus) { color:#fff !important; text-decoration:underline; text-underline-offset:4px; text-decoration-color:${GOLD}; }
${T} > .dp-frame__foot .dp-menu__item--fine:focus-visible { outline:2px solid ${GOLD} !important; outline-offset:2px; }

/* a short window: the doors give height before anything overlaps */
@media (max-height:620px) and (min-width:701px) {
  ${T} .of-title-actions { bottom:64px !important; }
  ${DOOR} { height:clamp(160px, 32vh, 200px) !important; padding:44px 20px 16px !important; }
  ${DOOR} > .of-door__go { margin-top:12px; }
}
/* a narrow screen: the doors stack under the name, full width, then the row */
@media (max-width:700px) {
  ${T} .of-title-actions { position:relative !important; left:auto !important; bottom:auto !important; width:100% !important; margin:24px 0 0 !important; }
  ${LIST} > li.of-title-door { flex:1 1 100% !important; }
  ${DOOR} { height:auto !important; min-height:0 !important; padding:16px 20px !important; justify-content:flex-start !important; }
  ${DOOR} > .of-door__kicker { display:none; }
  ${T} { overflow-y:auto !important; overscroll-behavior:contain; }
  ${T} > .dp-frame__body { overflow:visible !important; max-height:none !important; }
  ${DOOR} > .of-door__line { min-height:0; }
  ${T} > .dp-frame__foot { position:relative !important; left:auto !important; right:auto !important; bottom:auto !important; margin:24px 0 0 !important; }
  ${DOOR} > .of-door__go { margin-top:12px; }
  ${ROW_LI} { flex:1 1 calc(50% - 6px) !important; }
  ${ROW_BTN} { width:100% !important; min-height:44px !important; height:44px; }
  ${ROW_LI}.of-title-row-item > button.of-door { width:100% !important; height:44px !important; }
}
/* reduced motion is the game's setting (html.sf-reduce-motion), never the OS query alone */
html.sf-reduce-motion ${DOOR}, html.sf-reduce-motion ${DOOR} > *, html.sf-reduce-motion ${ROW_BTN} { transition:none !important; }
html.sf-reduce-motion ${DOOR}:is(:hover, :focus, [data-awake]) > .of-door__art::before { transform:none; transition:none; }
`;

export function injectTitleDoorsLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  injectOrrery(doc);
  const existing = doc.getElementById(STYLE_ID);
  if (existing) { if (existing.textContent !== TITLE_DOORS_LAYOUT_CSS) existing.textContent = TITLE_DOORS_LAYOUT_CSS; return; }
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = TITLE_DOORS_LAYOUT_CSS;
  doc.head.appendChild(style);
}
