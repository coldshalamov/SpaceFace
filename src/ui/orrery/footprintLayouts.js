// src/ui/orrery/footprintLayouts.js — ORRERY composition for THE FOOTPRINT (F3; design/frontend/ORRERY.md §6
// Meta). It places the screen's own nodes and pins nothing inline: the Heat Dial (footprintDial.js) on the
// left, filling the stage's height; beside it the reading of the traced source — what it is, its chain
// unfolded as a beam of its receipts (act, incident, standing, consequence), the verbs that answer it (the
// one Lamp Key and words, each with what it costs), then the record. No boxes: the column stands in a pool
// of shade, the beam is a band of light with a core, the verbs are words. It overrides the kit's footprint
// board (styles/ui.css fp-*) and the Deckplate printed keys from here, scoped to the screen.
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-footprint';
const BONE = '236 230 216';
const INK = 'rgb(248 244 234)';
const S = 'html body #screens .k-screen.fp-orrery.fp-orrery.fp-orrery[data-screen="footprint"]';
const LABEL = 'font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112% !important; font-variation-settings:"wdth" 112, "wght" 650 !important; font-weight:650 !important; text-transform:uppercase !important; font-style:normal !important;';
const BODY = 'font-family:var(--dp-face-body, "Instrument Sans"), system-ui, sans-serif !important; font-variation-settings:normal !important; text-transform:none !important; letter-spacing:0 !important;';
const PLAIN = 'background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; clip-path:none !important; border-radius:0 !important;';
const DISPLAY = 'font-family:var(--dp-face-display, "Archivo") !important; font-stretch:125% !important; font-variation-settings:"wdth" 125, "wght" 800 !important; font-weight:800 !important;';

const CSS = `
/* the screen: the title band over one stage row (the dial and its reading) */
${S} { grid-template-columns:minmax(0, 1fr) !important; grid-template-rows:auto minmax(0, 1fr) !important; grid-template-areas:"title" "stage" !important;
  row-gap:clamp(14px, 2.6vh, 36px) !important; padding-bottom:calc(var(--k-margin) * .55) !important; padding-top:calc(var(--k-margin) * .7) !important; }
${S}::before { background:rgb(5 7 10 / .42) !important; }
${S} > .k-title { grid-area:title; display:flex !important; align-items:baseline; flex-wrap:wrap; column-gap:28px; row-gap:6px; padding-right:0 !important; margin:0 !important; }
${S} > .k-title > .fp-display { ${DISPLAY} margin:0 !important; font-size:clamp(40px, 3.9vw, 84px) !important; line-height:.9 !important; letter-spacing:.01em !important;
  text-transform:uppercase !important; color:${INK} !important; text-shadow:0 2px 18px rgb(0 0 0 / .55) !important; }
${S} > .k-title > .fp-line { ${BODY} margin:0 !important; font-size:clamp(13px, .82vw, 16px) !important; line-height:1.4 !important; color:rgb(${BONE} / .8) !important; max-width:none !important;
  text-shadow:0 1px 10px rgb(0 0 0 / .7); }
${S} > .k-corner, ${S} > .k-hang { display:none !important; }

/* the stage: the dial (a square, as tall as the row) and the reading column */
${S} > .k-stage.fp-stage { grid-area:stage; display:grid !important; grid-template-columns:var(--fp-dial-w, 52%) minmax(0, 1fr) !important; grid-template-rows:minmax(0, 1fr) !important;
  column-gap:clamp(20px, 2.6vw, 60px) !important; row-gap:0 !important; min-height:0 !important; position:relative; }
${S} .fp-dialhost { grid-column:1; grid-row:1; position:relative; min-width:0; min-height:0; }
${S} .fp-read { grid-column:2; grid-row:1; position:relative; min-width:0; min-height:0; max-width:680px; display:flex; flex-direction:column; gap:clamp(12px, 2.1vh, 26px);
  overflow:hidden auto; scrollbar-width:none; padding:2px 10px 28px 0; box-sizing:border-box; }
${S} .fp-read::-webkit-scrollbar { display:none; }
/* the column scrolls as one: nothing in it shrinks to fit */
${S} .fp-read > * { flex:none !important; }
${S} .fp-read[data-overflow="1"] { -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 40px), transparent); mask-image:linear-gradient(180deg, #000 calc(100% - 40px), transparent); }
/* a pool of shade behind the reading, no panel */
${S} > .k-stage.fp-stage::after { content:""; position:absolute; z-index:-1; pointer-events:none; top:-40px; bottom:-40px; left:calc(var(--fp-dial-w, 52%) - 20px); right:-60px;
  background:radial-gradient(ellipse 70% 62% at 30% 46%, rgb(5 7 10 / .72), rgb(5 7 10 / .5) 55%, rgb(5 7 10 / 0) 100%); }

/* the traced source's head */
${S} .fp-trace { display:flex; flex-direction:column; gap:8px; }
${S} .fp-trace[hidden] { display:none !important; }
${S} .fp-trace__top { display:flex; align-items:center; gap:16px; min-width:0; }
${S} .fp-trace__crest { flex:none; width:clamp(40px, 3vw, 58px); height:clamp(40px, 3vw, 58px); object-fit:contain; filter:drop-shadow(0 0 8px rgb(0 0 0 / .85)); }
${S} .fp-trace__names { display:flex; flex-direction:column; gap:6px; min-width:0; }
${S} .fp-trace__k { ${LABEL} margin:0; font-size:12px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .76) !important; }
${S} .fp-trace__k b { font-weight:700; color:${INK}; }
${S} .fp-trace__name { ${DISPLAY} margin:0; font-size:clamp(22px, 1.6vw, 32px) !important; line-height:1.05 !important; letter-spacing:.02em !important; text-transform:uppercase !important; color:${INK} !important; }
${S} .fp-trace__read { display:flex; flex-direction:column; gap:4px; }
${S} .fp-trace__read .k-sentence { ${BODY} margin:0 !important; max-width:62ch !important; font-size:14.5px !important; line-height:1.45 !important; color:rgb(${BONE} / .84) !important; }
${S} .fp-trace__read .k-sentence--emph { font-size:15px !important; color:${INK} !important; font-weight:500 !important; }
${S} .fp-trace__read [data-entity], ${S} .fp-drawer [data-entity] { color:${INK} !important; text-decoration:none !important; background:linear-gradient(rgb(${BONE} / .42), rgb(${BONE} / .42)) 0 100% / 100% 1px no-repeat; }

/* the chain, unfolded: a band of light with a core, a bead per receipt, the stage words over them */
${S} .fp-board { ${PLAIN} position:relative; display:block !important; padding:2px 0 4px 50px !important; min-height:0; overflow:visible !important; }
${S} .fp-board[hidden] { display:none !important; }
${S} .fp-board::before { content:""; position:absolute; left:28px; top:4px; bottom:4px; width:10px; background:rgb(${BONE} / .14); pointer-events:none; }
${S} .fp-board::after { content:""; position:absolute; left:32px; top:4px; bottom:4px; width:2px; pointer-events:none;
  background:linear-gradient(180deg, rgb(143 203 255 / 0), rgb(143 203 255 / .95) 50%, rgb(143 203 255 / 0)) 0 -64px / 2px 64px no-repeat, rgb(${BONE} / .66);
  animation:fp-beam-pulse 2.8s linear infinite; }
@keyframes fp-beam-pulse { from { background-position:0 -64px, 0 0; } to { background-position:0 calc(100% + 64px), 0 0; } }
html.sf-reduce-motion ${S} .fp-board::after { animation:none; background:rgb(${BONE} / .66); }
${S} .fp-board > .fp-head { display:none !important; }
${S} .fp-edges { position:absolute; left:0; top:0; width:100%; height:100%; pointer-events:none; overflow:visible; z-index:0; }
${S} .fp-edge { fill:none; stroke:rgb(${BONE} / .72); stroke-width:2; stroke-linecap:round; }
${S} .fp-edge-bloom { fill:none; stroke:rgb(${BONE} / .12); stroke-width:7; stroke-linecap:round; }
${S} .fp-edge--spillover { stroke:rgb(${BONE} / .62); stroke-dasharray:5 4; }
${S} .fp-nodes { position:relative; z-index:1; padding:0 !important; overflow:visible !important; }
${S} .fp-chain { display:flex !important; flex-direction:column; gap:clamp(6px, 1.2vh, 12px); }
${S} .fp-cell { display:flex !important; flex-direction:column; align-items:flex-start; gap:2px; min-width:0; }
${S} .fp-cell::before { content:attr(data-name); ${LABEL} display:block; font-size:12px; letter-spacing:.22em; color:rgb(${BONE} / .7); margin:0 0 1px; }
${S} .fp-cell[data-empty="1"]::before { color:rgb(${BONE} / .6); }
${S} .fp-node { ${PLAIN} ${BODY} position:relative !important; display:block !important; width:auto !important; max-width:100% !important; min-height:0 !important; height:auto !important;
  padding:3px 0 !important; margin:0 !important; font-size:15px !important; line-height:1.35 !important; text-align:left !important; white-space:normal !important;
  color:rgb(${BONE} / .9) !important; cursor:pointer; outline:none !important; text-shadow:none !important; }
${S} .fp-node::after { display:none !important; content:none !important; }
/* the bead on the spine (spine centre 33px from the board's edge, the node's text starts at 50px) */
${S} .fp-node::before { content:"" !important; position:absolute !important; left:-22px !important; top:calc(.35em + 4px) !important; width:10px !important; height:10px !important; margin:0 !important;
  border-radius:50% !important; background:rgb(10 12 16) !important; box-shadow:inset 0 0 0 2px rgb(${BONE} / .82) !important; transform:none !important; translate:none !important; scale:none !important;
  opacity:1 !important; border:0 !important; display:block !important; }
${S} .fp-node:is(:hover, :focus-visible) { color:rgb(255 255 255) !important; }
${S} .fp-node:is(:hover, :focus-visible)::before { background:rgb(${BONE} / .5) !important; }
${S} .fp-node.fp-node--latch { color:${INK} !important; font-weight:600 !important; }
${S} .fp-node.fp-node--latch::before { background:${INK} !important; box-shadow:0 0 0 4px rgb(255 250 236 / .16), 0 0 12px 1px rgb(255 250 236 / .5) !important; }
${S} .fp-node.fp-node--spent { color:rgb(${BONE} / .6) !important; }
${S} .fp-col-empty { ${BODY} font-size:13px !important; color:rgb(${BONE} / .62) !important; padding:1px 0 !important; }

/* the answer: the verbs as words beside what each costs; the one that answers this source is the Lamp Key */
${S} .fp-answer { ${PLAIN} grid-area:auto !important; display:flex !important; flex-direction:column; align-items:stretch; gap:10px !important; min-width:0; padding:0 !important; margin:0 !important; }
${S} .fp-answer[hidden] { display:none !important; }
${S} .fp-answer__k { ${LABEL} margin:0; font-size:12px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .76) !important; }
${S} .fp-answer .k-words { display:grid !important; grid-template-columns:max-content minmax(0, 1fr); column-gap:22px; row-gap:4px; align-items:center; margin:0 !important; padding:0 !important; }
${S} .fp-answer .k-words > li { display:contents !important; }
${S} .fp-answer .k-word:not(.orr-lampkey) { ${PLAIN} ${LABEL} position:relative; display:inline-flex !important; align-items:center; justify-self:start; min-height:34px !important; height:auto !important; width:auto !important;
  padding:0 0 0 18px !important; margin:0 !important; font-size:13px !important; letter-spacing:.16em !important; line-height:1 !important; color:${INK} !important; cursor:pointer; outline:none !important; text-shadow:none !important; }
${S} .fp-answer .k-word:not(.orr-lampkey)::after { display:none !important; content:none !important; }
${S} .fp-answer .k-word:not(.orr-lampkey)::before { content:"" !important; position:absolute !important; left:0 !important; top:50% !important; width:8px !important; height:2px !important; margin:-1px 0 0 !important;
  background:rgb(${BONE} / .66) !important; border:0 !important; box-shadow:none !important; transform:none !important; translate:none !important; scale:none !important; display:block !important; clip-path:none !important; border-radius:0 !important; }
${S} .fp-answer .k-word:not(.orr-lampkey):is(:hover, :focus-visible, .is-previewing) { color:rgb(255 255 255) !important; text-shadow:0 0 14px rgb(255 250 236 / .45) !important; }
${S} .fp-answer .k-word:not(.orr-lampkey):is(:hover, :focus-visible, .is-previewing)::before { width:12px !important; height:3px !important; margin-top:-1.5px !important; background:${INK} !important; box-shadow:0 0 8px rgb(255 250 236 / .5) !important; }
${S} .fp-answer .k-word:not(.orr-lampkey)[aria-disabled="true"] { color:rgb(${BONE} / .56) !important; cursor:default; text-shadow:none !important; }
${S} .fp-answer .k-word:not(.orr-lampkey)[aria-disabled="true"]::before { background:rgb(${BONE} / .34) !important; width:8px !important; height:2px !important; box-shadow:none !important; }
${S} .fp-answer .k-word.orr-lampkey { justify-self:start; margin:4px 0 !important; }
${S} .fp-answer .k-word-sub { ${BODY} margin:0 !important; font-size:13px !important; line-height:1.35 !important; color:rgb(${BONE} / .78) !important; }
${S} .fp-answer .k-word[aria-disabled="true"] + .k-word-sub, ${S} .fp-answer li:has(> .k-word[aria-disabled="true"]) > .k-word-sub { color:rgb(${BONE} / .64) !important; }

/* the record: a ledger under a ruled line, lower in the column */
${S} .fp-drawer { ${PLAIN} display:flex !important; flex-direction:column; gap:8px !important; overflow:visible !important; min-height:0; padding:18px 0 0 !important;
  background:linear-gradient(90deg, rgb(${BONE} / .42), rgb(${BONE} / .42)) 0 0 / 100% 2px no-repeat,
    repeating-linear-gradient(90deg, rgb(${BONE} / .34) 0 1.5px, transparent 1.5px 12px) 0 2px / 100% 6px no-repeat !important; }
${S} .fp-drawer[hidden] { display:none !important; }
${S} .fp-drawer > .k-caps { ${LABEL} margin:8px 0 0 !important; font-size:12px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .74) !important; }
${S} .fp-drawer > .k-caps:first-child { margin-top:0 !important; }
${S} .fp-drawer .k-words--row { display:flex !important; flex-direction:row !important; gap:22px !important; margin:0 !important; }
${S} .fp-drawer .k-word { ${PLAIN} ${LABEL} min-height:28px !important; height:auto !important; padding:0 !important; font-size:12px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .7) !important; cursor:pointer; outline:none !important; }
${S} .fp-drawer .k-word::after, ${S} .fp-drawer .k-word::before { display:none !important; content:none !important; }
${S} .fp-drawer .k-word:is(:hover, :focus-visible) { color:rgb(255 255 255) !important; }
${S} .fp-drawer .k-word[aria-pressed="true"] { color:${INK} !important; background:linear-gradient(${INK}, ${INK}) 0 100% / 100% 2px no-repeat !important; padding-bottom:0 !important; }
${S} .fp-drawer .k-rows { margin:0 !important; padding:0 !important; }
${S} .fp-drawer .k-row { ${PLAIN} display:grid !important; grid-template-columns:minmax(0, 1fr) auto !important; column-gap:14px; min-height:0 !important; padding:5px 0 5px 16px !important; position:relative; cursor:default; }
${S} .fp-drawer .k-row::before { content:""; position:absolute; left:0; top:13px; width:7px; height:2px; background:rgb(${BONE} / .5); }
${S} .fp-drawer .k-row::after { display:none !important; }
${S} .fp-drawer .k-row__name { ${BODY} font-size:14px !important; color:${INK} !important; white-space:normal !important; }
${S} .fp-drawer .k-row__sub { ${BODY} font-size:12.5px !important; line-height:1.4; color:rgb(${BONE} / .7) !important; white-space:normal !important; }
${S} .fp-drawer .k-row__num { font-family:var(--dp-face-numeral, "Archivo") !important; font-variation-settings:"wdth" 100, "wght" 420 !important; font-size:15px !important; color:rgb(223 238 255) !important; align-self:start; padding-top:2px; }
${S} .fp-drawer .k-sentence { ${BODY} margin:0 !important; font-size:13.5px !important; color:rgb(${BONE} / .8) !important; }

/* a data state (loading, a fault): the words in the reading column, the chart as a word, no box */
${S} .fp-statehost:not([hidden]) { ${PLAIN} align-self:start; padding:0 !important; margin:0 !important; }
${S} .fp-statehost .sf-state { ${PLAIN} display:flex !important; flex-direction:column; gap:8px; padding:0 !important; }
${S} .fp-statehost .sf-state__glyph, ${S} .fp-statehost .sf-state__skel { display:none !important; }
${S} .fp-statehost .sf-state__word { ${LABEL} font-size:12px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .76) !important; }
${S} .fp-statehost .sf-state__head { ${DISPLAY} margin:0 !important; font-size:clamp(20px, 1.5vw, 28px) !important; line-height:1.1 !important; text-transform:uppercase !important; color:${INK} !important; }
${S} .fp-statehost .sf-state__fills { ${BODY} margin:0 !important; font-size:14.5px !important; line-height:1.45; color:rgb(${BONE} / .84) !important; max-width:52ch; }
${S} .fp-statehost .sf-state__verb { ${PLAIN} ${LABEL} align-self:flex-start; position:relative; min-height:34px !important; height:auto !important; padding:0 0 0 18px !important; margin:6px 0 0 !important;
  font-size:13px !important; letter-spacing:.16em !important; color:${INK} !important; cursor:pointer; }
${S} .fp-statehost .sf-state__verb::before { content:"" !important; position:absolute; left:0; top:50%; width:8px; height:2px; margin-top:-1px; background:rgb(${BONE} / .66); display:block !important; }
${S} .fp-statehost .sf-state__verb::after { display:none !important; }
${S} .fp-statehost .sf-state__verb:is(:hover, :focus-visible) { color:rgb(255 255 255) !important; outline:none !important; text-shadow:0 0 14px rgb(255 250 236 / .45); }
${S} .fp-statehost .sf-state__key { display:none !important; }

/* keyboard focus inside the column: light, never an underline or a box */
${S} :focus-visible { outline:none !important; }
@media (max-height:800px) {
  ${S} .fp-read { gap:10px; }
  ${S} .fp-trace { gap:5px; }
  ${S} .fp-trace__read .k-sentence--emph { display:none; }
  ${S} .fp-chain { gap:4px !important; }
  ${S} .fp-cell::before { margin:0 !important; }
  ${S} .fp-answer { gap:6px !important; }
  ${S} .fp-answer .k-words { row-gap:0 !important; }
  ${S} .fp-answer .k-word.orr-lampkey { min-height:38px !important; font-size:13.5px !important; margin:2px 0 !important; }
  ${S} .fp-trace__read .k-sentence { font-size:13.5px !important; }
  ${S} .fp-node { font-size:14px !important; padding:2px 0 !important; }
  ${S} .fp-answer .k-word:not(.orr-lampkey) { min-height:28px !important; }
  ${S} .fp-answer .k-word-sub { font-size:12.5px !important; }
}
`;

export function injectFootprintLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
