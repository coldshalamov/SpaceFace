// src/ui/orrery/constellationLayouts.js — the ORRERY composition for the two meta screens built on the
// constellation instruments (design/frontend/ORRERY.md §6 Meta): Research (the Research Constellation,
// src/ui/orrery/constellation.js) and Achievements (the medal ring grid,
// src/ui/orrery/constellationMedals.js). Layout and type only: where the instrument, its reading and
// the foot sit, and how the words read. Nothing here draws a box: the reading stands on a pool of shade
// with soft edges, the verbs are words, the one filled shape is the Lamp Key. Scoped to each screen's
// root (#sf-techtree.con-research, .con-achievements) so nothing reaches another screen; `!important`
// only where the kit or the Deckplate bridge pins a property with it.

const STYLE_ID = 'orr-constellation-screens';
const BONE = '236 230 216';
const WARM = '248 244 234';

const LABEL = `font-family:var(--dp-face-label, "Archivo"), "Archivo", system-ui, sans-serif; font-stretch:112%; font-weight:650; text-transform:uppercase; font-variation-settings:normal;`;
const READ = `font-family:var(--dp-face-read, "Instrument Sans"), "Instrument Sans", system-ui, sans-serif; font-stretch:100%; font-variation-settings:normal; text-transform:none;`;
const NUMERAL = `font-family:var(--dp-face-numeral, "Archivo"), "Archivo", system-ui, sans-serif; font-stretch:100%; font-weight:250; font-variation-settings:"wght" 250, "wdth" 100;
  font-variant-numeric:tabular-nums lining-nums; letter-spacing:-.01em;`;
const DISPLAY = `font-family:var(--dp-face-display, "Archivo"), "Archivo", system-ui, sans-serif; font-stretch:125%; font-weight:800; font-variation-settings:"wght" 800, "wdth" 125;
  text-transform:uppercase;`;
const HALO = 'text-shadow:0 0 2px rgb(4 6 9), 0 0 6px rgb(4 6 9 / .9), 0 0 14px rgb(4 6 9 / .7);';

/** A soft pool of shade under a reading: no edge, so it never reads as a panel. */
const POOL = (inset = '-40px -56px') => `content:""; position:absolute; z-index:-1; inset:${inset}; pointer-events:none;
  background:radial-gradient(closest-side, rgb(4 6 9 / .82), rgb(4 6 9 / .6) 58%, rgb(4 6 9 / 0));`;

const T = 'html body #screens > #sf-techtree.con-research';

const RESEARCH = `
${T}.k-screen { box-sizing:border-box; display:grid !important;
  padding:clamp(20px, 3.4vh, 52px) clamp(24px, 3.2vw, 80px) clamp(14px, 2.4vh, 36px) !important;
  grid-template-columns:minmax(0, 1fr) clamp(290px, 23vw, 500px) !important; grid-template-rows:auto minmax(0, 1fr) auto !important;
  grid-template-areas:"title corner" "stage side" "foot foot" !important; column-gap:clamp(18px, 2.2vw, 60px) !important; row-gap:clamp(4px, 1.1vh, 18px) !important; }
${T} > .k-title { grid-area:title; padding-right:0 !important; align-self:start; position:relative; z-index:2; pointer-events:none; }
${T} > .k-title .con-title { width:fit-content; margin:0; ${DISPLAY} font-size:clamp(32px, min(3.1vw, 5.6vh), 84px) !important; line-height:.92 !important; letter-spacing:.02em !important;
  color:rgb(${WARM}) !important; background:none !important; -webkit-text-fill-color:currentColor; ${HALO} }
${T} > .k-title .con-sub { width:fit-content; margin:clamp(6px, 1vh, 12px) 0 0 !important; ${READ} font-size:clamp(14px, min(.9vw, 1.7vh), 19px) !important; line-height:1.35; color:rgb(${BONE} / .8) !important; ${HALO} max-width:48ch; }
/* the three readings in the corner: thin numerals over their words, no plate */
${T} > .k-corner.con-corner { grid-area:corner; position:relative !important; right:auto !important; top:auto !important; z-index:2; align-self:start; justify-self:stretch;
  display:flex !important; flex-direction:row !important; justify-content:space-between; align-items:flex-start; gap:clamp(14px, 1.6vw, 36px);
  margin:0; padding:clamp(4px, .6vh, 10px) 0 0; background:none !important; border:0 !important; box-shadow:none !important; text-align:right; }
${T} .con-read { display:flex; flex-direction:column; align-items:flex-end; gap:clamp(4px, .6vh, 8px); min-width:0; }
${T} .con-read__n { ${NUMERAL} font-size:clamp(26px, min(2.1vw, 4vh), 56px); line-height:.9; color:rgb(${WARM}); ${HALO} white-space:nowrap; }
${T} .con-read__w { ${LABEL} font-size:clamp(10px, .6vw, 12.5px); line-height:1.3; letter-spacing:.2em; color:rgb(${BONE} / .66); white-space:nowrap; ${HALO} }
@media (max-width:1500px) { ${T} .con-read__w { white-space:normal; text-align:right; max-width:9ch; } }

/* the dial */
${T} > .k-stage.con-stage { grid-area:auto; grid-column:1; grid-row:1 / 3; position:relative; z-index:0; min-width:0; min-height:0; margin:0; padding:0; border:0 !important; background:none !important; box-shadow:none !important;
  overflow:visible; -webkit-mask-image:none !important; mask-image:none !important; animation:none !important; }
${T} .con-skyhost { position:absolute; inset:0; }

/* the reading beside the dial */
${T} > .con-side { grid-area:side; position:relative; z-index:1; min-width:0; min-height:0; align-self:stretch; box-sizing:border-box;
  padding:clamp(6px, 3vh, 44px) 0 10px; overflow:visible; }
${T} > .con-side::before { ${POOL('-10% -18% -6% -22%')} }
${T} .con-dossier { display:flex; flex-direction:column; gap:clamp(6px, 1.1vh, 14px); }
${T} .con-dossier > * { margin:0; }
${T} .con-dossier__kicker { ${LABEL} font-size:clamp(10.5px, .62vw, 13px); letter-spacing:.24em; color:rgb(${BONE} / .68); }
${T} .con-dossier__kicker span { margin:0 .3em; }
${T} .con-dossier__name { ${DISPLAY} font-size:clamp(22px, min(1.75vw, 3.3vh), 44px); line-height:1.02; letter-spacing:.02em; color:rgb(${WARM}); text-wrap:balance; ${HALO} }
${T} .con-dossier__state { ${READ} font-size:clamp(14px, .85vw, 18px); line-height:1.35; color:rgb(${BONE} / .8); }
${T} .con-dossier__state:is([data-state="available"], [data-state="researched"]) { color:rgb(${WARM}); }
/* the cost: each figure thin and large inside an arc of how much of it you hold */
${T} .con-dossier__cost { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px clamp(12px, 1.2vw, 26px); margin:clamp(4px, .8vh, 10px) 0 clamp(2px, .6vh, 8px) !important; }
${T} .con-cost { display:grid; grid-template-columns:auto minmax(0, 1fr); grid-template-rows:auto auto auto; column-gap:clamp(8px, .7vw, 14px); align-items:center; min-width:0; }
${T} .con-cost__gauge { grid-row:1 / span 3; width:clamp(38px, 2.6vw, 58px); height:clamp(38px, 2.6vw, 58px); overflow:visible; }
${T} .con-cost__track { fill:none; stroke:rgb(${BONE} / .26); stroke-width:1.5; stroke-linecap:round; }
${T} .con-cost__fill { fill:none; stroke:rgb(${WARM}); stroke-width:2.6; stroke-linecap:round; }
${T} .con-cost[data-short="1"] .con-cost__fill { stroke:rgb(${BONE} / .72); }
${T} .con-cost[data-free="1"] .con-cost__fill { stroke:rgb(${BONE} / .42); }
${T} .con-cost dt { ${LABEL} font-size:clamp(9.5px, .55vw, 11.5px); letter-spacing:.18em; color:rgb(${BONE} / .64); white-space:nowrap; }
${T} .con-cost dd { margin:2px 0 0; ${NUMERAL} font-size:clamp(24px, min(1.8vw, 3.4vh), 46px); line-height:1; color:rgb(${WARM}); }
${T} .con-cost__sub { margin-top:3px; ${LABEL} font-size:clamp(9.5px, .55vw, 11.5px); letter-spacing:.14em; color:rgb(${BONE} / .64); white-space:nowrap; }
${T} .con-cost[data-short="1"] .con-cost__sub { color:rgb(${WARM} / .9); }
${T} .con-dossier__cost.is-owned .con-cost dd { color:rgb(${BONE} / .7); }
${T} .con-actions { margin:clamp(2px, .6vh, 8px) 0 clamp(4px, 1vh, 12px); }
${T} .con-actions .orr-lampkey { min-width:clamp(150px, 11vw, 220px); justify-content:center; }
/* a node you cannot research yet: its reason in words where the key would be, never a box */
${T} .con-why { all:unset; box-sizing:border-box; display:block; cursor:default; max-width:100%; padding:6px 0 6px 18px; position:relative;
  ${LABEL} font-size:clamp(11px, .64vw, 13px); line-height:1.4; letter-spacing:.14em; color:rgb(${BONE} / .76); white-space:normal; }
${T} .con-why::before { content:"›"; position:absolute; left:0; top:5px; color:rgb(${BONE} / .5); letter-spacing:0; }
${T} .con-actions[data-state="researched"] .con-why::before { content:"✓"; }
${T} .con-why:focus-visible { outline:none !important; color:rgb(${WARM}); text-decoration:underline; text-decoration-thickness:1px; text-underline-offset:5px; }
${T} .con-caps { margin:clamp(4px, .9vh, 12px) 0 0; ${LABEL} font-size:clamp(9.5px, .56vw, 11.5px); letter-spacing:.24em; color:rgb(${BONE} / .62); }
${T} .con-rows { list-style:none; margin:2px 0 0 !important; padding:0; display:flex; flex-direction:column; }
${T} .con-row { display:grid; grid-template-columns:minmax(0, 1fr) auto; column-gap:14px; align-items:baseline; padding:clamp(3px, .5vh, 6px) 0; min-height:0; border:0; background:none; }
${T} .con-row__name { ${READ} font-size:clamp(14px, .82vw, 17px); line-height:1.3; color:rgb(${WARM}); min-width:0; }
${T} .con-row__sub { ${LABEL} font-size:clamp(9.5px, .54vw, 11px); letter-spacing:.16em; color:rgb(${BONE} / .62); white-space:nowrap; }
${T} .con-reqs .con-row[data-met="0"] .con-row__name { color:rgb(${BONE} / .76); }
${T} .con-sentence, ${T} .con-empty { ${READ} font-size:clamp(13.5px, .78vw, 16px); line-height:1.45; color:rgb(${BONE} / .78); margin:0; }
${T} .con-dossier .sf-entity-link { text-decoration:none !important; box-shadow:none !important; border:0 !important; color:inherit !important; background:none !important; cursor:pointer; }
${T} .con-dossier .sf-entity-link:is(:hover, :focus-visible) { outline:none !important; text-decoration:underline !important; text-decoration-thickness:1px !important; text-underline-offset:4px; }

/* the foot: Back as a word, the legend as the stars themselves, the picker as a value on a rail */
${T} > .k-foot.con-foot { grid-area:foot; display:flex; align-items:center; gap:clamp(18px, 2.8vw, 64px); min-height:0; margin:0; padding:0; border:0; background:none; }
${T} .con-back.sf-back.k-word { all:unset; box-sizing:border-box; display:inline-flex; align-items:center; gap:0; min-height:40px; cursor:pointer;
  ${LABEL} font-size:clamp(12px, .72vw, 15px); letter-spacing:.2em; color:rgb(${WARM}); }
${T} .con-back.sf-back.k-word::before { content:none !important; }
${T} .con-back.sf-back.k-word::after { content:"· ESC" / "" !important; all:unset; content:"· ESC" / ""; margin-left:.7em; ${LABEL} font-size:.82em; letter-spacing:.16em; color:rgb(${BONE} / .6); }
${T} .con-back.sf-back.k-word:is(:hover, :focus-visible) { outline:none !important; text-decoration:underline; text-decoration-thickness:1px; text-underline-offset:6px; }
${T} .con-legend { display:flex; align-items:center; gap:clamp(14px, 1.5vw, 30px); }
${T} .con-legend__item { display:inline-flex; align-items:center; gap:8px; ${LABEL} font-size:clamp(9.5px, .56vw, 11.5px); letter-spacing:.18em; color:rgb(${BONE} / .68); }
${T} .con-legend__item svg { width:16px; height:16px; overflow:visible; flex:none; }
${T} .con-picker { display:flex; align-items:center; gap:14px; margin-left:auto; }
${T} .con-picker__label { ${LABEL} font-size:clamp(9.5px, .56vw, 11.5px); letter-spacing:.2em; color:rgb(${BONE} / .66); }
${T} select.k-select.con-select { min-width:clamp(180px, 13vw, 280px); min-height:36px; ${READ} font-size:clamp(14px, .8vw, 16px) !important; color:rgb(${WARM}) !important;
  background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23ece6d8' stroke-width='1.4'/%3E%3C/svg%3E") right 4px center / 10px 6px no-repeat,
    linear-gradient(0deg, rgb(${BONE} / .34) 1px, transparent 0) !important; }
${T} select.k-select.con-select:focus-visible { outline:none !important;
  background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23f8f4ea' stroke-width='1.4'/%3E%3C/svg%3E") right 4px center / 10px 6px no-repeat,
    linear-gradient(0deg, rgb(${WARM}) 1px, transparent 0) !important; }
${T} select.k-select.con-select option { background:#0c0f13; color:rgb(${WARM}); }

/* narrow frames: the reading narrows, the foot's legend yields first */
@media (max-width:1400px) {
  ${T}.k-screen { grid-template-columns:minmax(0, 1fr) clamp(270px, 25vw, 340px) !important; }
}
@media (max-width:1100px) {
  ${T} .con-legend { display:none; }
}
@media (forced-colors:active) {
  ${T} > .con-side::before { display:none; }
  ${T} .con-cost__fill { stroke:Highlight; }
}
`;

const A = 'html body #screens > .k-screen.con-achievements';

const ACHIEVEMENTS = `
${A} { box-sizing:border-box; display:grid !important;
  padding:clamp(20px, 3.4vh, 52px) clamp(24px, 3.2vw, 80px) clamp(14px, 2.4vh, 36px) !important;
  grid-template-columns:minmax(0, 1fr) clamp(290px, 25vw, 520px) !important; grid-template-rows:auto auto minmax(0, 1fr) auto !important;
  grid-template-areas:"title read" "hang read" "stage read" "foot foot" !important; column-gap:clamp(18px, 3vw, 72px) !important; row-gap:clamp(6px, 1.4vh, 20px) !important; }
${A}::before { background:radial-gradient(120% 90% at 32% 50%, rgb(5 7 10 / .76), rgb(5 7 10 / .88) 70%) !important; }
${A} > .k-title { grid-area:title; max-width:none; padding-right:0 !important; display:block; }
${A} > .k-title .con-title { width:fit-content; margin:0; ${DISPLAY} font-size:clamp(32px, min(3.1vw, 5.6vh), 84px) !important; line-height:.92 !important;
  letter-spacing:.02em !important; color:rgb(${WARM}) !important; white-space:nowrap; ${HALO} }
${A} > .k-title .con-sub { margin:clamp(6px, 1vh, 12px) 0 0 !important; ${READ} font-size:clamp(14px, min(.9vw, 1.7vh), 19px) !important; line-height:1.35; color:rgb(${BONE} / .8) !important; ${HALO} }
/* the categories: words standing on a ruler, a bone bead under the one in view */
${A} > .k-hang.con-filters { grid-area:hang; overflow:visible !important; max-height:none; min-width:0; }
${A} .con-filters .k-words { display:flex !important; flex-direction:row !important; flex-wrap:nowrap; gap:clamp(14px, 2vw, 44px) !important; margin:0; padding:0 8px; list-style:none; }
${A} .con-filters .k-words > li { margin:0; padding:0; }
${A} .con-filters .k-word { all:unset; box-sizing:border-box; display:inline-flex; align-items:center; min-height:36px; cursor:pointer; position:relative;
  ${LABEL} font-size:clamp(11px, .66vw, 14px); letter-spacing:.2em; color:rgb(${BONE} / .7); white-space:nowrap; }
${A} .con-filters .k-word::before, ${A} .con-filters .k-word::after { content:none !important; display:none !important; }
${A} .con-filters .k-word:hover { color:rgb(${WARM}); }
${A} .con-filters .k-word[aria-current="true"] { color:rgb(${WARM}); }
${A} .con-filters .k-word:focus-visible { outline:none !important; color:rgb(${WARM}); text-decoration:underline; text-decoration-thickness:1px; text-underline-offset:6px; }
/* the grid of medals */
${A} > .k-stage.con-medal-stage { grid-area:stage; position:relative; min-width:0; min-height:0; margin:0; padding:clamp(12px, 2.6vh, 32px) 0 0 !important; border:0 !important;
  background:none !important; box-shadow:none !important; overflow:visible !important; -webkit-mask-image:none !important; mask-image:none !important; animation:none !important; max-width:none !important;
  --con-medal:clamp(64px, min(6vw, 9.4vh), 150px); --con-glyph:calc(var(--con-medal) * .27); --con-medal-px:clamp(11px, .64vw, 14px); --con-row-gap:clamp(8px, 1.6vh, 26px); }
${A} > .k-stage.con-medal-stage::before { ${POOL('-6% -4%')} }
${A} .con-medal { max-width:clamp(150px, 13vw, 280px); }
${A} .con-medal:focus-visible { outline:none !important; }
/* the chosen medal's line */
${A} > .con-medal-read { grid-area:read; position:relative; z-index:1; align-self:center; display:flex; flex-direction:column; align-items:flex-start; gap:clamp(6px, 1.1vh, 14px);
  min-width:0; padding:0 0 clamp(20px, 6vh, 90px); }
${A} > .con-medal-read::before { ${POOL('-14% -20% -8% -24%')} }
${A} .con-medal-read > * { margin:0; }
${A} .con-medal-read__dial { position:relative; width:clamp(140px, 11.5vw, 260px); height:clamp(140px, 11.5vw, 260px); margin-bottom:clamp(4px, 1vh, 14px) !important; --con-glyph:calc(clamp(140px, 11.5vw, 260px) * .3); }
${A} .con-medal-read__dial > svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
${A} .con-medal-read__dial .con-medal__glyph { color:rgb(${BONE} / .55); }
${A} .con-medal-read__dial[data-state="earned"] .con-medal__glyph { color:rgb(${WARM}); }
${A} .con-medal-read__dial[data-state="going"] .con-medal__glyph { color:rgb(${BONE} / .8); }
${A} .con-medal-read__dial .orr-svg .con-medal__ghost { stroke:rgb(${BONE} / .36); }
${A} .con-medal-read__dial[data-state="earned"] .orr-svg .con-medal__ghost { stroke-dasharray:none; stroke:rgb(${WARM} / .5); }
${A} .con-medal-read__dial[data-state="earned"] .orr-svg .con-medal__inner { stroke:rgb(${WARM} / .5); }
${A} .con-medal-read__dial[data-state="going"] .orr-svg .con-medal__ghost { stroke-dasharray:none; stroke:rgb(${BONE} / .24); }
${A} .con-medal-read__dial .orr-svg .con-medal__ticks { stroke:rgb(${BONE} / .34); }
${A} .con-medal-read__kicker { ${LABEL} font-size:clamp(10.5px, .62vw, 13px); letter-spacing:.24em; color:rgb(${BONE} / .68); }
${A} .con-medal-read__kicker span { margin:0 .3em; }
${A} .con-medal-read__name { ${DISPLAY} font-size:clamp(22px, min(1.75vw, 3.3vh), 44px); line-height:1.02; letter-spacing:.02em; color:rgb(${WARM}); text-wrap:balance; ${HALO} }
${A} .con-medal-read__line { ${READ} font-size:clamp(15px, .9vw, 19px); line-height:1.45; color:rgb(${BONE} / .86); max-width:34ch; }
${A} .con-medal-read__figure { display:flex; align-items:baseline; gap:12px; margin-top:clamp(4px, 1vh, 12px) !important; }
${A} .con-medal-read__n { ${NUMERAL} font-size:clamp(34px, min(2.8vw, 5vh), 72px); line-height:.95; color:rgb(${WARM}); }
${A} .con-medal-read[data-state="locked"] .con-medal-read__n { color:rgb(${BONE} / .7); }
${A} .con-medal-read__of { ${LABEL} font-size:clamp(10.5px, .62vw, 13px); letter-spacing:.18em; color:rgb(${BONE} / .66); }
${A} .con-medal-read__status { ${LABEL} font-size:clamp(10.5px, .6vw, 12.5px); letter-spacing:.16em; color:rgb(${BONE} / .64); }
/* Back, a word */
${A} > .k-foot.con-foot { grid-area:foot; display:flex; align-items:center; min-height:0; margin:0; padding:0; border:0; background:none; }
${A} > .k-foot .k-words { display:flex; margin:0; padding:0; list-style:none; }
${A} .con-back.sf-back.k-word { all:unset; box-sizing:border-box; display:inline-flex; align-items:center; gap:0; min-height:40px; cursor:pointer;
  ${LABEL} font-size:clamp(12px, .72vw, 15px); letter-spacing:.2em; color:rgb(${WARM}); }
${A} .con-back.sf-back.k-word::before { content:none !important; }
${A} .con-back.sf-back.k-word::after { all:unset; content:"· ESC" / ""; margin-left:.7em; ${LABEL} font-size:.82em; letter-spacing:.16em; color:rgb(${BONE} / .6); }
${A} .con-back.sf-back.k-word:is(:hover, :focus-visible) { outline:none !important; text-decoration:underline; text-decoration-thickness:1px; text-underline-offset:6px; }
@media (max-width:1400px) {
  ${A} { grid-template-columns:minmax(0, 1fr) clamp(260px, 26vw, 340px) !important; }
}
@media (forced-colors:active) {
  ${A} > .con-medal-read::before, ${A} > .k-stage.con-medal-stage::before { display:none; }
}
`;

const CSS = RESEARCH + ACHIEVEMENTS;

export function injectConstellationScreens(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/** The legend's glyph: the star a node of that state is, drawn the way the dial draws it. */
export function legendStarSvg(kind) {
  const open = '<svg viewBox="-8 -8 16 16" aria-hidden="true" focusable="false">';
  if (kind === 'researched') {
    return `${open}<circle r="6.5" fill="rgb(${WARM})" opacity=".18"></circle><path d="M-8 0H8M0-8V8" stroke="rgb(${WARM})" stroke-width="1" opacity=".7"></path>`
      + `<circle r="3.6" fill="rgb(${WARM})"></circle></svg>`;
  }
  if (kind === 'available') {
    return `${open}<circle r="4" fill="rgb(5 7 10)" stroke="rgb(${WARM})" stroke-width="1.5"></circle><circle r="1.7" fill="rgb(${WARM})"></circle></svg>`;
  }
  return `${open}<circle r="4" fill="rgb(5 7 10)" stroke="rgb(${BONE} / .45)" stroke-width="1" stroke-dasharray="2 2.2"></circle><circle r="1.4" fill="rgb(${BONE} / .6)"></circle></svg>`;
}
