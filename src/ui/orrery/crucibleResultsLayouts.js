// UI polish overlay for the Crucible results plate (bench id `crucible-results`).
// The composition lives in screenLayouts.js; this sheet turns the left column into ONE scroll
// column (figures, the run, the build, then the sheet, combo and share) instead of two clipped
// scrollers, rules each band title with a hairline, gives the share codes a field, lifts the
// 1080p band and stacks the plate on a phone. Scoped to `.sf-crucible-results.has-deathdial`;
// selectors and IDs unchanged, no new DOM.
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'orr-crucible-results-style';
const BONE = '236 230 216';
const VOID = '5 7 10';
const R = 'html body #screens > .k-screen.orr-crucible.sf-crucible-results.has-deathdial.has-deathdial';
const RP = 'html:root[data-sf-mobile="1"] body #screens > .k-screen.orr-crucible.sf-crucible-results.has-deathdial.has-deathdial';
const FADE = 'linear-gradient(180deg, #000 calc(100% - 28px), transparent)';

export const CRUCIBLE_RESULTS_LAYOUT_CSS = `
/* one column, one scroller: the ledger and story boxes dissolve so their bands share one order */
${R} .sf-crres__stage { display:flex !important; flex-direction:column !important; gap:20px !important; width:100%; max-width:min(600px, 46vw) !important;
  min-height:0 !important; overflow:hidden auto !important; overscroll-behavior:contain; padding:2px 16px 28px 0 !important; margin:0 !important;
  scrollbar-width:thin; scrollbar-color:rgb(${BONE} / .22) transparent; -webkit-mask-image:${FADE}; mask-image:${FADE}; }
${R} .sf-crres__stage::before, ${R} .sf-crres__story::before { content:none !important; display:none !important; }
${R} :is(.sf-crres__ledger, .sf-crres__story) { display:contents !important; }
${R} .sf-crres__stage > *, ${R} :is(.sf-crres__ledger, .sf-crres__story) > * { flex:none; margin:0 !important; }
${R} .orr-crres-figures { order:1; grid-template-columns:repeat(4, minmax(0, 1fr)) !important; max-width:560px; column-gap:12px; padding:0 !important; }
${R} .sf-crres__band[data-band="story"] { order:2; }
${R} .sf-crres__band[data-band="build"] { order:3; }
${R} .sf-crres__sheet { order:4; }
${R} .sf-crres__ledger > .sf-crres__band:not([data-band]) { order:5; }
${R} .sf-crres__share { order:6; }
${R} .sf-crres__story > details.sf-crres__band { order:7; }
${R} :is(.sf-crres__band, .sf-crres__sheet) { padding:0 !important; }

/* band titles: an etched label running into a hairline, so the column reads as sections */
${R} :is(.sf-crres__stage, .sf-crres-celebrate) .sf-crres__band-title { display:flex !important; align-items:center; gap:14px; margin:0 0 8px !important; max-width:560px;
  font-size:12px !important; letter-spacing:.24em !important; color:rgb(${BONE} / .7) !important; }
${R} :is(.sf-crres__stage, .sf-crres-celebrate) .sf-crres__band-title::after { content:""; flex:1 1 auto; height:1px; background:linear-gradient(90deg, rgb(${BONE} / .24), rgb(${BONE} / 0)); }
${R} :is(.sf-crres__stage, .sf-crres-celebrate) .sf-crres__band-title::before { content:none !important; }
${R} .sf-crres__story-line, ${R} .sf-crres__lead { color:rgb(${BONE} / .86) !important; line-height:1.45 !important; }
${R} .sf-crres__run-name { font-size:17px !important; color:rgb(246 241 230) !important; }
${R} .sf-crres__ledger > .sf-crres__band:not([data-band]) .sf-crd-grid { max-width:560px; }
${R} .sf-crres__ledger > .sf-crres__band:not([data-band]) .k-row { min-height:30px !important; padding:4px 0 4px 12px !important; }

/* share: each code is a quiet field with its save word at the end */
${R} .sf-crres__share-item { margin:0 0 8px !important; max-width:560px; }
${R} .sf-crres__share-row { display:grid !important; grid-template-columns:96px minmax(0, 1fr) auto; align-items:center; column-gap:14px; }
${R} .sf-crres__share-cap { font-size:12px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .62) !important; white-space:nowrap; }
${R} .sf-crres__share-code { width:100% !important; min-width:0; height:30px; box-sizing:border-box; padding:0 10px !important; border:0 !important; border-radius:2px !important;
  background:rgb(${VOID} / .55) !important; box-shadow:inset 0 0 0 1px rgb(${BONE} / .16) !important; color:rgb(${BONE} / .9) !important;
  font-size:12.5px !important; text-overflow:ellipsis; outline:none; }
${R} .sf-crres__share-code:focus-visible { box-shadow:inset 0 0 0 1px var(--dp-hand, #f2b950), 0 0 0 3px rgb(242 185 80 / .18) !important; }
${R} .sf-crres__share-link { white-space:nowrap; font-size:12px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .8) !important;
  background:linear-gradient(0deg, rgb(${BONE} / .26) 0 1px, transparent 1px) 0 100% / 100% 100% no-repeat !important; padding:4px 0 !important; }
${R} .sf-crres__share-link:is(:hover, :focus-visible) { color:var(--dp-hand-hot, #ffd98c) !important; outline:none !important;
  background:linear-gradient(0deg, var(--dp-hand, #f2b950) 0 1.5px, transparent 1.5px) 0 100% / 100% 100% no-repeat !important; }

/* 1080p band: the left column at the dial's weight */
@media (min-width:1800px) and (min-height:1000px) {
  ${R} .sf-crres__stage { max-width:min(720px, 44vw) !important; gap:22px !important; }
  ${R} .orr-crres-figures { max-width:660px; }
  ${R} .orr-crres-figure__n { font-size:60px !important; }
  ${R} .orr-crres-figure__w { font-size:13px !important; }
  ${R} .orr-crres-figures__rest { font-size:17px !important; }
  ${R} .sf-crres__stage .sf-crres__band-title { font-size:13px !important; max-width:660px; }
  ${R} :is(.sf-crres__story-line, .sf-crres__lead, .sf-crres__build-name) { font-size:16px !important; }
  ${R} .sf-crres__step .sf-crres__step-verb { font-size:19px !important; }
  ${R} .sf-crres__run-name { font-size:20px !important; }
  ${R} .sf-crd-headline { font-size:20px !important; }
  ${R} :is(.sf-crres__share-item, .sf-crres__ledger > .sf-crres__band:not([data-band]) .sf-crd-grid) { max-width:660px; }
}

/* phone (data-sf-mobile): one scrolling plate — title, instrument, column; ways-out stay docked.
   The sticky foot must leave the dial caption (LAST 5 HITS + legend) clear at scroll 0. */
${RP} { display:flex !important; flex-direction:column !important; gap:18px !important; overflow:hidden auto !important; padding:18px 20px 0 !important; }
${RP}::before { position:fixed !important; inset:0 !important; }
${RP} > :is(.k-title, .sf-crres-celebrate, .sf-crres__stage) { position:relative !important; z-index:2; }
${RP} > .k-title { order:1; padding-right:0 !important; max-width:none !important; }
${RP} > .k-title .k-t-title { font-size:46px !important; white-space:nowrap; }
${RP} > .sf-crres__dial { order:2; position:relative !important; inset:auto !important; left:auto !important; right:auto !important; top:auto !important; bottom:auto !important;
  flex:none; width:100%; z-index:3;
  /* Tall enough for the ring + caption, short enough that LAST 5 HITS + legend end above the docked foot
     (Code Work 2026-10-13 23:50: sticky foot was covering them at 390×844 scroll 0).
     margin-bottom keeps THE TAKE (celebrate) from climbing through the overflowing caption. */
  height:clamp(400px, calc(100svh - 300px), 520px); margin-bottom:48px; }
${RP} > .sf-crres__dial :is(.orr-deathdial__groups, .orr-deathdial__engrave) { display:none; }
${RP} > .sf-crres__dial .orr-crres-hitlegend { display:block; }
${RP} > .sf-crres__dial .orr-deathdial__warn:not(.orr-deathdial__vitals) { display:none; }
${RP} > .sf-crres-celebrate { order:3; max-width:none !important; }
${RP} .sf-crres__stage { order:4; flex:none !important; max-width:none !important; overflow:visible !important; -webkit-mask-image:none; mask-image:none; padding:0 0 8px !important; }
${RP} .orr-crres-figures { grid-template-columns:repeat(2, minmax(0, 1fr)) !important; row-gap:16px !important; }
${RP} .sf-crres__build { flex-wrap:wrap; }
${RP} .sf-crres__share-row { grid-template-columns:minmax(0, 1fr) auto; row-gap:6px; }
${RP} .sf-crres__share-cap { grid-column:1 / -1; }
/* Ways-out stay docked at the glass floor while the plate scrolls under them. */
${RP} > .k-foot { order:5; position:sticky; bottom:0; z-index:4; flex:none; margin:auto -20px 0 !important; padding:12px 20px 8px !important;
  background:linear-gradient(180deg, rgb(${VOID} / 0), rgb(${VOID}) 18px) !important; }
${RP} > .k-foot > .k-words { width:100% !important; max-width:100% !important; flex-wrap:wrap !important; column-gap:26px !important; row-gap:2px !important; }

/* ≤600 tall desktop (960×540): the dial plus its full caption (killer, detail, vitals, the
   LAST 5 HITS strip and its legend) needs ~520px, which the full-width foot row would cut in
   half. So the ways-out stack under the left column, and the instrument takes the whole
   right-hand height down to the plate's floor; nothing in the caption is hidden. */
@media (min-width:701px) and (max-height:600px) {
  ${R} > .sf-crres__dial { top:2px !important; bottom:4px !important; overflow:visible !important; }
  ${R} .orr-deathdial__caption { padding-bottom:0 !important; }
  ${R} .orr-deathdial__strip { margin-top:8px !important; }
  ${R} .orr-crres-hitlegend { display:block !important; margin:2px 0 0 !important; }
  ${R} > .k-foot { position:relative; z-index:5; max-width:calc(42vw - 60px) !important; box-sizing:border-box; }
  ${R} > .k-foot > .k-words { flex-wrap:wrap !important; column-gap:26px !important; row-gap:6px !important; max-width:100% !important; }
  ${R} > .k-foot .k-word.k-word--primary { flex:0 0 100%; font-size:15px !important; padding-bottom:8px !important; }
  ${R} > .k-foot .k-word.k-word--primary::after { content:none !important; display:none !important; }
  ${R} .sf-crres__stage { position:relative; z-index:2; gap:12px !important; padding:0 12px 16px 0 !important; }
  ${R} .orr-crres-figure__n { font-size:30px !important; }
  ${R} .orr-crres-figure__w { font-size:11px !important; letter-spacing:.18em !important; margin-top:4px !important; }
  ${R} :is(.sf-crres__stage, .sf-crres-celebrate) .sf-crres__band-title { margin:0 0 6px !important; }
  ${R} > .k-title .k-t-title { font-size:clamp(34px, 7.2vh, 48px) !important; }
  ${R} > .sf-crres-celebrate { margin:0 !important; }
}
@media (min-width:701px) and (max-width:880px) and (max-height:600px) {
  ${R} > .k-foot .k-word.k-word--primary { font-size:13px !important; }
}

/* 601–720 tall: keep a thin safety clip so a long killer name cannot bleed into the foot */
@media (min-width:701px) and (min-height:601px) and (max-height:720px) {
  ${R} > .sf-crres__dial { overflow:hidden !important; }
  ${R} > .k-foot { position:relative; z-index:5; }
}


`;

export function injectCrucibleResultsLayouts(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  injectOrrery(doc);
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CRUCIBLE_RESULTS_LAYOUT_CSS;
  doc.head.appendChild(style);
}
