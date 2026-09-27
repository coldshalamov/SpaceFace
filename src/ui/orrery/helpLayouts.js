// ORRERY composition for Help (design/frontend/ORRERY.md §6 Meta).
//
// The frame: HELP and its profile line; the six sections on a ladder (a ruled spine, a tick per word,
// the notched Hand on the open one -- warm bone, because the one amber on this screen belongs to the
// instrument on the stage); the stage; Close as a word with its key glyph. Then the grammar the tabs
// share: a Ladder of choices (one spine, ticks, the Hand), a reading that stands on a pool of shade
// (its kicker, its name, a ledger of terms), and the search field as a lit rule. No box, no card, no
// table rule. It styles the screen's own nodes (checks read .sf-tab, .sf-help-now, .sf-lc__search).
import { injectOrrery } from './tokens.js';
import { SCROLL_EXTENT_CSS } from './scrollExtent.js';

const STYLE_ID = 'sf-orrery-help-layouts';
const H = 'html body #screens > .k-screen.of-help.orr-help';
const BONE = '236 230 216';
const HOT = '248 244 234';
const LABEL = 'font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650 !important; font-weight:650 !important; text-transform:uppercase !important;';
const PLAIN = 'background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; outline:none !important; border-radius:0 !important;';
const HAND = 'clip-path:polygon(0 0, 100% 50%, 0 100%, 30% 50%) !important;';
// WEIGHT: a spine is a 2px line over a 7px band of bone .27 (measured ~2:1 on the glass).
const SPINE = `linear-gradient(90deg, transparent 7px, rgb(${BONE} / .55) 7px, rgb(${BONE} / .55) 9px, transparent 9px) 0 0 / 100% 100% no-repeat,
    linear-gradient(90deg, transparent 4.5px, rgb(${BONE} / .3) 4.5px, rgb(${BONE} / .3) 11.5px, transparent 11.5px) 0 0 / 100% 100% no-repeat,
    repeating-linear-gradient(180deg, rgb(${BONE} / .34) 0 1.5px, transparent 1.5px 8px) 2px 0 / 5px 100% no-repeat`;

const CSS = `
/* ------------------------------------------------ the frame ------------------------------------ */
${H} { grid-template-columns:clamp(172px, 12.2vw, 300px) minmax(0, 1fr) !important; grid-template-rows:auto minmax(0, 1fr) auto !important;
  grid-template-areas:"title title" "hang stage" "foot stage" !important;
  padding:clamp(34px, 5.4vh, 76px) 5vw clamp(30px, 4.6vh, 64px) !important;
  column-gap:clamp(26px, 3vw, 64px) !important; row-gap:clamp(14px, 3vh, 40px) !important; }
${H}::before { background:radial-gradient(120% 100% at 30% 40%, rgb(5 7 10 / .9), rgb(5 7 10 / .76) 55%, rgb(5 7 10 / .58)) !important; }
${H} > .k-title { align-self:end; margin:0 !important; padding:0 !important; border:0 !important; }
${H} > .k-title .k-t-title { margin:0 !important; }
${H} > .k-title > .sf-help-now { ${LABEL} margin:12px 0 0 !important; font-size:clamp(12px, .62vw, 16px) !important; letter-spacing:.26em !important; color:rgb(${BONE} / .66) !important;
  display:flex; align-items:center; gap:14px; }
${H}:not([data-tab="controls"]) > .k-title > .sf-help-now { visibility:hidden; }
${H} > .k-title > .sf-help-now::after { content:""; width:72px; height:1.5px; background:linear-gradient(90deg, rgb(${BONE} / .5), rgb(${BONE} / 0)); }

/* ------------------------------------------------ the section ladder --------------------------- */
${H} > .k-hang { ${PLAIN} overflow:visible !important; padding:0 !important; margin:0 !important; align-self:start; max-height:none !important; }
${H} .orr-help__tabs { ${PLAIN} position:relative !important; display:flex !important; flex-direction:column !important; gap:0 !important; margin:0 !important; padding:6px 0 !important;
  counter-reset:orrhelp; background:${SPINE} !important; }
${H} .orr-help__tabs > li { position:relative !important; counter-increment:orrhelp; width:100% !important; list-style:none !important; margin:0 !important; }
${H} .orr-help__tabs > li::before { content:counter(orrhelp, decimal-leading-zero); position:absolute; left:40px; top:50%; transform:translateY(-50%); pointer-events:none;
  ${LABEL} font-size:clamp(12px, .6vw, 15px); letter-spacing:.14em; color:rgb(${BONE} / .66); font-variant-numeric:tabular-nums; }
${H} .orr-help__tabs > li:has(> .sf-tab[aria-selected="true"])::before { color:rgb(${HOT}); }
${H} .orr-help__tabs .sf-tab { all:unset !important; box-sizing:border-box !important; position:relative !important; display:flex !important; align-items:center !important;
  width:100% !important; min-height:clamp(38px, 4.8vh, 50px) !important; padding:0 6px 0 72px !important; cursor:pointer !important; ${LABEL} font-size:clamp(13px, .68vw, 17px) !important;
  letter-spacing:.2em !important; color:rgb(${BONE} / .72) !important; white-space:nowrap !important; transition:color .16s linear; }
${H} .orr-help__tabs .sf-tab::before { content:"" !important; display:block !important; position:absolute !important; left:4px !important; top:50% !important; width:9px !important;
  height:2px !important; margin:-1px 0 0 !important; translate:none !important; scale:none !important; transform:none !important; background:rgb(${BONE} / .6) !important;
  box-shadow:none !important; border:0 !important; clip-path:none !important; border-radius:0 !important; opacity:1 !important; }
${H} .orr-help__tabs .sf-tab::after { content:none !important; display:none !important; }
${H} .orr-help__tabs .sf-tab:is(:hover, :focus-visible) { color:rgb(255 255 255) !important; }
${H} .orr-help__tabs .sf-tab:focus-visible:not([aria-selected="true"])::before { left:6px !important; width:3px !important; height:20px !important; margin-top:-10px !important;
  background:rgb(255 255 255) !important; box-shadow:0 0 8px rgb(255 250 236 / .55) !important; }
${H} .orr-help__tabs .sf-tab[aria-selected="true"] { color:rgb(255 255 255) !important; text-shadow:0 0 16px rgb(255 250 236 / .22); }
/* the Hand, in warm bone: a stem off the spine and a notched chevron at the word */
${H} .orr-help__tabs .sf-tab[aria-selected="true"]::after { content:"" !important; display:block !important; position:absolute !important; left:8px !important; top:50% !important;
  width:22px !important; height:2px !important; margin:-1px 0 0 !important; background:rgb(${HOT} / .9) !important; translate:none !important; scale:none !important;
  transform:none !important; border:0 !important; border-radius:0 !important; clip-path:none !important; box-shadow:none !important; opacity:1 !important; }
${H} .orr-help__tabs .sf-tab[aria-selected="true"]::before { left:29px !important; width:10px !important; height:12px !important; margin-top:-6px !important; ${HAND}
  background:rgb(${HOT}) !important; filter:drop-shadow(0 0 6px rgb(255 250 236 / .5)); }
/* on Controls the stage has no Hand of its own, so the open tab's Hand is the screen's one amber */
${H}[data-tab="controls"] .orr-help__tabs .sf-tab[aria-selected="true"]::after { background:var(--dp-hand, #f2b950) !important; }
${H}[data-tab="controls"] .orr-help__tabs .sf-tab[aria-selected="true"]::before { background:var(--dp-hand-hot, #ffd98c) !important; filter:drop-shadow(0 0 7px rgb(255 217 140 / .7)); }
${H} .orr-help__tabs .sf-tab[aria-selected="true"]:focus-visible { text-decoration:underline 2px rgb(255 255 255 / .8); text-underline-offset:7px; }

/* ------------------------------------------------ the foot: Close + its key -------------------- */
${H} > .k-foot { ${PLAIN} align-self:end; justify-content:flex-start; gap:0 !important; margin:0 !important; padding:0 !important; }
${H} .orr-help__close.sf-back.k-word { all:unset !important; box-sizing:border-box !important; display:inline-flex !important; align-items:center !important; gap:14px !important;
  cursor:pointer !important; padding:8px 0 !important; min-height:44px !important; }
${H} .orr-help__close.sf-back.k-word::before { content:none !important; display:none !important; }
${H} .orr-help__close.sf-back.k-word::after { content:none !important; display:none !important; }
${H} .orr-help__close-word { font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-variation-settings:"wdth" 125, "wght" 800; font-weight:800;
  font-size:clamp(18px, .94vw, 24px); letter-spacing:.16em; text-transform:uppercase; color:rgb(${HOT}); transition:color .16s linear; }
${H} .orr-help__close:is(:hover, :focus-visible) .orr-help__close-word { color:rgb(255 255 255); text-shadow:0 0 18px rgb(255 250 236 / .35); }
${H} .orr-help__close:focus-visible .orr-hkey::after { background:rgb(255 255 255); left:-5px; right:-5px; }

/* ------------------------------------------------ a key glyph (the letter over a bar of light) - */
.orr-hkey { position:relative; display:inline-flex; align-items:baseline; justify-content:center; gap:6px; flex:none; min-width:20px; padding:0 3px 8px;
  font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 560; font-weight:560; font-size:clamp(17px, .9vw, 22px); line-height:1;
  letter-spacing:.02em; color:rgb(${HOT}); white-space:nowrap; text-transform:none; }
.orr-hkey::before { content:""; position:absolute; left:-3px; right:-3px; bottom:0; height:8px; border-radius:4px; background:rgb(${HOT} / .13); }
.orr-hkey::after { content:""; position:absolute; left:0; right:0; bottom:2.5px; height:2px; border-radius:2px; background:rgb(${HOT} / .74); transition:background .16s linear, left .2s, right .2s; }
.orr-hkey--word { ${LABEL} font-size:clamp(12px, .62vw, 16px) !important; letter-spacing:.14em; }
.orr-hkey--small { font-size:clamp(14px, .73vw, 18px); padding-bottom:7px; }
.orr-hkey--small.orr-hkey--word { font-size:clamp(12px, .6vw, 15px) !important; }
.orr-hkey__sep { color:rgb(${BONE} / .6); font-weight:400; }
/* a binding that is a sentence, not a key, reads as a quiet line */
.orr-hkey--text { padding:0; font-family:var(--dp-face-body, "Instrument Sans"), system-ui, sans-serif; font-variation-settings:normal; font-weight:500; font-size:clamp(13px, .68vw, 17px);
  letter-spacing:0; color:rgb(${BONE} / .8); white-space:normal; text-align:right; justify-content:flex-end; }
.orr-hkey--text::before, .orr-hkey--text::after { content:none; }
.orr-hkey--none { color:rgb(${BONE} / .66); }
.orr-hkey--none::before { content:none; }
.orr-hkey--none::after { background:rgb(${BONE} / .3); left:30%; right:30%; }

/* ------------------------------------------------ the stage ------------------------------------ */
${H} > .orr-help__stage { ${PLAIN} grid-area:stage; position:relative; min-height:0 !important; height:100%; overflow:visible !important; padding:0 !important; margin:0 !important; max-width:none !important; }

/* CONTROLS: the rig and the ladder of every key */
${H} .orr-help-controls { position:relative; display:grid; grid-template-columns:minmax(0, 1fr) clamp(236px, 19vw, 430px); column-gap:clamp(20px, 2.4vw, 56px); height:100%; min-height:0; }
${H} .orr-help-controls__rig { position:relative; min-width:0; min-height:0; }
${H} .orr-hreg { position:relative; display:flex; flex-direction:column; min-height:0; height:100%; }
${H} .orr-hreg__head { display:flex; flex-direction:column; gap:10px; padding:0 0 12px 0; }
${H} .orr-hreg__title { margin:0; font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-variation-settings:"wdth" 125, "wght" 800; font-weight:800; font-size:clamp(16px, 1.25vw, 22px);
  letter-spacing:.12em; text-transform:uppercase; color:rgb(${HOT}); }
${H} .orr-hreg__secs { display:flex; gap:clamp(8px, 1vw, 22px); flex-wrap:nowrap; padding-bottom:14px;
  background:linear-gradient(rgb(${BONE} / .5) 0 0) 0 calc(100% - 4px) / 100% 2px no-repeat, linear-gradient(rgb(${BONE} / .12) 0 0) 0 calc(100% - 1.5px) / 100% 7px no-repeat; }
${H} .orr-hreg__secword { all:unset; box-sizing:border-box; cursor:pointer; position:relative; padding:3px 0 4px; ${LABEL} font-size:clamp(12px, .6vw, 15px) !important; letter-spacing:.18em; color:rgb(${BONE} / .72); }
${H} .orr-hreg__secword::after { content:""; position:absolute; left:50%; bottom:-12px; width:2px; height:9px; margin-left:-1px; background:rgb(${BONE} / .6); }
${H} .orr-hreg__secword[aria-current="true"] { color:rgb(${HOT}); }
${H} .orr-hreg__secword[aria-current="true"]::after { width:9px; height:9px; margin-left:-4.5px; bottom:-14px; border-radius:50%; background:rgb(${HOT}); box-shadow:0 0 8px rgb(255 244 222 / .55); }
${H} .orr-hreg__secword:is(:hover, :focus-visible) { color:rgb(255 255 255); outline:none; }
${H} .orr-hreg__secword:focus-visible::after { background:rgb(255 255 255); height:12px; }
${H} .orr-hreg__pad { display:none; padding:6px 0 0; }
${H} .orr-hreg__pad.is-pad { display:block; }
${H} .orr-hreg__pad > svg { display:block; margin:0 auto; max-width:100%; height:auto; }
/* a binding that is a sentence runs under its verb, not beside it */
${H} .orr-hreg__row:has(> .orr-hkey--text) { grid-template-columns:minmax(0, 1fr); row-gap:3px; }
${H} .orr-hreg__row.orr-hreg__row > .orr-hkey--text { justify-self:start; text-align:left; justify-content:flex-start; max-width:none; color:rgb(236 230 216 / .74); }
${H} .orr-hreg__scroll { position:relative; flex:1 1 auto; min-height:0; overflow:hidden auto; scrollbar-width:none; padding:0 10px 18px 0; outline:none;
  -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 40px), transparent); mask-image:linear-gradient(180deg, #000 calc(100% - 40px), transparent); }
${H} .orr-hreg__scroll[data-overflow="0"] { -webkit-mask-image:none; mask-image:none; }
${H} .orr-hreg__scroll::-webkit-scrollbar { display:none; }
${H} .orr-hreg__scroll:focus-visible .orr-hreg__list { background-color:rgb(${HOT} / .03); }
${H} .orr-hreg__list { list-style:none; margin:0; padding:2px 0 8px; background:${SPINE}; }
${H} .orr-hreg__sec { position:relative; margin:0; padding:18px 0 8px 30px; ${LABEL} font-size:clamp(12px, .6vw, 15px) !important; letter-spacing:.24em; color:rgb(${HOT}); }
${H} .orr-hreg__sec:first-child { padding-top:4px; }
${H} .orr-hreg__sec::before { content:""; position:absolute; left:2px; bottom:14px; width:16px; height:2px; background:rgb(${HOT} / .9); }
${H} .orr-hreg__row { position:relative; display:grid; grid-template-columns:minmax(0, 1fr) auto; align-items:center; column-gap:14px; padding:5px 0 5px 30px; min-height:clamp(32px, 1.7vw, 42px); box-sizing:border-box; }
${H} .orr-hreg__row::before { content:""; position:absolute; left:4px; top:50%; width:8px; height:2px; margin-top:-1px; background:rgb(${BONE} / .55); transition:width .16s, background .16s; }
${H} .orr-hreg__name { font-family:var(--dp-face-body, "Instrument Sans"), system-ui, sans-serif; font-size:clamp(14px, .73vw, 18px); line-height:1.3; color:rgb(${BONE} / .84); }
${H} .orr-hreg__row .orr-hkey { justify-self:end; max-width:210px; }
${H} .orr-hreg__row.is-echo::before { width:20px; background:rgb(255 255 255); box-shadow:0 0 8px rgb(143 203 255 / .8); }
${H} .orr-hreg__row.is-echo .orr-hreg__name { color:rgb(255 255 255); }
${H} .orr-hreg__row.is-echo .orr-hkey { color:rgb(255 255 255); text-shadow:0 0 12px rgb(143 203 255 / .9); }
${H} .orr-hreg__row.is-echo .orr-hkey::after { background:rgb(255 255 255); left:-4px; right:-4px; }
${H} .orr-hreg__row.is-echo .orr-hkey::before { background:rgb(143 203 255 / .34); }
${H} .orr-hreg__fine { margin:10px 0 0; padding-left:30px; font-family:var(--dp-face-body, "Instrument Sans"), system-ui, sans-serif; font-size:clamp(12px, .6vw, 15px); line-height:1.4; color:rgb(${BONE} / .7); }
${H} .orr-hreg .orr-extent::before { left:7px; width:2px; }

/* ------------------------------------------------ the shared ladder + reading ------------------ */
${H} .orr-help-list { position:relative; display:grid; grid-template-columns:clamp(222px, 18.5vw, 360px) minmax(0, 1fr); grid-template-rows:minmax(0, 1fr);
  column-gap:clamp(24px, 3vw, 64px); height:100%; min-height:0; }
${H} .orr-help-list__side { position:relative; display:flex; flex-direction:column; min-height:0; }
${H} .orr-help-list__stage { position:relative; min-width:0; min-height:0; display:grid; grid-template-columns:minmax(0, 1fr) clamp(260px, 21vw, 420px);
  column-gap:clamp(20px, 2.6vw, 56px); align-items:center; }
${H} .orr-help-list__hero { position:relative; height:100%; min-height:0; min-width:0; }
${H} .orr-help-loops { position:relative; height:100%; min-height:0; }
/* ORES: the mix fills the stage; its reading runs under it as one line of terms */
${H} .orr-help-list--ores .orr-help-list__stage { grid-template-columns:minmax(0, 1fr); grid-template-rows:minmax(0, 1fr) auto; row-gap:8px; align-items:stretch; }
${H} .orr-help-list--ores .orr-help-reading { max-width:none; display:grid; grid-template-columns:auto minmax(0, 1fr); grid-template-rows:auto minmax(0, 1fr); column-gap:clamp(24px, 3vw, 60px); align-items:start; padding:0 0 4px 40px; }
${H} .orr-help-list--ores .orr-help-reading > .orr-help-reading__kicker { grid-column:1; }
${H} .orr-help-list--ores .orr-help-reading > .orr-help-reading__name { grid-column:1; font-size:clamp(22px, 1.7vw, 34px); }
${H} .orr-help-list--ores .orr-help-terms { grid-column:2; grid-row:1 / span 2; margin:0; grid-template-columns:auto minmax(0, 1fr) auto minmax(0, 1fr); column-gap:18px; }
${H} .orr-help-search.sf-lc { margin:0 0 12px !important; padding:0 !important; }
${H} .orr-help-search .sf-lc__search { ${PLAIN} width:100% !important; max-width:none !important; min-height:38px; padding:6px 2px 12px 2px !important; box-sizing:border-box;
  font-family:var(--dp-face-body, "Instrument Sans"), system-ui, sans-serif !important; font-size:clamp(14px, .73vw, 18px) !important; color:rgb(${HOT}) !important;
  background:linear-gradient(rgb(${BONE} / .55) 0 0) 0 calc(100% - 3px) / 100% 2px no-repeat,
    repeating-linear-gradient(90deg, rgb(${BONE} / .5) 0 1.5px, transparent 1.5px 24px) 0 100% / 100% 8px no-repeat !important; }) !important;
  background:linear-gradient(rgb(${BONE} / .5) 0 0) 0 100% / 100% 2px no-repeat, linear-gradient(rgb(${BONE} / .1) 0 0) 0 calc(100% - 2px) / 100% 7px no-repeat !important; }
${H} .orr-help-search .sf-lc__search::placeholder { color:rgb(${BONE} / .66) !important; }
${H} .orr-help-search .sf-lc__search:focus { background:linear-gradient(rgb(255 255 255) 0 0) 0 calc(100% - 3px) / 100% 2px no-repeat,
  repeating-linear-gradient(90deg, rgb(255 255 255 / .8) 0 1.5px, transparent 1.5px 24px) 0 100% / 100% 8px no-repeat !important; }
${H} .orr-help-search { position:relative; }

${H} .orr-help-ladder { ${PLAIN} position:relative; flex:1 1 auto; min-height:0; overflow:hidden auto; scrollbar-width:none; list-style:none; margin:0; padding:2px 8px 22px 0;
  background:${SPINE} !important; background-attachment:local !important;
  -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 36px), transparent); mask-image:linear-gradient(180deg, #000 calc(100% - 36px), transparent); }
${H} .orr-help-ladder[data-overflow="0"] { -webkit-mask-image:none; mask-image:none; }
${H} .orr-help-ladder::-webkit-scrollbar { display:none; }
${H} .orr-help-ladder__head { position:relative; display:flex; align-items:center; gap:10px; padding:14px 0 6px 30px; ${LABEL} font-size:clamp(12px, .6vw, 15px) !important; letter-spacing:.24em; color:rgb(${HOT}); }
${H} .orr-help-ladder__head:first-child { padding-top:4px; }
${H} .orr-help-ladder__head::before { content:""; position:absolute; left:2px; top:calc(50% + 4px); width:16px; height:2px; background:rgb(${HOT} / .9); }
${H} .orr-help-ladder__head:first-child::before { top:calc(50%); }
${H} .orr-help-ladder__glyph { display:inline-flex; width:18px; height:18px; color:rgb(${HOT}); }
${H} .orr-help-ladder__glyph svg { width:18px; height:18px; }
${H} .orr-help-ladder__rung { margin:0; list-style:none; }
${H} .orr-help-ladder__item { all:unset; box-sizing:border-box; position:relative; display:grid; grid-template-columns:minmax(0, 1fr) auto; align-items:center; column-gap:12px; width:100%;
  min-height:clamp(34px, 1.8vw, 44px); padding:5px 4px 5px 44px; cursor:pointer; }
${H} .orr-help-ladder__item::before { content:""; position:absolute; left:4px; top:50%; width:8px; height:2px; margin-top:-1px; background:rgb(${BONE} / .55); transition:width .16s, background .16s; }
${H} .orr-help-ladder__name { font-family:var(--dp-face-body, "Instrument Sans"), system-ui, sans-serif; font-size:clamp(14px, .73vw, 18px); line-height:1.25; color:rgb(${BONE} / .82); transition:color .16s linear; }
${H} .orr-help-ladder__fig { font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 500; font-size:clamp(13px, .68vw, 17px); font-variant-numeric:tabular-nums; color:rgb(${BONE} / .72); text-transform:none; }
${H} .orr-help-ladder__fig.is-foe { color:#ff7a66; }
${H} .orr-help-ladder__item:hover .orr-help-ladder__name, ${H} .orr-help-ladder__item:focus-visible .orr-help-ladder__name { color:rgb(255 255 255); }
${H} .orr-help-ladder__item:hover::before { width:14px; background:rgb(${HOT}); }
${H} .orr-help-ladder__item:focus-visible::before { left:6px; width:3px; height:20px; margin-top:-10px; background:rgb(255 255 255); box-shadow:0 0 8px rgb(255 250 236 / .55); }
${H} .orr-help-ladder__item[aria-selected="true"] .orr-help-ladder__name { color:rgb(255 255 255); font-weight:600; }
${H} .orr-help-ladder__item[aria-selected="true"] .orr-help-ladder__fig { color:rgb(${HOT}); }
/* the Hand on the chosen rung: a stem off the spine and the notched chevron, amber (the screen's one) */
${H} .orr-help-ladder__item[aria-selected="true"]::after { content:""; position:absolute; left:8px; top:50%; width:22px; height:2px; margin-top:-1px; background:var(--dp-hand, #f2b950); }
${H} .orr-help-ladder__item[aria-selected="true"]::before { left:29px; width:10px; height:12px; margin-top:-6px; ${HAND} background:var(--dp-hand-hot, #ffd98c); filter:drop-shadow(0 0 6px rgb(255 217 140 / .6)); box-shadow:none; }
${H} .orr-help-empty { margin:10px 0 0 30px !important; font-size:14px !important; color:rgb(${BONE} / .76) !important; }
${H} .orr-help-ladder ~ .orr-extent, ${H} .orr-help-ladder > .orr-extent { }

/* the reading: no panel; a pool of shade, the figure, a ledger of terms */
${H} .orr-help-reading { position:relative; z-index:2; max-width:clamp(420px, 26vw, 640px); }
${H} .orr-help-reading::before { content:""; position:absolute; z-index:-1; left:-60px; right:-60px; top:-40px; bottom:-40px; pointer-events:none;
  background:radial-gradient(closest-side, rgb(5 7 10 / .8), rgb(5 7 10 / .5) 60%, rgb(5 7 10 / 0)); }
${H} .orr-help-reading__kicker { margin:0 0 6px; ${LABEL} font-size:clamp(12px, .6vw, 15px) !important; letter-spacing:.24em; color:rgb(${BONE} / .72); }
${H} .orr-help-reading__name { margin:0 0 6px; font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-variation-settings:"wdth" 125, "wght" 800; font-weight:800;
  font-size:clamp(24px, 2.1vw, 40px); line-height:1; letter-spacing:.02em; text-transform:uppercase; color:rgb(${HOT}); }
${H} .orr-help-reading__name.sf-entity-link { text-decoration:none !important; box-shadow:none !important; border:0 !important; color:rgb(${HOT}) !important; cursor:pointer; }
${H} .orr-help-reading__name.sf-entity-link:is(:hover, :focus-visible) { color:rgb(255 255 255) !important; outline:none; text-shadow:0 0 22px rgb(255 250 236 / .3); }
${H} .orr-help-reading__sub { margin:0 0 14px; font-family:var(--dp-face-body, "Instrument Sans"), system-ui, sans-serif; font-size:clamp(15px, .78vw, 19px); color:rgb(${BONE} / .84); }
${H} .orr-help-terms { margin:14px 0 0; padding:0; display:grid; grid-template-columns:auto minmax(0, 1fr); column-gap:22px; row-gap:0; }
${H} .orr-help-terms__row { display:contents; }
${H} .orr-help-terms dt, ${H} .orr-help-terms__k { ${LABEL} font-size:clamp(12px, .6vw, 15px) !important; letter-spacing:.18em; color:rgb(${BONE} / .72); padding:7px 0; margin:0; }
${H} .orr-help-terms dd { margin:0; padding:5px 0; font-family:var(--dp-face-body, "Instrument Sans"), system-ui, sans-serif; font-size:clamp(15px, .78vw, 19px); line-height:1.4; color:rgb(${HOT}); font-variant-numeric:tabular-nums; }
${H} .orr-help-terms__row.is-against dd { color:#ff7a66; }
${H} .orr-help-reading__legal { display:flex; align-items:baseline; gap:22px; margin:8px 0 0; }
${H} .orr-help-legal { ${LABEL} font-size:13px !important; letter-spacing:.18em; color:rgb(${HOT}); }
${H} .orr-help-legal.is-foe { color:#ff7a66; }
${H} .orr-help-legal.is-goal { color:rgb(${HOT}); text-decoration:underline 2px rgb(${BONE} / .5); text-underline-offset:6px; }
${H} .orr-help-reading__body { margin:14px 0 0; font-family:var(--dp-face-body, "Instrument Sans"), system-ui, sans-serif; font-size:clamp(15px, .78vw, 19px); line-height:1.5; color:rgb(${HOT}); }
${H} .orr-help-reading__lore { margin:8px 0 0; font-family:var(--dp-face-body, "Instrument Sans"), system-ui, sans-serif; font-style:italic; font-size:clamp(14px, .73vw, 18px); line-height:1.5; color:rgb(${BONE} / .8); }
/* entity links on this screen read as bone, never a web underline or a second amber */
${H} .sf-entity-link { text-decoration:none !important; box-shadow:none !important; }

/* FACTIONS: the orbit beside its reading */
${H} .orr-help-factions { position:relative; display:grid; grid-template-columns:minmax(0, 1.25fr) minmax(300px, .75fr); column-gap:clamp(20px, 3vw, 64px); align-items:center; height:100%; min-height:0; }
${H} .orr-help-factions__orbit .orr-crest__rep { display:none !important; }
${H} .orr-help-factions__orbit { position:relative; height:100%; min-height:0; --orr-band-a:.3; --orr-w-band:11px; --orr-edge-a:.6; }

/* KEYBOARD FOCUS: the kit's bone focus box (.k-screen :focus-visible) would draw a rectangle round a rung,
   a station or a crest. Every control on Help marks focus in its own light (a light segment on its tick,
   its glyph's bar, its ring), so the box is dropped here. */
${H} :focus-visible { outline:none !important; }
/* PAD FOCUS: the pad moves focus programmatically, so the accessibility sheet draws a lamp-coloured
   ring box round whatever holds it. On Help that would be a box and a second amber; each control shows
   pad focus in its own light instead (the same marks as keyboard focus). */
html.sf-gamepad-focus ${H} :is(button, a, input, select, [tabindex]):focus { outline:none !important; box-shadow:none !important; }
html.sf-gamepad-focus ${H} .orr-help__tabs .sf-tab:focus { color:rgb(255 255 255) !important; }
html.sf-gamepad-focus ${H} .orr-help__tabs .sf-tab:focus:not([aria-selected="true"])::before { left:6px !important; width:3px !important; height:20px !important; margin-top:-10px !important;
  background:rgb(255 255 255) !important; box-shadow:0 0 8px rgb(255 250 236 / .55) !important; }
html.sf-gamepad-focus ${H} .orr-help__tabs .sf-tab[aria-selected="true"]:focus { text-decoration:underline 2px rgb(255 255 255 / .8); text-underline-offset:7px; }
html.sf-gamepad-focus ${H} .orr-help-ladder__item:focus .orr-help-ladder__name { color:rgb(255 255 255); }
html.sf-gamepad-focus ${H} .orr-help-ladder__item:focus:not([aria-selected="true"])::before { left:6px; width:3px; height:20px; margin-top:-10px; background:rgb(255 255 255); box-shadow:0 0 8px rgb(255 250 236 / .55); }
html.sf-gamepad-focus ${H} .orr-hrig__st:focus .orr-hrig__verb { color:rgb(255 255 255); }
html.sf-gamepad-focus ${H} .orr-hrig__st:focus .orr-hrig__glyph::before { background:rgb(248 244 234 / .3); }
html.sf-gamepad-focus ${H} :is(.orr-hrig__devword, .orr-hreg__secword):focus { color:rgb(255 255 255); }
html.sf-gamepad-focus ${H} :is(.orr-hrig__devword, .orr-hreg__secword):focus::after { height:3px; background:rgb(255 255 255); }
html.sf-gamepad-focus ${H} .orr-help__close:focus .orr-help__close-word { color:rgb(255 255 255); text-shadow:0 0 18px rgb(255 250 236 / .35); }
html.sf-gamepad-focus ${H} .orr-help__close:focus .orr-hkey::after { background:rgb(255 255 255); left:-5px; right:-5px; }
html.sf-gamepad-focus ${H} :is(.orr-hloop__body, .orr-hmix__rock):focus::before { box-shadow:inset 0 0 0 3px rgb(255 255 255), 0 0 12px rgb(255 250 236 / .5); }
html.sf-gamepad-focus ${H} .orr-hmix__lbl:focus .orr-hmix__lbl-name { color:rgb(255 255 255); text-decoration:underline 2px rgb(255 255 255 / .6); text-underline-offset:4px; }
html.sf-gamepad-focus ${H} .orr-crest:focus > img, ${H} .orr-crest:focus-visible > img { opacity:.9; transform:scale(1.14); }
html.sf-gamepad-focus ${H} .orr-crest:focus::before, ${H} .orr-crest:focus-visible::before { display:block; }
html.sf-gamepad-focus ${H} .orr-crest:focus .orr-crest__name { color:rgb(248 244 234); }
html.sf-gamepad-focus ${H} .orr-hscale:focus .orr-hi__edge { stroke:rgb(255 255 255); }
html.sf-gamepad-focus ${H} .orr-hreg__scroll:focus .orr-hreg__list { background-color:rgb(248 244 234 / .03); }
html.sf-gamepad-focus ${H} .orr-help-reading__name.sf-entity-link:focus { color:rgb(255 255 255) !important; text-shadow:0 0 22px rgb(255 250 236 / .3); }
${H} .orr-hmix__lbl:focus-visible { outline:none; }
/* a large screen: the crests on the orbit grow with it (the library draws them at a fixed 50px) */
@media (min-width:2200px) {
  ${H} .orr-help-factions__orbit .orr-crest { scale:1.3; }
  ${H} .orr-help-factions__orbit .orr-crest__name, ${H} .orr-help-factions__orbit .orr-crest__rep { font-size:12px; }
}
@media (max-width:1500px) {
  ${H} .orr-hreg__secword { letter-spacing:.12em; }
  ${H} .orr-help__tabs .sf-tab { padding-left:56px !important; letter-spacing:.14em !important; font-size:12px !important; }
  ${H} .orr-help__tabs > li::before { left:32px; }
  ${H} .orr-help__tabs .sf-tab[aria-selected="true"]::before { left:22px !important; }
  ${H} .orr-help__tabs .sf-tab[aria-selected="true"]::after { width:16px !important; }
  ${H} .orr-hreg__name { font-size:13px; }
}
${SCROLL_EXTENT_CSS}
@media (forced-colors: active) {
  ${H} .orr-help__tabs .sf-tab[aria-selected="true"]::before { background:Highlight !important; }
  .orr-hkey::after { background:CanvasText; }
}
`;

export function injectHelpLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || doc.getElementById(STYLE_ID)) return;
  injectOrrery(doc);
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
