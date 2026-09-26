// src/ui/orrery/archiveLayouts.js — ORRERY composition for the archive screens (design/frontend/ORRERY.md
// §6 Meta): the Codex and the Mission log. It styles the screens' existing nodes (every class, role and
// data hook that checks and probes read stays where it was) and pins nothing inline.
//
// CODEX — an archive instrument. The hang is one ladder read at two magnifications: the eight
// sections are graduations on a scale, and the open section's entries hang off a second rail that its
// graduation fans out to; the chosen entry carries the Hand. The stage is the entry's plate: produced
// art (a portrait, a crest, a discovery still) or the section's glyph in an aperture ringed by the
// section itself, one arc per entry, the lore rising under its title. The unlock counts are dials.
//
// MISSION LOG — a tracing beam. One beam runs the hang: the current action at its head, every active
// contract a node on it with its progress lit down the beam below the node, the Hand on the chosen
// node; the career paths and the settled receipts further down. The stage is the chosen contract's
// reading beside a dial of its progress and its clock; its verbs are words, one Lamp Key at most
// (Track, while the contract is not yet tracked) and Abandon red only where the player reaches it.
import { injectOrrery } from './tokens.js';
import { SCROLL_EXTENT_CSS } from './scrollExtent.js';

const STYLE_ID = 'sf-orrery-archive';
const BONE = '236 230 216';
const INK = 'rgb(248 244 234)';
const CX = 'html body #screens > .k-screen.of-codex.orr-archive.orr-archive';
const ML = 'html body #screens > .k-screen.sf-mlog.orr-mlog.orr-mlog';
/** the same roots under the game's reduced-motion setting (the class sits on <html> itself) */
const RCX = CX.replace(/^html /, 'html.sf-reduce-motion ');
const RML = ML.replace(/^html /, 'html.sf-reduce-motion ');
const LABEL = 'font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112% !important; font-variation-settings:"wdth" 112, "wght" 650 !important; font-weight:650 !important; text-transform:uppercase !important; font-style:normal !important;';
const BODY = 'font-family:var(--dp-face-body, "Instrument Sans"), system-ui, sans-serif !important; font-variation-settings:normal !important; text-transform:none !important; letter-spacing:0 !important;';
const PLAIN = 'background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; clip-path:none !important; outline:none; border-radius:0 !important;';
const DISPLAY = 'font-family:var(--dp-face-display, "Archivo") !important; font-stretch:125% !important; font-variation-settings:"wdth" 125, "wght" 800 !important; font-weight:800 !important; text-transform:uppercase !important;';
/** a small verb: a caps word; white with a hairline where the player reaches it (the amber is the Hand's) */
const verb = (sel) => `
${sel} { ${PLAIN} ${LABEL} display:inline-flex !important; align-items:baseline; gap:0; width:auto !important; min-width:0 !important; min-height:0 !important; height:auto !important;
  margin:0 0 0 -12px !important; padding:4px 0 5px 12px !important; font-size:11.5px !important; letter-spacing:.16em !important; line-height:1.2 !important; color:${INK} !important; cursor:pointer; text-shadow:none !important; }
${sel}::after { display:none !important; content:none !important; }
${sel}::before, ${sel}::after { white-space:pre; }
${sel}:is(:hover, :focus-visible) { color:rgb(255 255 255) !important; outline:none !important;
  background:linear-gradient(${INK}, ${INK}) 0 50% / 2px 14px no-repeat, linear-gradient(rgb(255 250 236 / .22), rgb(255 250 236 / .22)) 0 50% / 6px 18px no-repeat !important; }
${sel}:is([aria-disabled="true"], :disabled) { color:rgb(${BONE} / .56) !important; cursor:default; background:none !important; }`;
/** the notched Hand (the ORRERY handoff's shared chevron), riding a ladder on a spring */
const HAND = `
.orr-arc-hand { position:absolute; left:0; top:0; z-index:3; width:44px; height:18px; margin-top:-9px; pointer-events:none; will-change:transform; background:none !important; }
.orr-arc-hand[hidden] { display:none !important; }
.orr-arc-hand::before { content:""; position:absolute; left:var(--orr-hand-x, 22px); top:2px; width:10px; height:14px; background:var(--dp-hand, #f2b950);
  clip-path:polygon(0 0, 100% 50%, 0 100%, 26% 50%); }
.orr-arc-hand::after { content:""; position:absolute; left:var(--orr-hand-from, 7px); top:8px; width:calc(var(--orr-hand-x, 22px) + 2px - var(--orr-hand-from, 7px)); height:2px; border-radius:1px;
  background:var(--dp-hand, #f2b950); box-shadow:0 0 0 2px rgb(242 185 80 / .22), 0 0 8px 1px rgb(242 185 80 / .35); }
:is(:focus-within, :hover) > .orr-arc-hand::before { background:var(--dp-hand-hot, #ffd98c); }
:is(:focus-within, :hover) > .orr-arc-hand::after { background:var(--dp-hand-hot, #ffd98c); }
/* the rail's chosen row where the screen's hero instrument carries the Hand: bone, a bead and an arm */
.orr-arc-hand--bone::before { left:calc(var(--orr-hand-x, 22px) + 1px); top:4px; width:10px; height:10px; clip-path:none; border-radius:50%; background:rgb(252 250 244);
  box-shadow:0 0 0 3px rgb(252 250 244 / .16), 0 0 10px 1px rgb(252 250 244 / .4); }
.orr-arc-hand--bone::after { background:rgb(252 250 244); box-shadow:0 0 0 2px rgb(252 250 244 / .14); }
:is(:focus-within, :hover) > .orr-arc-hand--bone::before, :is(:focus-within, :hover) > .orr-arc-hand--bone::after { background:rgb(255 255 255); }
`;

const CODEX_CSS = `
/* ================================ CODEX ===================================================== */
${CX} { --cx-sections:134px; --cx-gap:44px; row-gap:clamp(24px, 4.4vh, 52px) !important; }
/* the title band: the name and its line on the left, the archive's fill as dials on the right */
${CX} > .k-title { display:grid !important; grid-template-columns:minmax(0, auto) minmax(0, 1fr); grid-template-rows:auto auto; column-gap:48px; align-items:end; }
${CX} > .k-title > :not(.cx-index) { grid-column:1; }
${CX} > .k-title > p { margin:10px 0 0 !important; font-size:15px !important; color:rgb(${BONE} / .74) !important; ${BODY} }
${CX} > .k-title > .cx-index { grid-column:2; grid-row:1 / span 2; justify-self:end; align-self:end; }
${CX} .cx-index { display:grid !important; grid-template-columns:auto; justify-items:end; row-gap:8px; margin:0 !important; }
${CX} .cx-index[hidden] { display:none !important; }
${CX} .cx-index__cap { ${LABEL} margin:0 !important; font-size:10px !important; letter-spacing:.24em !important; color:rgb(${BONE} / .62) !important; }
${CX} .cx-index__list { display:flex !important; flex-wrap:nowrap; gap:0 clamp(8px, 1.1vw, 22px); margin:0 !important; }
${CX} .cx-index__item { position:relative; display:grid !important; grid-template-rows:58px auto; justify-items:center; width:clamp(66px, 5.2vw, 84px); margin:0 !important; }
${CX} .cx-index__dial { grid-row:1; grid-column:1; width:58px; height:58px; display:block; }
${CX} .cx-index__dial > svg { width:100%; height:100%; }
${CX} .cx-index__n { grid-row:1; grid-column:1; align-self:center; justify-self:center; margin:0 !important; padding-top:2px; order:0 !important;
  font-family:var(--dp-face-numeral, "Archivo") !important; font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 420 !important; font-weight:420 !important;
  font-size:16px !important; line-height:1 !important; letter-spacing:-.01em; font-variant-numeric:tabular-nums lining-nums; color:rgb(223 238 255) !important; text-shadow:none !important; white-space:nowrap; }
${CX} .cx-index__of { font-size:10px; font-variation-settings:"wdth" 100, "wght" 500; color:rgb(${BONE} / .66); margin-left:1px; }
${CX} .cx-index__w { grid-row:2; grid-column:1; margin:4px 0 0 !important; ${LABEL} font-size:9.5px !important; letter-spacing:.14em !important; line-height:1.25 !important;
  color:rgb(${BONE} / .66) !important; text-align:center; text-wrap:balance; }
/* the dials fill once on arrival (reduced motion: they rest filled) */
${CX} .orr-arc-gauge__track { fill:none; stroke:rgb(${BONE} / .3); stroke-width:5; }
${CX} .orr-arc-gauge__trackglow { fill:none; stroke:rgb(${BONE} / .07); stroke-width:10; }
${CX} .orr-arc-gauge__ticks { fill:none; stroke:rgb(${BONE} / .5); stroke-width:1.25; }
${CX} .orr-arc-gauge__fill { fill:none; stroke:rgb(223 238 255); stroke-width:3.5; stroke-linecap:round; }
${CX} .orr-arc-gauge__bloom { fill:none; stroke:rgb(223 238 255 / .24); stroke-width:9; stroke-linecap:round; }
${CX} .orr-arc-gauge__bead { fill:rgb(240 248 255); }
${CX}.cx-arrive :is(.orr-arc-gauge__fill, .orr-arc-gauge__bloom) { animation:orr-arc-gauge-in 900ms var(--dp-ease-out, ease-out) both; animation-delay:var(--orr-delay, 0ms); }
${CX}.cx-arrive .orr-arc-gauge__bead { animation:orr-arc-fade 900ms ease-out both; }
${CX} .cx-index__item { --orr-delay:0ms; }
${CX} .cx-index__item .orr-arc-gauge { --orr-delay:inherit; }
@keyframes orr-arc-gauge-in { from { stroke-dashoffset:var(--v, 0); } to { stroke-dashoffset:0; } }
@keyframes orr-arc-fade { 0%, 70% { opacity:0; } to { opacity:1; } }

/* ---- the ladder: the sections as graduations on a scale, the open one's entries on its own rail ---- */
${CX} > .k-hang { position:relative; display:grid !important; grid-template-columns:var(--cx-sections) minmax(0, 1fr); grid-template-rows:auto minmax(0, 1fr);
  column-gap:var(--cx-gap); row-gap:clamp(12px, 2.2vh, 22px); min-height:0 !important; overflow:visible !important; padding:0 !important; ${PLAIN} -webkit-mask-image:none !important; mask-image:none !important; }
${CX} > .k-hang > .cx-search { grid-column:1 / -1; grid-row:1; position:relative; }
${CX} > .k-hang > .cx-search[hidden] { display:none !important; }
${CX} > .k-hang > .sf-tabbar { grid-column:1; grid-row:2; align-self:start; }
${CX} > .k-hang > .cx-ladder { grid-column:2; grid-row:2; min-height:0; position:relative; overflow:hidden auto; scrollbar-width:none; padding:0 0 18px !important; }
${CX} > .k-hang > .cx-ladder::-webkit-scrollbar { display:none; }
${CX} > .k-hang > .cx-ladder > .orr-extent::before { display:none !important; }
${CX} > .k-hang > .cx-ladder[data-overflow="1"] { -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 34px), transparent); mask-image:linear-gradient(180deg, #000 calc(100% - 34px), transparent); }
${CX} > .k-hang > .cx-wedge { position:absolute; left:0; top:0; width:100%; height:100%; pointer-events:none; overflow:visible; z-index:0; }
${CX} .cx-wedge > svg { position:absolute; left:0; top:0; overflow:visible; }
${CX} .cx-wedge .cx-wedge__fan { stroke:none; }
${CX} .cx-wedge .cx-wedge__edge { fill:none; stroke:rgb(${BONE} / .62); stroke-width:2; vector-effect:non-scaling-stroke; }
${CX} .cx-wedge .cx-wedge__bloom { fill:none; stroke:rgb(${BONE} / .16); stroke-width:7; stroke-linecap:round; vector-effect:non-scaling-stroke; }
${CX} .cx-wedge .cx-wedge__pip { fill:${INK}; }
/* the search: a field of light on a ruled line, no box */
${CX} .cx-search .sf-codex-search { ${PLAIN} ${BODY} display:block; width:100% !important; min-height:0 !important; height:34px !important; box-sizing:border-box; padding:0 0 4px 26px !important;
  font-size:14px !important; color:${INK} !important; caret-color:${INK};
  background:linear-gradient(0deg, rgb(${BONE} / .36) 1px, transparent 1px) 0 100% / 100% 100% no-repeat,
    repeating-linear-gradient(90deg, rgb(${BONE} / .26) 0 1px, transparent 1px 12px) 0 100% / 100% 5px no-repeat !important; }
${CX} .cx-search .sf-codex-search::placeholder { ${LABEL} font-size:10.5px; letter-spacing:.2em; color:rgb(${BONE} / .64); opacity:1; }
${CX} .cx-search .sf-codex-search:focus-visible { outline:none !important;
  background:linear-gradient(0deg, ${INK} 1.5px, transparent 1.5px) 0 100% / 100% 100% no-repeat,
    repeating-linear-gradient(90deg, rgb(${BONE} / .4) 0 1px, transparent 1px 12px) 0 100% / 100% 5px no-repeat !important; }
${CX} .cx-search .sf-codex-search::-webkit-search-cancel-button { filter:grayscale(1) brightness(1.6); }
/* a lens glyph drawn in two strokes of light before the field */
${CX} .cx-search::before { content:""; position:absolute; left:2px; top:8px; width:10px; height:10px; border-radius:50%; box-shadow:inset 0 0 0 1.5px rgb(${BONE} / .7); pointer-events:none; }
${CX} .cx-search::after { content:""; position:absolute; left:11px; top:18px; width:6px; height:1.5px; background:rgb(${BONE} / .7); transform:rotate(45deg); transform-origin:0 50%; pointer-events:none; }
/* the sections: caps graduations standing on the scale's right edge */
${CX} .sf-tabbar { ${PLAIN} display:flex !important; flex-direction:column !important; flex-wrap:nowrap !important; align-items:stretch !important; gap:0 !important; margin:0 !important; padding:4px 0 !important; list-style:none;
  background:linear-gradient(90deg, transparent calc(100% - 2px), rgb(${BONE} / .56) calc(100% - 2px)) 0 0 / 100% 100% no-repeat,
    linear-gradient(90deg, transparent calc(100% - 7px), rgb(${BONE} / .07) calc(100% - 7px)) 0 0 / 100% 100% no-repeat,
    repeating-linear-gradient(180deg, rgb(${BONE} / .32) 0 1px, transparent 1px 8px) 100% 0 / 6px 100% no-repeat !important; }
${CX} .sf-tabbar > li { display:block !important; margin:0 !important; padding:0 !important; }
${CX} .sf-tabbar .sf-tab { ${PLAIN} ${LABEL} position:relative; display:flex !important; justify-content:flex-end !important; align-items:center !important; width:100% !important;
  min-width:0 !important; min-height:0 !important; height:clamp(26px, 3.3vh, 34px) !important; box-sizing:border-box; padding:0 20px 0 0 !important; margin:0 !important;
  font-size:11px !important; letter-spacing:.16em !important; line-height:1 !important; color:rgb(${BONE} / .68) !important; text-align:right; cursor:pointer; text-shadow:none !important; }
${CX} .sf-tabbar .sf-tab::after { content:"" !important; display:block !important; position:absolute !important; right:0 !important; left:auto !important; top:50% !important; bottom:auto !important;
  width:12px !important; height:2px !important; margin:-1px 0 0 !important; translate:none !important; scale:none !important; transform:none !important; opacity:1 !important;
  background:rgb(${BONE} / .62) !important; border:0 !important; box-shadow:none !important; clip-path:none !important; }
${CX} .sf-tabbar .sf-tab::before { display:none !important; content:none !important; }
${CX} .sf-tabbar .sf-tab:is(:hover, :focus-visible) { color:rgb(255 255 255) !important; outline:none !important; }
${CX} .sf-tabbar .sf-tab:is(:hover, :focus-visible)::after { width:16px !important; background:${INK} !important; }
${CX} .sf-tabbar .sf-tab[aria-current="true"] { color:${INK} !important; font-variation-settings:"wdth" 112, "wght" 760 !important; font-weight:760 !important; }
${CX} .sf-tabbar .sf-tab[aria-current="true"]::after { width:20px !important; height:3px !important; margin-top:-1.5px !important; box-shadow:0 0 8px rgb(255 250 236 / .45) !important; background:${INK} !important; }
${CX} .sf-tabbar .sf-tab[aria-current="true"]:focus-visible { text-shadow:0 0 12px rgb(255 250 236 / .45) !important; }
/* the open section's rail: a tick per entry, the section heads as long graduations */
${CX} .cx-ladder > .k-rows { position:relative; margin:0 !important; padding:2px 0 0 !important; list-style:none; ${PLAIN}
  background:linear-gradient(90deg, transparent 7px, rgb(${BONE} / .56) 7px, rgb(${BONE} / .56) 9px, transparent 9px) 0 0 / 100% 100% no-repeat,
    linear-gradient(90deg, transparent 3px, rgb(${BONE} / .07) 3px, rgb(${BONE} / .07) 13px, transparent 13px) 0 0 / 100% 100% no-repeat,
    repeating-linear-gradient(180deg, rgb(${BONE} / .3) 0 1px, transparent 1px 8px) 3px 0 / 4px 100% no-repeat !important; }
${CX} .cx-ladder .k-row { ${PLAIN} position:relative !important; display:flex !important; align-items:center; gap:10px; min-height:0 !important; height:auto !important;
  padding:6px 6px 6px 38px !important; margin:0 !important; color:rgb(${BONE} / .84) !important; cursor:pointer; }
${CX} .cx-ladder .k-row::after { display:none !important; content:none !important; }
${CX} .cx-ladder .k-row::before { content:"" !important; display:block !important; position:absolute !important; left:3px !important; top:15px !important; width:10px !important; height:2px !important;
  margin:-1px 0 0 !important; translate:none !important; scale:none !important; transform:none !important; background:rgb(${BONE} / .64) !important; border:0 !important; box-shadow:none !important; clip-path:none !important; border-radius:0 !important; }
${CX} .cx-ladder .k-row > div { min-width:0; flex:1 1 auto; }
${CX} .cx-ladder .k-row .k-row__name { ${BODY} display:block; font-size:14px !important; line-height:1.3 !important; font-weight:450; color:rgb(${BONE} / .86) !important;
  white-space:normal; overflow:visible; text-wrap:balance; text-shadow:none !important; }
${CX} .cx-ladder .k-row .k-row__sub, ${CX} .cx-ladder .k-row .k-row__num { display:none !important; }
${CX} .cx-ladder .k-row:is(:hover, :focus-visible) .k-row__name { color:rgb(255 255 255) !important; }
${CX} .cx-ladder .k-row:focus-visible { outline:none !important; }
${CX} .cx-ladder .k-row:focus-visible:not([aria-selected="true"])::before { width:12px !important; height:2px !important; background:${INK} !important; }
${CX} .cx-ladder .k-row[aria-selected="true"] .k-row__name { color:rgb(252 250 244) !important; font-weight:600 !important; }
${CX} .cx-ladder .k-row[aria-selected="true"]::before { opacity:0; }
${CX} .cx-ladder .k-row.k-row--static { cursor:default; padding-top:14px !important; padding-bottom:4px !important; }
${CX} .cx-ladder .k-row.k-row--static:first-child { padding-top:4px !important; }
${CX} .cx-ladder .k-row.k-row--static::before { left:0 !important; width:14px !important; background:rgb(${BONE} / .66) !important; top:auto !important; bottom:calc(4px + .5em) !important; }
${CX} .cx-ladder .k-row.k-row--static .cx-count { margin-left:10px; font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 480; font-size:11px; letter-spacing:.04em; color:rgb(223 238 255); font-variant-numeric:tabular-nums; }
${CX} .cx-ladder .k-row.k-row--static .k-caps { ${LABEL} font-size:10px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .66) !important; text-shadow:none !important; margin:0 !important; }
${CX} .cx-ladder .k-row.k-row--static > .k-38 { ${BODY} font-size:12.5px !important; color:rgb(${BONE} / .6) !important; white-space:normal; }
${CX} .cx-ladder .k-row.k-row--static:has(> .k-38)::before { width:6px !important; background:rgb(${BONE} / .3) !important; top:50% !important; bottom:auto !important; }
${CX} .cx-ladder .k-row.k-row--static:has(> .k-38) { padding-top:4px !important; }
${CX} .cx-ladder > .k-empty { ${BODY} margin:6px 0 0 !important; padding-left:38px; font-size:13px !important; color:rgb(${BONE} / .66) !important; }
/* a locked entry's name is cipher: the real words stay for assistive tech, the eye sees noise */
${CX} .cx-sr { position:absolute !important; width:1px !important; height:1px !important; overflow:hidden !important; clip:rect(0 0 0 0) !important; white-space:nowrap !important; margin:-1px !important; padding:0 !important; }
${CX} .cx-cipher { color:rgb(${BONE} / .58); letter-spacing:.06em; font-family:var(--dp-face-code, "Spline Sans Mono"), ui-monospace, monospace; font-size:.92em; }
${CX} .cx-ladder .k-row[aria-selected="true"] .cx-cipher { color:rgb(${BONE} / .8); }
${CX} .cx-ladder .k-row .cx-code { color:rgb(${BONE} / .86); }
${CX} .cx-filed { color:rgb(252 250 244); }

/* ---- the reading: one column, wrapped to meet the plate ---- */
${CX} > .k-stage { ${PLAIN} padding:0 0 26px !important; overflow:hidden auto; }
${CX}[data-plate="on"] > .k-stage { padding-right:calc(var(--cx-plate) + clamp(28px, 3vw, 64px)) !important; }
${CX} > .k-stage { display:flex !important; flex-direction:column; }
${CX} .sf-codex-entry { ${PLAIN} position:relative; display:block !important; max-width:none !important; min-height:0 !important; padding:0 !important; margin:0 !important; color:${INK}; }
/* the reading stands level with the plate's heart; a long one starts at the top and scrolls */
${CX}[data-plate="on"] .sf-codex-entry { margin-block:auto !important; }
${CX} .cx-reader__num { display:flex; align-items:baseline; gap:12px; margin:0 0 6px !important; line-height:1; }
${CX} .cx-reader__num-n { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 230; font-weight:230;
  font-size:clamp(60px, 9.5vh, 108px); line-height:.82; letter-spacing:-.03em; color:rgb(223 238 255); font-variant-numeric:tabular-nums lining-nums; }
${CX} .cx-reader__num-of { font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 420; font-size:15px; letter-spacing:.06em; color:rgb(${BONE} / .7); }
${CX} .cx-reader__turn-at { position:absolute !important; width:1px !important; min-width:0 !important; height:1px !important; overflow:hidden !important; clip:rect(0 0 0 0) !important; white-space:nowrap !important; }
${CX} .sf-codex-entry > * { margin-right:0 !important; min-width:0; }
${CX} .sf-codex-entry > .cx-reader__mark { display:none !important; }

/* ---- the plate: the hero instrument. The entry's art in an aperture, every entry of the section on
   the ring round it (the ring is the dial you turn), the Hand an amber blade across the ring ---- */
${CX} { --cx-plate:min(640px, 59vh, 34vw); }
${CX} > .cx-plate-host { position:absolute; grid-area:auto; z-index:1; right:var(--k-margin, 96px); top:calc(50% + 20px - var(--cx-plate) / 2); width:var(--cx-plate); height:var(--cx-plate); }
${CX} > .cx-plate-host[hidden] { display:none !important; }
${CX} .cx-plate { position:absolute; inset:0; border-radius:50%; outline:none; cursor:grab; touch-action:none; user-select:none; -webkit-user-select:none;
  transform:perspective(1400px) rotateX(var(--cx-tilt-x, 0deg)) rotateY(var(--cx-tilt-y, 0deg)); transition:transform 460ms var(--dp-ease-over, ease-out); }
${CX} .cx-plate.is-dragging { cursor:grabbing; }
${CX} .cx-plate:is(:focus, :focus-visible) { outline:none !important; box-shadow:none !important; }
${CX} .cx-plate:focus-visible:not(.is-dragging) { box-shadow:0 0 0 2px rgb(${BONE} / .55), 0 0 18px 2px rgb(${BONE} / .18) !important; }
${CX} .cx-plate__rings, ${CX} .cx-plate__blade { position:absolute; inset:0; pointer-events:none; }
${CX} .cx-plate__rings > svg, ${CX} .cx-plate__blade > svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
/* a shade under the plate so its light reads over any world behind it */
${CX} > .cx-plate-host::before { content:""; position:absolute; inset:-8%; z-index:-1; border-radius:50%; pointer-events:none;
  background:radial-gradient(closest-side, rgb(5 7 10 / .78), rgb(5 7 10 / .55) 70%, rgb(5 7 10 / 0)); }
/* the aperture (radius 140 of the dial's 200) */
${CX} .cx-plate__art { position:absolute; left:15%; top:15%; width:70%; height:70%; border-radius:50%; overflow:hidden; background:rgb(6 8 11 / .6); }
${CX} .cx-plate__art > img { display:block; width:100%; height:100%; object-fit:cover; margin:0 !important; filter:saturate(.9) contrast(1.04); }
${CX} .cx-plate__art::after { content:""; position:absolute; inset:0; border-radius:50%; pointer-events:none;
  background:radial-gradient(circle, rgb(5 7 10 / 0) 62%, rgb(5 7 10 / .5) 88%, rgb(5 7 10 / .85)); }
${CX} .cx-plate__art.is-crest { background:radial-gradient(circle, rgb(18 20 24 / .7), rgb(6 8 11 / .6)); }
${CX} .cx-plate__art.is-crest > img { object-fit:contain; padding:17%; box-sizing:border-box; mix-blend-mode:screen; filter:none; opacity:.9; }
${CX} .cx-plate__art.is-plate > img { transform:scale(1.04); }
${CX} .cx-plate__art.is-hull { background:radial-gradient(circle at 50% 42%, rgb(${BONE} / .1), rgb(6 8 11 / .6) 72%); }
${CX} .cx-plate__art.is-hull > img { object-fit:contain; transform:scale(1.18) translateY(3%); filter:none; }
${CX} .cx-plate__art.is-station > img, ${CX} .cx-plate__art.is-still > img { transform:scale(1.12); }
/* a locked entry: its art held back, dim and out of focus behind the cipher */
${CX} .cx-plate__art.is-locked > img { filter:blur(16px) brightness(.55) saturate(.45); transform:scale(1.2); }
${CX} .cx-plate__art.is-locked::after { background:radial-gradient(circle, rgb(5 7 10 / .2), rgb(5 7 10 / .7) 90%); }
/* the ring: bands of light with a bloom of their own, graded by what the player has read */
${CX} .orr-arc-major { fill:none; stroke:rgb(${BONE} / .42); stroke-width:2; vector-effect:non-scaling-stroke; }
${CX} .orr-arc-band { fill:none; stroke:rgb(${BONE} / .07); vector-effect:non-scaling-stroke; }
${CX} .orr-arc-seg { fill:none; vector-effect:non-scaling-stroke; stroke-linecap:butt; stroke-width:8; }
${CX} .orr-arc-seg-glow { fill:none; vector-effect:non-scaling-stroke; stroke-linecap:butt; stroke-width:16; }
${CX} .orr-arc-seg--read { stroke:rgb(${BONE} / .56); }
${CX} .orr-arc-seg-glow--read { stroke:rgb(${BONE} / .15); }
${CX} .orr-arc-seg--open { stroke:rgb(${BONE} / .34); }
${CX} .orr-arc-seg-glow--open { stroke:rgb(${BONE} / .1); }
${CX} .orr-arc-seg--locked { stroke:rgb(${BONE} / .15); }
${CX} .orr-arc-seg-glow--locked { stroke:none; }
${CX} .orr-arc-seg--now { stroke:rgb(223 238 255); stroke-width:10; }
${CX} .orr-arc-seg-bloom { fill:none; stroke:rgb(223 238 255 / .26); stroke-width:24; vector-effect:non-scaling-stroke; }
${CX} .orr-arc-now.is-locked .orr-arc-seg--now { stroke:rgb(${BONE} / .6); }
${CX} .orr-arc-now.is-locked .orr-arc-seg-bloom { stroke:rgb(${BONE} / .1); }
${CX} .orr-arc-start { fill:none; stroke:rgb(${BONE} / .85); stroke-width:2.5; vector-effect:non-scaling-stroke; }
${CX} .orr-arc-tick { fill:none; stroke:rgb(${BONE} / .5); stroke-width:1.5; vector-effect:non-scaling-stroke; }
${CX} .orr-arc-tick--hi { stroke:rgb(${BONE} / .8); stroke-width:2.5; }
${CX} .orr-arc-ring { fill:none; stroke:rgb(${BONE} / .4); stroke-width:2; vector-effect:non-scaling-stroke; }
${CX} .orr-arc-ring--rim { stroke:rgb(${BONE} / .7); stroke-width:3; }
${CX} .orr-arc-engrave { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; letter-spacing:.3em; fill:rgb(${BONE} / .72); text-transform:uppercase; }
${CX} .orr-arc-cipher { font-family:var(--dp-face-code, "Spline Sans Mono"), ui-monospace, monospace; letter-spacing:.16em; fill:rgb(${BONE} / .5); }
${CX} .orr-arc-drift { transform-box:view-box; transform-origin:50% 50%; animation:orr-drift 720s linear infinite; }
/* the Hand: an amber blade across the ring, its bloom a wider stroke of the same light */
${CX} .cx-blade__arm { transform-box:view-box; transform-origin:50% 50%; will-change:transform; }
${CX} .cx-blade__core { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:3; stroke-linecap:round; vector-effect:non-scaling-stroke; }
${CX} .cx-blade__bloom { fill:none; stroke:rgb(242 185 80 / .3); stroke-width:10; stroke-linecap:round; vector-effect:non-scaling-stroke; }
${CX} .cx-blade__tip { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:2.5; stroke-linejoin:miter; stroke-linecap:round; vector-effect:non-scaling-stroke; }
${CX} .cx-blade__pip { fill:var(--dp-hand-hot, #ffd98c); stroke:rgb(5 7 10); stroke-width:1.5; vector-effect:non-scaling-stroke; }
${CX} .cx-plate:is(:focus-visible, .is-dragging, .is-over-ring) .cx-blade__core { stroke:var(--dp-hand-hot, #ffd98c); }
${CX} .cx-plate.is-dragging .cx-blade__bloom { stroke:rgb(255 217 140 / .42); }
/* the reading under the plate while the ring is being turned or pointed at */
${CX} .cx-plate__caption { position:absolute; left:50%; top:calc(100% + 10px); transform:translateX(-50%); white-space:nowrap; pointer-events:none; display:flex; align-items:baseline; gap:12px;
  padding:4px 14px; background:radial-gradient(closest-side, rgb(5 7 10 / .9), rgb(5 7 10 / .6) 70%, rgb(5 7 10 / 0)); }
${CX} .cx-plate__caption[hidden] { display:none !important; }
${CX} .cx-plate__caption-at { font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 480; font-size:12px; letter-spacing:.06em; color:rgb(223 238 255); font-variant-numeric:tabular-nums; }
${CX} .cx-plate__caption-name { ${BODY} font-size:14px !important; color:${INK}; }
${CX} .cx-plate__caption-name.is-locked .cx-cipher { font-size:13px; color:rgb(${BONE} / .78); }
/* arrival: a fresh page's ring draws and its art opens */
${CX} .cx-plate.is-arriving .orr-arc-draw { stroke-dasharray:1 1; stroke-dashoffset:1; animation:orr-draw 620ms var(--dp-ease-out, ease-out) forwards; }
${CX} .cx-plate.is-arriving .orr-arc-now { animation:orr-arc-fade 520ms ease-out 180ms both; }
${CX} .cx-plate.is-arriving > .cx-plate__art > img { animation:orr-arc-open 560ms var(--dp-ease-out, ease-out) both; }
${CX} .cx-plate.is-unlocking .orr-arc-now { animation:cx-flare-arc 1.6s var(--dp-ease-out, ease-out) both; }
@keyframes cx-flare-arc { 0% { filter:drop-shadow(0 0 16px rgb(223 238 255)); } 100% { filter:none; } }
@keyframes orr-arc-open { from { opacity:0; filter:blur(6px); } to { opacity:1; } }
/* the words */
${CX} .cx-reader__filed { ${LABEL} margin:2px 0 0 !important; font-size:10.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .66) !important; }
${CX} .sf-codex-entry > h2 { margin:12px 0 0 !important; }
${CX} .sf-codex-entry > h2, ${CX} .sf-codex-entry > h2 .k-signal, ${CX} .sf-codex-entry > h2 .k-38 { ${DISPLAY} font-size:clamp(24px, min(2.1vw, 4vh), 40px) !important; line-height:1.04 !important;
  letter-spacing:.01em !important; color:rgb(242 237 226) !important; text-shadow:0 2px 18px rgb(0 0 0 / .5) !important; text-wrap:balance; }
${CX} .sf-codex-entry.is-locked > h2 .cx-cipher { font-family:inherit !important; letter-spacing:.04em; font-size:1em; color:rgb(${BONE} / .5); }
${CX} .sf-codex-entry > .fh-legend, ${CX} .sf-codex-entry > .cx-reader__meta { ${LABEL} margin:10px 0 0 !important; font-size:10.5px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .66) !important; }
${CX} .sf-codex-entry :is(.sf-entity-link, [data-entity]) { color:${INK} !important; text-decoration:none !important; background-image:none !important; box-shadow:none !important; border-bottom:0 !important; }
${CX} .sf-codex-entry :is(.sf-entity-link, [data-entity]):is(:hover, :focus-visible) { text-decoration:underline 1px rgb(${BONE} / .6) !important; text-underline-offset:4px; outline:none !important; }
${CX} .sf-codex-entry .k-measure { ${PLAIN} margin:22px 0 0 !important; padding:18px 0 0 !important; max-width:60ch !important; min-height:0 !important;
  background:linear-gradient(90deg, rgb(${BONE} / .42), rgb(${BONE} / .42)) 0 0 / 56px 1px no-repeat,
    repeating-linear-gradient(90deg, rgb(${BONE} / .3) 0 1px, transparent 1px 8px) 0 0 / 160px 5px no-repeat !important; }
${CX} .sf-codex-entry .k-measure .k-sentence { ${BODY} margin:0 0 .8em !important; font-size:16.5px !important; line-height:1.6 !important; color:rgb(${BONE} / .9) !important; font-style:normal !important; }
${CX} .sf-codex-entry .k-measure .k-sentence.k-38 { ${LABEL} font-size:10.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .62) !important; }
${CX} .sf-codex-entry .k-measure .k-rule { height:1px !important; margin:16px 0 !important; border:0 !important; width:56px; background:rgb(${BONE} / .3) !important; }
${CX} .sf-codex-entry .k-measure .k-sentence--emph, ${CX} .sf-codex-entry .k-measure .k-sentence--emph.k-bad { color:rgb(${BONE} / .76) !important; font-size:15px !important; }
${CX} .sf-codex-entry .k-measure .k-rows { margin:4px 0 12px !important; }
${CX} .sf-codex-entry .k-measure .k-row { ${PLAIN} display:grid !important; grid-template-columns:minmax(120px, 11em) minmax(0, 1fr) !important; column-gap:18px; min-height:0 !important; padding:6px 0 !important; cursor:default; }
${CX} .sf-codex-entry .k-measure .k-row > span:first-child { ${LABEL} font-size:10px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .64) !important; padding-top:3px; }
${CX} .sf-codex-entry .k-measure .k-row .k-row__name { ${BODY} font-size:14.5px !important; color:${INK} !important; white-space:normal !important; }
/* the cipher block a locked entry shows where its lore will be */
${CX} .cx-cipher-block { margin:0 0 14px !important; font-family:var(--dp-face-code, "Spline Sans Mono"), ui-monospace, monospace; font-size:14px; line-height:1.7; letter-spacing:.12em; color:rgb(${BONE} / .56); word-break:break-all; }
/* the survey's readings */
${CX} #sf-codex-stage .st-ledger .st-sub-h { ${DISPLAY} font-size:clamp(24px, min(2.1vw, 4vh), 40px) !important; line-height:1.04 !important; letter-spacing:.01em !important; color:rgb(242 237 226) !important; }
${CX} .sf-codex-entry > .k-words--row { display:flex !important; flex-wrap:wrap; gap:14px 44px; margin:20px 0 0 !important; }
${CX} .sf-codex-entry > .k-words--row .k-hero__n { font-family:var(--dp-face-numeral, "Archivo") !important; font-variation-settings:"wdth" 100, "wght" 260 !important; font-weight:260 !important;
  font-size:clamp(34px, min(3vw, 5.6vh), 58px) !important; line-height:.95 !important; color:rgb(223 238 255) !important; text-shadow:none !important; }
${CX} .sf-codex-entry > .k-words--row .k-hero__w { ${LABEL} margin-top:8px !important; font-size:10px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .66) !important; }
/* the page turn: two words and the place between them as a reading */
${CX} .cx-reader__turn { ${PLAIN} display:flex !important; align-items:baseline; gap:26px; margin:26px 0 0 !important; padding:0 !important; }
${verb(`${CX} .cx-reader__turn-key`)}
${CX} .cx-reader__turn-key--next { margin-left:0 !important; }
${CX} .cx-reader__turn-key--prev::before { content:"‹  "; color:rgb(${BONE} / .6); }
${CX} .cx-reader__turn-key--next::before { content:""; }
${CX} .cx-reader__turn-key--next::after { content:"  ›" !important; display:inline !important; position:static !important; background:none !important; width:auto !important; height:auto !important;
  transform:none !important; translate:none !important; scale:none !important; opacity:1 !important; clip-path:none !important; color:rgb(${BONE} / .6) !important; }
${CX} .cx-reader__turn-at { order:-1; font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 420; font-size:13px; letter-spacing:.06em; color:rgb(223 238 255); font-variant-numeric:tabular-nums; min-width:4.2em; }
/* a conditional return to the chart: a verb, not a second amber */
${CX} .sf-codex-entry > [data-action="tethys-return"] { margin-top:22px !important; justify-self:start; }
/* the Signal Archive: four stills with their corners marked in light, no frames */
${CX} .sf-codex-entry > ul.fh-cluster { align-items:start !important; display:grid !important; grid-template-columns:repeat(auto-fill, minmax(clamp(170px, 14vw, 250px), 1fr)); gap:26px 28px; width:100%; margin:22px 0 0 !important; padding:0 !important; list-style:none; grid-column:1 / -1; }
${CX} .sf-codex-entry > ul.fh-cluster > li { display:flex !important; flex-direction:column; gap:8px; min-width:0; }
${CX} .sf-codex-entry > ul.fh-cluster .cx-still { ${PLAIN} position:relative; display:block !important; width:100% !important; min-width:0 !important; min-height:0 !important; padding:0 !important; cursor:pointer; aspect-ratio:16 / 9; overflow:visible; }
${CX} .sf-codex-entry > ul.fh-cluster .cx-still img { display:block; width:100% !important; height:100% !important; object-fit:cover; }
${CX} .sf-codex-entry > ul.fh-cluster .cx-still::before { content:""; position:absolute; inset:-6px; pointer-events:none;
  background:linear-gradient(rgb(${BONE} / .6) 0 0) 0 0 / 12px 1px no-repeat, linear-gradient(rgb(${BONE} / .6) 0 0) 0 0 / 1px 12px no-repeat,
    linear-gradient(rgb(${BONE} / .6) 0 0) 100% 0 / 12px 1px no-repeat, linear-gradient(rgb(${BONE} / .6) 0 0) 100% 0 / 1px 12px no-repeat,
    linear-gradient(rgb(${BONE} / .6) 0 0) 0 100% / 12px 1px no-repeat, linear-gradient(rgb(${BONE} / .6) 0 0) 0 100% / 1px 12px no-repeat,
    linear-gradient(rgb(${BONE} / .6) 0 0) 100% 100% / 12px 1px no-repeat, linear-gradient(rgb(${BONE} / .6) 0 0) 100% 100% / 1px 12px no-repeat; }
${CX} .sf-codex-entry > ul.fh-cluster .cx-still:is(:hover, :focus-visible) { outline:none !important; }
${CX} .sf-codex-entry > ul.fh-cluster .cx-still:is(:hover, :focus-visible)::before { inset:-8px;
  background:linear-gradient(${INK} 0 0) 0 0 / 16px 1.5px no-repeat, linear-gradient(${INK} 0 0) 0 0 / 1.5px 16px no-repeat,
    linear-gradient(${INK} 0 0) 100% 0 / 16px 1.5px no-repeat, linear-gradient(${INK} 0 0) 100% 0 / 1.5px 16px no-repeat,
    linear-gradient(${INK} 0 0) 0 100% / 16px 1.5px no-repeat, linear-gradient(${INK} 0 0) 0 100% / 1.5px 16px no-repeat,
    linear-gradient(${INK} 0 0) 100% 100% / 16px 1.5px no-repeat, linear-gradient(${INK} 0 0) 100% 100% / 1.5px 16px no-repeat; }
${CX} .sf-codex-entry > ul.fh-cluster .cx-still__name { ${LABEL} font-size:11px !important; letter-spacing:.18em !important; color:${INK} !important; margin-top:4px; }
${CX} .sf-codex-entry > ul.fh-cluster .fh-fine { ${BODY} min-height:0 !important; font-size:13px !important; line-height:1.4 !important; color:rgb(${BONE} / .74) !important; }
${verb(`${CX} .sf-codex-entry > ul.fh-cluster .k-word`)}
${CX} .sf-codex-entry > ul.fh-cluster .k-word::before { content:"›  "; color:rgb(${BONE} / .6); }
${CX} .sf-codex-entry.cx-archive > p.k-sentence { ${BODY} margin:18px 0 0 !important; font-size:16px !important; line-height:1.55; color:rgb(${BONE} / .86) !important; max-width:60ch; }
/* the foot: one way back, a word */
${CX} > .k-foot { align-items:center !important; min-height:0 !important; }
/* the plate's sheen follows the pointer across its art */
${CX} .cx-plate__art::before { content:""; position:absolute; inset:0; z-index:1; border-radius:50%; pointer-events:none; opacity:0; transition:opacity .3s linear;
  background:radial-gradient(circle at var(--cx-sheen-x, 50%) var(--cx-sheen-y, 30%), rgb(255 246 226 / .26), rgb(255 246 226 / 0) 48%); mix-blend-mode:screen; }
${CX} .cx-plate.is-lit .cx-plate__art::before { opacity:1; }
/* an entry that has just unlocked: its name decrypts in a flare of phosphor */
${CX} .cx-ladder .k-row.is-unlocking .k-row__name { animation:cx-unlock 1.6s var(--dp-ease-out, ease-out) both; }
@keyframes cx-unlock { 0% { color:rgb(223 238 255); text-shadow:0 0 14px rgb(223 238 255 / .9); } 100% { text-shadow:0 0 0 rgb(223 238 255 / 0); } }
${RCX} .cx-plate { transition:none !important; transform:none !important; }
${RCX} .cx-plate__art::before { transition:none !important; }
${RCX} :is(.cx-plate.is-unlocking .orr-arc-now, .cx-ladder .k-row.is-unlocking .k-row__name, .cx-plate.is-arriving .orr-arc-now) { animation:none !important; }
${RCX} .cx-plate.is-arriving > .cx-plate__art > img { animation:none !important; }
${RCX} .cx-plate.is-arriving .orr-arc-draw { animation:none !important; stroke-dashoffset:0; }
${verb(`${CX} > .k-foot .sf-back.k-word`)}
${CX} > .k-foot .sf-back.k-word { font-size:12px !important; }
${CX} .cx-index__num.orr-counter { height:1em; }
${CX} .cx-index__num .orr-counter__digit { width:.6em; }
${CX} > .k-foot .sf-back.k-word::before { content:"‹  "; color:rgb(${BONE} / .6); }
${CX} > .k-foot .sf-back.k-word::after { content:"ESC" / "" !important; display:inline !important; position:static !important; margin-left:14px !important; width:auto !important; height:auto !important;
  background:none !important; border:0 !important; box-shadow:none !important; ${LABEL} font-size:9.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .6) !important; transform:none !important; opacity:1 !important; }
/* arrival: the lore rises line by line under its title (reduced motion: it simply is there) */
${CX} .cx-rise { animation:orr-rise 460ms var(--dp-ease-out, ease-out) both; animation-delay:var(--orr-delay, 0ms); }
${CX}.cx-arrive .sf-tabbar > li, ${CX}.cx-arrive .cx-index__item { animation:orr-rise 420ms var(--dp-ease-out, ease-out) both; animation-delay:var(--orr-delay, 0ms); }
${RCX} :is(.cx-rise, .orr-arc-drift, .orr-arc-draw, .orr-arc-gauge__fill, .orr-arc-gauge__bloom, .orr-arc-gauge__bead, .orr-arc-now),
${RCX} .sf-tabbar > li, ${RCX} .cx-index__item, ${RCX} .cx-plate__art { animation:none !important; }
${RCX} .orr-arc-draw { stroke-dashoffset:0; }
@media (max-width:1400px) {
  ${CX} { --cx-sections:124px; --cx-gap:30px; }
  ${CX} .cx-index__dial { width:50px; height:50px; }
  ${CX} .cx-index__item { grid-template-rows:50px auto; }
  ${CX} .cx-index__n { font-size:14px !important; }
}
/* a 1440p screen shows the 1080p composition at 1.25 (the kit scale is folded into the zoom), as the station does */
@media (min-width:2200px) and (min-height:1200px) {
  ${CX}, ${ML} { zoom:1.25; --k-s:1; }
}
@media (min-width:3400px) and (min-height:1900px) {
  ${CX}, ${ML} { zoom:1.85; --k-s:1; }
}
@media (forced-colors:active) {
  ${CX} .cx-ladder .k-row[aria-selected="true"] { outline:2px solid Highlight !important; }
  ${CX} .orr-arc-hand::before, ${CX} .orr-arc-hand::after { background:Highlight !important; forced-color-adjust:none; }
}
`;

const MLOG_CSS = `
/* ================================ MISSION LOG =============================================== */
${ML} { --ml-dial:clamp(190px, min(16vw, 30vh), 300px); row-gap:clamp(24px, 4.4vh, 52px) !important; grid-template-areas:"title title" "hang stage" "foot stage" !important; }
${ML} > .k-title .sf-mlog-story-line { margin:10px 0 0 !important; ${BODY} font-size:15px !important; color:rgb(${BONE} / .74) !important; }
/* the hang is the beam: one ruled line down its left edge, carried with the scroll */
${ML} > .k-hang.sf-mlog-body { ${PLAIN} position:relative; padding:4px 8px 30px 0 !important; overflow:hidden auto; scrollbar-width:none; background:none !important; -webkit-mask-image:none !important; mask-image:none !important; animation:none !important; }
${ML} > .k-hang.sf-mlog-body::-webkit-scrollbar { display:none; }
${ML} > .k-hang.sf-mlog-body[data-overflow="1"] { -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 18px), transparent) !important; mask-image:linear-gradient(180deg, #000 calc(100% - 18px), transparent) !important; }
${ML} .ml-beam { position:absolute; left:9px; top:0; width:10px; height:0; z-index:0; pointer-events:none; will-change:transform;
  background:linear-gradient(90deg, transparent 4px, rgb(${BONE} / .55) 4px, rgb(${BONE} / .55) 6px, transparent 6px),
    linear-gradient(90deg, rgb(${BONE} / .07), rgb(${BONE} / .07)),
    repeating-linear-gradient(180deg, rgb(${BONE} / .28) 0 1px, transparent 1px 8px) 0 0 / 4px 100% no-repeat; border-radius:5px; }
${ML} .ml-beam[hidden] { display:none !important; }
${ML} .ml-beam::after { content:""; position:absolute; left:3px; right:3px; bottom:-10px; height:10px; border-radius:0 0 3px 3px;
  background:linear-gradient(180deg, rgb(${BONE} / .45), rgb(${BONE} / 0)); }
${ML} > .k-hang.sf-mlog-body > .orr-extent::before { display:none !important; }
${ML} .orr-arc-hand { --orr-hand-from:22px; --orr-hand-x:25px; }
/* section heads: long graduations with a caps word */
${ML} .sf-mlog-body > .k-row.k-row--static, ${ML} .sf-mlog-story > .k-row.k-row--static, ${ML} .sf-mlog-comp-subhead { ${PLAIN} position:relative !important; display:flex !important; align-items:baseline; justify-content:space-between; gap:12px;
  min-height:0 !important; height:auto !important; padding:22px 0 8px 40px !important; margin:0 !important; }
${ML} .sf-mlog-body > .k-row.k-row--static:first-of-type, ${ML} .sf-mlog-story > .k-row.k-row--static { padding-top:6px !important; }
${ML} .sf-mlog-body > .k-row.k-row--static[hidden] { display:none !important; }
${ML} .sf-mlog-body > .k-row.k-row--static::before, ${ML} .sf-mlog-story > .k-row.k-row--static::before, ${ML} .sf-mlog-comp-subhead::before { content:"" !important; position:absolute !important; left:6px !important; bottom:calc(8px + .45em) !important; top:auto !important;
  width:18px !important; height:2px !important; margin:0 !important; background:rgb(${BONE} / .78) !important; translate:none !important; scale:none !important; transform:none !important; border:0 !important; box-shadow:none !important; border-radius:0 !important; clip-path:none !important; display:block !important; }
${ML} .sf-mlog-body .k-row.k-row--static::after { display:none !important; content:none !important; }
${ML} .sf-mlog-body .k-caps { ${LABEL} font-size:10.5px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .68) !important; text-shadow:none !important; margin:0 !important; }
${verb(`${ML} .sf-mlog-toggle`)}
${ML} .sf-mlog-toggle { font-size:10px !important; }
${ML} .sf-mlog-toggle::before { content:"›  "; color:rgb(${BONE} / .6); }
/* the current action: the beam's head, a ring round a point of phosphor */
${ML} .sf-mlog-recommend > .k-rows { margin:0 !important; padding:0 !important; }
${ML} .sf-mlog-rec-item.k-row { ${PLAIN} position:relative !important; display:grid !important; grid-template-columns:minmax(0, 1fr) auto; align-items:start; column-gap:12px;
  min-height:0 !important; height:auto !important; padding:2px 0 6px 40px !important; margin:0 !important; cursor:default; }
${ML} .sf-mlog-rec-item.k-row::before { content:"" !important; position:absolute !important; left:6px !important; top:3px !important; width:16px !important; height:16px !important; margin:0 !important; display:block !important;
  translate:none !important; scale:none !important; transform:none !important; border:0 !important; box-shadow:none !important; clip-path:none !important; border-radius:50% !important;
  background:radial-gradient(circle, rgb(223 238 255) 0 2.6px, transparent 3px 5.4px, rgb(${BONE} / .8) 5.6px 6.9px, transparent 7.2px), radial-gradient(circle, rgb(8 10 13) 0 7px, transparent 7.4px) !important; }
${ML} .sf-mlog-rec-item.k-row::after { display:none !important; }
${ML} .sf-mlog-rec-item.is-now { padding-bottom:2px !important; }
${ML} .sf-mlog-rec-now { ${LABEL} display:inline-block; margin-right:12px; font-size:10px !important; letter-spacing:.24em !important; color:rgb(223 238 255) !important; }
${ML} .sf-mlog-rec-item.is-now .sf-mlog-rec-body { display:inline !important; margin:0 !important; font-size:13.5px !important; color:${INK} !important; }
${ML} .sf-mlog-rec-item .sf-mlog-rec-title { ${BODY} display:block; font-size:15px !important; line-height:1.3 !important; font-weight:560; color:${INK} !important; white-space:normal !important; }
${ML} .sf-mlog-rec-item .k-row__sub { ${BODY} display:block; margin-top:4px; font-size:12.5px !important; line-height:1.45 !important; color:rgb(${BONE} / .74) !important; white-space:normal; }
${ML} .sf-mlog-rec-item .sf-mlog-rec-meta { font-size:12px !important; color:rgb(${BONE} / .68) !important; }
${ML} .sf-mlog-rec-item .sf-mlog-rec-marker { ${LABEL} margin-top:8px !important; font-size:9.5px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .62) !important; }
${ML} .sf-mlog-rec-item .sf-mlog-rec-label { display:block !important; ${PLAIN} ${LABEL} min-height:0 !important; padding:2px 0 0 !important; font-size:9.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .84) !important; }
${ML} .sf-mlog-rec-item .sf-mlog-rec-label::before { content:"●  "; font-size:7px; vertical-align:2px; color:rgb(${BONE} / .84); }
${ML} .sf-mlog-rec-actions, ${ML} .sf-mlog-story .sf-mlog-rec-actions { display:flex !important; flex-wrap:wrap; gap:6px 26px; margin:4px 0 0 !important; padding:0 0 0 40px !important; list-style:none; }
${ML} .sf-mlog-rec-actions > li { display:flex !important; flex-direction:column; align-items:flex-start; }
${verb(`${ML} .sf-mlog-rec-action`)}
${ML} .sf-mlog-rec-action::before { content:"›  "; color:rgb(${BONE} / .6); }
${ML} :is(.sf-mlog-rec-actions, .sf-mlog-btns) .k-word-sub { ${LABEL} margin:1px 0 0 14px !important; font-size:9.5px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .6) !important; }
/* the active contracts: nodes on the beam; below each node the beam is lit as far as the contract has come */
${ML} .sf-mlog-list > .k-rows { margin:0 !important; padding:0 !important; ${PLAIN} }
/* the trace: the beam lit from the current action down to a bead (the chosen node at rest, the pointer's
   place on the beam while it traces), an ice pulse running down it */
${ML} .ml-trace { position:absolute; left:12px; top:0; width:4px; height:0; z-index:1; pointer-events:none; border-radius:2px; will-change:transform;
  background:linear-gradient(180deg, rgb(223 238 255 / .35), rgb(223 238 255 / .95)); box-shadow:0 0 10px 1px rgb(223 238 255 / .32); }
${ML} .ml-trace[hidden], ${ML} .ml-trace__bead[hidden] { display:none !important; }
${ML} .ml-trace::after { content:""; position:absolute; left:-2px; top:-36px; width:8px; height:36px; border-radius:4px;
  background:linear-gradient(180deg, rgb(143 203 255 / 0), rgb(143 203 255 / .95) 70%, rgb(223 238 255)); box-shadow:0 0 10px 2px rgb(143 203 255 / .4);
  animation:ml-pulse 2.8s cubic-bezier(.4, 0, .6, 1) infinite; opacity:.95; }
@keyframes ml-pulse { 0% { transform:translateY(0); opacity:0; } 12% { opacity:.95; } 88% { opacity:.95; } 100% { transform:translateY(calc(var(--ml-trace-h, 0px) + 36px)); opacity:0; } }
${ML} .ml-trace__bead { position:absolute; left:6px; top:-8px; width:16px; height:16px; z-index:2; pointer-events:none; border-radius:50%; will-change:transform;
  background:radial-gradient(circle, rgb(255 255 255) 0 2.6px, rgb(223 238 255 / .9) 3px 4.2px, rgb(223 238 255 / 0) 7.5px); box-shadow:0 0 14px 3px rgb(223 238 255 / .45); }
${ML} .sf-mlog-list .k-row.sf-mlog-row.is-traced::before { background:radial-gradient(circle, rgb(8 10 13) 0 4.2px, rgb(223 238 255) 4.5px 7px, rgb(8 10 13 / 0) 7.3px) !important; }
${ML} .sf-mlog-list .k-row.sf-mlog-row.is-traced .k-row__name { color:rgb(255 255 255) !important; }
${ML} .sf-mlog-list .k-row.sf-mlog-row.is-traced .k-row__sub { color:rgb(${BONE} / .86) !important; }
${ML} .sf-mlog-list .k-row.sf-mlog-row.is-traced .k-row__sub.k-bad { color:var(--dp-danger, #ff5038) !important; }
${ML} > .k-hang.sf-mlog-body { cursor:default; }
${RML} .ml-trace::after { animation:none !important; display:none; }
${ML} .orr-mdial__pct .orr-mdial__num.orr-counter { height:.9em; line-height:.9; }
${ML} .orr-mdial__pct .orr-counter__digit { width:.58em; }
${ML} .sf-mlog-card > .k-hero .k-hero__n.orr-counter { height:.92em; line-height:.92; overflow:hidden; }
${ML} .sf-mlog-card > .k-hero .k-hero__n .orr-counter__digit { width:.58em; }
${ML} .sf-mlog-list .k-row.sf-mlog-row { ${PLAIN} position:relative !important; display:grid !important; grid-template-columns:minmax(0, 1fr) auto; align-items:start; column-gap:14px;
  min-height:0 !important; height:auto !important; padding:10px 4px 12px 40px !important; margin:0 !important; cursor:pointer; color:${INK} !important; }
${ML} .sf-mlog-list .k-row.sf-mlog-row::before { content:"" !important; position:absolute !important; left:6.5px !important; top:12px !important; width:15px !important; height:15px !important; margin:0 !important; display:block !important;
  translate:none !important; scale:none !important; transform:none !important; border:0 !important; box-shadow:none !important; clip-path:none !important; border-radius:50% !important; z-index:1;
  background:radial-gradient(circle, rgb(${BONE} / .24) 0 4.4px, rgb(${BONE} / .9) 4.7px 6.8px, rgb(8 10 13 / 0) 7.1px) !important;
  box-shadow:0 0 0 3px rgb(8 10 13), 0 0 10px 2px rgb(${BONE} / .16) !important; }
${ML} .sf-mlog-list .k-row.sf-mlog-row.tracked::before { background:radial-gradient(circle, rgb(${BONE} / .24) 0 4.4px, rgb(${BONE} / .9) 4.7px 6.8px, rgb(8 10 13 / 0) 7.1px),
  linear-gradient(rgb(${BONE} / .9), rgb(${BONE} / .9)) 100% 50% / 4px 2px no-repeat !important; }
${ML} .sf-mlog-list .k-row.sf-mlog-row.tracked::before { width:19px !important; border-radius:7.5px 0 0 7.5px !important; }
${ML} .sf-mlog-list .k-row.sf-mlog-row::after { content:"" !important; position:absolute !important; left:12px !important; top:27px !important; width:4px !important; margin:0 !important; display:block !important;
  height:calc((100% - 13px) * var(--mlog-p, 0)) !important; translate:none !important; scale:none !important; transform:none !important; border:0 !important; clip-path:none !important; border-radius:2px !important;
  background:linear-gradient(180deg, rgb(223 238 255), rgb(223 238 255 / .7)) !important; box-shadow:0 0 8px 1px rgb(223 238 255 / .32) !important; opacity:1 !important; }
/* the stretch to the next node, faint, so the lit stub reads as a share of it */
${ML} .sf-mlog-list .k-row.sf-mlog-row { background:linear-gradient(90deg, transparent 12px, rgb(${BONE} / .16) 12px, rgb(${BONE} / .16) 16px, transparent 16px) 0 27px / 100% calc(100% - 13px) no-repeat !important; }
${ML} .sf-mlog-list .k-row.sf-mlog-row[aria-selected="true"]::before { background:radial-gradient(circle, rgb(252 250 244) 0 6.8px, rgb(8 10 13 / 0) 7.1px) !important;
  box-shadow:0 0 0 3px rgb(8 10 13), 0 0 14px 3px rgb(252 250 244 / .35) !important; }
${ML} .sf-mlog-list .k-row.sf-mlog-row:focus-visible { outline:none !important; }
${ML} .sf-mlog-list .k-row.sf-mlog-row:focus-visible:not([aria-selected="true"])::before { background:radial-gradient(circle, rgb(8 10 13) 0 4.2px, ${INK} 4.5px 7px, rgb(8 10 13 / 0) 7.3px) !important; }
${ML} .sf-mlog-list .k-row.sf-mlog-row .k-row__name { ${BODY} display:inline; font-size:14.5px !important; line-height:1.3 !important; font-weight:500; color:rgb(${BONE} / .9) !important; white-space:normal !important; text-shadow:none !important; }
${ML} .sf-mlog-list .k-row.sf-mlog-row[aria-selected="true"] .k-row__name { color:rgb(252 250 244) !important; font-weight:600 !important; }
${ML} .sf-mlog-list .k-row.sf-mlog-row:is(:hover, :focus-visible) .k-row__name { color:rgb(255 255 255) !important; }
${ML} .sf-mlog-list .k-row.sf-mlog-row .k-row__sub { ${BODY} display:block; margin-top:4px; font-size:12.5px !important; line-height:1.4 !important; color:rgb(${BONE} / .72) !important; }
${ML} .sf-mlog-list .k-row.sf-mlog-row .k-row__sub.k-bad { color:var(--dp-danger, #ff5038) !important; }
${ML} .sf-mlog-list .k-row.sf-mlog-row .k-row__num { ${PLAIN} min-height:0 !important; padding:1px 0 0 !important; display:block !important;
  font-family:var(--dp-face-numeral, "Archivo") !important; font-variation-settings:"wdth" 100, "wght" 480 !important; font-weight:480 !important; font-size:14px !important; letter-spacing:0 !important;
  text-transform:none !important; color:rgb(223 238 255) !important; font-variant-numeric:tabular-nums; }
${ML} .sf-mlog-tag { ${LABEL} display:inline-block; margin-left:10px; font-size:9px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .8); vertical-align:1px; white-space:nowrap; }
${ML} .sf-mlog-tag::before { content:"●  "; font-size:6.5px; vertical-align:1.5px; }
${ML} .sf-mlog-pct { ${LABEL} display:block; margin-top:6px; font-size:9.5px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .64); }
${ML} .sf-mlog-list .sf-mlog-empty .k-sentence, ${ML} .sf-mlog-comp-list .sf-mlog-empty .k-sentence { ${BODY} margin:0 !important; padding:2px 0 6px 40px; font-size:13px !important; color:rgb(${BONE} / .66) !important; }
/* the career paths: a diamond on the beam, their verbs as words */
${ML} .sf-mlog-career.k-row { ${PLAIN} position:relative !important; display:grid !important; grid-template-columns:minmax(0, 1fr) auto; column-gap:12px; align-items:start;
  min-height:0 !important; height:auto !important; padding:8px 0 12px 40px !important; margin:0 !important; cursor:default; }
${ML} .sf-mlog-career.k-row::before { content:"" !important; position:absolute !important; left:9.5px !important; top:12px !important; width:9px !important; height:9px !important; margin:0 !important; display:block !important;
  transform:rotate(45deg) !important; translate:none !important; scale:none !important; border:0 !important; border-radius:0 !important; clip-path:none !important;
  background:rgb(8 10 13) !important; box-shadow:inset 0 0 0 1.5px rgb(${BONE} / .66) !important; }
${ML} .sf-mlog-career.k-row::after { display:none !important; }
${ML} .sf-mlog-career .sf-mlog-career-title { ${BODY} font-size:14.5px !important; font-weight:560; color:${INK} !important; white-space:normal !important; }
${ML} .sf-mlog-career .k-row__sub { ${BODY} margin-top:3px; font-size:12.5px !important; line-height:1.4; color:rgb(${BONE} / .72) !important; white-space:normal; }
${ML} .sf-mlog-career .sf-mlog-career-status { ${LABEL} font-size:9.5px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .76) !important; }
${ML} .sf-mlog-career .sf-mlog-career-progress { ${PLAIN} ${LABEL} min-height:0 !important; padding:2px 0 0 !important; font-size:9.5px !important; letter-spacing:.16em !important; color:rgb(223 238 255) !important; }
${ML} .sf-mlog-career :is(.sf-mlog-career-actions, .sf-mlog-career-choices) { display:flex !important; flex-wrap:wrap; gap:4px 22px; margin:8px 0 0 !important; padding:0 !important; list-style:none; }
${verb(`${ML} .sf-mlog-career .sf-mlog-career-btn`)}
${ML} .sf-mlog-career .sf-mlog-career-btn { font-size:10.5px !important; }
${ML} .sf-mlog-career .sf-mlog-career-btn::before { content:"›  "; color:rgb(${BONE} / .6); }
${ML} .sf-mlog-career .sf-mlog-career-btn[aria-pressed="true"] { color:rgb(255 255 255) !important; background:linear-gradient(90deg, ${INK}, rgb(${BONE} / 0)) 0 100% / 100% 1.5px no-repeat !important; }
${ML} .sf-mlog-career .sf-mlog-career-btn-abandon:is(:hover, :focus-visible) { color:var(--dp-danger, #ff5038) !important; background:linear-gradient(90deg, var(--dp-danger, #ff5038), rgb(255 80 56 / 0)) 0 100% / 100% 1.5px no-repeat !important; }
${ML} .sf-mlog-body :is(a, .sf-entity-link, [data-entity]) { color:${INK} !important; text-decoration:none !important; box-shadow:none !important; background-image:none !important; border-bottom:0 !important; }
${ML} .sf-mlog-body :is(a, .sf-entity-link, [data-entity]):is(:hover, :focus-visible) { text-decoration:underline 1px rgb(${BONE} / .6) !important; text-underline-offset:3px; outline:none !important; }
/* the settled: past nodes on the beam, hollow and dim; the totals as a ledger */
${ML} .sf-mlog-comp-list :is(.sf-mlog-receipts, .sf-mlog-comp-rows) { margin:0 !important; padding:0 !important; }
${ML} .sf-mlog-comp-list .k-row { ${PLAIN} position:relative !important; display:grid !important; grid-template-columns:minmax(0, 1fr) auto; column-gap:12px; align-items:start;
  min-height:0 !important; height:auto !important; padding:6px 0 8px 40px !important; margin:0 !important; cursor:default; }
${ML} .sf-mlog-comp-list .k-row::before { content:"" !important; position:absolute !important; left:10.5px !important; top:10px !important; width:7px !important; height:7px !important; margin:0 !important; display:block !important;
  border-radius:50% !important; translate:none !important; scale:none !important; transform:none !important; border:0 !important; clip-path:none !important; background:rgb(${BONE} / .44) !important; box-shadow:none !important; }
${ML} .sf-mlog-comp-list .k-row::after { display:none !important; }
${ML} .sf-mlog-comp-list .k-row.sf-mlog-receipt-row::before { border-radius:1px !important; width:8px !important; height:8px !important; left:10px !important; background:rgb(${BONE} / .6) !important; }
${ML} .sf-mlog-comp-list .k-row.sf-mlog-receipt-row--bad::before { background:var(--dp-danger, #ff5038) !important; width:9px !important; height:2.5px !important; top:13px !important;
  transform:rotate(-45deg) !important; border-radius:1px !important; }
${ML} .sf-mlog-comp-list .k-row .k-38 { ${BODY} font-size:13px !important; color:rgb(${BONE} / .8) !important; }
${ML} .sf-mlog-comp-list .k-row .k-row__sub { ${BODY} margin-top:2px; font-size:12px !important; color:rgb(${BONE} / .64) !important; }
${ML} .sf-mlog-comp-list .k-row :is(.sf-mlog-receipt-outcome, .sf-mlog-comp-cr) { ${LABEL} font-size:9.5px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .7) !important; }
${ML} .sf-mlog-comp-list .sf-mlog-receipt-row--bad .sf-mlog-receipt-outcome { color:rgb(${BONE} / .7) !important; }
/* the campaign thread (post-ending only) keeps the same voice */
${ML} .sf-mlog-story-tile { padding:0 0 10px 40px !important; ${PLAIN} }
${ML} .sf-mlog-story-tile .k-sentence { ${BODY} font-size:13px !important; line-height:1.5; color:rgb(${BONE} / .8) !important; }
${ML} .sf-mlog-story-tile .sf-mlog-rec-actions { padding-left:0 !important; }

/* ---- the stage: the chosen contract's reading beside its dial ---- */
${ML} > .k-stage.sf-mlog-stage { ${PLAIN} padding:0 0 26px !important; overflow:hidden auto; -webkit-mask-image:none !important; mask-image:none !important; animation:none !important; }
${ML} > .k-stage.sf-mlog-stage { display:flex !important; flex-direction:column; align-self:stretch !important; max-height:none !important; padding-bottom:clamp(16px, calc(12vh - 50px), 90px) !important; }
${ML} .sf-mlog-card { position:relative; display:grid !important; flex:1 0 auto; grid-template-columns:minmax(0, 1fr) var(--ml-dial);
  grid-template-rows:repeat(6, auto) minmax(18px, 1fr) auto; column-gap:clamp(28px, 3.6vw, 72px); align-content:stretch; align-items:start; min-height:100%; }
${ML} .sf-mlog-card > * { grid-column:1; min-width:0; margin-left:0 !important; }
${ML} .sf-mlog-side { grid-column:2 !important; grid-row:1 / span 7; display:flex; flex-direction:column; align-items:center; }
${ML} .sf-mlog-side > .sf-mlog-btns { margin:48px 0 0 !important; }
${ML} .sf-mlog-side .sf-mlog-btns > .k-words--row { flex-direction:column; align-items:center; gap:14px; }
${ML} .sf-mlog-side .sf-mlog-btns > .k-words--row > li { align-items:center; }
${ML} .sf-mlog-card > .ml-route-host { grid-column:1 / -1 !important; grid-row:8; align-self:end; margin-top:18px; }
${ML} .sf-mlog-card.is-empty > .sf-mlog-empty { grid-row:2; }
${ML} .sf-mlog-kicker { ${LABEL} margin:2px 0 0 !important; font-size:10.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .68) !important; }
${ML} .sf-mlog-kicker .sf-mlog-tag { margin-left:14px; }
/* ---- the route band: here to the berth across the stage, the clock as a scale under it ---- */
${ML} .ml-route { position:relative; padding:16px 0 4px; transition:opacity .2s linear; }
${ML} .ml-route::before { content:""; position:absolute; inset:-18px -40px -8px; z-index:-1; pointer-events:none;
  background:radial-gradient(60% 90% at 50% 55%, rgb(5 7 10 / .72), rgb(5 7 10 / .4) 70%, rgb(5 7 10 / 0)); }
${ML} .ml-route__cap { display:flex; align-items:baseline; justify-content:space-between; gap:18px; margin:0 0 12px !important; padding:0 64px; }
${ML} .ml-route__kicker { ${LABEL} font-size:10px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .7) !important; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
${ML} .ml-route__jumps { ${LABEL} font-size:10px !important; letter-spacing:.2em !important; color:rgb(223 238 255) !important; white-space:nowrap; }
${ML} .ml-route.is-preview .ml-route__kicker { color:rgb(143 203 255) !important; }
${ML} .ml-route__track { position:relative; height:56px; margin:0 32px; }
${ML} .ml-route__run { position:absolute; left:40px; right:40px; top:0; bottom:0; }
${ML} .ml-route__beam { position:absolute; left:0; right:0; top:27px; height:3px; border-radius:2px; background:rgb(${BONE} / .5); box-shadow:0 0 0 4px rgb(${BONE} / .06); }
${ML} .ml-route__lit { position:absolute; left:0; top:26px; height:5px; border-radius:3px; background:rgb(223 238 255); box-shadow:0 0 12px 2px rgb(223 238 255 / .35); }
${ML} .ml-route__lane { position:absolute; top:22px; height:13px; overflow:hidden; pointer-events:none; }
${ML} .ml-route__pulse { position:absolute; left:0; top:0; width:100%; height:100%; transform:translateX(-100%); animation:ml-route-pulse 3.2s cubic-bezier(.4, 0, .6, 1) infinite;
  background:radial-gradient(closest-side, rgb(143 203 255 / .95), rgb(143 203 255 / 0)) 100% 50% / 44px 100% no-repeat; }
@keyframes ml-route-pulse { from { transform:translateX(-100%); } to { transform:translateX(0); } }
${ML} .ml-route__hop { position:absolute; top:0; height:56px; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; pointer-events:none; }
${ML} .ml-route__hop > i { display:block; width:3px; height:22px; margin-top:17px; border-radius:1px; background:rgb(${BONE} / .85); box-shadow:0 0 0 3px rgb(5 7 10 / .9); }
${ML} .ml-route__hop > b { position:absolute; top:44px; ${LABEL} font-size:9.5px !important; letter-spacing:.18em !important; font-weight:650; color:rgb(${BONE} / .76); white-space:nowrap; }
${ML} .ml-route__threat { position:absolute; top:25px; height:7px; border-radius:2px; background:var(--dp-danger, #ff5038); box-shadow:0 0 12px 1px rgb(255 80 56 / .4); pointer-events:none; }
${ML} .ml-route__threat > b { position:absolute; left:50%; top:-20px; transform:translateX(-50%); ${LABEL} font-size:9.5px !important; letter-spacing:.2em !important; color:var(--dp-danger, #ff5038); white-space:nowrap; }
${ML} .ml-route__face { position:absolute; top:0; width:56px; height:56px; margin-left:-28px; border-radius:50%; overflow:hidden; background:rgb(10 12 16);
  box-shadow:0 0 0 2px rgb(${BONE} / .8), 0 0 0 6px rgb(5 7 10), 0 0 16px 4px rgb(${BONE} / .14); }
${ML} .ml-route__face > img { display:block; width:100%; height:100%; object-fit:cover; transform:scale(1.4); filter:saturate(.9); }
${ML} .ml-route__face.is-bare { background:radial-gradient(circle, rgb(${BONE} / .5) 0 5px, rgb(10 12 16) 6px); }
${ML} .ml-route__face--from { left:0; }
${ML} .ml-route__face--to { left:100%; box-shadow:0 0 0 2px rgb(223 238 255), 0 0 0 6px rgb(5 7 10), 0 0 18px 5px rgb(223 238 255 / .28); }
${ML} .ml-route__ship { position:absolute; top:20px; width:18px; height:18px; margin-left:-9px; border-radius:50%; z-index:2;
  background:radial-gradient(circle, rgb(255 255 255) 0 3.5px, rgb(223 238 255) 4px 6px, rgb(223 238 255 / 0) 9px); box-shadow:0 0 16px 4px rgb(223 238 255 / .5); }
${ML} .ml-route__ship > b { position:absolute; left:50%; bottom:calc(100% + 4px); transform:translateX(-50%); font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 520;
  font-size:11px; letter-spacing:.04em; color:rgb(223 238 255); white-space:nowrap; }
${ML} .ml-route__names { display:flex; justify-content:space-between; gap:24px; margin:10px 0 0 !important; }
${ML} .ml-route__from, ${ML} .ml-route__to { ${BODY} font-size:14px !important; color:${INK} !important; white-space:nowrap; }
${ML} .ml-route__to { text-align:right; }
${ML} :is(.ml-route__from, .ml-route__to) small { ${LABEL} display:block; margin-bottom:3px; font-size:9.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .66) !important; }
${ML} .ml-route__to :is(a, .sf-entity-link, [data-entity]) { color:${INK} !important; text-decoration:none !important; box-shadow:none !important; background-image:none !important; border-bottom:0 !important; }
${ML} .ml-route__to :is(a, .sf-entity-link, [data-entity]):is(:hover, :focus-visible) { text-decoration:underline 1px rgb(${BONE} / .6) !important; text-underline-offset:4px; outline:none !important; }
${ML} .ml-route__clock { position:relative; display:flex; align-items:center; gap:18px; margin:14px 32px 0; }
${ML} .ml-route__clock-rule { position:relative; flex:1 1 auto; height:12px; border-bottom:0; background:linear-gradient(rgb(${BONE} / .3), rgb(${BONE} / .3)) 0 100% / 100% 2px no-repeat; }
${ML} .ml-route__clock-rule > i { position:absolute; bottom:0; width:2px; height:8px; margin-left:-1px; background:rgb(${BONE} / .42); }
${ML} .ml-route__clock-left { position:absolute; bottom:-1px; height:4px; border-radius:2px; background:rgb(${BONE} / .86); box-shadow:0 0 8px rgb(${BONE} / .25); }
${ML} .ml-route__clock-now { position:absolute; bottom:-3px; width:3px; height:14px; margin-left:-1.5px; background:${INK}; }
${ML} .ml-route__clock.is-threat .ml-route__clock-left, ${ML} .ml-route__clock.is-threat .ml-route__clock-now { background:var(--dp-danger, #ff5038); box-shadow:0 0 10px rgb(255 80 56 / .45); }
${ML} .ml-route__clock.is-none .ml-route__clock-rule { background:repeating-linear-gradient(90deg, rgb(${BONE} / .26) 0 6px, transparent 6px 12px) 0 100% / 100% 2px no-repeat; }
${ML} .ml-route__clock-read { ${LABEL} flex:none; font-size:10px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .72) !important; white-space:nowrap; }
${ML} .ml-route__clock-read b { font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 480; font-size:14px; letter-spacing:.02em; color:rgb(223 238 255); margin-right:8px; }
${ML} .ml-route__clock.is-threat .ml-route__clock-read b { color:var(--dp-danger, #ff5038); }
${ML} .ml-route.is-preview :is(.ml-route__lit, .ml-route__ship) { opacity:.75; }
${ML} .ml-route.is-empty .ml-route__beam { background:linear-gradient(90deg, rgb(${BONE} / .5), rgb(${BONE} / 0)); box-shadow:none; }
${ML} .ml-route.is-empty .ml-route__to { color:rgb(${BONE} / .7) !important; }
${ML} .orr-mdial.is-preview { opacity:.9; }
${ML} .orr-mdial__face { position:absolute; left:26%; top:26%; width:48%; height:48%; border-radius:50%; overflow:hidden; pointer-events:none; opacity:.3; }
${ML} .orr-mdial__face > img { display:block; width:100%; height:100%; object-fit:cover; transform:scale(1.3); filter:saturate(.7); }
${ML} .orr-mdial__face::after { content:""; position:absolute; inset:0; border-radius:50%; background:radial-gradient(circle, rgb(5 7 10 / .2), rgb(5 7 10 / .85) 92%); }
${RML} .ml-route__pulse { animation:none !important; opacity:0; }
${RML} .ml-route { transition:none !important; }
${ML} .sf-mlog-card > h2.k-t-title { ${DISPLAY} margin:12px 0 0 !important; font-size:clamp(24px, min(2vw, 4vh), 38px) !important; line-height:1.05 !important; letter-spacing:.01em !important;
  color:rgb(242 237 226) !important; text-shadow:0 2px 18px rgb(0 0 0 / .5) !important; text-wrap:balance; }
${ML} .sf-mlog-card > :is(.sf-mlog-next, .sf-mlog-obj) { ${BODY} margin:12px 0 0 !important; max-width:60ch; font-size:16px !important; line-height:1.5 !important; font-style:normal !important; color:rgb(${BONE} / .84) !important; }
${ML} .sf-mlog-card > .k-hero { margin:22px 0 0 !important; }
${ML} .sf-mlog-card > .k-hero .k-hero__n { font-family:var(--dp-face-numeral, "Archivo") !important; font-variation-settings:"wdth" 100, "wght" 250 !important; font-weight:250 !important; font-stretch:100% !important;
  font-size:clamp(56px, 8vh, 92px) !important; line-height:.9 !important; letter-spacing:-.02em !important; color:${INK} !important; text-shadow:0 0 24px rgb(0 0 0 / .5) !important; }
${ML} .sf-mlog-card > .k-hero .k-hero__w { ${LABEL} margin-top:8px !important; font-size:10.5px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .68) !important; }
/* the terms: a ledger of caps and values, each on a tick of one short scale */
${ML} .sf-mlog-card .sf-mlog-terms { margin:24px 0 0 !important; padding:0 !important; max-width:640px; list-style:none; ${PLAIN}
  background:linear-gradient(90deg, rgb(${BONE} / .44) 2px, transparent 2px) 0 0 / 2px 100% no-repeat !important; --k-row-cols:none !important; }
${ML} .sf-mlog-card .sf-mlog-terms > .k-row { ${PLAIN} position:relative !important; display:grid !important; grid-template-columns:minmax(118px, 10.5em) minmax(0, 1fr) !important; align-items:baseline; column-gap:18px;
  min-height:0 !important; height:auto !important; padding:7px 0 7px 16px !important; margin:0 !important; cursor:default; }
${ML} .sf-mlog-card .sf-mlog-terms > .k-row::before { content:"" !important; display:block !important; position:absolute !important; left:0 !important; top:calc(7px + .55em) !important; width:8px !important; height:1px !important; margin:0 !important;
  background:rgb(${BONE} / .5) !important; translate:none !important; scale:none !important; transform:none !important; border:0 !important; box-shadow:none !important; clip-path:none !important; border-radius:0 !important; }
${ML} .sf-mlog-card .sf-mlog-terms > .k-row::after { display:none !important; }
${ML} .sf-mlog-card .sf-mlog-terms > .k-row > .k-62 { ${LABEL} font-size:10px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .66) !important; }
${ML} .sf-mlog-card .sf-mlog-terms > .k-row > .k-row__name { ${BODY} font-size:14.5px !important; line-height:1.4 !important; color:${INK} !important; white-space:normal !important; overflow:visible !important; }
${ML} .sf-mlog-card .sf-mlog-terms > .k-row > .k-row__name .k-bad { color:var(--dp-danger, #ff5038) !important; }
${ML} .sf-mlog-card .sf-mlog-terms :is(a, .sf-entity-link, [data-entity]) { color:${INK} !important; text-decoration:none !important; box-shadow:none !important; background-image:none !important; border-bottom:0 !important; }
${ML} .sf-mlog-card .sf-mlog-terms :is(a, .sf-entity-link, [data-entity]):is(:hover, :focus-visible) { text-decoration:underline 1px rgb(${BONE} / .6) !important; text-underline-offset:4px; outline:none !important; }
/* the verbs: Track is the one Lamp Key while untracked; tracked, it is a bone state; Abandon reddens only when reached */
${ML} .sf-mlog-btns { margin:26px 0 0 !important; }
${ML} .sf-mlog-btns > .k-words--row { display:flex !important; flex-wrap:wrap; align-items:center; gap:14px 34px; margin:0 !important; padding:0 !important; list-style:none; }
${ML} .sf-mlog-btns > .k-words--row > li { display:flex !important; flex-direction:column; align-items:flex-start; }
${verb(`${ML} .sf-mlog-btns .k-word:not(.orr-lampkey)`)}
${ML} .sf-mlog-btns .k-word:not(.orr-lampkey) { font-size:12px !important; }
${ML} .sf-mlog-btns .sf-mlog-btn-map::before { content:"›  "; color:rgb(${BONE} / .6); }
${ML} .sf-mlog-btns .sf-mlog-btn-track[aria-pressed="true"]::before { content:"●  "; font-size:7px; vertical-align:2px; color:${INK}; }
${ML} .sf-mlog-btns .sf-mlog-btn-track[aria-pressed="true"] { color:${INK} !important; }
${ML} .sf-mlog-btns .sf-mlog-btn-abandon { color:rgb(${BONE} / .76) !important; }
${ML} .sf-mlog-btns .sf-mlog-btn-abandon:is(:hover, :focus-visible) { color:var(--dp-danger, #ff5038) !important;
  background:linear-gradient(90deg, var(--dp-danger, #ff5038), rgb(255 80 56 / 0)) 0 100% / 100% 1.5px no-repeat !important; }
/* the dial: the clock outside, the progress inside, the two readings at its heart */
${ML} .orr-mdial { position:relative; width:var(--ml-dial); height:var(--ml-dial); margin:0 !important; }
${ML} .orr-mdial > svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
${ML} .orr-mdial__read { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; text-align:center; pointer-events:none; }
${ML} .orr-mdial__pct { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 260; font-weight:260; font-size:clamp(40px, calc(var(--ml-dial) * .22), 66px);
  line-height:.9; letter-spacing:-.02em; color:rgb(223 238 255); font-variant-numeric:tabular-nums; }
${ML} .orr-mdial__pct small { font-size:.42em; margin-left:2px; font-weight:400; color:rgb(${BONE} / .7); }
${ML} .orr-mdial__w { ${LABEL} font-size:9.5px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .66); }
${ML} .orr-mdial__clock-read { ${LABEL} white-space:nowrap; position:absolute; left:-40px; right:-40px; bottom:calc(var(--ml-dial) * -.02 - 22px); text-align:center; font-size:10px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .7); }
${ML} .orr-mdial__clock-read b { font-family:var(--dp-face-numeral, "Archivo"); font-weight:480; font-variation-settings:"wdth" 100, "wght" 480; font-size:13px; letter-spacing:.04em; color:rgb(223 238 255); margin-right:8px; }
${ML} .orr-mdial__clock-read.is-threat b { color:var(--dp-danger, #ff5038); }
${ML} .orr-mdial .orr-arc-tick { fill:none; stroke:rgb(${BONE} / .4); stroke-width:1.25; vector-effect:non-scaling-stroke; }
${ML} .orr-mdial .orr-arc-tick--hi { stroke:rgb(${BONE} / .72); stroke-width:2; }
${ML} .orr-mdial .orr-arc-ring { fill:none; stroke:rgb(${BONE} / .26); stroke-width:4; vector-effect:non-scaling-stroke; }
${ML} .orr-mdial .orr-arc-ring--rim { stroke:rgb(${BONE} / .16); stroke-width:6; }
${ML} .orr-mdial__clock { fill:none; stroke:rgb(${BONE} / .86); stroke-width:4; stroke-linecap:round; vector-effect:non-scaling-stroke; }
${ML} .orr-mdial__clock-bloom { fill:none; stroke:rgb(${BONE} / .14); stroke-width:12; vector-effect:non-scaling-stroke; }
${ML} .orr-mdial__clock.is-threat { stroke:var(--dp-danger, #ff5038); }
${ML} .orr-mdial__clock-bloom.is-threat { stroke:rgb(255 80 56 / .22); }
${ML} .orr-mdial__prog { fill:none; stroke:rgb(223 238 255); stroke-width:6; stroke-linecap:round; vector-effect:non-scaling-stroke; }
${ML} .orr-mdial__prog-bloom { fill:none; stroke:rgb(223 238 255 / .24); stroke-width:18; vector-effect:non-scaling-stroke; }
${ML} .orr-mdial__bead { fill:rgb(240 248 255); }
${ML} .orr-arc-drift { transform-box:view-box; transform-origin:50% 50%; animation:orr-drift 900s linear infinite; }
${ML} .sf-mlog-empty.k-empty { ${BODY} max-width:46ch; margin:14px 0 0 !important; font-size:16px !important; line-height:1.55; color:rgb(${BONE} / .82) !important; padding-left:0; }
${ML} .orr-mdial.is-empty .orr-mdial__pct { color:rgb(${BONE} / .5); font-size:clamp(34px, calc(var(--ml-dial) * .16), 50px); }
/* arrival: the nodes come down the beam in turn, the dial draws its clock and its progress */
${ML}.ml-arrive :is(.sf-mlog-rec-item, .sf-mlog-list .k-row, .sf-mlog-career) { animation:orr-rise 460ms var(--dp-ease-out, ease-out) both; animation-delay:var(--orr-delay, 0ms); }
${ML}.ml-arrive :is(.orr-mdial__clock, .orr-mdial__clock-bloom, .orr-mdial__prog, .orr-mdial__prog-bloom) { stroke-dasharray:1 1; stroke-dashoffset:1; animation:orr-draw 900ms var(--dp-ease-out, ease-out) 180ms both; }
${ML}.ml-arrive .orr-mdial__bead { animation:orr-arc-fade 1100ms ease-out both; }
${ML}.ml-arrive .orr-mdial__pct { animation:orr-rise 520ms var(--dp-ease-out, ease-out) 260ms both; }
${RML} :is(.orr-arc-drift, .sf-mlog-rec-item, .sf-mlog-list .k-row, .sf-mlog-career, .orr-mdial__clock, .orr-mdial__clock-bloom, .orr-mdial__prog, .orr-mdial__prog-bloom, .orr-mdial__bead, .orr-mdial__pct) { animation:none !important; }
/* the foot: one way back */
${ML} > .k-foot { align-items:center !important; }
${verb(`${ML} > .k-foot .sf-back.k-word`)}
${ML} > .k-foot .sf-back.k-word { font-size:12px !important; }
${ML} > .k-foot .sf-back.k-word::before { content:"‹  "; color:rgb(${BONE} / .6); }
${ML} > .k-foot .sf-back.k-word::after { content:"ESC" / "" !important; display:inline !important; position:static !important; margin-left:14px !important; width:auto !important; height:auto !important;
  background:none !important; border:0 !important; box-shadow:none !important; ${LABEL} font-size:9.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .6) !important; transform:none !important; opacity:1 !important; }
@media (max-width:1400px) {
  ${ML} { --ml-dial:clamp(180px, min(20vw, 36vh), 240px); }
}
/* a short screen: tighter rows on the beam, a lower band */
@media (max-height:820px) {
  ${ML} { --ml-dial:clamp(150px, 25vh, 190px); }
  ${ML} .sf-mlog-card { grid-template-columns:minmax(0, 1fr) max(var(--ml-dial), 220px); column-gap:clamp(20px, 2.6vw, 48px); }
  ${ML} .sf-mlog-side > .sf-mlog-btns { margin-top:36px !important; }
  ${ML} .sf-mlog-card > .k-hero { display:none !important; }
  ${ML} .sf-mlog-side > .sf-mlog-btns { margin-top:40px !important; }
  ${ML} .orr-mdial__clock-read { bottom:-26px; }
  ${ML} .sf-mlog-side .sf-mlog-btns > .k-words--row { gap:8px; }
  ${ML} .ml-route__track { height:48px; }
  ${ML} .ml-route__face { width:48px; height:48px; margin-left:-24px; }
  ${ML} .ml-route__beam { top:23px; }
  ${ML} .ml-route__lit { top:22px; }
  ${ML} .ml-route__lane { top:18px; }
  ${ML} .ml-route__ship { top:16px; }
  ${ML} .ml-route__threat { top:21px; }
  ${ML} .ml-route__hop { height:48px; }
  ${ML} .ml-route__hop > i { margin-top:13px; }
  ${ML} .ml-route__hop > b { top:38px; }
  ${ML} .ml-route__names { margin-top:6px !important; }
  ${ML} .sf-mlog-card .sf-mlog-terms { margin-top:12px !important; }
  ${ML} .sf-mlog-card .sf-mlog-terms > .k-row { padding-top:4px !important; padding-bottom:4px !important; }
  ${ML} .sf-mlog-list .k-row.sf-mlog-row { padding-top:7px !important; padding-bottom:8px !important; }
  ${ML} .sf-mlog-body > .k-row.k-row--static { padding-top:14px !important; }
  ${ML} .ml-route { padding-top:8px; }
  ${ML} .ml-route__cap { margin-bottom:6px !important; }
  ${ML} .ml-route__clock { margin-top:8px; }
}
@media (forced-colors:active) {
  ${ML} .sf-mlog-list .k-row.sf-mlog-row[aria-selected="true"] { outline:2px solid Highlight !important; }
}
`;

export const ARCHIVE_CSS = HAND + CODEX_CSS + MLOG_CSS + SCROLL_EXTENT_CSS;

/** Inject the archive composition once (after the Deckplate and ORRERY sheets). */
export function injectArchiveLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.createElement !== 'function') return;
  injectOrrery(doc);
  if (typeof doc.getElementById === 'function' && doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = ARCHIVE_CSS;
  doc.head.appendChild(style);
}
