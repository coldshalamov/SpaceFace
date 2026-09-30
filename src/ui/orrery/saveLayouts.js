// ORRERY composition for the Save/Load and Game Over screens (design/frontend/ORRERY.md §6 Meta).
//
// Save/Load: an instrument, not a slot list. The lives on file ride a filmstrip on a curved rail
// (saveFilmstrip.js) under the chosen save's hull, which stands alone on the glass (no dock
// photograph); the save's facts are readings beside it (credits as a rolling numeral, the sector, the
// time played), its hull record a ledger of caps and values, and LOAD the one Lamp Key.
// Game Over: the cause is the headline line; the career record is a ring (the career's time, the
// lost hull's life the red arc at its end); restore is the one Lamp Key; red is only the loss.
//
// Like the other composition sheets it styles the screens' existing nodes (checks and probes read
// their classes) and pins nothing. Scoped by the root classes the screens add (`orr-saveload`,
// `orr-gameover`), doubled where an older deckplate/kit rule needs out-ranking.
import { injectOrrery } from './tokens.js';
import { berthImage } from './saveBerth.js';

const STYLE_ID = 'sf-orrery-save-layouts';
const BONE = '236 230 216';
const SL = 'html body #screens > .k-screen.of-saveload.orr-saveload.orr-saveload';
const LABEL = 'font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650; font-weight:650; text-transform:uppercase;';
const DISPLAY = 'font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-variation-settings:"wght" 800, "wdth" 125; font-weight:800; text-transform:uppercase;';
const BODY = 'font-family:var(--dp-face-read, "Instrument Sans"), "Instrument Sans", system-ui, sans-serif; font-variation-settings:normal; font-stretch:100%; text-transform:none;';
const PLAIN = 'background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; clip-path:none !important;';
/** The one berth (saveBerth.js): the hero under a standing hull, the hero open where none is on file,
 *  and the station berth on the filmstrip. */
const BERTH_HULL = berthImage({ size: 'hero', hull: true });
const BERTH_OPEN = berthImage({ size: 'hero' });
const BERTH_STATION = berthImage({ size: 'station' });

const SAVE_LOAD = `
/* ---- the frame: the reading down the left, the hull on the glass to its right, the filmstrip under
   the hull, the way back along the foot ---- */
${SL} { --sv:var(--k-s, 1);
  padding:clamp(28px, 5.4vh, 112px) clamp(40px, 5vw, 128px) clamp(22px, 4.2vh, 84px) !important;
  grid-template-columns:minmax(300px, 31.5%) minmax(0, 1fr) !important;
  grid-template-rows:auto minmax(0, 1fr) auto auto !important;
  grid-template-areas:"title stage" "page stage" "hang hang" "foot foot" !important;
  column-gap:clamp(28px, 3.4vw, 88px) !important; row-gap:clamp(10px, 1.9vh, 30px) !important; }

/* title: the extended display cut, no rule under it */
${SL} > .k-title { grid-area:title; align-self:end; margin:0; padding:0 !important; border:0 !important; position:relative; z-index:2; }
${SL} > .k-title .k-t-title { ${DISPLAY} margin:0; font-size:calc(72px * var(--sv)) !important; line-height:.9 !important; letter-spacing:.005em !important;
  color:rgb(${BONE}) !important; -webkit-text-fill-color:currentColor; background:none !important; text-shadow:0 2px 18px rgb(0 0 0 / .5); }
${SL} > .k-title .k-t-emph { ${BODY} margin:calc(12px * var(--sv)) 0 0; font-size:max(12.5px, calc(16px * var(--sv))); line-height:1.35; color:rgb(${BONE} / .74); }

/* ---- the reading: free type on a pool of shade, no panel ---- */
${SL} > .k-stage__foot.sf-save-ledger { grid-area:page; position:relative !important; inset:auto !important; left:auto !important; bottom:auto !important; top:auto !important;
  width:auto !important; max-width:none !important; height:auto; min-height:0; align-self:start; box-sizing:border-box; display:flex; flex-direction:column;
  gap:calc(12px * var(--sv)); margin:0; padding:calc(10px * var(--sv)) 0 0 !important; overflow:visible !important; ${PLAIN} z-index:2; }
${SL} > .sf-save-ledger::before { content:""; position:absolute; inset:-40px -64px -30px -56px; z-index:-1; pointer-events:none;
  background:radial-gradient(closest-side, rgb(4 6 9 / .72), rgb(4 6 9 / .5) 58%, transparent); }
${SL} .sf-save-ledger .sf-slot-context { ${LABEL} margin:0; font-size:max(10px, calc(11px * var(--sv))); letter-spacing:.18em; line-height:1.35; color:rgb(${BONE} / .7); }
${SL} .sf-save-ledger .sf-slot-card-title { all:unset; display:block; ${DISPLAY} margin:0; font-size:calc(44px * var(--sv)); line-height:.95; letter-spacing:.01em;
  color:rgb(246 241 230); text-shadow:0 2px 16px rgb(0 0 0 / .5); overflow-wrap:anywhere; cursor:default; }
${SL} .sf-save-ledger .sf-slot-card-title.sf-entity-link { cursor:pointer; border:0 !important; text-decoration:none !important; }
${SL} .sf-save-ledger .sf-slot-card-title.sf-entity-link:is(:hover, :focus-visible) { color:#fff; outline:none; text-shadow:0 0 18px rgb(255 236 200 / .28); }
${SL} .sf-save-ledger .sf-slot-detail { ${BODY} margin:0; max-width:44ch; font-weight:500; font-size:max(12.5px, calc(15.5px * var(--sv))); line-height:1.42; color:rgb(${BONE} / .9); }
${SL}[data-slot-state="empty"] .sf-save-ledger .sf-slot-detail, ${SL}[data-slot-state="open"] .sf-save-ledger .sf-slot-detail { color:rgb(${BONE} / .74); font-weight:400; }

/* the facts: credits as the one thin hero numeral; sector, played, saved as readings on a row */
${SL} .sf-ledger-facts { display:grid !important; grid-template-columns:repeat(3, minmax(0, auto)); justify-content:start; column-gap:calc(34px * var(--sv)); row-gap:calc(12px * var(--sv));
  margin:calc(6px * var(--sv)) 0 0 !important; padding:0 !important; background:none !important; }
${SL} .sf-ledger-fact { margin:0; min-width:0; }
${SL}[data-slot-state="empty"] .sf-ledger-facts { display:none !important; }
${SL} .sf-ledger-fact--figure { grid-column:1 / -1; }
${SL} .sf-ledger-fact dt { ${LABEL} font-size:max(10px, calc(10.5px * var(--sv))); letter-spacing:.18em; color:rgb(${BONE} / .66); }
${SL} .sf-ledger-fact dd { margin:calc(5px * var(--sv)) 0 0; ${BODY} font-weight:600; font-size:max(12.5px, calc(16px * var(--sv))); line-height:1.2; font-variant-numeric:tabular-nums;
  color:var(--dp-phos, rgb(223 238 255)); text-shadow:0 0 12px rgb(143 203 255 / .12); overflow-wrap:anywhere; }
${SL} .sf-ledger-fact--figure dd { display:flex; align-items:flex-end; gap:calc(10px * var(--sv)); margin-top:calc(2px * var(--sv)); }
${SL} .sf-fact-n { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-variation-settings:"wght" 250, "wdth" 100; font-weight:250;
  font-size:calc(76px * var(--sv)); line-height:.92; letter-spacing:-.02em; color:var(--dp-phos, rgb(223 238 255)); font-variant-numeric:tabular-nums lining-nums; }
${SL} .sf-fact-n.orr-counter { line-height:1; }
${SL} .sf-fact-u { ${LABEL} font-size:max(11.5px, calc(13px * var(--sv))); line-height:1; letter-spacing:.2em; color:rgb(${BONE} / .7); padding-bottom:calc(9px * var(--sv)); }
${SL} .sf-ledger-fact dd.is-blank, ${SL} .sf-ledger-fact dd.is-blank .sf-fact-n { color:rgb(${BONE} / .5); text-shadow:none; }

/* the hull's own record: a ledger of caps and values under a quiet head */
${SL} .sf-save-ledger .sf-save-portrait { display:flex; flex-direction:column; margin:calc(4px * var(--sv)) 0 0; padding:0; border:0 !important; }
${SL} .sf-ledger-head { display:flex; align-items:center; gap:12px; margin:0 0 calc(4px * var(--sv)); ${LABEL} font-size:max(10px, calc(10.5px * var(--sv))); letter-spacing:.18em; color:rgb(${BONE} / .66); }
${SL} .sf-ledger-head::after { content:""; flex:1; height:1px; background:linear-gradient(90deg, rgb(${BONE} / .28), rgb(${BONE} / 0)); }
${SL} .sf-ledger-line { display:grid; grid-template-columns:max(76px, calc(96px * var(--sv))) minmax(0, 1fr); align-items:baseline; gap:12px; padding:calc(4px * var(--sv)) 0; background:none !important; }
${SL} .sf-ledger-k { ${LABEL} font-size:max(10px, calc(10px * var(--sv))); letter-spacing:.16em; color:rgb(${BONE} / .62); }
${SL} .sf-ledger-line .k-sentence { ${BODY} margin:0; font-size:max(12.5px, calc(14px * var(--sv))); line-height:1.35; color:rgb(${BONE} / .84); }
${SL} .sf-ledger-line .k-sentence.sf-entity-link { cursor:pointer; padding:0; border:0 !important; background:none !important; text-decoration:none; color:rgb(${BONE} / .84); }
${SL} .sf-ledger-line .sf-entity-link:is(:hover, :focus-visible) { color:rgb(246 241 230); outline:none; text-decoration:underline 1px rgb(${BONE} / .5); text-underline-offset:3px; }

/* the save's verbs: LOAD is the one Lamp Key; the others are small verbs with their notch */
${SL} .sf-save-ledger .sf-save-actions { margin-top:calc(14px * var(--sv)); padding:0 !important; }
${SL} .sf-save-actions > .k-words { display:flex !important; flex-direction:row !important; flex-wrap:wrap; align-items:center; gap:calc(10px * var(--sv)) calc(30px * var(--sv)) !important;
  margin:0; padding:0; list-style:none; background:none !important; }
${SL} .sf-save-actions > .k-words > li { margin:0; padding:0; }
${SL} .sf-save-actions .k-word.orr-lampkey { font-size:max(12.5px, calc(15px * var(--sv))) !important; min-height:calc(44px * var(--sv)) !important; padding:0 calc(30px * var(--sv)) 0 calc(24px * var(--sv)) !important; }
${SL} .sf-save-actions .k-word.sf-save-verb { ${PLAIN} ${LABEL} display:inline-flex !important; align-items:center; min-height:0 !important; min-width:0 !important; height:auto !important; width:auto !important;
  padding:6px 0 !important; font-size:max(10px, calc(11px * var(--sv))) !important; letter-spacing:.18em !important; color:rgb(246 241 230) !important; text-shadow:0 1px 0 rgb(0 0 0 / .5); cursor:pointer; }
${SL} .sf-save-actions .k-word.sf-save-verb::after { display:none !important; content:none !important; }
${SL} .sf-save-actions .k-word.sf-save-verb::before { all:unset !important; content:"›" !important; margin-right:.7em !important; color:rgb(${BONE} / .6) !important; }
${SL} .sf-save-actions .k-word.sf-save-verb:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
${SL} .sf-save-actions .k-word.sf-save-verb--danger:is(:hover, :focus-visible) { color:var(--dp-danger-hot, #ff7a5c) !important; }

/* ---- the hull alone on the glass: no dock, no frame; a pool of shade under it ---- */
${SL} > .sf-save-stage { grid-area:stage; position:relative; min-height:0; margin:0; padding:0 !important; ${PLAIN} isolation:isolate; overflow:visible; }
${SL} > .sf-save-stage::before { content:""; position:absolute; left:4%; right:4%; top:8%; bottom:0; z-index:-2; pointer-events:none;
  background:radial-gradient(closest-side, rgb(4 6 9 / .78), rgb(4 6 9 / .5) 62%, transparent); }
/* the berth under the hull: a lit floor, a near rim with body, the hull's contact shadow */
${SL} > .sf-save-stage::after { content:""; position:absolute; left:12%; right:12%; top:66%; height:22%; z-index:-2; pointer-events:none;
  background:${BERTH_HULL} center / 100% 100% no-repeat; }
${SL} > .sf-save-stage.is-vacant::after { background:${BERTH_OPEN} center / 100% 100% no-repeat; }
${SL} > .sf-save-stage > :is(.k-stage__poster, .k-world--stage) { position:absolute !important; left:0 !important; right:auto !important; top:4% !important; bottom:auto !important;
  width:100% !important; height:90% !important; inset:auto; z-index:-1; }
${SL} > .sf-save-stage > .k-stage__poster { object-fit:contain; object-position:50% 50%; animation:sf-save-hull-ride 9s ease-in-out infinite alternate; }
/* a new hull lands on the berth: it drops in and settles (the strip's scrub flicks through them) */
${SL} > .sf-save-stage.is-landing > .k-stage__poster { animation:sf-save-land .62s cubic-bezier(.2, 1.3, .4, 1) both, sf-save-hull-ride 9s ease-in-out .62s infinite alternate; }
@keyframes sf-save-land { from { translate:0 -26px; opacity:.15; } to { translate:0 0; opacity:1; } }
/* the hull rides its berth: a slow breath on the compositor, still under reduced motion */
@keyframes sf-save-hull-ride { from { transform:translateY(0); } to { transform:translateY(-7px); } }
html.sf-reduce-motion ${SL} > .sf-save-stage > .k-stage__poster, html.sf-reduce-motion ${SL} > .sf-save-stage.is-landing > .k-stage__poster { animation:none; }
${SL} > .sf-save-stage > .sf-save-vacant { left:0 !important; right:0 !important; top:0; bottom:0; }
${SL} > .sf-save-stage > .sf-save-vacant .dp-mark { display:none; }
${SL} > .sf-save-stage > .sf-save-vacant::before { display:none; }
/* no hull on file: the word stands on the open berth's floor */
${SL} > .sf-save-stage > .sf-save-vacant > .sf-save-vacant__word { position:absolute; left:50%; top:76%; transform:translate(-50%, -50%); white-space:nowrap;
  ${LABEL} font-size:max(10.5px, calc(12px * var(--sv))); letter-spacing:.32em; color:rgb(${BONE} / .76); text-shadow:0 1px 0 rgb(0 0 0 / .6); }

/* ---- the filmstrip: frames on their stations along the rail ---- */
${SL} > .k-hang { grid-area:hang; position:relative; min-height:0; height:calc(214px * var(--sv)); margin:0; padding:0 !important; overflow:visible !important;
  -webkit-mask-image:none !important; mask-image:none !important; ${PLAIN} }
${SL} .orr-film__list > .k-row.sf-slot { display:grid !important; grid-template-columns:minmax(0, 1fr); grid-template-areas:"frame" "label" "num";
  column-gap:10px; row-gap:0; align-items:start; padding:0 !important; min-height:0 !important; height:auto !important; ${PLAIN}
  cursor:pointer; text-align:left; color:rgb(${BONE}); outline:none !important; }
${SL} .orr-film__list > .k-row.sf-slot::before, ${SL} .orr-film__list > .k-row.sf-slot::after { display:none !important; content:none !important; translate:none !important; scale:none !important; }
${SL} .orr-film__list > .k-row.sf-slot > div { grid-area:label; min-width:0; }
${SL} .orr-film__list > .k-row.sf-slot > .k-row__num { grid-area:num; justify-self:start; margin-top:calc(4px * var(--sv)); }
${SL} .sf-slot-frame { grid-area:frame; position:relative; display:block; height:calc(92px * var(--sv)); margin:0 0 calc(22px * var(--sv));
  background:${BERTH_STATION} center bottom / min(176px, 78%) max(26px, calc(32px * var(--sv))) no-repeat;
  transform-origin:50% 100%; opacity:.72; transition:transform .32s cubic-bezier(.2, 1.3, .4, 1), opacity .2s linear; }
${SL} .sf-slot-frame.is-empty { height:max(30px, calc(38px * var(--sv))); }
${SL} .sf-slot-frame > img { position:absolute; left:4%; top:0; width:92%; height:calc(100% - max(10px, calc(13px * var(--sv)))); object-fit:contain; object-position:50% 100%;
  opacity:.78; filter:saturate(.72) brightness(.86); transition:opacity .2s linear, filter .2s linear; pointer-events:none; user-select:none; }
${SL} .sf-slot-frame.is-filed::after { content:""; position:absolute; left:50%; top:38%; width:18px; height:18px; margin:-9px 0 0 -9px; border-radius:50%;
  box-shadow:inset 0 0 0 2px rgb(${BONE} / .42); }
/* Dock-rail: the slot under the Hand stands up, lit on its berth; the pointer lifts what it is over */
${SL} .orr-film__list > .k-row.sf-slot:hover .sf-slot-frame { opacity:1; transform:translateY(-5px); }
${SL} .orr-film__list > .k-row.sf-slot:hover .sf-slot-frame > img { opacity:1; }
${SL} .orr-film__list > .k-row.sf-slot[aria-selected="true"] .sf-slot-frame { opacity:1; transform:translateY(-4px) scale(1.08); }
${SL} .orr-film__list > .k-row.sf-slot[aria-selected="true"] .sf-slot-frame > img { opacity:1; filter:none; }
${SL} .orr-film__list > .k-row.sf-slot[aria-selected="true"] .sf-slot-frame::before { content:""; position:absolute; left:8%; right:8%; bottom:-10px; height:max(40px, calc(52px * var(--sv)));
  z-index:-1; pointer-events:none; background:radial-gradient(closest-side, rgb(255 244 222 / .2), rgb(255 244 222 / .07) 60%, transparent); }
html.sf-reduce-motion ${SL} .sf-slot-frame { transition:none; }
${SL} .orr-film__list .k-row__name.sf-slot-name { ${LABEL} display:inline; font-size:max(11.5px, calc(12px * var(--sv))) !important; letter-spacing:.14em !important; line-height:1.3;
  color:rgb(${BONE} / .86) !important; white-space:normal; overflow:visible; text-overflow:clip; text-shadow:0 1px 0 rgb(0 0 0 / .5); }
${SL} .orr-film__list .k-row.empty .k-row__name.sf-slot-name { color:rgb(${BONE} / .6) !important; }
${SL} .orr-film__list > .k-row[aria-selected="true"] .k-row__name.sf-slot-name { color:rgb(250 247 240) !important; }
${SL} .orr-film__list .sf-slot-badges { display:inline-flex; flex-wrap:wrap; gap:0 8px; margin-left:8px; vertical-align:1px; }
${SL} .orr-film__list .sf-slot-badges::before { content:"·"; color:rgb(${BONE} / .56); }
${SL} .orr-film__list .sf-slot-badge { ${LABEL} font-size:max(10px, calc(9.5px * var(--sv))); letter-spacing:.16em; color:rgb(${BONE} / .64) !important; text-shadow:none !important; }
${SL} .orr-film__list .sf-slot-badge--calm { display:none !important; }
${SL} .orr-film__list .sf-slot-badge--you { color:rgb(${BONE} / .86) !important; }
${SL} .orr-film__list .sf-slot-badge--foe { color:var(--dp-danger-hot, #ff7a5c) !important; }
${SL} .orr-film__list .k-row__sub.sf-slot-sub { ${BODY} margin-top:calc(3px * var(--sv)); font-size:max(11.5px, calc(12.5px * var(--sv))) !important; line-height:1.32; color:rgb(${BONE} / .7) !important;
  white-space:normal !important; overflow:visible !important; text-overflow:clip !important; overflow-wrap:anywhere; }
${SL} .orr-film__list .k-row.empty .k-row__sub.sf-slot-sub { color:rgb(${BONE} / .56) !important; }
${SL} .orr-film__list .k-row__num { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-variation-settings:"wght" 520, "wdth" 100; font-weight:520;
  font-size:max(11.5px, calc(13px * var(--sv))) !important; line-height:1.3; color:var(--dp-phos, rgb(223 238 255)) !important; text-shadow:none !important; white-space:nowrap; }

/* ---- the way back: words along the foot, no keys ---- */
${SL} > .k-foot { grid-area:foot; display:flex !important; flex-direction:row; align-items:center; gap:calc(34px * var(--sv)); margin:0; padding:0 !important; ${PLAIN} }
${SL} > .k-foot .k-word { ${PLAIN} ${LABEL} display:inline-flex !important; align-items:center; min-height:0 !important; min-width:0 !important; height:auto !important; width:auto !important;
  padding:6px 0 !important; margin:0 !important; font-size:max(10px, calc(11px * var(--sv))) !important; letter-spacing:.18em !important; color:rgb(246 241 230) !important; text-shadow:0 1px 0 rgb(0 0 0 / .5); }
${SL} > .k-foot .k-word:not(.sf-back)::before { all:unset !important; content:"›" !important; margin-right:.7em !important; color:rgb(${BONE} / .6) !important; }
${SL} > .k-foot .k-word:not(.sf-back)::after { display:none !important; content:none !important; }
${SL} > .k-foot .k-word.sf-back::before { display:none !important; content:none !important; }
${SL} > .k-foot .k-word.sf-back::after { content:"ESC" / "" !important; display:inline !important; min-width:0 !important; height:auto !important; padding:0 !important; margin-left:12px !important;
  ${LABEL} font-size:max(10px, calc(10px * var(--sv))) !important; letter-spacing:.16em !important; line-height:1 !important;
  color:rgb(${BONE} / .62) !important; background:none !important; border:0 !important; box-shadow:none !important; position:static !important; transform:none !important; opacity:1 !important; }
${SL} > .k-foot .k-word:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }

/* ---- a short screen: the reading tightens so the whole page stands above the foot ---- */
@media (max-height:820px) {
  ${SL} .sf-save-ledger .sf-slot-card-title { font-size:calc(38px * var(--sv)); }
  ${SL} .sf-fact-n { font-size:calc(58px * var(--sv)); }
  ${SL} .sf-ledger-facts { row-gap:calc(8px * var(--sv)); margin-top:0 !important; }
  ${SL} .sf-save-ledger .sf-save-portrait { margin-top:0; }
  ${SL} .sf-ledger-k { letter-spacing:.12em; white-space:nowrap; }
  ${SL} .sf-ledger-line { padding:calc(2px * var(--sv)) 0; }
  ${SL} .sf-ledger-line .k-sentence { font-size:max(12.5px, calc(13.5px * var(--sv))); line-height:1.3; }
  ${SL} > .k-stage__foot.sf-save-ledger { gap:5px; padding-top:0 !important; }
  ${SL} > .k-hang { height:calc(226px * var(--sv)); }
  ${SL} .sf-save-ledger .sf-save-actions { margin-top:4px; }
  ${SL} { row-gap:clamp(8px, 1.4vh, 30px) !important; padding-bottom:clamp(16px, 2.6vh, 84px) !important; }
}
@media (forced-colors: active) {
  ${SL} .sf-slot-frame { background:none; border:1px solid CanvasText; }
  ${SL} .orr-film__list > .k-row[aria-selected="true"] { outline:2px solid Highlight !important; }
}
`;


const GO = 'html body #screens > .k-screen.sf-gameover.orr-gameover.orr-gameover';
/** Light rays cooled to red: a dozen soft shafts at uneven bearings and weights (never a regular sunburst). */
const RAY_WEDGES = [[8, 2.4, .11], [31, 1.7, .07], [52, 3, .1], [79, 1.9, .065], [104, 2.6, .11], [131, 1.6, .06],
  [158, 3.2, .09], [190, 2.1, .075], [217, 2.8, .11], [248, 1.8, .065], [279, 3, .1], [318, 2.2, .085]];
const RAYS = 'conic-gradient(from 0deg, ' + RAY_WEDGES.map(([a, w, k]) =>
  `transparent ${(a - w * 1.6).toFixed(1)}deg, rgb(255 96 72 / ${k}) ${a}deg, transparent ${(a + w * 1.6).toFixed(1)}deg`).join(', ') + ')';
const GAME_OVER = `
/* ---- the report on the left, the career ring on the right; the rays behind both ---- */
${GO} { --sv:var(--k-s, 1); --r:calc(210px * var(--sv));
  padding:clamp(28px, 5.4vh, 112px) clamp(40px, 5vw, 128px) clamp(20px, 3.4vh, 72px) !important;
  grid-template-columns:minmax(0, 1fr) auto !important;
  grid-template-rows:minmax(0, 1.5fr) auto auto auto minmax(0, .5fr) auto !important;
  grid-template-areas:". recap" "title recap" "stage recap" "foot recap" ". recap" "tape tape" !important;
  column-gap:clamp(32px, 4vw, 110px) !important; row-gap:calc(24px * var(--sv)) !important; }
${GO}.k-screen::before { background:
    radial-gradient(80% 64% at 22% 36%, rgb(118 22 12 / .3), transparent 64%),
    linear-gradient(180deg, rgb(4 5 8 / .8), rgb(4 5 8 / .93)) !important; }
/* light rays cooled to red: two drifting ray fields of unequal period (never a regular sunburst) */
${GO} > .orr-go-rays { position:absolute; left:22%; top:34%; width:260vmax; height:260vmax; margin:-130vmax 0 0 -130vmax; z-index:-1; pointer-events:none;
  background:${RAYS};
  -webkit-mask-image:radial-gradient(circle at 50% 50%, rgb(0 0 0 / .2) 0, #000 6vmax, rgb(0 0 0 / .7) 22vmax, rgb(0 0 0 / .25) 44vmax, transparent 64vmax);
  mask-image:radial-gradient(circle at 50% 50%, rgb(0 0 0 / .2) 0, #000 6vmax, rgb(0 0 0 / .7) 22vmax, rgb(0 0 0 / .25) 44vmax, transparent 64vmax);
  animation:orr-go-rays 300s linear infinite; }
@keyframes orr-go-rays { to { transform:rotate(360deg); } }
html.sf-reduce-motion ${GO} > .orr-go-rays { animation:none; }

/* the verdict: a red kicker, then the cause as the headline in bone */
${GO} > .k-title { grid-area:title; align-self:end; margin:0; padding:0 !important; border:0 !important; max-width:min(1040px, 100%); }
${GO} > .k-title .k-caps { display:flex !important; align-items:center; gap:14px; margin:0 0 calc(14px * var(--sv)) !important; ${LABEL}
  font-size:max(10px, calc(11.5px * var(--sv))) !important; letter-spacing:.26em !important; color:var(--dp-danger-hot, #ff7a5c) !important; text-shadow:0 0 14px rgb(255 80 56 / .35) !important; }
${GO} > .k-title .k-caps::before { content:""; width:calc(34px * var(--sv)); height:2px; background:var(--dp-danger, #ff5038); box-shadow:0 0 8px rgb(255 80 56 / .6); }
${GO} > .k-title .k-t-title { ${DISPLAY} display:block !important; margin:0 !important; padding:0 !important; max-width:17ch; text-wrap:balance;
  font-size:calc(66px * var(--sv)) !important; line-height:.94 !important; letter-spacing:.005em !important;
  color:rgb(246 241 230) !important; -webkit-text-fill-color:currentColor; background:none !important; text-shadow:0 2px 22px rgb(0 0 0 / .55) !important; }
${GO} > .k-title .k-sentence { ${BODY} margin:calc(16px * var(--sv)) 0 0 !important; max-width:64ch; font-size:max(12.5px, calc(15.5px * var(--sv))) !important; line-height:1.45; color:rgb(${BONE} / .86) !important; }
${GO} > .k-title .sf-go-sub { margin-top:calc(6px * var(--sv)) !important; color:rgb(${BONE} / .74) !important; }

/* the recovery receipt as readings: no panel */
${GO} > .k-stage { grid-area:stage; align-self:start; width:auto !important; max-width:min(1040px, 100%) !important; margin:0; padding:0 !important; ${PLAIN} }
${GO} .sf-go-grid { display:flex !important; flex-wrap:wrap !important; gap:calc(14px * var(--sv)) calc(52px * var(--sv)) !important; margin:0 0 calc(16px * var(--sv)) !important; padding:0 !important; background:none !important; }
${GO} .sf-go-grid .k-hero { display:flex; flex-direction:column-reverse; gap:calc(6px * var(--sv)); margin:0; padding:0; min-width:0; }
${GO} .sf-go-grid .k-hero[hidden] { display:none; }
${GO} .sf-go-grid .k-hero__n { ${BODY} font-weight:600 !important; font-size:calc(21px * var(--sv)) !important; line-height:1.15 !important; letter-spacing:0 !important;
  color:var(--dp-phos, rgb(223 238 255)) !important; text-shadow:0 0 12px rgb(143 203 255 / .14) !important; }
${GO} .sf-go-grid .k-hero__n.sf-entity-link { all:unset; ${BODY} font-weight:600; font-size:calc(21px * var(--sv)); line-height:1.15; color:var(--dp-phos, rgb(223 238 255)); cursor:pointer; }
${GO} .sf-go-grid .k-hero__n.sf-entity-link:is(:hover, :focus-visible) { color:#fff; outline:none; text-decoration:underline 1px rgb(${BONE} / .5); text-underline-offset:4px; }
${GO} .sf-go-grid .k-hero__w { ${LABEL} font-size:max(10px, calc(10.5px * var(--sv))) !important; letter-spacing:.18em !important; color:rgb(${BONE} / .66) !important; }
${GO} > .k-stage > .k-sentence { ${BODY} margin:calc(4px * var(--sv)) 0 0 !important; font-size:max(12.5px, calc(14px * var(--sv))) !important; line-height:1.45; color:rgb(${BONE} / .76) !important; max-width:70ch; }
${GO} > .k-stage > .sf-go-recovery { max-width:70ch !important; }
${GO} > .k-stage > .sf-go-recovery.is-receipt { position:absolute !important; width:1px !important; height:1px !important; overflow:hidden !important; clip-path:inset(50%) !important; white-space:nowrap !important; margin:0 !important; }
${GO} > .k-stage .sf-entity-link { all:unset; color:rgb(246 241 230); cursor:pointer; }

/* restore is the Lamp Key; the other routes are small verbs */
${GO} > .k-foot.sf-go-foot { grid-area:foot; align-self:start; display:flex !important; margin:calc(6px * var(--sv)) 0 0; padding:0 !important; ${PLAIN} }
${GO} .sf-go-foot > .k-words { display:flex !important; flex-direction:row !important; flex-wrap:wrap; align-items:center; gap:calc(12px * var(--sv)) calc(34px * var(--sv)) !important; margin:0; padding:0; background:none !important; }
${GO} .sf-go-foot > .k-words > li { margin:0; padding:0; }
${GO} .sf-go-foot > .k-words > li[hidden] { display:none !important; }
${GO} .sf-go-foot .k-word.orr-lampkey { font-size:max(12.5px, calc(15px * var(--sv))) !important; min-height:calc(46px * var(--sv)) !important; padding:0 calc(32px * var(--sv)) 0 calc(24px * var(--sv)) !important; }
${GO} .sf-go-foot .k-word.sf-go-verb { ${PLAIN} ${LABEL} display:inline-flex !important; align-items:center; min-height:0 !important; min-width:0 !important; height:auto !important; width:auto !important;
  padding:6px 0 !important; font-size:max(10px, calc(11px * var(--sv))) !important; letter-spacing:.18em !important; color:rgb(246 241 230) !important; text-shadow:0 1px 0 rgb(0 0 0 / .5); }
${GO} .sf-go-foot .k-word.sf-go-verb::after { display:none !important; content:none !important; }
${GO} .sf-go-foot .k-word.sf-go-verb::before { all:unset !important; content:"›" !important; margin-right:.7em !important; color:rgb(${BONE} / .6) !important; }
${GO} .sf-go-foot .k-word.sf-go-verb:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }

/* ---- the career ring: the figures on stations round the rim, time flown at the hub ---- */
${GO} > .sf-go-recap { grid-area:recap; align-self:end; position:relative; box-sizing:border-box; margin:0 !important; padding:0 !important; ${PLAIN}
  width:calc(var(--r) * 2 + 330px * var(--sv)); height:calc(var(--r) * 2 + 150px * var(--sv)); }
${GO} > .sf-go-recap::before { content:""; position:absolute; left:50%; top:50%; width:calc(var(--r) * 3.2); height:calc(var(--r) * 3.2); transform:translate(-50%, -50%); z-index:-1; pointer-events:none;
  border-radius:50%; background:radial-gradient(closest-side, rgb(4 6 9 / .78), rgb(4 6 9 / .5) 62%, transparent); }
${GO} .sf-go-recap__title { position:absolute; left:0; right:0; top:0; margin:0 !important; text-align:center; ${LABEL}
  font-size:max(10px, calc(10.5px * var(--sv))) !important; letter-spacing:.3em !important; color:rgb(${BONE} / .7) !important; }
${GO} .sf-go-ring { position:absolute; left:50%; top:50%; width:calc(var(--r) * 2.4); height:calc(var(--r) * 2.4); transform:translate(-50%, -50%); pointer-events:none; }
${GO} .sf-go-ring__svg { width:100%; height:100%; overflow:visible; display:block; }
${GO} .sf-go-ring__ticks { fill:none; stroke:rgb(${BONE} / .42); stroke-width:1.4; vector-effect:non-scaling-stroke; }
${GO} .sf-go-ring__majors { fill:none; stroke:rgb(${BONE} / .72); stroke-width:2.4; stroke-linecap:round; vector-effect:non-scaling-stroke; }
${GO} .sf-go-ring__majors-bloom { fill:none; stroke:rgb(${BONE} / .15); stroke-width:7; stroke-linecap:round; vector-effect:non-scaling-stroke; }
${GO} .sf-go-ring__band { fill:rgb(${BONE} / .07); stroke:none; }
${GO} .sf-go-ring__track { fill:none; stroke:rgb(${BONE} / .26); stroke-width:2; vector-effect:non-scaling-stroke; }
${GO} .sf-go-ring__inner { fill:none; stroke:rgb(${BONE} / .16); stroke-width:1.5; vector-effect:non-scaling-stroke; }
${GO} .sf-go-ring__career { fill:none; stroke:rgb(246 241 230 / .9); stroke-width:1.7; stroke-linecap:round; }
${GO} .sf-go-ring__bloom { fill:none; stroke:rgb(255 236 200 / .16); stroke-width:5.6; stroke-linecap:round; }
${GO} .sf-go-ring__lost { fill:none; stroke:var(--dp-danger, #ff5038); stroke-width:2.2; stroke-linecap:butt; }
${GO} .sf-go-ring__lost-bloom { fill:none; stroke:rgb(255 80 56 / .3); stroke-width:6.6; }
/* the black box's bead on the red arc, while the tape is scrubbed */
${GO} .sf-go-ring__bead { transition:opacity .18s linear; }
${GO} .sf-go-ring__bead-glow { fill:rgb(255 244 222 / .28); }
${GO} .sf-go-ring__bead-core { fill:rgb(250 247 240); }
${GO} > .sf-go-recap:not(.is-scrubbing) .sf-go-ring__bead { opacity:0; }
/* the hub's reading while the tape is scrubbed: the time into the sortie, the moment's word */
${GO} .sf-go-hubscrub { position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); display:flex; flex-direction:column; align-items:center; gap:calc(8px * var(--sv));
  opacity:0; transition:opacity .16s linear; text-align:center; white-space:nowrap; }
${GO} .sf-go-hubscrub__t { font-family:var(--dp-face-numeral, "Archivo"); font-weight:250; font-variation-settings:"wght" 250, "wdth" 100; font-size:calc(46px * var(--sv)); line-height:1;
  color:var(--dp-phos, rgb(223 238 255)); font-variant-numeric:tabular-nums; }
${GO} .sf-go-hubscrub__w { ${LABEL} font-size:max(10px, calc(10.5px * var(--sv))); letter-spacing:.2em; color:rgb(${BONE} / .78); }
${GO} > .sf-go-recap.is-scrubbing .sf-go-hubscrub { opacity:1; }
${GO} > .sf-go-recap.is-scrubbing .sf-go-st--hub { visibility:hidden; }
${GO} .sf-go-ring__stop { fill:none; stroke:var(--dp-danger-hot, #ff7a5c); stroke-width:3; stroke-linecap:round; vector-effect:non-scaling-stroke; }
/* the lost hull at the hub: its produced plan view, cooled and dimmed under the time flown */
${GO} .sf-go-ring__hull { position:absolute; left:50%; top:50%; width:58%; height:58%; transform:translate(-50%, -50%); object-fit:contain; pointer-events:none;
  opacity:calc(.26 + .5 * var(--life-left, 0)); filter:grayscale(1) sepia(1) saturate(3.4) hue-rotate(-38deg) brightness(.6); transition:opacity .12s linear; }
/* a pulse runs once round the career when the report arrives, and stops at the loss */
${GO} .sf-go-ring__sweep { fill:none; stroke:var(--dp-ice, #8fcbff); stroke-width:1.5; stroke-linecap:round; stroke-dasharray:.08 1.1; stroke-dashoffset:.08; opacity:0;
  filter:drop-shadow(0 0 4px rgb(143 203 255 / .8)); animation:sf-go-sweep 1.6s cubic-bezier(.35, .05, .25, 1) .5s both; }
@keyframes sf-go-sweep { 0% { stroke-dashoffset:.08; opacity:1; } 92% { opacity:1; } 100% { stroke-dashoffset:-1; opacity:0; } }
/* the stations arrive one by one round the rim */
${GO} .sf-go-st { animation:sf-go-st-in .5s var(--dp-ease-out, ease-out) both; animation-delay:calc(260ms + var(--i, 0) * 70ms); }
@keyframes sf-go-st-in { from { opacity:0; } to { opacity:1; } }
html.sf-reduce-motion ${GO} .sf-go-ring__sweep { display:none; }
html.sf-reduce-motion ${GO} .sf-go-st { animation:none; }
${GO} .sf-go-recap__rows { position:absolute; inset:0; margin:0 !important; padding:0 !important; display:block !important; background:none !important; }
${GO} .sf-go-st { position:absolute; margin:0; display:flex; flex-direction:column; gap:calc(4px * var(--sv)); white-space:nowrap;
  left:calc(50% + var(--sx, 0) * (var(--r) + 26px * var(--sv))); top:calc(50% + var(--sy, 0) * (var(--r) + 26px * var(--sv))); transform:translate(-50%, -50%); }
${GO} .sf-go-st[data-side="right"] { transform:translate(0, -50%); text-align:left; align-items:flex-start; }
${GO} .sf-go-st[data-side="left"] { transform:translate(-100%, -50%); text-align:right; align-items:flex-end; }
${GO} .sf-go-st > :is(dt, dd) { margin:0 !important; padding:0 !important; background:none !important; border:0 !important; }
${GO} .sf-go-st .sf-go-recap__k { ${LABEL} font-size:max(10px, calc(10px * var(--sv))) !important; letter-spacing:.2em !important; color:rgb(${BONE} / .68) !important; }
${GO} .sf-go-st .sf-go-recap__v { display:flex; align-items:baseline; gap:6px; font-family:var(--dp-face-numeral, "Archivo") !important; font-stretch:100%; font-variation-settings:"wght" 300, "wdth" 100 !important;
  font-weight:300 !important; font-size:calc(27px * var(--sv)) !important; line-height:1 !important; letter-spacing:-.01em; text-align:inherit !important;
  color:var(--dp-phos, rgb(223 238 255)) !important; font-variant-numeric:tabular-nums; }
${GO} .sf-go-st .sf-go-u { ${LABEL} font-size:max(10px, calc(10.5px * var(--sv))); letter-spacing:.16em; color:rgb(${BONE} / .66); }
${GO} .sf-go-st--lost .sf-go-recap__k { color:var(--dp-danger-hot, #ff7a5c) !important; }
${GO} .sf-go-st--lost .sf-go-recap__v { color:rgb(246 241 230) !important; }
${GO} .sf-go-st--hub { left:50%; top:50%; transform:translate(-50%, -50%); flex-direction:column-reverse; align-items:center; text-align:center; gap:calc(8px * var(--sv)); }
${GO} .sf-go-st--hub .sf-go-recap__v { font-variation-settings:"wght" 250, "wdth" 100 !important; font-weight:250 !important; font-size:calc(46px * var(--sv)) !important; }
${GO} > .sf-go-recap.is-blank .sf-go-st:not(.sf-go-st--hub) { position:absolute !important; width:1px !important; height:1px !important; overflow:hidden !important; clip-path:inset(50%) !important; }
${GO} > .sf-go-recap.is-blank .sf-go-st--hub .sf-go-recap__v { ${LABEL} font-size:max(11px, calc(13px * var(--sv))) !important; letter-spacing:.3em !important; color:rgb(${BONE} / .7) !important; }
${GO} > .sf-go-recap.is-blank .sf-go-st--hub .sf-go-recap__k { color:rgb(${BONE} / .56) !important; }

/* ---- the black box along the foot ---- */
${GO} > .sf-go-tape { grid-area:tape; position:relative; height:max(122px, calc(150px * var(--sv))); margin:0; padding:0; }
${GO} > .sf-go-tape::before { content:""; position:absolute; inset:-18px -40px -10px; z-index:-1; pointer-events:none;
  background:radial-gradient(60% 100% at 50% 50%, rgb(4 5 8 / .55), rgb(4 5 8 / .25) 70%, transparent); }
${GO} > .sf-go-tape:focus-visible { outline:none; }
${GO} > .sf-go-tape:focus-visible .orr-tape__band { fill:rgb(${BONE} / .16); }
@media (max-width:1100px) {
  ${GO} { grid-template-columns:minmax(0, 1fr) !important; grid-template-areas:"title" "stage" "foot" "recap" "tape" !important; grid-template-rows:auto auto auto auto auto !important; overflow:auto; }
  ${GO} > .sf-go-recap { justify-self:center; }
}
@media (forced-colors: active) {
  ${GO} > .orr-go-rays, ${GO} .sf-go-ring { display:none; }
  ${GO} .sf-go-recap__rows, ${GO} .sf-go-st { position:static; transform:none; }
}
`;

export const SAVE_LAYOUT_CSS = SAVE_LOAD + GAME_OVER;

export function injectSaveLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = SAVE_LAYOUT_CSS;
  doc.head.appendChild(style);
}
