// src/ui/orrery/physics-raceLayouts.js — ORRERY composition for the physics venues board
// (design/frontend/ORRERY.md §6): "Move the world." is two ladders and one verb.
//
// The hang is a two-column instrument: the Orbital Gallery (24 rungs) and the Kinetic League
// (12 rungs) as graduations on two vertical scales — a choice set far past nine rides a ladder
// with a light cursor (ORRERY §3.2). The chosen rung carries the Hand in its bone variant
// (`archiveInstruments.createLadderHand`), so the screen's single amber leader stays the Lamp
// Key: LAUNCH, dressed by `orrery/lampKey.js`, in a foot band with the selection's reading.
// The ladders scroll inside their lanes, so nothing clips at the frame at either width — the
// defect this sheet replaces (the shared `.race-board` document flow cut the last venue in
// half at 1080p) cannot recur here.
//
// Scope: `#screens .k-screen.pv-board` only. No colour outside `--dp-*` tokens and the bone
// alpha literals every layout sheet uses; no border, card, box-shadow or `<table>`; nothing
// below the 12 px floor; reduced motion reaches every state instantly.

import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-physics-race';
const R = 'html body #screens .k-screen.pv-board';
const BONE = '236 230 216';
const INK = 'rgb(248 244 234)';
const LABEL = 'font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112% !important; font-variation-settings:"wdth" 112, "wght" 650 !important; font-weight:650 !important; text-transform:uppercase !important; font-style:normal !important;';
const BODY = 'font-family:var(--dp-face-body, "Instrument Sans"), system-ui, sans-serif !important; font-variation-settings:normal !important; text-transform:none !important; letter-spacing:0 !important;';
const PLAIN = 'background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; clip-path:none !important; outline:none; border-radius:0 !important;';
const NUM = 'font-family:var(--dp-face-numeral, "Archivo") !important; font-stretch:100% !important; font-variation-settings:"wdth" 100, "wght" 300 !important; font-weight:300 !important; font-variant-numeric:tabular-nums lining-nums !important; letter-spacing:-.01em !important;';

const CSS = `
/* ============================ the board frame ================================= */
${R} { display:grid !important; grid-template-columns:minmax(0, 1fr) !important;
  grid-template-rows:auto minmax(0, 1fr) auto !important; grid-auto-rows:auto !important;
  row-gap:0 !important; column-gap:0 !important;
  overflow:hidden !important; box-sizing:border-box;
  padding:clamp(26px, 5.5vh, 60px) clamp(22px, 4.5vw, 84px) clamp(18px, 3.5vh, 40px) !important; }
${R}::before { position:fixed !important; content:"" !important; inset:0 !important; z-index:-1;
  background:linear-gradient(90deg, rgb(6 8 11 / .94), rgb(6 8 11 / .88) 55%, rgb(6 8 11 / .78)) !important; }
${R} > * { grid-column:1 / -1 !important; min-width:0; }
${R} > .k-title, ${R} > .pv-tools { grid-row:1 !important; }
${R} > .pv-hang { grid-row:2 !important; }
${R} > .pv-foot { grid-row:3 !important; }

/* ---- head: kicker, display, one body line; Back stands at the row's far end ---- */
${R} > .k-title { position:relative; display:block !important; margin:0 0 clamp(14px, 2.4vh, 24px) !important; max-width:calc(100% - 150px); }
${R} > .k-title > .k-sentence:first-child { ${LABEL} font-size:12px !important; letter-spacing:.22em !important;
  color:rgb(${BONE} / .66) !important; margin:0 0 10px !important; }
${R} > .k-title > .k-display { font-size:clamp(34px, 4.2vw, 76px) !important; line-height:.92 !important; margin:0 0 12px !important; }
${R} > .k-title > .k-sentence:last-child { ${BODY} font-size:clamp(13.5px, .95vw, 16px) !important; line-height:1.5 !important;
  color:rgb(${BONE} / .8) !important; max-width:66ch !important; margin:0 !important; }
${R} .pv-tools { justify-self:end !important; align-self:start !important; z-index:1; margin:0 !important; }

/* ---- the two ladders ---- */
${R} > .pv-hang { display:grid !important; grid-template-columns:repeat(2, minmax(0, 1fr)) !important;
  column-gap:clamp(32px, 4vw, 72px); min-height:0 !important; height:100%; }
${R} .pv-lane { display:flex !important; flex-direction:column !important; min-height:0 !important; min-width:0; }
${R} .pv-lane__head { display:flex !important; align-items:baseline !important; gap:12px !important;
  margin:0 0 10px !important; padding:0 0 10px 18px !important;
  background:linear-gradient(90deg, rgb(${BONE} / .34) 0 22px, rgb(${BONE} / .16) 22px 100%) 0 100% / 100% 1px no-repeat !important; }
${R} .pv-lane__head > .pv-lane__name { ${LABEL} font-size:12px !important; letter-spacing:.2em !important; line-height:1 !important;
  color:rgb(${BONE} / .86) !important; margin:0 !important; }
${R} .pv-lane__head > .pv-lane__count { ${NUM} font-size:15px !important; line-height:1 !important; color:rgb(223 238 255 / .9) !important; margin:0 !important; }
${R} .pv-lane__head > .pv-lane__count small { ${LABEL} font-size:12px !important; letter-spacing:.12em !important; color:rgb(${BONE} / .56) !important; margin-left:4px; }
${R} .pv-lane__scroll { position:relative; flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden;
  scrollbar-width:none; overscroll-behavior:contain; scroll-padding-top:8px; }
${R} .pv-lane__scroll[data-overflow="1"] {
  -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 30px), transparent);
  mask-image:linear-gradient(180deg, #000 calc(100% - 30px), transparent); }
${R} .pv-lane__scroll::-webkit-scrollbar { display:none; }

/* the ladder: one rail, a tick per rung, the rung hanging off it */
${R} .pv-lane .k-rows { ${PLAIN} position:relative !important; display:block !important; list-style:none !important;
  margin:0 !important; padding:2px 0 26px 18px !important; }
${R} .pv-lane .k-rows::before { content:"" !important; position:absolute !important; left:2.5px !important; top:10px !important; bottom:26px !important;
  width:1px !important; background:linear-gradient(180deg, rgb(${BONE} / .4), rgb(${BONE} / .16)) !important; }
${R} .pv-lane .k-row { ${PLAIN} ${BODY} position:relative !important; display:block !important; box-sizing:border-box;
  width:100% !important; min-height:0 !important; height:auto !important; margin:0 !important; padding:9px 96px 9px 16px !important;
  cursor:pointer; }
${R} .pv-lane .k-row::after { display:none !important; content:none !important; }
/* the rung's tick, reaching from the rail */
${R} .pv-lane .k-row::before { content:"" !important; display:block !important; position:absolute !important;
  left:-15.5px !important; top:19px !important; width:10px !important; height:2px !important; margin:0 !important;
  background:rgb(${BONE} / .4) !important; border:0 !important; box-shadow:none !important; border-radius:0 !important;
  transition:width 160ms var(--dp-ease-out, ease-out), background 160ms linear; }
${R} .pv-lane .k-row > div:first-child { min-width:0; }
${R} .pv-lane .k-row .k-row__name { ${BODY} display:block; font-size:14.5px !important; line-height:1.3 !important; font-weight:480;
  color:rgb(${BONE} / .92) !important; transition:color 140ms linear; }
${R} .pv-lane .k-row .k-row__sub { ${BODY} display:block !important; font-size:12.5px !important; line-height:1.35 !important;
  color:rgb(${BONE} / .56) !important; margin-top:3px !important;
  overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
/* the rung's reading: best total, or CLEARED, hanging at the rung's right */
${R} .pv-lane .k-row .k-row__num { ${NUM} position:absolute !important; right:0 !important; top:12px !important;
  font-size:15px !important; line-height:1 !important; color:rgb(223 238 255 / .92) !important; margin:0 !important; text-align:right; }
${R} .pv-lane .k-row .k-row__num:empty { display:none !important; }
${R} .pv-lane .k-row[data-record="word"] .k-row__num { ${LABEL} font-size:12px !important; letter-spacing:.16em !important;
  color:rgb(223 238 255 / .78) !important; top:15px; }
/* hover / focus: the rung's tick reaches further and its name comes forward */
${R} .pv-lane .k-row:is(:hover, :focus-visible) .k-row__name { color:rgb(255 255 255) !important; }
${R} .pv-lane .k-row:is(:hover, :focus-visible)::before { width:14px !important; background:rgb(${BONE} / .8) !important; }
${R} .pv-lane .k-row:focus-visible:not([aria-selected="true"]) { text-shadow:0 0 14px rgb(255 250 236 / .28); }
/* press: while held, the tick pulls back toward the rail and the reading eases — the beat
   between the pick's confirm sound and the Hand's spring answering it */
${R} .pv-lane .k-row:not([aria-disabled="true"]):active .k-row__name { color:rgb(255 250 236 / .78) !important; }
${R} .pv-lane .k-row:not([aria-disabled="true"]):active::before { width:8px !important; background:rgb(${BONE} / .6) !important; }
/* the chosen rung: bone light, the tick lit and bloomed (the amber stays the Lamp Key's) */
${R} .pv-lane .k-row[aria-selected="true"] .k-row__name { color:${INK} !important; font-weight:620 !important; }
${R} .pv-lane .k-row[aria-selected="true"] .k-row__sub { color:rgb(${BONE} / .72) !important; }
${R} .pv-lane .k-row[aria-selected="true"]::before { width:14px !important; height:3px !important; margin-top:-.5px;
  background:${INK} !important; box-shadow:0 0 10px rgb(255 250 236 / .5), 0 0 2px rgb(255 250 236 / .7) !important; }
/* a locked rung is inert: dimmed rung, dimmed tick, and its reason in place of the reading */
${R} .pv-lane .k-row[aria-disabled="true"] { cursor:default; }
${R} .pv-lane .k-row[aria-disabled="true"] .k-row__name { color:rgb(${BONE} / .48) !important; font-weight:440; }
${R} .pv-lane .k-row[aria-disabled="true"] .k-row__sub { color:rgb(${BONE} / .42) !important; }
${R} .pv-lane .k-row[aria-disabled="true"]::before { width:6px !important; background:rgb(${BONE} / .2) !important; }
${R} .pv-lane .k-row[aria-disabled="true"]:is(:hover, :focus-visible) .k-row__name { color:rgb(${BONE} / .6) !important; }
${R} .pv-lane .k-row[aria-disabled="true"][data-locked="true"] .k-row__name::after { content:" · LOCKED"; ${LABEL}
  font-size:12px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .4) !important; margin-left:8px; }

/* ---- the Hand (bone variant): geometry local to this board; the amber field's discipline
   lives in orrery/lampKey.css and archiveLayouts carries the codex's own copy ---- */
${R} .orr-arc-hand { position:absolute; left:0; top:0; z-index:3; width:44px; height:18px; margin-top:-9px; pointer-events:none; will-change:transform; }
${R} .orr-arc-hand[hidden] { display:none !important; }
${R} .orr-arc-hand::before { content:""; position:absolute; left:var(--orr-hand-x, 22px); top:2px; width:10px; height:14px;
  background:rgb(252 250 244); clip-path:polygon(0 0, 100% 50%, 0 100%, 26% 50%);
  box-shadow:0 0 0 3px rgb(252 250 244 / .14), 0 0 12px 1px rgb(252 250 244 / .38); }
${R} .orr-arc-hand::after { content:""; position:absolute; left:var(--orr-hand-from, 7px); top:8px;
  width:calc(var(--orr-hand-x, 22px) + 2px - var(--orr-hand-from, 7px)); height:2px; border-radius:1px;
  background:rgb(252 250 244); box-shadow:0 0 0 2px rgb(252 250 244 / .12); }

/* ---- the foot band: the selection's reading and the one verb ---- */
${R} > .pv-foot { display:grid !important; grid-template-columns:minmax(0, 1fr) auto !important;
  column-gap:28px; align-items:center !important; box-sizing:border-box;
  margin:8px 0 0 !important; padding:14px 0 2px 18px !important;
  background:linear-gradient(90deg, rgb(${BONE} / .3) 0 22px, rgb(${BONE} / .12) 22px 100%) 0 0 / 100% 1px no-repeat !important; }
${R} .pv-foot__read { min-width:0; }
${R} .pv-foot__title { ${BODY} font-size:16px !important; line-height:1.25 !important; font-weight:620; color:${INK} !important;
  margin:0 !important; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
${R} .pv-foot__title:empty::before { content:"Choose a challenge to launch."; color:rgb(${BONE} / .56); font-weight:450; }
${R} .pv-foot__status { ${BODY} font-size:12.5px !important; line-height:1.4 !important; color:rgb(${BONE} / .62) !important; margin:3px 0 0 !important; min-height:1.4em; }
${R} > .pv-foot > button { margin:0 !important; }

/* ---- Back: a quiet word with its tick, no plate ---- */
${R} .pv-tools > button { ${PLAIN} ${LABEL} display:inline-flex !important; align-items:center; gap:0;
  min-height:34px !important; height:auto !important; margin:0 !important; padding:4px 2px 5px 0 !important;
  font-size:12px !important; letter-spacing:.18em !important; line-height:1 !important;
  color:rgb(${BONE} / .62) !important; cursor:pointer; text-shadow:none !important; }
${R} .pv-tools > button::before { content:"" !important; display:inline-block !important; width:14px !important; height:2px !important;
  margin-right:10px !important; background:rgb(${BONE} / .5) !important; border:0 !important; box-shadow:none !important;
  transition:width 160ms var(--dp-ease-out, ease-out), background 140ms linear; }
${R} .pv-tools > button:is(:hover, :focus-visible) { color:rgb(255 255 255) !important; outline:none !important; }
${R} .pv-tools > button:is(:hover, :focus-visible)::before { width:20px !important; background:rgb(255 250 236 / .9) !important; }
${R} .pv-tools > button:active { color:rgb(${BONE} / .8) !important; }
${R} .pv-tools > button:active::before { width:14px !important; background:rgb(${BONE} / .6) !important; }
${R} .pv-tools > button:focus-visible { text-shadow:0 0 12px rgb(255 250 236 / .4); }

/* ---- arrival: the rails draw, the rungs rise in a 22 ms stagger, the band fades last ---- */
${R}.pv-arrive .k-rows::before { transform-origin:top; animation:pv-rail 560ms var(--dp-ease-out, ease-out) both 60ms; }
${R}.pv-arrive .k-row { animation:pv-rise 420ms var(--dp-ease-out, ease-out) both; animation-delay:var(--orr-delay, 0ms); }
${R}.pv-arrive .pv-lane__head, ${R}.pv-arrive .pv-tools > button { animation:pv-rise 380ms var(--dp-ease-out, ease-out) both; }
${R}.pv-arrive > .k-title { animation:pv-rise 380ms var(--dp-ease-out, ease-out) both; }
${R}.pv-arrive > .pv-foot { animation:pv-rise 420ms var(--dp-ease-out, ease-out) both 200ms; }
@keyframes pv-rail { from { transform:scaleY(0); } to { transform:scaleY(1); } }
@keyframes pv-rise { from { opacity:0; transform:translateY(7px); } to { opacity:1; transform:none; } }
html.sf-reduce-motion ${R} .k-row, html.sf-reduce-motion ${R} .k-rows::before,
html.sf-reduce-motion ${R} .pv-lane__head, html.sf-reduce-motion ${R} > .k-title,
html.sf-reduce-motion ${R} > .pv-foot, html.sf-reduce-motion ${R} .pv-tools > button { animation:none !important; }
html.sf-reduce-motion ${R} .pv-lane .k-row::before { transition:none !important; }

/* ---- condense, never shrink ---- */
@media (max-height: 760px) {
  ${R} > .k-title > .k-display { font-size:clamp(30px, 3.6vw, 54px) !important; }
  ${R} .pv-lane .k-row { padding-top:7px; padding-bottom:7px; }
  ${R} .pv-lane .k-row::before { top:16px; }
}
@media (max-width: 980px) {
  ${R} { grid-template-rows:auto auto auto !important; align-content:start !important; overflow-y:auto !important; }
  ${R} > .k-title { max-width:none; padding-right:120px; }
  ${R} > .pv-hang { display:flex !important; flex-direction:column; gap:26px; height:auto; overflow:visible; align-self:start; }
  ${R} .pv-lane { flex:none; }
  ${R} .pv-lane__scroll { overflow:visible; -webkit-mask-image:none; mask-image:none; flex:0 0 auto; }
  ${R} > .pv-foot { position:sticky; bottom:0; z-index:2;
    background-color:rgb(6 8 11 / .98) !important; background-origin:content-box !important;
    box-shadow:0 40px 0 rgb(6 8 11 / .98), 0 -18px 18px -6px rgb(6 8 11 / .9) !important; }
  /* the band sits flush on the bottom edge (its own padding carries the frame's foot inset), so
     no rung shows beneath it; a rung the keyboard reaches scrolls clear of the band */
  ${R} { padding-bottom:0 !important; scroll-padding-bottom:150px; }
  ${R} > .pv-foot { padding-bottom:clamp(18px, 3.5vh, 40px) !important; box-shadow:0 -18px 18px -6px rgb(6 8 11 / .9) !important; }
}
/* phone: the 120px Back gutter is only needed beside the kicker; the body line, the rung
   readings and the band's status take the full column instead of a 215px strip */
@media (max-width: 560px) {
  ${R} > .k-title { padding-right:0; }
  ${R} > .k-title > .k-sentence:first-child { padding-right:110px; }
  ${R} > .k-title > .k-sentence:last-child { max-width:none !important; }
  ${R} .pv-lane .k-row { padding-right:0 !important; }
  ${R} .pv-lane .k-row .k-row__name { padding-right:84px; }
  ${R} > .pv-foot { grid-template-columns:minmax(0, 1fr) auto !important; row-gap:6px; }
  ${R} .pv-foot__read { display:contents; }
  ${R} .pv-foot__title { grid-column:1; grid-row:1; align-self:center; }
  ${R} > .pv-foot > button { grid-column:2; grid-row:1; }
  ${R} .pv-foot__status { grid-column:1 / -1; grid-row:2; margin:0 !important; }
}
`;

export const PHYSICS_RACE_LAYOUT_CSS = CSS;

export function injectPhysicsRaceLayouts(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  injectOrrery(doc);
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
