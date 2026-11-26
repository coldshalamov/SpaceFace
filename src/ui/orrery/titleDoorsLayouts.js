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
/* The frame's own outer gutter (--dp-margin, 64px by the frame's size step: 48px on a 1440 window).
   The name block sits inside the frame's padding, so the doors and the fine line stand on the same
   left edge as the name at every size. A hard 48px here put the name 16px right of the doors at 1920. */
const GUTTER = 'var(--dp-margin, 48px)';
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
  position:absolute !important; left:${GUTTER} !important; right:auto !important; top:auto !important;
  bottom:clamp(72px, 12vh, 104px) !important; transform:none !important;
  display:flex !important; flex-direction:column !important; gap:12px !important;
  width:min(600px, 48vw, calc(100vw - 2 * ${GUTTER})) !important; max-width:none !important; min-height:0 !important; height:auto !important;
  /* the column is exactly as tall as its words: clipping it cut off every focus ring and shadow that
     a door or a row key draws outside itself, so keyboard focus was only a 1px change of border colour */
  overflow:visible !important;
  margin:0 !important; padding:0 !important; z-index:2; }
${T} .dp-title__eyebrow:empty { display:none !important; }
${T} .of-title-strap { margin:12px 0 0 !important; max-width:44ch; font:500 clamp(15px, 2.2vh, 18px)/1.4 ${READ}; letter-spacing:.01em;
  color:rgb(255 255 255 / .82); text-shadow:none; }
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

/* ── THE PICTURE ───────────────────────────────────────────────────────────────────────────── */
/* The authored "Field at dusk" still is the title's picture, with its idle drift (kit.css k-plate-drift).
   Looked at on the desktop build's own GPU (2026-11-23), the live title-field scene drew an unlit hull
   over a dark, flat-faceted rock — far below the still it was built from — so on the default title the
   still no longer steps aside when the stage reports live. The lab replay (?titleLab=1) sets
   data-attract="live" and swaps the stage to title-attract; only then the plate may fade so that
   fight is the picture. Default idle attract stays "1" (still-drift over title-field) and keeps
   the still. uiStage skips per-frame draws while this plate covers title-field. */
${T}[data-k-stage]:not([data-attract="live"]) .k-world--plate { opacity:1 !important; }

/* ── THE DOORS ─────────────────────────────────────────────────────────────────────────────── */
/* A door is a card: its picture fills the top at full colour, and the words stand on a flat caption
   block underneath. A dark gradient used to be washed over the whole picture so the type could sit on
   it, which turned both pictures muddy; with the type on its own block neither needs one. */
${DOOR} {
  position:relative !important; isolation:isolate; overflow:hidden !important; container-type:inline-size;
  display:flex !important; flex-direction:column !important; justify-content:safe flex-end !important; align-items:flex-start !important;
  /* the kit's lit item gaps its stacked lines by 16px; the caption sets its own spacing, or it runs
     32px taller than its margins and the name climbs into the picture */
  gap:0 !important;
  width:100% !important; height:clamp(244px, 34vh, 300px) !important; min-height:0 !important;
  margin:0 !important; padding:0 20px 18px !important; box-sizing:border-box;
  text-align:left !important; white-space:normal !important; cursor:pointer;
  pointer-events:auto !important; touch-action:manipulation; user-select:none;
  color:#f4f5f7 !important; background:#141416 !important;
  border:1px solid rgb(255 255 255 / .12) !important; border-radius:10px !important; outline:none !important;
  box-shadow:none !important; text-shadow:none !important;
  font:inherit !important; letter-spacing:0 !important; text-transform:none !important;
  transform:none !important; opacity:1 !important;
  transition:border-color .16s ${EASE}, transform .16s ${EASE} !important; }
${DOOR}::before, ${DOOR}::after { display:none !important; content:none !important; }
/* The art, caption and painted verb are one native control, never nested hit targets. */
${DOOR} > * { pointer-events:none !important; user-select:none; }
/* the picture is a clipped frame (the art span) around a painted plate (its ::before), so the awake zoom
   stays inside the frame: a scaled frame used to widen the door's scroll box by ~7px, which read as a
   horizontal clip to the layout checks */
${DOOR} > .of-door__art { position:absolute; left:0; right:0; top:0; bottom:auto; height:46%; z-index:-1; pointer-events:none; overflow:hidden;
  border-radius:10px 10px 0 0; }
${DOOR} > .of-door__art::before {
  content:""; position:absolute; inset:0;
  background:var(--door-img) var(--door-img-pos, center) / cover no-repeat;
  transform:scale(1.0); transform-origin:50% 60%;
  transition:transform .32s ${EASE}; }
${DOOR}[data-door="swarm"] > .of-door__art { --door-img:url("${SWARM_IMG}"); --door-img-pos:50% 42%; }
${DOOR}[data-door="adventure"] > .of-door__art { --door-img:url("${ADVENTURE_IMG}"); --door-img-pos:58% 46%; }
/* the kind of run is a small badge on the picture, inset from the card's corner as a badge on a photo is */
${DOOR} > .of-door__kicker {
  position:absolute; top:12px; left:12px; max-width:calc(100% - 24px); box-sizing:border-box; overflow-wrap:anywhere; padding:5px 8px; border-radius:6px;
  font:600 12px/1.2 ${READ}; letter-spacing:0; text-transform:none;
  color:rgb(255 255 255 / .92); background:rgb(12 12 13 / .86); border:0; }
${DOOR} > .of-door__name {
  display:block; max-width:100%; font:800 clamp(28px, min(5.6vh, 14cqw), 52px)/1.05 ${DISPLAY}; letter-spacing:-.02em; text-transform:none;
  color:#ffffff; text-shadow:none;
  /* a longer translation breaks inside the word before it can run past the card's clip */
  overflow-wrap:anywhere; hyphens:auto; }
${DOOR} > .of-door__line {
  display:-webkit-box !important; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden !important;
  position:static !important; clip:auto !important; clip-path:none !important; width:auto !important; height:auto !important;
  max-width:40ch; min-height:2.9em; margin:6px 0 0 !important; padding:0 !important; overflow-wrap:anywhere;
  font:400 14px/1.45 ${READ} !important; letter-spacing:0 !important; text-transform:none !important;
  color:#a3a6ad !important; opacity:1 !important; text-shadow:none !important; }
${DOOR} > .of-door__go {
  display:inline-flex; align-items:center; gap:8px; margin-top:14px; height:32px; padding:0 12px; border-radius:6px;
  font:600 13px/1 ${READ}; letter-spacing:0; text-transform:none;
  color:#f4f5f7; background:rgb(255 255 255 / .08); border:0;
  transition:color .16s ${EASE}, background-color .16s ${EASE}; }
${DOOR} > .of-door__go::after { content:"\\2192"; font-size:15px; letter-spacing:0; transition:transform .16s ${EASE}; }
${DOOR} > .of-door__plain { display:none !important; }
/* awake — the pointer moves focus, so exactly one door is ever lit, and the lit edge is its focus mark
   too: a 2px gold edge (the 1px border and a 1px ring flush against it). */
${DOOR}:is(:hover, :focus, [data-awake]) {
  border-color:${GOLD} !important;
  box-shadow:0 0 0 1px ${GOLD} !important; }
${DOOR}:is(:hover, :focus, [data-awake]) > .of-door__art::before { transform:scale(1.035); }
${DOOR}:is(:hover, :focus, [data-awake]) > .of-door__go { color:#141414; background:${GOLD}; }
${DOOR}:is(:hover, :focus, [data-awake]) > .of-door__go::after { transform:translateX(3px); }
${DOOR}:active { transform:scale(.985) !important; transition-duration:.08s !important; }
${DOOR}[aria-disabled="true"] { cursor:progress; }
${DOOR}[aria-disabled="true"] > .of-door__go { opacity:.6; }

/* ── THE SMALL ROW ─────────────────────────────────────────────────────────────────────────── */
${ROW_BTN} {
  position:relative !important; display:inline-flex !important; align-items:center !important; justify-content:center !important;
  min-height:40px !important; height:40px; padding:0 14px !important; margin:0 !important; box-sizing:border-box;
  font:600 14px/1 ${READ} !important; letter-spacing:0 !important; text-transform:none !important; white-space:nowrap;
  color:#f4f5f7 !important; background:#1a1a1d !important;
  border:1px solid rgb(255 255 255 / .12) !important; border-radius:8px !important; outline:none !important;
  box-shadow:none !important; text-shadow:none !important; transform:none !important; opacity:1 !important; cursor:pointer;
  transition:color .16s ${EASE}, background-color .16s ${EASE}, border-color .16s ${EASE}, transform .16s ${EASE} !important; }
${ROW_BTN}::before, ${ROW_BTN}::after { display:none !important; content:none !important; }
${ROW_BTN} .dp-lit__note { display:none !important; }
${ROW_BTN}:is(:hover, :focus, [data-awake]) { color:#ffffff !important; background:#242428 !important; border-color:rgb(255 255 255 / .3) !important; }
${ROW_BTN}:focus-visible { outline:2px solid ${GOLD} !important; outline-offset:2px !important; }
${ROW_BTN}:active { transform:scale(.97) !important; transition-duration:.08s !important; }
${ROW_BTN}.dp-lit__item--danger:is(:hover, :focus) { color:#ff8a70 !important; border-color:rgb(255 122 92 / .6) !important; }
${ROW_BTN}[aria-disabled="true"] { color:rgb(255 255 255 / .4) !important; cursor:progress; }
/* New Game in the row (a save owns the Adventure door): the plain word, none of the door's art */
${ROW_LI}.of-title-row-item > button.of-door { height:40px !important; padding:0 14px !important; display:inline-flex !important; width:auto !important; flex-direction:row !important; isolation:auto; border-radius:8px !important; }
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
${T} > .dp-frame__foot { grid-area:auto !important; position:absolute !important; left:${GUTTER} !important; right:${GUTTER} !important; bottom:clamp(20px, 4vh, 32px) !important; top:auto !important; margin:0 !important; padding:0 !important;
  display:flex !important; flex-wrap:wrap; align-items:center; gap:4px 8px; font:500 13px/1.4 ${READ} !important; letter-spacing:0 !important; text-transform:none; opacity:1 !important; }
/* Credits · Achievements on the left; the build string stands apart at the far right, quieter and in
   tabular figures, so the line reads as two links and a stamp rather than one run-on sentence */
${T} > .dp-frame__foot > .of-title-foot__dot { opacity:.6; }
${T} > .dp-frame__foot > .of-title-build { margin-left:auto; display:inline-flex; align-items:center; gap:8px;
  font:500 12px/1.4 ${READ}; letter-spacing:.06em; font-variant-numeric:tabular-nums; }
${T} > .dp-frame__foot > .of-title-build, ${T} > .dp-frame__foot > .of-title-build * { color:rgb(255 255 255 / .55) !important; }
${T} > .dp-frame__foot, ${T} > .dp-frame__foot * { color:rgb(255 255 255 / .82) !important; text-shadow:none !important; }
${T} > .dp-frame__foot .dp-menu__item--fine { font:600 13px/1 ${READ} !important; letter-spacing:0 !important; text-transform:none !important; min-height:28px; padding:4px 6px !important;
  border-radius:2px; transition:color .16s ${EASE}; background:none !important; border:0 !important; cursor:pointer; }
/* the line's first word starts on the gutter like the name and the doors above it; its 6px of key
   padding hangs into the margin, where there is nothing to collide with */
${T} > .dp-frame__foot .dp-menu__item--fine:first-child { margin-left:-6px; }
${T} > .dp-frame__foot .dp-menu__item--fine:is(:hover, :focus) { color:#fff !important; text-decoration:underline; text-underline-offset:4px; text-decoration-color:${GOLD}; }
${T} > .dp-frame__foot .dp-menu__item--fine:focus-visible { outline:2px solid ${GOLD} !important; outline-offset:2px; }

/* a short window: the doors give height before anything overlaps */
@media (max-height:620px) and (min-width:701px) {
  ${T} .of-title-actions { bottom:56px !important; }
  ${DOOR} { height:clamp(214px, 32vh, 232px) !important; padding:0 16px 14px !important; }
  ${DOOR} > .of-door__art { height:38%; }
  ${DOOR} > .of-door__line { min-height:2.9em; font-size:13px !important; }
  ${DOOR} > .of-door__go { margin-top:10px; }
}
/* a narrow screen: the doors stack under the name, full width, then the row */
@media (max-width:700px) {
  ${T} .of-title-actions { position:relative !important; left:auto !important; bottom:auto !important; width:100% !important; margin:24px 0 0 !important; }
  ${LIST} > li.of-title-door { flex:1 1 100% !important; }
  ${DOOR} { height:auto !important; min-height:0 !important; padding:144px 16px 14px !important; justify-content:flex-start !important; }
  ${DOOR} > .of-door__art { height:132px; }
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
html.sf-reduce-motion ${DOOR}:active, html.sf-reduce-motion ${ROW_BTN}:active { transform:none !important; }
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
