// UI polish overlay for the Game Over after-action screen (design/frontend/ORRERY.md §6 Meta).
// The composition itself lives in saveLayouts.js (GAME_OVER block); this file only raises contrast,
// gives the secondary verbs a foot-rail affordance, shades the career-ring hub, keeps the foot on one
// line at 720p and lifts the 1080p band. Scoped to `.orr-gameover`; selectors/IDs unchanged.

import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-gameover-layouts';
const BONE = '236 230 216';
const GO = 'html body #screens > .k-screen.sf-gameover.orr-gameover.orr-gameover.orr-gameover';
const GON = 'html:not([data-locale="en-US"]) body #screens > .k-screen.sf-gameover.orr-gameover.orr-gameover.orr-gameover';
const LABEL = 'font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650; font-weight:650; text-transform:uppercase;';
const HALO = 'text-shadow:0 0 2px rgb(4 6 9), 0 0 8px rgb(4 6 9 / .9), 0 0 18px rgb(4 6 9 / .75) !important;';

export const GAME_OVER_LAYOUT_CSS = `
/* report copy: secondary lines up toward bone; the red kicker one step larger */
${GO} > .k-title .k-caps { font-size:max(12px, calc(12.5px * var(--sv))) !important; }
${GO} > .k-title .k-sentence { color:rgb(${BONE} / .92) !important; }
${GO} > .k-title .sf-go-sub { color:rgb(${BONE} / .84) !important; }
${GO} .sf-go-grid .k-hero__w { color:rgb(${BONE} / .84) !important; font-size:max(12px, calc(11px * var(--sv))) !important; }
${GO} > .k-stage > .k-sentence { color:rgb(${BONE} / .86) !important; }

/* secondary verbs: one rail, brighter words, an underline that lights with the Hand */
${GO} .sf-go-foot > .k-words { flex-wrap:nowrap !important; column-gap:calc(30px * var(--sv)) !important; }
${GO} .sf-go-foot .k-word.sf-go-verb {
  position:relative !important; padding:10px 0 11px !important; min-height:44px !important; white-space:nowrap !important;
  font-size:max(12px, calc(12.5px * var(--sv))) !important; letter-spacing:.2em !important; color:rgb(250 247 240) !important;
  background:linear-gradient(0deg, rgb(${BONE} / .26) 0 1.5px, transparent 1.5px) 0 100% / 100% 100% no-repeat !important; }
${GO} .sf-go-foot .k-word.sf-go-verb::before { color:rgb(${BONE} / .7) !important; margin-right:.6em !important; }
${GO} .sf-go-foot .k-word.sf-go-verb:is(:hover, :focus-visible) {
  color:var(--dp-hand-hot, #ffd98c) !important;
  background:linear-gradient(0deg, var(--dp-hand, #f2b950) 0 1.5px, transparent 1.5px) 0 100% / 100% 100% no-repeat !important; }
${GO} .sf-go-foot .k-word.sf-go-verb:is(:hover, :focus-visible)::before { color:var(--dp-hand, #f2b950) !important; }

/* an unavailable verb (Load latest with no save yet) reads as resting, not live */
${GO} .sf-go-foot .k-word.sf-go-verb[aria-disabled="true"], ${GO} .sf-go-foot .k-word.sf-go-verb[aria-disabled="true"]:is(:hover, :focus-visible) {
  cursor:default !important; color:rgb(${BONE} / .46) !important;
  background:linear-gradient(0deg, rgb(${BONE} / .1) 0 1px, transparent 1px) 0 100% / 100% 100% no-repeat !important; }
${GO} .sf-go-foot .k-word.sf-go-verb[aria-disabled="true"]::before { color:rgb(${BONE} / .3) !important; }

/* expanded/pseudo locale: wrap foot actions and verb text so words never clip or crowd the dial */
${GON} .sf-go-foot > .k-words { flex-wrap:wrap !important; row-gap:calc(8px * var(--sv)) !important; max-width:100% !important; }
${GON} .sf-go-foot > .k-words > li { max-width:100% !important; min-width:0 !important; }
${GON} .sf-go-foot .k-word.sf-go-verb { white-space:normal !important; overflow-wrap:anywhere !important; height:auto !important; max-width:100% !important; min-width:0 !important; }
${GON} .sf-go-foot .k-word.orr-lampkey { white-space:normal !important; overflow-wrap:anywhere !important; height:auto !important; max-width:100% !important; min-width:0 !important; }

/* career ring: a titled instrument, legible stations, and a shaded hub over the hull plan view */
${GO} .sf-go-recap__title { display:flex !important; align-items:center; justify-content:center; gap:14px;
  font-size:max(12px, calc(11.5px * var(--sv))) !important; color:rgb(${BONE} / .9) !important; ${HALO} }
${GO} .sf-go-recap__title::before, ${GO} .sf-go-recap__title::after { content:""; width:calc(40px * var(--sv)); height:1px; }
${GO} .sf-go-recap__title::before { background:linear-gradient(90deg, rgb(${BONE} / 0), rgb(${BONE} / .45)); }
${GO} .sf-go-recap__title::after { background:linear-gradient(90deg, rgb(${BONE} / .45), rgb(${BONE} / 0)); }
${GO} .sf-go-st .sf-go-recap__k { color:rgb(${BONE} / .86) !important; font-size:max(12px, calc(10.5px * var(--sv))) !important; }
${GO} .sf-go-st--lost .sf-go-recap__k { color:var(--dp-danger-hot, #ff7a5c) !important; }
${GO} .sf-go-st .sf-go-u { color:rgb(${BONE} / .8) !important; }
${GO} .sf-go-st .sf-go-recap__v { ${HALO} }
${GO} .sf-go-st--hub { padding:calc(18px * var(--sv)) calc(26px * var(--sv)) !important; border-radius:50%;
  background:radial-gradient(closest-side, rgb(4 6 9 / .82), rgb(4 6 9 / .55) 60%, rgb(4 6 9 / 0)) !important; }
${GO} .sf-go-st--hub .sf-go-recap__k { color:rgb(${BONE} / .9) !important; }
${GO} > .sf-go-recap.is-blank .sf-go-st:not(.sf-go-st--hub) { display:none !important; }
${GO} > .sf-go-recap.is-blank .sf-go-ring__hull { opacity:.2 !important; }
${GO} > .sf-go-recap.is-blank .sf-go-st--hub .sf-go-recap__v { color:rgb(${BONE} / .9) !important; }

/* black box: legend and empty line readable on void */
${GO} > .sf-go-tape .orr-tape__legend { fill:rgb(${BONE} / .88); }
${GO} > .sf-go-tape .orr-tape__legend--sub { fill:rgb(${BONE} / .72); }
${GO} > .sf-go-tape .orr-tape__empty { fill:rgb(${BONE} / .8); }

/* 720p: keep the four actions on one rail */
@media (max-width:1400px) {
  ${GO} .sf-go-foot > .k-words { column-gap:20px !important; }
  ${GO} .sf-go-foot .k-word.orr-lampkey { padding:0 24px 0 18px !important; }
  ${GO} .sf-go-foot .k-word.sf-go-verb { letter-spacing:.16em !important; }
}
/* 1080p band: lift the whole composition one step (the ring and tape scale with --sv) */
@media (min-width:1800px) and (max-width:2199px) and (min-height:1000px) {
  ${GO} { --sv:1.1; }
}
/* short desktop windows (1101w+, <=640h): the 66px headline and 210px ring outgrow the height and push
   the foot and the black box below the frame, so tighten the headline, ring, gaps and tape to fit */
@media (min-width:1101px) and (max-height:640px) {
  ${GO} { --r:calc(124px * var(--sv)); row-gap:calc(10px * var(--sv)) !important;
    padding:20px clamp(40px, 5vw, 128px) 14px !important; grid-template-rows:minmax(0, 1fr) auto auto auto minmax(0, .2fr) auto !important; }
  ${GO} > .k-title .k-caps { margin-bottom:calc(8px * var(--sv)) !important; }
  ${GO} > .k-title .k-t-title { font-size:calc(40px * var(--sv)) !important; max-width:24ch; }
  ${GO} > .k-title .k-sentence { margin-top:calc(8px * var(--sv)) !important; }
  ${GO} .sf-go-grid { gap:calc(8px * var(--sv)) calc(40px * var(--sv)) !important; margin-bottom:calc(8px * var(--sv)) !important; }
  ${GO} .sf-go-st--hub .sf-go-recap__v, ${GO} .sf-go-hubscrub__t { font-size:calc(34px * var(--sv)) !important; }
  ${GO} > .sf-go-recap { height:calc(var(--r) * 2 + 110px * var(--sv)); }
  ${GO} > .sf-go-tape { height:112px; }
}
/* stacked (<=1100): the screen scrolls, so the rays and the scrim hold to the window instead of
   stretching the scroll sideways and past the tape into bare backdrop */
@media (max-width:1100px) {
  ${GO} { overflow-x:hidden !important; }
  ${GO} > .orr-go-rays { position:fixed; }
  ${GO}.k-screen::before { position:fixed; }
}
/* phone: a headline that fits the width, the lamp key across the column, and the career ring as a
   small dial over a two-up list of its figures (the rim stations need ~750px) */
@media (max-width:640px) {
  ${GO} { --sv:1; --r:76px; padding:28px 22px 24px !important; row-gap:22px !important; }
  ${GO} > .k-title .k-t-title { font-size:clamp(28px, 9vw, 42px) !important; line-height:.98 !important; max-width:none; overflow-wrap:break-word; }
  ${GO} .sf-go-grid { gap:14px 28px !important; }
  ${GO} .sf-go-foot, ${GO} .sf-go-foot > .k-words { width:100%; }
  ${GO} .sf-go-foot > .k-words { flex-wrap:wrap !important; column-gap:28px !important; row-gap:4px !important; }
  ${GO} .sf-go-foot > .k-words > li:first-child { flex:1 0 100%; min-width:0; max-width:100%; }
  ${GO} .sf-go-foot .k-word.orr-lampkey .orr-lampkey__word { white-space:normal !important; text-align:center; min-width:0; }
  ${GO} .sf-go-foot .k-word.orr-lampkey { box-sizing:border-box; width:100% !important; justify-content:center; padding:0 18px !important; letter-spacing:.14em !important; }
  ${GO} > .sf-go-recap { justify-self:stretch; width:100%; height:auto; padding-top:calc(34px + var(--r) * 2.4 + 22px) !important; }
  ${GO} > .sf-go-recap::before { top:calc(34px + var(--r) * 1.2); width:calc(var(--r) * 3.4); height:calc(var(--r) * 3.4); }
  ${GO} .sf-go-ring, ${GO} .sf-go-st--hub, ${GO} .sf-go-hubscrub { top:calc(34px + var(--r) * 1.2); }
  ${GO} .sf-go-recap__rows { position:static !important; display:grid !important; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:18px 20px !important; }
  ${GO} .sf-go-st:not(.sf-go-st--hub), ${GO} .sf-go-st[data-side] { position:static; transform:none; text-align:left; align-items:flex-start; white-space:normal; }
  ${GO} .sf-go-st--hub { padding:10px 14px !important; }
  ${GO} .sf-go-st--hub .sf-go-recap__v, ${GO} .sf-go-hubscrub__t { font-size:30px !important; }
  ${GO} > .sf-go-tape { height:160px; }
  ${GO} > .sf-go-tape::before { inset:-14px -22px -8px; }
}
`;

export function injectGameOverLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = GAME_OVER_LAYOUT_CSS;
  doc.head.appendChild(style);
}
