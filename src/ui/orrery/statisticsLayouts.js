// ORRERY composition for the Statistics screen (design/frontend/ORRERY.md §6 Meta).
// Layout and type only: title, reading bands, foot rail. Scoped to `.orr-statistics` so nothing
// reaches another screen. Selectors/IDs unchanged for player-truth and pause wiring.

import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-statistics-layouts';
const BONE = '236 230 216';
const WARM = '248 244 234';
const ST = 'html body #screens > .k-screen.orr-statistics.orr-statistics';
const LABEL = 'font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650; font-weight:650; text-transform:uppercase;';
const DISPLAY = 'font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-variation-settings:"wght" 800, "wdth" 125; font-weight:800; text-transform:uppercase;';
const BODY = 'font-family:var(--dp-face-read, "Instrument Sans"), "Instrument Sans", system-ui, sans-serif; font-variation-settings:normal; font-stretch:100%; text-transform:none;';
const NUMERAL = 'font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-variation-settings:"wght" 250, "wdth" 100; font-weight:250; font-variant-numeric:tabular-nums lining-nums;';
const HALO = 'text-shadow:0 0 2px rgb(4 6 9), 0 0 6px rgb(4 6 9 / .9), 0 0 14px rgb(4 6 9 / .7);';
const PLAIN = 'background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; clip-path:none !important;';

export const STATISTICS_LAYOUT_CSS = `
${ST} { --sv:var(--k-s, 1); box-sizing:border-box; display:grid !important;
  padding:clamp(22px, 3.6vh, 72px) clamp(28px, 3.6vw, 96px) clamp(14px, 2.4vh, 40px) !important;
  grid-template-columns:minmax(0, 1fr) !important;
  grid-template-rows:auto minmax(0, 1fr) auto !important;
  grid-template-areas:"title" "stage" "foot" !important;
  row-gap:clamp(8px, 1.4vh, 22px) !important; column-gap:0 !important; }
${ST}::before { background:radial-gradient(120% 90% at 28% 42%, rgb(5 7 10 / .72), rgb(5 7 10 / .9) 72%) !important; }

/* title */
${ST} > .k-title { grid-area:title; position:relative; z-index:2; max-width:none; padding:0 !important; margin:0; display:block; ${PLAIN} }
${ST} > .k-title .k-t-title, ${ST} > .k-title .fh-title {
  ${DISPLAY} margin:0; width:fit-content;
  font-size:clamp(34px, min(3.2vw, 5.8vh), 88px) !important; line-height:.92 !important; letter-spacing:.02em !important;
  color:rgb(${WARM}) !important; -webkit-text-fill-color:currentColor; background:none !important; ${HALO} }
${ST} > .k-title .k-sentence, ${ST} > .k-title > p {
  ${BODY} margin:clamp(6px, 1vh, 12px) 0 0 !important; max-width:52ch;
  font-size:clamp(14px, min(.9vw, 1.7vh), 19px) !important; line-height:1.35; font-weight:500;
  color:rgb(${BONE} / .88) !important; ${HALO} }

/* reading stage: scrollable bands on a shade pool */
${ST} > .sf-statistics.k-stage, ${ST} > .sf-statistics.k-hang { grid-area:stage !important; position:relative; z-index:1; min-width:0; min-height:0;
  margin:0; padding:clamp(4px, .8vh, 12px) 0 clamp(28px, 4vh, 56px) !important;
  overflow:hidden auto !important; -webkit-mask-image:none !important; mask-image:none !important;
  animation:none !important; max-width:min(780px, 100%) !important; ${PLAIN} }
${ST} > .sf-statistics.k-stage::before { content:""; position:absolute; z-index:-1; inset:-24px -48px -20px -40px; pointer-events:none;
  background:radial-gradient(closest-side, rgb(4 6 9 / .78), rgb(4 6 9 / .52) 60%, rgb(4 6 9 / 0)); }
${ST} .sf-statistics__group { margin:0 0 clamp(16px, 2.2vh, 32px); padding:0; border:0; }
${ST} .sf-statistics__group > .k-caps {
  ${LABEL} margin:0 0 clamp(6px, .9vh, 12px); padding:0; display:flex; align-items:center; gap:12px;
  font-size:clamp(12px, .66vw, 13.5px) !important; letter-spacing:.22em !important;
  color:rgb(${BONE} / .9) !important; ${HALO} }
${ST} .sf-statistics__group > .k-caps::after { content:""; flex:1; height:1px; background:linear-gradient(90deg, rgb(${BONE} / .32), rgb(${BONE} / 0)); }
${ST} .sf-statistics__group > .k-sentence {
  ${BODY} margin:0; font-size:clamp(13.5px, .85vw, 17px); line-height:1.4; font-weight:500;
  color:rgb(${BONE} / .82) !important; }
${ST} .sf-statistics .k-rows { list-style:none; margin:0; padding:0; border:0; }
${ST} .sf-statistics .k-row {
  display:grid !important; grid-template-columns:minmax(0, 1fr) auto; align-items:baseline;
  gap:clamp(16px, 2vw, 40px); min-height:clamp(36px, 4.4vh, 46px);
  margin:0; padding:clamp(6px, .75vh, 10px) 0 !important;
  border:0 !important; border-top:1px solid rgb(${BONE} / .24) !important; ${PLAIN} }
${ST} .sf-statistics .k-rows > .k-row:first-child { border-top-color:rgb(${BONE} / .36) !important; }
${ST} .sf-statistics .k-rows > .k-row:last-child { border-bottom:1px solid rgb(${BONE} / .2) !important; }
${ST} .sf-statistics .k-row__name {
  ${BODY} font-size:clamp(14px, min(.95vw, 1.7vh), 18px) !important; font-weight:500; line-height:1.3;
  color:rgb(${BONE} / .94) !important; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
${ST} .sf-statistics .k-row__num {
  ${NUMERAL} font-size:clamp(17px, min(1.2vw, 2.2vh), 26px) !important; line-height:1;
  color:var(--dp-phos, #dfeeff) !important; text-align:right; white-space:nowrap;
  text-shadow:0 0 14px rgb(143 203 255 / .22); }

/* foot: ‹ BACK + ESC keycap (matches settings / save-load / help / credits / archive / achievements) */
${ST} > .k-foot { grid-area:foot; display:flex !important; align-items:center; min-height:0;
  margin:0; padding:0 !important; ${PLAIN} }
${ST} > .k-foot .k-words { display:flex; margin:0; padding:0; list-style:none; }
${ST} > .k-foot .k-word.sf-back {
  all:unset !important; box-sizing:border-box !important; cursor:pointer !important;
  display:inline-flex !important; align-items:baseline !important; gap:0 !important;
  padding:10px 0 12px !important; min-height:44px !important;
  ${LABEL} font-size:13.5px !important; letter-spacing:.22em !important; color:rgb(255 253 248) !important;
  background:linear-gradient(0deg, rgb(${BONE} / .28) 0 1.5px, transparent 1.5px) 0 100% / 120px 100% no-repeat !important;
  text-shadow:none !important; }
${ST} > .k-foot .k-word.sf-back::before {
  all:unset !important; content:"‹" !important; display:inline !important; margin-right:12px !important;
  font-size:15px !important; color:rgb(${BONE} / .6) !important; }
${ST} > .k-foot .k-word.sf-back::after {
  all:unset !important; content:"ESC" / "" !important; display:inline-block !important; margin-left:16px !important;
  padding:3px 7px 4px !important; ${LABEL} font-size:12px !important; letter-spacing:.2em !important; line-height:1 !important;
  color:rgb(${BONE} / .9) !important; background:rgb(${BONE} / .1) !important; border:1px solid rgb(${BONE} / .5) !important;
  border-radius:3px !important; box-shadow:inset 0 -1px 0 rgb(0 0 0 / .35) !important; vertical-align:baseline !important; }
${ST} > .k-foot .k-word.sf-back:is(:hover, :focus-visible) {
  color:var(--dp-hand-hot, #ffd98c) !important; outline:none !important; text-decoration:none !important; }
${ST} > .k-foot .k-word.sf-back:focus-visible::after {
  color:rgb(255 253 248) !important; border-color:rgb(255 253 248 / .45) !important; }

/* short frames: keep LAW Status on first paint without crushing 1080 */
@media (max-height:820px) {
  ${ST} { row-gap:6px !important; padding-top:clamp(14px, 2.4vh, 28px) !important; padding-bottom:10px !important; }
  ${ST} > .k-title .k-t-title, ${ST} > .k-title .fh-title { font-size:clamp(28px, 5.2vh, 48px) !important; }
  ${ST} > .k-title .k-sentence, ${ST} > .k-title > p { margin-top:4px !important; font-size:13.5px !important; }
  ${ST} > .sf-statistics.k-stage { padding-bottom:20px !important; max-width:min(640px, 100%) !important; }
  ${ST} .sf-statistics__group { margin-bottom:10px; }
  ${ST} .sf-statistics .k-row { min-height:30px; padding:3px 0 !important; }
  ${ST} .sf-statistics .k-row__name { font-size:13.5px !important; }
  ${ST} .sf-statistics .k-row__num { font-size:15px !important; }
}

/* very short desktop (≤460 tall, e.g. 1024×440 / 844×390): TRADE's lower rows hard-clipped
   mid-glyph against ‹ BACK. Compress chrome, fade the stage foot so a partial row dissolves
   instead of slicing letters, and keep Back clear of the last visible ink. */
@media (max-height:460px) {
  ${ST} { row-gap:3px !important; padding-top:8px !important; padding-bottom:4px !important;
    padding-left:clamp(18px, 2.8vw, 40px) !important; padding-right:clamp(18px, 2.8vw, 40px) !important; }
  ${ST} > .k-title .k-t-title, ${ST} > .k-title .fh-title { font-size:clamp(22px, 5.2vh, 34px) !important; line-height:.88 !important; }
  ${ST} > .k-title .k-sentence, ${ST} > .k-title > p { margin-top:1px !important; font-size:12px !important; max-width:48ch;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  ${ST} > .sf-statistics.k-stage, ${ST} > .sf-statistics.k-hang {
    padding:0 0 44px !important; max-width:min(560px, 100%) !important;
    -webkit-mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 52px), transparent 100%) !important;
    mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 52px), transparent 100%) !important; }
  ${ST} .sf-statistics__group { margin-bottom:4px; }
  ${ST} .sf-statistics__group > .k-caps { margin-bottom:2px; gap:8px;
    font-size:10px !important; letter-spacing:.16em !important; }
  ${ST} .sf-statistics__group > .k-sentence { font-size:12px; line-height:1.25; }
  ${ST} .sf-statistics .k-row { min-height:20px; padding:1px 0 !important; gap:10px; }
  ${ST} .sf-statistics .k-row__name { font-size:12px !important; }
  ${ST} .sf-statistics .k-row__num { font-size:12.5px !important; }
  ${ST} > .k-foot .k-word.sf-back { padding:4px 0 6px !important; min-height:32px !important;
    font-size:12px !important; }
}

/* shortest band (≤400 tall, e.g. 844×390): one more notch so Biggest profit stays fully
   opaque above the fade and ‹ BACK never slices a TRADE numeral. */
@media (max-height:400px) {
  ${ST} { padding-top:6px !important; padding-bottom:2px !important; row-gap:2px !important; }
  ${ST} > .k-title .k-t-title, ${ST} > .k-title .fh-title { font-size:22px !important; }
  ${ST} > .k-title .k-sentence, ${ST} > .k-title > p { display:none !important; }
  ${ST} > .sf-statistics.k-stage, ${ST} > .sf-statistics.k-hang {
    padding:0 0 40px !important;
    -webkit-mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 48px), transparent 100%) !important;
    mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 48px), transparent 100%) !important; }
  ${ST} .sf-statistics__group { margin-bottom:2px; }
  ${ST} .sf-statistics .k-row { min-height:18px; padding:0 !important; }
  ${ST} .sf-statistics .k-row__name { font-size:11.5px !important; }
  ${ST} .sf-statistics .k-row__num { font-size:12px !important; }
  ${ST} > .k-foot .k-word.sf-back { padding:2px 0 4px !important; min-height:28px !important; }
}
/* 1080p band + archive-matched 1440p/4K zoom */
@media (min-width:1800px) and (max-width:2199px) and (min-height:1000px) {
  ${ST} { zoom:1.12; }
}
@media (min-width:2200px) and (min-height:1200px) {
  ${ST} { zoom:1.25; --k-s:1; }
}
@media (min-width:3400px) and (min-height:1900px) {
  ${ST} { zoom:1.85; --k-s:1; }
}
@media (forced-colors:active) {
  ${ST} > .sf-statistics.k-stage::before { display:none; }
}
`;

export function injectStatisticsLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STATISTICS_LAYOUT_CSS;
  doc.head.appendChild(style);
}
