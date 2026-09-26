// ORRERY composition for Settings and Credits (design/frontend/ORRERY.md §6 Meta).
//
// SETTINGS — three columns on one line of sight: the five categories on a Ladder (a ruled rail, a
// tick per category, the notched Hand on the open one), the open category's rows as instruments (a
// slider is a graduated Scale with a bone light cursor and a thin numeral; a switch is two words and a
// lit bar; a choice is its value on a line; a binding is its key), and beside
// them the live preview (settingsPreview.js). No plate, no card, no table rule: the rows hang off a
// rail of light. The one amber on the screen follows focus — the Hand on the category ladder while
// the player is in it, the focused control's cursor or word once they step into the rows.
//
// CREDITS — a reel that scrolls over the drift field: every section on one continuous scroll, each
// line resolving as it rises into view (Scroll Reveal), the emblem turning slowly behind, the section
// ladder's Hand following the reel and a progress arc reading how far through it you are.
//
// It styles the screens' existing nodes (checks read their classes and data-actions) and pins nothing.
import { injectOrrery } from './tokens.js';
import { syncScrollExtent, SCROLL_EXTENT_CSS } from './scrollExtent.js';
import { svg, arcD, ticksD } from './svg.js';
import { reducedMotion, onFrame } from './motion.js';
import { decrypt } from './text.js';

const STYLE_ID = 'sf-orrery-settings-layouts';
const S = 'html body #screens > .k-screen.of-settings.orr-settings';
const C = 'html body #screens > .k-screen.of-credits.orr-credits';
const BONE = '236 230 216';
const HOT = '248 244 234';
const LABEL = 'font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650 !important; font-weight:650 !important; text-transform:uppercase !important;';
const PLAIN = 'background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; outline:none !important; border-radius:0 !important;';
const HAND = 'clip-path:polygon(0 0, 100% 50%, 0 100%, 30% 50%) !important;';
const CHEVRON = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="rgb(236,230,216)" stroke-opacity=".7" stroke-width="1.3"/></svg>')}")`;

/** The rail of light down a list: a 1.5px line, minor ticks every 8px, a faint band. */
const RAIL_BG = `linear-gradient(90deg, transparent 7px, rgb(${BONE} / .3) 7px, rgb(${BONE} / .3) 8.5px, transparent 8.5px) 0 0 / 100% 100% no-repeat,
    linear-gradient(90deg, transparent 5px, rgb(${BONE} / .06) 5px, rgb(${BONE} / .06) 10px, transparent 10px) 0 0 / 100% 100% no-repeat,
    repeating-linear-gradient(180deg, rgb(${BONE} / .26) 0 1px, transparent 1px 8px) 4px 0 / 4px 100% no-repeat`;

/**
 * A Ladder with the notched Hand: `list` is the ruled list, `item` the button on each rung, `chosen`
 * the rung's chosen state. At rest the Hand is warm bone; while focus or the pointer is in the list it
 * is the amber Hand (the one amber on the screen).
 */
const ladder = (scope, list, item, chosen) => `
${scope} ${list} { ${PLAIN} position:relative !important; display:flex !important; flex-direction:column !important; flex-wrap:nowrap !important; gap:0 !important;
  margin:0 !important; padding:4px 0 !important; counter-reset:orrlad; background:${RAIL_BG} !important; }
${scope} ${list} > li { position:relative !important; counter-increment:orrlad; width:100% !important; list-style:none !important; margin:0 !important; }
${scope} ${list} > li::before { content:counter(orrlad, decimal-leading-zero); position:absolute; left:44px; top:50%; transform:translateY(-50%); pointer-events:none;
  ${LABEL} font-size:10px; letter-spacing:.14em; color:rgb(${BONE} / .68); font-variant-numeric:tabular-nums; }
${scope} ${list} > li:has(> ${item}:is(${chosen}))::before { color:rgb(${BONE} / .86); }
${scope} ${list} ${item} { all:unset !important; box-sizing:border-box !important; position:relative !important; display:flex !important; align-items:center !important;
  width:100% !important; min-height:46px !important; padding:0 8px 0 74px !important; cursor:pointer !important; ${LABEL} font-size:13px !important;
  letter-spacing:.2em !important; color:rgb(${BONE} / .7) !important; white-space:nowrap !important; transition:color .16s linear; }
${scope} ${list} ${item}::before { content:"" !important; display:block !important; position:absolute !important; left:4px !important; top:50% !important; width:8px !important;
  height:1.5px !important; margin:0 !important; translate:none !important; scale:none !important; transform:none !important; background:rgb(${BONE} / .55) !important;
  box-shadow:none !important; border:0 !important; clip-path:none !important; border-radius:0 !important; opacity:1 !important; }
${scope} ${list} ${item}::after { content:none !important; display:none !important; }
${scope} ${list} ${item}:is(:hover, :focus-visible) { color:rgb(${HOT}) !important; }
${scope} ${list} ${item}:focus-visible:not(${chosen})::before { width:13px !important; background:rgb(${HOT}) !important; }
${scope} ${list} ${item}:is(${chosen}) { color:rgb(${HOT}) !important; text-shadow:0 0 14px rgb(255 250 236 / .18); }
/* the Hand: a stem off the rail and a notched chevron at the word, bone at rest */
${scope} ${list} ${item}:is(${chosen})::after { content:"" !important; display:block !important; position:absolute !important; left:7px !important; top:50% !important;
  width:22px !important; height:1.5px !important; margin:-.75px 0 0 !important; background:rgb(${HOT} / .85) !important; translate:none !important; scale:none !important;
  transform:none !important; border:0 !important; border-radius:0 !important; clip-path:none !important; box-shadow:none !important; opacity:1 !important; }
${scope} ${list} ${item}:is(${chosen})::before { left:28px !important; width:9px !important; height:11px !important; margin-top:-5.5px !important; ${HAND}
  background:rgb(${HOT}) !important; filter:drop-shadow(0 0 5px rgb(255 250 236 / .45)); }
${scope} ${list}:is(:focus-within, :hover) ${item}:is(${chosen})::after { background:var(--dp-hand, #f2b950) !important; }
${scope} ${list}:is(:focus-within, :hover) ${item}:is(${chosen})::before { background:var(--dp-hand-hot, #ffd98c) !important; filter:drop-shadow(0 0 6px rgb(255 217 140 / .7)); }`;

const SETTINGS_CSS = `
/* ------------------------------------------------ the frame ------------------------------------ */
${S} { grid-template-columns:minmax(168px, 212px) minmax(600px, 660px) minmax(0, 1fr) !important;
  grid-template-rows:auto minmax(0, 1fr) auto !important;
  grid-template-areas:"title title title" "hang stage preview" "foot foot foot" !important;
  column-gap:clamp(28px, 3.4vw, 72px) !important; row-gap:clamp(18px, 3.6vh, 44px) !important; }
${S}::before { background:radial-gradient(120% 95% at 18% 36%, rgb(5 7 10 / .9), rgb(5 7 10 / .72) 55%, rgb(5 7 10 / .5)) !important; }
${S} > .k-title { align-self:end; }
${S} > .k-title > p { ${LABEL} margin:14px 0 0 !important; font-size:10.5px !important; letter-spacing:.26em !important; color:rgb(${BONE} / .6) !important;
  display:flex; align-items:center; gap:14px; }
${S} > .k-title > p::after { content:""; width:72px; height:1px; background:linear-gradient(90deg, rgb(${BONE} / .42), rgb(${BONE} / 0)); }
${S} > .orr-set-preview { grid-area:preview; align-self:stretch; justify-self:stretch; min-height:0; }

/* ------------------------------------------------ the category ladder -------------------------- */
${S} > .k-hang { overflow:visible !important; padding:0 !important; margin:0 !important; align-self:start; max-height:none !important; }
${S} > .k-hang .of-settings-rail { display:none !important; }
${ladder(S, '.sf-tabbar', '.sf-tab', '[aria-selected="true"], .active')}

/* ------------------------------------------------ the rows ------------------------------------- */
${S} #sf-settings-pane { ${PLAIN} backdrop-filter:none !important; -webkit-backdrop-filter:none !important; width:auto !important; max-width:none !important;
  justify-self:stretch !important; align-self:stretch !important; max-height:100% !important; min-height:0 !important; overflow:hidden auto !important;
  padding:0 20px 34px 0 !important; margin:0 !important; scrollbar-width:none; position:relative; --sf-fade-edge:0px !important; }
${S} #sf-settings-pane::-webkit-scrollbar { display:none; }
${S} #sf-settings-pane::before, ${S} #sf-settings-pane::after { content:none !important; display:none !important; }
${S} #sf-settings-pane .k-rows { ${PLAIN} position:relative; margin:0 !important; padding:2px 0 !important; max-width:none !important; background:${RAIL_BG} !important; }
${S} #sf-settings-pane .k-row { ${PLAIN} position:relative !important; display:grid !important; grid-template-columns:var(--orr-label-w, 206px) minmax(0, 1fr) !important;
  align-items:center !important; column-gap:22px !important; row-gap:2px !important; min-height:46px !important; height:auto !important; padding:5px 0 5px 30px !important;
  color:rgb(${BONE} / .78) !important; }
${S} #sf-settings-pane .k-row::after { content:none !important; display:none !important; }
${S} #sf-settings-pane .k-row::before { content:"" !important; display:block !important; position:absolute !important; left:4px !important; top:50% !important; width:8px !important;
  height:1.5px !important; margin:0 !important; background:rgb(${BONE} / .5) !important; translate:none !important; scale:none !important; transform:none !important;
  box-shadow:none !important; border:0 !important; clip-path:none !important; }
${S} #sf-settings-pane .k-row:is(:focus-within, :hover)::before { width:13px !important; background:rgb(${HOT}) !important; }
${S} #sf-settings-pane .k-row > :is(label, span.k-t-body) { ${LABEL} font-size:11.5px !important; letter-spacing:.13em !important; line-height:1.3 !important;
  color:rgb(${BONE} / .8) !important; white-space:normal; overflow-wrap:break-word; text-shadow:none !important; }
${S} #sf-settings-pane .k-row:is(:focus-within, :hover) > :is(label, span.k-t-body) { color:rgb(${HOT}) !important; }

/* a slider is a graduated Scale: the ruled line, a tick every 5 %, majors at the quarters, the fill to
   the value, a bone light cursor, the value as a thin numeral. The cursor is the Hand while it has focus. */
${S} #sf-settings-pane .k-row > div.k-words--row { ${PLAIN} display:grid !important; grid-template-columns:var(--orr-scale-w, 254px) 64px !important; align-items:center !important;
  column-gap:14px !important; justify-content:start !important; width:auto !important; }
${S} #sf-settings-pane input.k-range { -webkit-appearance:none !important; appearance:none !important; ${PLAIN} display:block !important; width:var(--orr-scale-w, 254px) !important;
  height:30px !important; margin:0 !important; padding:0 !important; cursor:pointer !important;
  background:
    linear-gradient(rgb(${HOT} / .96) 0 0) 7px 12.5px / calc((100% - 14px) * var(--orr-v, .5)) 3px no-repeat,
    linear-gradient(rgb(${HOT} / .17) 0 0) 7px 9.5px / calc((100% - 14px) * var(--orr-v, .5)) 9px no-repeat,
    linear-gradient(rgb(${BONE} / .44) 0 0) 7px 13.25px / calc(100% - 14px) 1.5px no-repeat,
    linear-gradient(rgb(${BONE} / .075) 0 0) 7px 9.5px / calc(100% - 14px) 9px no-repeat,
    linear-gradient(90deg, rgb(${BONE} / .5) 0 1px, transparent 1px) 7px 21px / calc((100% - 14px) / 20) 4px repeat-x,
    linear-gradient(90deg, rgb(${BONE} / .72) 0 1.5px, transparent 1.5px) 7px 21px / calc((100% - 14px) / 4) 8px repeat-x !important; }
${S} #sf-settings-pane input.k-range::-webkit-slider-runnable-track { -webkit-appearance:none; height:30px; background:transparent; border:0; box-shadow:none; }
${S} #sf-settings-pane input.k-range::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:14px; height:24px; margin-top:2px; border:0; border-radius:0; box-shadow:none;
  background:
    linear-gradient(90deg, transparent 5.5px, rgb(${HOT}) 5.5px 8.5px, transparent 8.5px) 0 0 / 14px 24px no-repeat,
    linear-gradient(90deg, transparent 2px, rgb(${HOT} / .24) 2px 12px, transparent 12px) 0 4px / 14px 16px no-repeat; }
${S} #sf-settings-pane input.k-range:hover::-webkit-slider-thumb {
  background:
    linear-gradient(90deg, transparent 5.5px, rgb(255 253 248) 5.5px 8.5px, transparent 8.5px) 0 0 / 14px 24px no-repeat,
    linear-gradient(90deg, transparent 1px, rgb(${HOT} / .34) 1px 13px, transparent 13px) 0 3px / 14px 18px no-repeat; }
${S} #sf-settings-pane input.k-range:focus::-webkit-slider-thumb { height:28px; margin-top:0;
  background:
    linear-gradient(90deg, transparent 5px, var(--dp-hand-hot, #ffd98c) 5px 9px, transparent 9px) 0 0 / 14px 28px no-repeat,
    linear-gradient(90deg, transparent 1px, rgb(242 185 80 / .36) 1px 13px, transparent 13px) 0 4px / 14px 18px no-repeat; }
${S} #sf-settings-pane input.k-range:focus { outline:none !important; }
${S} #sf-settings-pane .k-row > div.k-words--row > span { ${PLAIN} font-family:var(--dp-face-numeral, "Archivo") !important; font-stretch:100% !important;
  font-variation-settings:"wdth" 100, "wght" 300 !important; font-weight:300 !important; font-size:22px !important; line-height:1 !important; letter-spacing:-.01em !important;
  text-transform:none !important; font-variant-numeric:tabular-nums lining-nums; text-align:right !important; width:auto !important; margin:0 !important; color:rgb(${HOT}) !important; }

/* a switch / a choice: the words on the line, the live one lit with a bar under it */
${S} #sf-settings-pane .k-row .k-words--row:has(> li) { ${PLAIN} display:flex !important; flex-direction:row !important; flex-wrap:wrap !important; align-items:center !important;
  gap:4px 22px !important; width:auto !important; height:auto !important; min-width:0 !important; padding:0 !important; justify-self:start !important; }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) > li { list-style:none !important; margin:0 !important; }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) .k-word { all:unset !important; box-sizing:border-box !important; position:relative !important; display:inline-block !important;
  cursor:pointer !important; padding:7px 0 9px !important; ${LABEL} font-size:11.5px !important; letter-spacing:.2em !important; line-height:1 !important;
  color:rgb(${BONE} / .66) !important; transition:color .16s linear; }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) .k-word::before { content:none !important; display:none !important; }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) .k-word::after { content:"" !important; display:block !important; position:absolute !important; left:0 !important; right:0 !important;
  bottom:0 !important; top:auto !important; width:auto !important; height:1px !important; margin:0 !important; background:rgb(${BONE} / .16) !important; transform:none !important;
  translate:none !important; scale:none !important; border:0 !important; box-shadow:none !important; opacity:1 !important; }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) .k-word:hover { color:rgb(${HOT}) !important; }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) .k-word[aria-pressed="true"] { color:rgb(${HOT}) !important; }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) .k-word[aria-pressed="true"]::after { height:2px !important; background:rgb(${HOT} / .9) !important; box-shadow:0 0 6px rgb(255 250 236 / .35) !important; }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) .k-word:focus-visible { color:var(--dp-hand-hot, #ffd98c) !important; }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) .k-word:focus-visible::after { height:2px !important; background:var(--dp-hand, #f2b950) !important; box-shadow:0 0 6px rgb(242 185 80 / .5) !important; }

/* a choice from a list: its value on an underline and a chevron */
${S} #sf-settings-pane select.k-select { all:unset !important; -webkit-appearance:none !important; appearance:none !important; box-sizing:border-box !important; display:inline-block !important;
  justify-self:start !important; max-width:100% !important; min-width:0 !important; cursor:pointer !important; padding:6px 24px 7px 0 !important;
  font-family:var(--dp-face-read, "Instrument Sans") !important; font-size:14.5px !important; font-weight:500 !important; line-height:1.25 !important; color:rgb(${HOT}) !important;
  background:${CHEVRON} right 4px center / 10px 6px no-repeat, linear-gradient(rgb(${BONE} / .22) 0 0) 0 100% / 100% 1px no-repeat !important;
  text-overflow:ellipsis; white-space:nowrap; overflow:hidden; }
${S} #sf-settings-pane select.k-select:hover { background:${CHEVRON} right 4px center / 10px 6px no-repeat, linear-gradient(rgb(${BONE} / .5) 0 0) 0 100% / 100% 1px no-repeat !important; }
${S} #sf-settings-pane select.k-select:focus-visible, ${S} #sf-settings-pane select.k-select:focus { color:var(--dp-hand-hot, #ffd98c) !important;
  background:${CHEVRON} right 4px center / 10px 6px no-repeat, linear-gradient(var(--dp-hand, #f2b950) 0 0) 0 100% / 100% 2px no-repeat !important; }
${S} #sf-settings-pane select.k-select option { background:#0b0e13; color:rgb(${HOT}); }
/* the list it opens is an instrument too (a customizable select): a column of light on deep glass, a rail
   down its edge, the chosen option lit; the native control stays the control (keys, pad, probes) */
${S} #sf-settings-pane select.k-select, ${S} #sf-settings-pane select.k-select::picker(select) { appearance:base-select !important; }
${S} #sf-settings-pane select.k-select::picker-icon { display:none; }
${S} #sf-settings-pane select.k-select::picker(select) { border:0; border-radius:0; padding:8px 0; margin-top:6px; width:max-content; min-width:220px; max-width:440px; right:auto;
  background:linear-gradient(90deg, transparent 13px, rgb(${BONE} / .3) 13px 14.5px, transparent 14.5px), rgb(7 9 13 / .97);
  box-shadow:0 22px 60px rgb(0 0 0 / .66), 0 0 0 1px rgb(${BONE} / .06); color:rgb(${HOT}); }
${S} #sf-settings-pane select.k-select option { position:relative; display:flex; align-items:center; min-height:36px; padding:0 22px 0 34px;
  background:none; border:0; outline:none !important; box-shadow:none; color:rgb(${BONE} / .78); font-family:var(--dp-face-read, "Instrument Sans"); font-size:14px; font-weight:500; cursor:pointer; }
${S} #sf-settings-pane select.k-select option::checkmark { display:none; }
${S} #sf-settings-pane select.k-select option::before { content:""; position:absolute; left:10px; top:50%; width:8px; height:1.5px; background:rgb(${BONE} / .5); }
${S} #sf-settings-pane select.k-select option:is(:hover, :focus, :focus-visible) { color:rgb(255 253 248); background:linear-gradient(90deg, rgb(${BONE} / .1), rgb(${BONE} / 0)); outline:none !important; }
${S} #sf-settings-pane select.k-select option:checked { color:rgb(${HOT}); background:none; border:0; outline:none; }
${S} #sf-settings-pane select.k-select option:checked::before { left:24px; width:5px; height:5px; margin-top:-2.5px; border-radius:50%; background:var(--dp-hand-hot, #ffd98c);
  box-shadow:0 0 6px rgb(255 217 140 / .7); }

/* a binding is its key: the key in label caps on an underline; listening runs ice */
${S} #sf-settings-pane .sf-bind-btn { all:unset !important; box-sizing:border-box !important; position:relative !important; justify-self:start !important; cursor:pointer !important;
  padding:6px 0 8px !important; min-width:28px !important; ${LABEL} font-size:12px !important; letter-spacing:.16em !important; line-height:1 !important; color:rgb(${HOT}) !important;
  background:linear-gradient(rgb(${BONE} / .26) 0 0) 0 100% / 100% 1px no-repeat !important; white-space:nowrap !important; }
${S} #sf-settings-pane .sf-bind-btn::before { content:none !important; display:none !important; }
${S} #sf-settings-pane .sf-bind-btn::after { content:none !important; display:none !important; }
${S} #sf-settings-pane .sf-bind-btn:hover { background:linear-gradient(rgb(${BONE} / .6) 0 0) 0 100% / 100% 1px no-repeat !important; }
${S} #sf-settings-pane .sf-bind-btn:focus-visible { color:var(--dp-hand-hot, #ffd98c) !important; background:linear-gradient(var(--dp-hand, #f2b950) 0 0) 0 100% / 100% 2px no-repeat !important; }
${S} #sf-settings-pane .sf-bind-btn:is(.sf-bind-btn--capture, [aria-pressed="true"]) { color:var(--dp-ice, #8fcbff) !important;
  background:linear-gradient(90deg, rgb(143 203 255 / 0), var(--dp-ice, #8fcbff), rgb(143 203 255 / 0)) 0 100% / 200% 2px repeat-x !important; animation:orr-set-listen-bar 1.1s linear infinite; }
@keyframes orr-set-listen-bar { to { background-position:-200% 100%; } }

/* a fixed shortcut: its name and note, the key on the right */
${S} #sf-settings-pane .k-row[data-orr-kind="shortcut"] { grid-template-columns:minmax(0, 1fr) auto !important; }
${S} #sf-settings-pane .k-row[data-orr-kind="shortcut"] .k-row__name { font-family:var(--dp-face-read, "Instrument Sans") !important; font-size:13.5px !important; font-weight:500 !important;
  letter-spacing:0 !important; text-transform:none !important; color:rgb(${HOT}) !important; }
${S} #sf-settings-pane .k-row[data-orr-kind="shortcut"] .k-row__sub { display:block; margin-top:2px; font-family:var(--dp-face-read, "Instrument Sans") !important; font-size:11.5px !important;
  line-height:1.4 !important; color:rgb(${BONE} / .62) !important; white-space:normal !important; }
${S} #sf-settings-pane .k-row[data-orr-kind="shortcut"] > .k-t-emph { ${LABEL} font-size:11.5px !important; letter-spacing:.16em !important; color:rgb(${HOT}) !important; text-align:right; }

/* a section head in the rows, and a quiet sentence between lists */
${S} #sf-settings-pane .k-row[data-orr-kind="head"] { min-height:0 !important; padding:22px 0 6px 30px !important; grid-template-columns:minmax(0, 1fr) !important; }
${S} #sf-settings-pane .k-row[data-orr-kind="head"]::before { top:auto !important; bottom:12px !important; width:12px !important; background:rgb(${BONE} / .7) !important; }
${S} #sf-settings-pane .k-row .k-caps { ${PLAIN} ${LABEL} display:flex !important; align-items:center; gap:14px; padding:0 !important; font-size:10.5px !important;
  letter-spacing:.26em !important; color:rgb(${BONE} / .66) !important; }
${S} #sf-settings-pane .k-row .k-caps::after { content:""; flex:1 1 auto; max-width:120px; height:1px; background:linear-gradient(90deg, rgb(${BONE} / .3), rgb(${BONE} / 0)); }
${S} #sf-settings-pane > p.k-sentence { ${PLAIN} font-family:var(--dp-face-read, "Instrument Sans") !important; font-size:12.5px !important; line-height:1.5 !important;
  color:rgb(${BONE} / .66) !important; max-width:58ch !important; margin:8px 0 12px 30px !important; padding:0 !important; text-transform:none !important; letter-spacing:0 !important; }
${S} #sf-settings-pane > .k-words { ${PLAIN} display:flex !important; flex-wrap:wrap; align-items:baseline; gap:6px 16px !important; margin:10px 0 12px 30px !important; padding:0 !important; }
${S} #sf-settings-pane > .k-words > .k-word { all:unset !important; box-sizing:border-box !important; cursor:pointer !important; padding:5px 0 !important; ${LABEL} font-size:11px !important;
  letter-spacing:.18em !important; color:rgb(${HOT}) !important; }
${S} #sf-settings-pane > .k-words > .k-word::before { content:"›  " !important; color:rgb(${BONE} / .6); }
${S} #sf-settings-pane > .k-words > .k-word::after { content:none !important; display:none !important; }
${S} #sf-settings-pane > .k-words > .k-word:hover { color:rgb(255 253 248) !important; }
${S} #sf-settings-pane > .k-words > .k-word:focus-visible { color:var(--dp-hand-hot, #ffd98c) !important; }
${S} #sf-settings-pane > .k-words > .k-t-fine { font-family:var(--dp-face-read, "Instrument Sans") !important; font-size:11.5px !important; color:rgb(${BONE} / .6) !important; }
${S} #sf-settings-pane > .orr-extent::before { left:7px; }
/* a category arrives row by row */
${S} #sf-settings-pane .orr-set-rise { animation:orr-rise 460ms var(--dp-ease-out, ease-out) both; animation-delay:var(--orr-delay, 0ms); }
html.sf-reduce-motion ${S} #sf-settings-pane .orr-set-rise { animation:none !important; }
/* the screens stand above their spotlight */
${S} > :is(.k-title, .k-hang, .orr-set-preview, .k-foot) { position:relative; z-index:1; }
${S} #sf-settings-pane { z-index:1; }

/* ------------------------------------------------ the way back --------------------------------- */
${S} > .k-foot { align-items:center !important; }
${S} > .k-foot .sf-back { all:unset !important; box-sizing:border-box !important; cursor:pointer !important; display:inline-flex !important; align-items:baseline !important; gap:0 !important;
  padding:8px 0 !important; ${LABEL} font-size:13px !important; letter-spacing:.24em !important; color:rgb(${HOT}) !important; }
${S} > .k-foot .sf-back::before { content:"‹" !important; margin-right:12px; font-size:15px; color:rgb(${BONE} / .6); }
${S} > .k-foot .sf-back::after { all:unset !important; content:"ESC" / "" !important; margin-left:16px !important; ${LABEL} font-size:10px !important; letter-spacing:.2em !important;
  color:rgb(${BONE} / .58) !important; }
${S} > .k-foot .sf-back:is(:hover, :focus-visible) { color:var(--dp-hand-hot, #ffd98c) !important; }

@media (max-width:1500px) {
  ${S} { --orr-scale-w:174px; --orr-label-w:150px; grid-template-columns:minmax(150px, 176px) minmax(456px, 480px) minmax(0, 1fr) !important; }
  ${S} #sf-settings-pane .k-row { column-gap:16px !important; }
  ${S} #sf-settings-pane .k-row > :is(label, span.k-t-body) { font-size:10.5px !important; letter-spacing:.12em !important; }
  ${S} #sf-settings-pane .k-row .k-words--row:has(> li) { gap:4px 14px !important; }
  ${S} #sf-settings-pane .k-row .k-words--row:has(> li) .k-word { font-size:10.5px !important; letter-spacing:.12em !important; }
  ${S} #sf-settings-pane .k-row > div.k-words--row { grid-template-columns:var(--orr-scale-w, 174px) 56px !important; column-gap:10px !important; }
  ${S} #sf-settings-pane .k-row > div.k-words--row > span { font-size:19px !important; }
  ${S} .sf-tabbar .sf-tab { min-height:40px !important; }
}
/* a 1440p screen shows the 1080p composition at 1.25 (the kit scale folded into the zoom), as the station does */
@media (min-width:2200px) and (min-height:1200px) { ${S}, ${C} { zoom:1.25; --k-s:1; } }
@media (min-width:3400px) and (min-height:1900px) { ${S}, ${C} { zoom:1.85; --k-s:1; } }
@media (max-height:800px) {
  ${S} #sf-settings-pane .k-row { min-height:40px !important; padding-top:3px !important; padding-bottom:3px !important; }
}
@media (max-width:900px) {
  ${S} { grid-template-columns:minmax(0, 1fr) !important; grid-template-areas:"title" "hang" "stage" "foot" !important; }
  ${S} > .orr-set-preview { display:none !important; }
}
html.sf-reduce-motion ${S} #sf-settings-pane .sf-bind-btn { animation:none !important; }
@media (forced-colors: active) {
  ${S} #sf-settings-pane input.k-range { background:CanvasText !important; height:2px !important; }
  ${S} #sf-settings-pane .sf-bind-btn, ${S} #sf-settings-pane select.k-select { border-bottom:1px solid CanvasText !important; }
}
`;

const EMBLEM = new URL('../../../assets/ui/generated/emblem/emblem.webp', import.meta.url).href;

const CREDITS_CSS = `
/* ------------------------------------------------ credits: the frame ---------------------------- */
${C} { grid-template-columns:minmax(200px, 268px) minmax(0, 1fr) !important; grid-template-rows:auto minmax(0, 1fr) auto !important;
  grid-template-areas:"title title" "hang stage" "foot foot" !important; column-gap:clamp(28px, 3.4vw, 72px) !important; row-gap:clamp(18px, 3.6vh, 44px) !important;
  isolation:isolate; overflow:hidden !important; }
${C}::before { background:linear-gradient(90deg, rgb(5 7 10 / .92) 0%, rgb(5 7 10 / .84) 42%, rgb(5 7 10 / .6) 72%, rgb(5 7 10 / .5)) !important; z-index:0 !important; }
${C} > :is(.k-title, .k-hang, .k-stage, .k-foot) { position:relative; z-index:2; }
${C} > .k-title { max-width:none !important; align-self:end; }
${C} > .k-title > p { ${LABEL} margin:14px 0 0 !important; max-width:none !important; font-size:10.5px !important; letter-spacing:.26em !important; line-height:1.4 !important;
  color:rgb(${BONE} / .6) !important; display:flex; align-items:center; gap:14px; }
${C} > .k-title > p::after { content:""; width:72px; height:1px; background:linear-gradient(90deg, rgb(${BONE} / .42), rgb(${BONE} / 0)); }
/* the drift field and the emblem stand behind everything */
${C} > .orr-cr-drift { position:absolute; left:0; top:0; width:100%; height:100%; z-index:1; pointer-events:none; }
${C} > .orr-cr-emblem { position:absolute; z-index:1; right:max(-8vw, -140px); top:50%; width:min(86vh, 980px); height:min(86vh, 980px); margin-top:calc(min(86vh, 980px) / -2);
  pointer-events:none; background:url("${EMBLEM}") center / contain no-repeat; opacity:.15; mix-blend-mode:screen;
  -webkit-mask-image:radial-gradient(circle closest-side, rgb(0 0 0 / .5), #000 70%); mask-image:radial-gradient(circle closest-side, rgb(0 0 0 / .5), #000 70%);
  animation:orr-cr-turn 1200s linear infinite; }
@keyframes orr-cr-turn { to { transform:rotate(360deg); } }

/* ------------------------------------------------ credits: the section ladder + progress -------- */
${C} > .k-hang { overflow:visible !important; padding:0 !important; margin:0 !important; align-self:start; max-height:none !important; }
${ladder(C, '.k-hang > .k-words', '.k-word', '[aria-current="true"]')}
/* a long section name breaks at its space onto a second line of its rung, never under the next */
${C} .k-hang > .k-words .k-word { white-space:normal !important; line-height:1.35 !important; padding-top:7px !important; padding-bottom:7px !important; }
${C} .orr-cr-progress { display:grid; grid-template-columns:62px auto; align-items:center; column-gap:14px; margin:30px 0 0 12px; pointer-events:none; }
${C} .orr-cr-progress svg { width:62px; height:62px; overflow:visible; }
${C} .orr-cr-progress__n { font-family:var(--dp-face-numeral, "Archivo") !important; font-variation-settings:"wdth" 100, "wght" 280 !important; font-weight:280 !important; font-size:28px;
  line-height:.9; color:rgb(${HOT}); font-variant-numeric:tabular-nums; }
${C} .orr-cr-progress__n small { font-size:.46em; margin-left:2px; color:rgb(${BONE} / .7); }
${C} .orr-cr-progress__l { ${LABEL} display:block; margin-top:6px; font-size:10px; letter-spacing:.24em; color:rgb(${BONE} / .74); }

/* ------------------------------------------------ credits: the reel ---------------------------- */
${C} > .k-stage { ${PLAIN} backdrop-filter:none !important; -webkit-backdrop-filter:none !important; max-width:none !important; width:100% !important; min-height:0 !important;
  padding:0 !important; margin:0 !important; overflow:hidden auto !important; scrollbar-width:none; animation:none !important;
  -webkit-mask-image:linear-gradient(180deg, transparent 0, #000 10%, #000 80%, transparent 100%) !important;
  mask-image:linear-gradient(180deg, transparent 0, #000 10%, #000 80%, transparent 100%) !important; }
${C} > .k-stage::-webkit-scrollbar { display:none; }
${C} > .k-stage::before, ${C} > .k-stage::after { content:none !important; display:none !important; }
${C} > .k-stage:focus-visible { outline:none !important; }
${C} .orr-cr-reel { position:relative; max-width:min(660px, 100%); padding:9vh 0 52vh; }
${C} .orr-cr-sec { position:relative; scroll-margin-top:9vh; }
${C} .orr-cr-sec + .orr-cr-sec { margin-top:86px; }
${C} .orr-cr-head { ${LABEL} display:flex; align-items:center; gap:16px; margin:0 0 24px !important; font-size:12px !important; letter-spacing:.28em !important; color:rgb(${HOT}) !important; }
${C} .orr-cr-head > i { font-style:normal; font-size:10px; letter-spacing:.14em; color:rgb(${BONE} / .68); font-variant-numeric:tabular-nums; }
${C} .orr-cr-head::after { content:""; flex:0 1 180px; height:1px; background:linear-gradient(90deg, rgb(${BONE} / .42), rgb(${BONE} / 0)); }
/* the maker: the name at display size, the build and the trade in labels, one sentence */
${C} .of-credits-made { margin:0 0 20px !important; }
${C} .of-credits-kicker { display:none !important; }
${C} .of-credits-name { margin:0 !important; font-family:var(--dp-face-display, "Archivo") !important; font-stretch:125%; font-variation-settings:"wdth" 125, "wght" 800 !important;
  font-weight:800 !important; font-size:clamp(48px, 7vh, 80px) !important; line-height:.92 !important; white-space:nowrap; letter-spacing:-.005em !important; text-transform:uppercase !important;
  color:rgb(${HOT}) !important; text-shadow:0 2px 24px rgb(0 0 0 / .5); }
${C} .of-credits-ver, ${C} .of-credits-made .k-row__sub { ${LABEL} display:inline-block; margin:18px 22px 0 0 !important; font-size:11px !important; letter-spacing:.24em !important;
  color:rgb(${BONE} / .72) !important; }
${C} .of-credits-ver { color:var(--dp-phos, #dfeeff) !important; }
${C} .orr-cr-sec > .k-sentence { font-family:var(--dp-face-read, "Instrument Sans") !important; font-size:16px !important; line-height:1.55 !important; max-width:44ch !important;
  color:rgb(${BONE} / .82) !important; margin:6px 0 0 !important; text-transform:none !important; letter-spacing:0 !important; }
/* a credit list hangs off the rail: a tick per name, the name in reading type, its role in labels */
${C} .of-credits-rows { ${PLAIN} position:relative; margin:0 !important; padding:4px 0 !important; max-width:none !important; background:${RAIL_BG} !important; }
${C} .of-credits-rows .k-row { ${PLAIN} position:relative !important; display:grid !important; grid-template-columns:minmax(0, 1fr) auto !important; align-items:baseline !important;
  column-gap:28px !important; min-height:0 !important; height:auto !important; padding:12px 0 12px 30px !important; }
${C} .of-credits-rows .k-row::after { content:none !important; display:none !important; }
${C} .of-credits-rows .k-row::before { content:"" !important; display:block !important; position:absolute !important; left:4px !important; top:22px !important; width:8px !important;
  height:1.5px !important; margin:0 !important; background:rgb(${BONE} / .55) !important; transform:none !important; translate:none !important; scale:none !important;
  box-shadow:none !important; border:0 !important; }
${C} .of-credits-rows .k-row__name { font-family:var(--dp-face-read, "Instrument Sans") !important; font-size:17px !important; font-weight:500 !important; letter-spacing:0 !important;
  text-transform:none !important; color:rgb(${HOT}) !important; }
/* the line under a name reads as text (versions, makers, addresses keep their case) */
${C} .of-credits-rows .k-row__sub { display:block; margin-top:5px !important; font-family:var(--dp-face-read, "Instrument Sans") !important; font-size:12.5px !important;
  font-weight:400 !important; letter-spacing:.01em !important; text-transform:none !important; line-height:1.45 !important; color:rgb(${BONE} / .66) !important; white-space:normal !important; overflow-wrap:anywhere; }
${C} .of-credits-rows .k-row__num { ${LABEL} font-size:11px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .84) !important; text-align:right; white-space:nowrap; }
/* a licence: its name, its terms in labels, its text as quiet reading */
${C} .of-credits-notice { ${PLAIN} padding:0 0 0 30px !important; margin:0 0 40px !important; position:relative; max-width:none !important; }
${C} .of-credits-notice::before { content:"" !important; position:absolute; left:4px; top:10px; width:8px; height:1.5px; background:rgb(${BONE} / .55); }
${C} .of-credits-notice::after { content:none !important; display:none !important; }
${C} .of-credits-notice > h2 { font-family:var(--dp-face-read, "Instrument Sans") !important; font-size:16px !important; font-weight:600 !important; letter-spacing:0 !important;
  text-transform:none !important; color:rgb(${HOT}) !important; margin:0 !important; }
${C} .of-credits-notice > .k-caps { ${LABEL} margin:6px 0 12px !important; font-size:10px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .64) !important;
  background:none !important; padding:0 !important; }
${C} .of-credits-notice > .k-sentence { font-family:var(--dp-face-read, "Instrument Sans") !important; font-size:12.5px !important; line-height:1.6 !important; max-width:66ch !important;
  color:rgb(${BONE} / .68) !important; margin:0 0 10px !important; text-transform:none !important; letter-spacing:0 !important; }
${C} .orr-cr-end { ${LABEL} display:flex; align-items:center; gap:16px; margin:96px 0 0 30px; font-size:10.5px; letter-spacing:.3em; color:rgb(${BONE} / .68); }
${C} .orr-cr-end::before { content:""; width:28px; height:1px; background:rgb(${BONE} / .4); }
/* Scroll Reveal: each line rises out of the dark as the reel brings it up */
${C} .orr-cr-line { opacity:0; transform:translateY(16px); transition:opacity 640ms var(--dp-ease-out, ease-out), transform 760ms var(--dp-ease-out, ease-out); }
${C} .orr-cr-line.is-in { opacity:1; transform:none; }
${C} .orr-cr-head.orr-cr-line { filter:blur(3px); transition:opacity 640ms var(--dp-ease-out, ease-out), transform 760ms var(--dp-ease-out, ease-out), filter 640ms linear; }
${C} .orr-cr-head.orr-cr-line.is-in { filter:none; }
html.sf-reduce-motion ${C} .orr-cr-line { opacity:1 !important; transform:none !important; filter:none !important; transition:none !important; }
html.sf-reduce-motion ${C} > .orr-cr-emblem { animation:none !important; }

/* ------------------------------------------------ credits: the way back ------------------------ */
${C} > .k-foot { align-items:center !important; }
${C} > .k-foot .sf-back { all:unset !important; box-sizing:border-box !important; cursor:pointer !important; display:inline-flex !important; align-items:baseline !important;
  padding:8px 0 !important; ${LABEL} font-size:13px !important; letter-spacing:.24em !important; color:rgb(${HOT}) !important; }
${C} > .k-foot .sf-back::before { all:unset !important; content:"‹" !important; margin-right:12px !important; font-size:15px !important; color:rgb(${BONE} / .6) !important; }
${C} > .k-foot .sf-back::after { all:unset !important; content:"ESC" / "" !important; margin-left:16px !important; ${LABEL} font-size:10px !important; letter-spacing:.2em !important;
  color:rgb(${BONE} / .58) !important; }
${C} > .k-foot .sf-back:is(:hover, :focus-visible) { color:var(--dp-hand-hot, #ffd98c) !important; }

@media (max-width:1500px) {
  ${C} { grid-template-columns:minmax(180px, 210px) minmax(0, 1fr) !important; }
  ${C} .k-hang > .k-words .k-word { font-size:12px !important; letter-spacing:.14em !important; }
  ${C} .orr-cr-reel { max-width:min(520px, 100%); }
  ${C} > .orr-cr-emblem { width:78vh; height:78vh; margin-top:-39vh; right:max(-12vw, -180px); }
  ${C} .orr-cr-sec + .orr-cr-sec { margin-top:64px; }
  ${C} .of-credits-rows .k-row__name { font-size:15.5px !important; }
}
@media (max-width:900px) {
  ${C} { grid-template-columns:minmax(0, 1fr) !important; grid-template-areas:"title" "hang" "stage" "foot" !important; }
  ${C} > .orr-cr-emblem { display:none; }
}
@media (forced-colors: active) { ${C} > .orr-cr-emblem, ${C} > .orr-cr-drift { display:none; } }
`;

/**
 * Drift Field (ORRERY §4 #17): slow points of light on one canvas behind the credits, in three depths,
 * drifting up with the reel and shifted by its scroll (parallax). It runs only while its screen is
 * shown and never under reduced motion (one still frame instead). Returns null on a shim document.
 */
export function createDriftField(host, { count = 110 } = {}) {
  const doc = host && host.ownerDocument;
  if (!doc || typeof doc.createElement !== 'function') return null;
  const canvas = doc.createElement('canvas');
  const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!ctx) return null;
  canvas.className = 'orr-cr-drift';
  canvas.setAttribute('aria-hidden', 'true');
  // cosmetic randomness only (the sim's rng is never touched by presentation)
  const motes = Array.from({ length: count }, () => {
    const z = 0.25 + Math.random() * 0.75;
    return { x: Math.random(), y: Math.random(), z, r: 0.5 + z * 1.1, a: 0.1 + z * 0.4, vx: (Math.random() - 0.5) * 3 * z, vy: -(4 + Math.random() * 10) * z };
  });
  let w = 0; let h = 0; let dpr = 1; let scroll = 0; let off = null; let last = 0;
  const size = () => {
    // layout pixels for the drawing, screen pixels for the backing store (a 1440p screen zooms the frame)
    const r = host.getBoundingClientRect ? host.getBoundingClientRect() : { width: 0, height: 0 };
    w = Math.max(1, host.offsetWidth || Math.round(r.width)); h = Math.max(1, host.offsetHeight || Math.round(r.height));
    const zoom = r.width > 0 ? r.width / w : 1;
    dpr = Math.min(3, (globalThis.devicePixelRatio || 1) * zoom);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  };
  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const m of motes) {
      const y = ((m.y * h - scroll * m.z * 0.18) % h + h) % h;
      const x = ((m.x * w) % w + w) % w;
      ctx.globalAlpha = m.a;
      ctx.fillStyle = m.z > 0.8 ? 'rgb(248 244 234)' : 'rgb(236 230 216)';
      ctx.beginPath(); ctx.arc(x, y, m.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  const step = (now) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    for (const m of motes) { m.x += (m.vx * dt) / Math.max(1, w); m.y += (m.vy * dt) / Math.max(1, h); }
    draw();
    return true;
  };
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => { size(); draw(); }); ro.observe(host); }
  return {
    el: canvas,
    start() {
      size();
      if (off) return;
      if (reducedMotion() || typeof requestAnimationFrame !== 'function') { draw(); return; }
      last = 0;
      off = onFrame(step);
    },
    stop() { if (off) { off(); off = null; } },
    setScroll(y) { scroll = Number(y) || 0; if (!off) draw(); },
    dispose() { if (off) { off(); off = null; } ro?.disconnect?.(); },
  };
}

/** The emblem behind the reel: the orrery mark, produced art, turning very slowly. */
export function createCreditsEmblem(doc = globalThis.document) {
  if (!doc || typeof doc.createElement !== 'function') return null;
  const node = doc.createElement('div');
  node.className = 'orr-cr-emblem';
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/** The reel's progress as an arc: how far through the credits the reel has rolled. */
export function createReelProgress(doc = globalThis.document) {
  if (!doc || typeof doc.createElementNS !== 'function') return null;
  const el = doc.createElement('div');
  el.className = 'orr-cr-progress';
  el.setAttribute('aria-hidden', 'true');
  const s = svg('svg', { class: 'orr-svg', viewBox: '0 0 62 62' });
  s.appendChild(svg('path', { d: ticksD(31, 31, 30, 40, { len: 2, major: 10, majorLen: 5 }), class: 'orr-core orr-faint', 'stroke-width': 1, 'stroke-linecap': 'butt' }));
  s.appendChild(svg('path', { d: arcD(31, 31, 22, 0, 360), class: 'orr-core orr-faint', 'stroke-width': 2 }));
  const bloom = svg('path', { d: arcD(31, 31, 22, 0, 360), class: 'orr-bloom orr-phos', 'stroke-width': 6, pathLength: 1, 'stroke-dasharray': '0 1', 'stroke-linecap': 'butt' });
  const arc = svg('path', { d: arcD(31, 31, 22, 0, 360), class: 'orr-core orr-phos', 'stroke-width': 2, pathLength: 1, 'stroke-dasharray': '0 1', 'stroke-linecap': 'butt' });
  s.append(bloom, arc);
  const read = doc.createElement('div');
  const n = doc.createElement('b');
  n.className = 'orr-cr-progress__n';
  const l = doc.createElement('span');
  l.className = 'orr-cr-progress__l';
  l.textContent = 'Read';
  read.append(n, l);
  el.append(s, read);
  let shown = -1;
  return {
    el,
    set(frac) {
      const v = Math.max(0, Math.min(1, Number(frac) || 0));
      const pct = Math.round(v * 100);
      if (pct === shown) return;
      shown = pct;
      const dash = `${v.toFixed(4)} 1`;
      arc.setAttribute('stroke-dasharray', dash);
      bloom.setAttribute('stroke-dasharray', dash);
      n.textContent = String(pct);
      const unit = doc.createElement('small');
      unit.textContent = '%';
      n.appendChild(unit);
    },
  };
}

/**
 * Scroll Reveal: lines in `root` (a scroll container) gain `.is-in` as they rise into view, and a
 * section head decrypts the first time it arrives. Under reduced motion, or with no observer, every
 * line is simply shown.
 */
export function revealReel(root, lines) {
  const all = [...(lines || [])];
  const showAll = () => { for (const n of all) n.classList.add('is-in'); };
  if (reducedMotion() || typeof IntersectionObserver !== 'function' || !root) { showAll(); return { dispose() {} }; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const n = e.target;
      io.unobserve(n);
      n.classList.add('is-in');
      if (n.classList.contains('orr-cr-head')) {
        const word = n.querySelector('b');
        if (word) decrypt(word, word.dataset.text || word.textContent, { duration: 320 });
      }
    }
  }, { root, threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  for (const n of all) io.observe(n);
  return { dispose() { io.disconnect(); } };
}

const SPOT_CSS = `
/* Spotlight (ORRERY §4 #13): a soft inspection light rides under the pointer, behind the words */
:is(${S}, ${C}) > .orr-spot { position:absolute; left:0; top:0; width:100%; height:100%; z-index:0; pointer-events:none; opacity:0; transition:opacity .35s linear;
  background:radial-gradient(300px circle at var(--x, 50%) var(--y, 50%), rgb(${BONE} / .075), rgb(${BONE} / .03) 42%, rgb(${BONE} / 0) 72%); }
:is(${S}, ${C}) > .orr-spot.is-on { opacity:1; }
html.sf-reduce-motion :is(${S}, ${C}) > .orr-spot { transition:none; }
@media (forced-colors: active) { :is(${S}, ${C}) > .orr-spot { display:none; } }
`;

const CSS = `${SPOT_CSS}
${SETTINGS_CSS}
${CREDITS_CSS}
${SCROLL_EXTENT_CSS}`;

export function injectOrrerySettings(doc = globalThis.document) {
  if (!doc?.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/**
 * Dress a freshly rendered settings pane: tag every row with its kind (for the sheet), drive each
 * Scale's fill from its value, and seat the rail's light cursor.
 * Idempotent per node; safe on a shim document (every DOM call is guarded).
 */
export function dressSettingsPane(pane, { arrive = false } = {}) {
  if (!pane || typeof pane.querySelectorAll !== 'function') return;
  for (const row of pane.querySelectorAll('.k-row')) {
    if (!row.dataset) continue;
    let kind = 'row';
    if (row.querySelector(':scope > .k-caps')) kind = 'head';
    else if (row.querySelector('input.k-range')) kind = 'slider';
    else if (row.querySelector('select')) kind = 'select';
    else if (row.querySelector('.sf-bind-btn')) kind = 'key';
    else if (row.querySelector('.k-words--row > li')) kind = 'choice';
    else if (row.querySelector(':scope > div > .k-row__name')) kind = 'shortcut';
    row.dataset.orrKind = kind;
  }
  for (const input of pane.querySelectorAll('input.k-range')) {
    if (input.dataset.orrScale === '1') continue;
    input.dataset.orrScale = '1';
    const paint = () => {
      const min = Number(input.min) || 0;
      const max = Number(input.max);
      const span = Number.isFinite(max) && max > min ? max - min : 1;
      const v = Math.max(0, Math.min(1, (parseFloat(input.value) - min) / span));
      input.style.setProperty('--orr-v', v.toFixed(4));
    };
    input.addEventListener('input', paint);
    input.addEventListener('change', paint);
    paint();
  }
  try { syncScrollExtent(pane); } catch (e) { /* a shim document has no layout */ }
  if (arrive && !reducedMotion()) {
    let i = 0;
    for (const node of pane.children) {
      const rows = node.classList && node.classList.contains('k-rows') ? [...node.children] : [node];
      for (const row of rows) {
        if (!row.classList || i > 22) continue;
        row.classList.add('orr-set-rise');
        row.style.setProperty('--orr-delay', `${60 + i * 26}ms`);
        i += 1;
      }
    }
    setTimeout(() => { for (const row of pane.querySelectorAll('.orr-set-rise')) row.classList.remove('orr-set-rise'); }, 1400);
  }
}

/** Spotlight: a soft light that follows the pointer across the screen, behind its words. */
export function attachSpotlight(root) {
  const doc = root && root.ownerDocument;
  if (!doc || typeof root.addEventListener !== 'function' || typeof root.insertBefore !== 'function') return null;
  const spot = doc.createElement('i');
  spot.className = 'orr-spot';
  spot.setAttribute('aria-hidden', 'true');
  root.insertBefore(spot, root.firstChild);
  let frame = 0;
  let px = 0;
  let py = 0;
  const paint = () => {
    frame = 0;
    const r = root.getBoundingClientRect();
    const zoom = root.offsetWidth ? r.width / root.offsetWidth : 1;
    spot.style.setProperty('--x', `${Math.round((px - r.left) / (zoom || 1))}px`);
    spot.style.setProperty('--y', `${Math.round((py - r.top) / (zoom || 1))}px`);
    spot.classList.add('is-on');
  };
  const onMove = (ev) => {
    px = ev.clientX; py = ev.clientY;
    if (frame) return;
    if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(paint); else paint();
  };
  const onLeave = () => spot.classList.remove('is-on');
  root.addEventListener('pointermove', onMove, { passive: true });
  root.addEventListener('pointerleave', onLeave);
  return {
    el: spot,
    dispose() {
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      spot.remove();
    },
  };
}
