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
import { svg, arcD, ticksD, polar } from './svg.js';
import { reducedMotion, onFrame, createSpring } from './motion.js';
import { decrypt } from './text.js';

const STYLE_ID = 'sf-orrery-settings-layouts';
const S = 'html body #screens > .k-screen.of-settings.orr-settings';
const C = 'html body #screens > .k-screen.of-credits.orr-credits';
const BONE = '236 230 216';
const HOT = '248 244 234';
const LABEL = 'font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650 !important; font-weight:650 !important; text-transform:uppercase !important;';
const PLAIN = 'background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; outline:none !important; border-radius:0 !important;';
const HAND = 'clip-path:polygon(0 0, 100% 50%, 0 100%, 30% 50%) !important;';

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
${scope} ${list} ${item}:focus-visible:not(${chosen})::before { left:6.5px !important; width:2.5px !important; height:18px !important; margin-top:-9px !important;
  background:rgb(${HOT}) !important; box-shadow:0 0 8px rgb(255 250 236 / .5) !important; }
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
${S} #sf-settings-pane .k-row:hover::before { width:13px !important; background:rgb(${HOT}) !important; }
${S} #sf-settings-pane .k-row:focus-within::before { left:6.5px !important; width:2.5px !important; height:20px !important; margin-top:-10px !important; background:rgb(${HOT}) !important;
  box-shadow:0 0 8px rgb(255 250 236 / .5) !important; }
${S} #sf-settings-pane .k-row:has(.sf-bind-btn--capture)::before { left:6px !important; width:3px !important; height:24px !important; margin-top:-12px !important;
  background:var(--dp-hand-hot, #ffd98c) !important; box-shadow:0 0 10px rgb(255 217 140 / .7) !important; }
/* a short category spreads its rows over the column: the scales carry it, not a hole under them */
${S} #sf-settings-pane.is-roomy .k-row { min-height:62px !important; }
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

/* a switch / a choice: the words on the line, the chosen one lit with a bead of light; focus stands the
   Hand beside the word (a vertical segment of amber) */
${S} #sf-settings-pane .k-row .k-words--row:has(> li) { ${PLAIN} display:flex !important; flex-direction:row !important; flex-wrap:wrap !important; align-items:center !important;
  gap:4px 20px !important; width:auto !important; height:auto !important; min-width:0 !important; padding:0 !important; justify-self:start !important; }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) > li { list-style:none !important; margin:0 !important; }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) .k-word { all:unset !important; box-sizing:border-box !important; position:relative !important; display:inline-block !important;
  cursor:pointer !important; padding:8px 0 8px 14px !important; ${LABEL} font-size:11.5px !important; letter-spacing:.2em !important; line-height:1 !important;
  color:rgb(${BONE} / .62) !important; transition:color .16s linear; }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) .k-word::after { content:none !important; display:none !important; }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) .k-word::before { content:"" !important; display:block !important; position:absolute !important; left:1px !important; top:50% !important;
  width:4px !important; height:4px !important; margin-top:-2px !important; border-radius:50% !important; background:rgb(${BONE} / .26) !important; transform:none !important;
  translate:none !important; scale:none !important; border:0 !important; box-shadow:none !important; clip-path:none !important; opacity:1 !important; }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) .k-word:hover { color:rgb(${HOT}) !important; }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) .k-word[aria-pressed="true"] { color:rgb(${HOT}) !important; text-shadow:0 0 12px rgb(255 250 236 / .28); }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) .k-word[aria-pressed="true"]::before { left:0 !important; width:6px !important; height:6px !important; margin-top:-3px !important;
  background:rgb(${HOT}) !important; box-shadow:0 0 7px rgb(255 250 236 / .65) !important; }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) .k-word:focus-visible { color:var(--dp-hand-hot, #ffd98c) !important; }
${S} #sf-settings-pane .k-row .k-words--row:has(> li) .k-word:focus-visible::before { left:1.5px !important; width:3px !important; height:16px !important; margin-top:-8px !important;
  border-radius:0 !important; background:var(--dp-hand-hot, #ffd98c) !important; box-shadow:0 0 8px rgb(255 217 140 / .7) !important; }

/* a choice from a list: the chosen word in the label face, its options engraved beneath as a short tick
   scale (one tick per option, the chosen one lit); it opens as the instrument column below */
${S} #sf-settings-pane select.k-select { all:unset !important; -webkit-appearance:none !important; appearance:none !important; box-sizing:border-box !important; display:inline-block !important;
  justify-self:start !important; align-self:end !important; max-width:100% !important; min-width:0 !important; cursor:pointer !important; padding:6px 0 4px !important;
  ${LABEL} font-size:12px !important; letter-spacing:.16em !important; line-height:1.2 !important; color:rgb(${HOT}) !important; background:none !important;
  text-overflow:ellipsis; white-space:nowrap; overflow:hidden; text-shadow:0 0 12px rgb(255 250 236 / .22); }
${S} #sf-settings-pane select.k-select:hover { color:rgb(255 253 248) !important; }
${S} #sf-settings-pane select.k-select:focus-visible, ${S} #sf-settings-pane select.k-select:focus { color:var(--dp-hand-hot, #ffd98c) !important; outline:none !important; }
${S} #sf-settings-pane .k-row[data-orr-kind="select"] { grid-template-rows:auto auto; }
${S} #sf-settings-pane .k-row[data-orr-kind="select"] > :is(label, span.k-t-body) { grid-row:1 / span 2; }
${S} #sf-settings-pane .orr-set-stops { grid-column:2; grid-row:2; justify-self:start; position:relative; display:flex; justify-content:space-between; align-items:flex-end;
  width:calc((var(--n, 3) - 1) * 16px); height:9px; margin:1px 0 2px; font-style:normal; pointer-events:none; }
${S} #sf-settings-pane .orr-set-stops::before { content:""; position:absolute; left:0; right:0; bottom:0; height:1.5px; background:rgb(${BONE} / .3); }
${S} #sf-settings-pane .orr-set-stops > b { position:relative; width:1.5px; height:5px; margin-bottom:0; background:rgb(${BONE} / .5); }
${S} #sf-settings-pane .orr-set-stops > b.is-on { width:3px; height:9px; margin:0 -.75px; background:rgb(${HOT}); box-shadow:0 0 6px rgb(255 250 236 / .55); }
${S} #sf-settings-pane .k-row:has(select:focus) .orr-set-stops > b.is-on { background:var(--dp-hand-hot, #ffd98c); box-shadow:0 0 6px rgb(255 217 140 / .6); }${S} #sf-settings-pane select.k-select option { background:#0b0e13; color:rgb(${HOT}); }
/* the list it opens is an instrument too (a customizable select): a column of light on deep glass, a rail
   down its edge, the chosen option lit; the native control stays the control (keys, pad, probes) */
${S} #sf-settings-pane select.k-select, ${S} #sf-settings-pane select.k-select::picker(select) { appearance:base-select !important; }
${S} #sf-settings-pane select.k-select::picker-icon { display:none; }
${S} #sf-settings-pane select.k-select::picker(select) { border:0; border-radius:0; padding:14px 0; margin-top:6px; width:max-content; min-width:240px; max-width:440px; right:auto;
  background:linear-gradient(90deg, transparent 13px, rgb(${BONE} / .34) 13px 15px, transparent 15px), rgb(6 8 12);
  -webkit-mask-image:linear-gradient(90deg, transparent, #000 18px, #000 calc(100% - 18px), transparent), linear-gradient(180deg, transparent, #000 12px, #000 calc(100% - 12px), transparent);
  -webkit-mask-composite:source-in; mask-image:linear-gradient(90deg, transparent, #000 18px, #000 calc(100% - 18px), transparent), linear-gradient(180deg, transparent, #000 12px, #000 calc(100% - 12px), transparent);
  mask-composite:intersect; box-shadow:none; color:rgb(${HOT}); }
${S} #sf-settings-pane select.k-select option { position:relative; display:flex; align-items:center; min-height:36px; padding:0 30px 0 34px;
  background:none; border:0; outline:none !important; box-shadow:none; color:rgb(${BONE} / .78); font-family:var(--dp-face-read, "Instrument Sans"); font-size:14px; font-weight:500; cursor:pointer; }
${S} #sf-settings-pane select.k-select option::checkmark { display:none; }
${S} #sf-settings-pane select.k-select option::before { content:""; position:absolute; left:10px; top:50%; width:8px; height:1.5px; background:rgb(${BONE} / .5); }
${S} #sf-settings-pane select.k-select option:is(:hover, :focus, :focus-visible) { color:rgb(255 253 248); background:linear-gradient(90deg, rgb(${BONE} / .1), rgb(${BONE} / 0)); outline:none !important; }
${S} #sf-settings-pane select.k-select option:checked { color:rgb(${HOT}); background:none; border:0; outline:none; }
${S} #sf-settings-pane select.k-select option:checked::before { left:24px; width:5px; height:5px; margin-top:-2.5px; border-radius:50%; background:var(--dp-hand-hot, #ffd98c);
  box-shadow:0 0 6px rgb(255 217 140 / .7); }

/* a binding is its key in label caps; focus stands the Hand beside it; listening runs ice */
${S} #sf-settings-pane .sf-bind-btn { all:unset !important; box-sizing:border-box !important; position:relative !important; justify-self:start !important; cursor:pointer !important;
  padding:7px 0 7px 14px !important; min-width:28px !important; ${LABEL} font-size:12.5px !important; letter-spacing:.16em !important; line-height:1 !important; color:rgb(${HOT}) !important;
  background:none !important; white-space:nowrap !important; text-shadow:0 0 12px rgb(255 250 236 / .2); }
${S} #sf-settings-pane .sf-bind-btn::after { content:none !important; display:none !important; }
${S} #sf-settings-pane .sf-bind-btn::before { content:"" !important; display:block !important; position:absolute !important; left:1px !important; top:50% !important; width:4px !important;
  height:4px !important; margin-top:-2px !important; border-radius:50% !important; background:rgb(${BONE} / .4) !important; transform:none !important; box-shadow:none !important; border:0 !important; }
${S} #sf-settings-pane .sf-bind-btn:hover { color:rgb(255 253 248) !important; }
${S} #sf-settings-pane .sf-bind-btn:focus-visible { color:var(--dp-hand-hot, #ffd98c) !important; }
${S} #sf-settings-pane .sf-bind-btn:focus-visible::before { left:1.5px !important; width:3px !important; height:16px !important; margin-top:-8px !important; border-radius:0 !important;
  background:var(--dp-hand-hot, #ffd98c) !important; box-shadow:0 0 8px rgb(255 217 140 / .7) !important; }
${S} #sf-settings-pane .sf-bind-btn:is(.sf-bind-btn--capture, [aria-pressed="true"]) { color:var(--dp-ice, #8fcbff) !important; text-shadow:0 0 12px rgb(143 203 255 / .4); }
${S} #sf-settings-pane .sf-bind-btn:is(.sf-bind-btn--capture, [aria-pressed="true"])::before { left:1.5px !important; width:3px !important; height:16px !important; margin-top:-8px !important;
  border-radius:0 !important; background:var(--dp-ice, #8fcbff) !important; box-shadow:0 0 8px rgb(143 203 255 / .7) !important; animation:orr-set-listen-seg 1s ease-in-out infinite; }
@keyframes orr-set-listen-seg { 50% { opacity:.35; } }
/* a fixed shortcut shares the row grammar: its name in label caps over its note, the key in the bind column */
${S} #sf-settings-pane .k-row[data-orr-kind="shortcut"] { grid-template-columns:var(--orr-label-w, 206px) minmax(0, 1fr) !important; align-items:start !important; padding-top:9px !important; }
${S} #sf-settings-pane .k-row[data-orr-kind="shortcut"] .k-row__name { ${LABEL} font-size:11.5px !important; letter-spacing:.13em !important; line-height:1.3 !important; color:rgb(${BONE} / .84) !important; }
${S} #sf-settings-pane .k-row[data-orr-kind="shortcut"] .k-row__sub { display:block; margin-top:4px; font-family:var(--dp-face-read, "Instrument Sans") !important; font-size:11.5px !important;
  line-height:1.4 !important; color:rgb(${BONE} / .64) !important; white-space:normal !important; text-transform:none !important; letter-spacing:0 !important; }
${S} #sf-settings-pane .k-row[data-orr-kind="shortcut"] > .k-t-emph { ${LABEL} justify-self:start !important; padding-left:14px !important; font-size:12.5px !important; letter-spacing:.16em !important;
  color:rgb(${HOT}) !important; text-align:left !important; margin-top:1px; }
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

@media (min-width:1501px) { ${S} #sf-settings-pane.is-roomy { --orr-scale-w:294px; } }
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
  ${S} #sf-settings-pane :is(.k-word, .sf-bind-btn):focus-visible { outline:2px solid Highlight !important; }
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
${C} > .orr-cr-drift { position:absolute; left:0; top:0; width:100%; height:100%; z-index:1; pointer-events:none; overflow:hidden; }
/* the orrery: the emblem (produced art) the reel turns; the sections ride its orbit as bodies and the amber
   Hand catches the one being read. The art sits at rest light; a second, lit copy shows only round the Hand. */
${C} > .orr-cr-orrery { position:absolute; z-index:1; right:max(-8vw, -140px); top:50%; width:min(86vh, 980px); height:min(86vh, 980px); margin-top:calc(min(86vh, 980px) / -2);
  pointer-events:none; }
${C} .orr-cr-orrery > * { position:absolute; inset:0; width:100%; height:100%; }
${C} .orr-cr-orrery__art { display:block; background:url("${EMBLEM}") center / contain no-repeat; opacity:.3; transform:rotate(var(--orr-cr-turn, 0deg)); will-change:transform; }
${C} .orr-cr-orrery__lit { display:block;
  -webkit-mask-image:radial-gradient(circle at 16% 50%, #000 0, #000 16%, rgb(0 0 0 / .45) 30%, transparent 46%);
  mask-image:radial-gradient(circle at 16% 50%, #000 0, #000 16%, rgb(0 0 0 / .45) 30%, transparent 46%); }
${C} .orr-cr-orrery__lit > .orr-cr-orrery__art { opacity:.92; }
${C} .orr-cr-orrery__svg { overflow:visible; }
${C} .orr-cr-orrery__svg path, ${C} .orr-cr-orrery__svg circle { vector-effect:none !important; }
${C} .orr-cr-body__disc { fill:rgb(10 13 18); stroke:rgb(${BONE} / .7); transition:stroke .3s linear, fill .3s linear; }
${C} .orr-cr-body__halo { fill:rgb(${BONE} / .08); transition:fill .3s linear; }
${C} .orr-cr-body.is-current .orr-cr-body__disc { fill:rgb(${HOT}); stroke:rgb(255 253 248); }
${C} .orr-cr-body.is-current .orr-cr-body__halo { fill:rgb(255 250 236 / .2); }
${C} .orr-cr-body text { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; letter-spacing:.2em; text-transform:uppercase; fill:rgb(${BONE} / .7); }
${C} .orr-cr-body text.orr-cr-body__num { font-size:17px; letter-spacing:.14em; }
${C} .orr-cr-body text.orr-cr-body__name { font-size:19px; opacity:0; transition:opacity .3s linear; }
${C} .orr-cr-body.is-current text { fill:rgb(${HOT}); }
${C} .orr-cr-body.is-current text.orr-cr-body__name { opacity:1; }
${C} .orr-cr-orrery__hand path, ${C} .orr-cr-orrery__hand circle { stroke-linecap:round; }
@media (min-width:1501px) { ${C} .orr-cr-orrery__svg text { paint-order:stroke; stroke:rgb(5 7 10 / .9); stroke-width:6px; stroke-linejoin:round; } }
/* ------------------------------------------------ credits: the section ladder + progress -------- */
${C} > .k-hang { overflow:visible !important; padding:0 !important; margin:0 !important; align-self:start; max-height:none !important; }
${ladder(C, '.k-hang > .k-words', '.k-word', '[aria-current="true"]')}
/* the ladder on Credits stays bone at every state: the one amber here is the Hand on the orrery */
${C} .k-hang > .k-words:is(:focus-within, :hover) .k-word[aria-current="true"]::after { background:rgb(${HOT} / .85) !important; }
${C} .k-hang > .k-words:is(:focus-within, :hover) .k-word[aria-current="true"]::before { background:rgb(${HOT}) !important; filter:drop-shadow(0 0 5px rgb(255 250 236 / .45)); }
/* a long section name breaks at its space onto a second line of its rung, never under the next */
${C} .k-hang > .k-words .k-word { white-space:normal !important; line-height:1.35 !important; padding-top:7px !important; padding-bottom:7px !important; }
${C} .orr-cr-progress { display:grid; grid-template-columns:84px auto; align-items:center; column-gap:16px; margin:30px 0 0 6px; pointer-events:none; }
${C} .orr-cr-progress svg { width:84px; height:84px; overflow:visible; }${C} .orr-cr-progress__n { font-family:var(--dp-face-numeral, "Archivo") !important; font-variation-settings:"wdth" 100, "wght" 280 !important; font-weight:280 !important; font-size:32px;
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
${C} .of-credits-name { margin:0 !important; font-family:var(--dp-face-numeral, "Archivo") !important; font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 230 !important;
  font-weight:230 !important; font-size:clamp(58px, 8.8vh, 100px) !important; line-height:.9 !important; white-space:nowrap; letter-spacing:.02em !important; text-transform:uppercase !important;
  color:rgb(${HOT}) !important; text-shadow:none !important; }${C} .of-credits-ver, ${C} .of-credits-made .k-row__sub { ${LABEL} display:inline-block; margin:18px 22px 0 0 !important; font-size:11px !important; letter-spacing:.24em !important;
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
${C} .of-credits-notice .orr-cr-copy { font-family:var(--dp-face-read, "Instrument Sans") !important; font-size:13px !important; line-height:1.5 !important; color:rgb(${BONE} / .8) !important;
  margin:0 0 8px !important; max-width:66ch; }
${C} .of-credits-notice .orr-cr-unfold { all:unset; box-sizing:border-box; position:relative; cursor:pointer; padding:5px 0 5px 14px; ${LABEL} font-size:10.5px; letter-spacing:.2em; color:rgb(${HOT}); }
${C} .of-credits-notice .orr-cr-unfold::before { content:""; position:absolute; left:1px; top:50%; width:5px; height:5px; margin-top:-2.5px; border-radius:50%; background:rgb(${BONE} / .55); }
${C} .of-credits-notice .orr-cr-unfold:hover { color:rgb(255 253 248); }
${C} .of-credits-notice .orr-cr-unfold:focus-visible { color:var(--dp-hand-hot, #ffd98c); outline:none !important; box-shadow:none !important; }
${C} .of-credits-notice .orr-cr-unfold:focus { outline:none !important; }
${C} .of-credits-notice .orr-cr-unfold:focus-visible::before { width:3px; height:16px; margin-top:-8px; left:2px; border-radius:0; background:var(--dp-hand-hot, #ffd98c); box-shadow:0 0 8px rgb(255 217 140 / .7); }
${C} .of-credits-notice .orr-cr-full { margin-top:10px; }
${C} .of-credits-notice .orr-cr-full[hidden] { display:none !important; }
${C} .orr-cr-end { ${LABEL} display:flex; align-items:center; gap:16px; margin:96px 0 0 30px; font-size:10.5px; letter-spacing:.3em; color:rgb(${BONE} / .68); }
${C} .orr-cr-end::before { content:""; width:28px; height:1px; background:rgb(${BONE} / .4); }
/* Scroll Reveal: each line rises out of the dark as the reel brings it up */
${C} .orr-cr-line { opacity:0; transform:translateY(16px); transition:opacity 640ms var(--dp-ease-out, ease-out), transform 760ms var(--dp-ease-out, ease-out); }
${C} .orr-cr-line.is-in { opacity:1; transform:none; }
${C} .orr-cr-head.orr-cr-line { filter:blur(3px); transition:opacity 640ms var(--dp-ease-out, ease-out), transform 760ms var(--dp-ease-out, ease-out), filter 640ms linear; }
${C} .orr-cr-head.orr-cr-line.is-in { filter:none; }
html.sf-reduce-motion ${C} .orr-cr-line { opacity:1 !important; transform:none !important; filter:none !important; transition:none !important; }


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
  ${C} > .orr-cr-orrery { width:80vh; height:80vh; margin-top:-40vh; right:max(-14vw, -190px); }
  /* a short window: the reel starts high and its foot fades late, so a list shows more than one row */
  ${C} .orr-cr-reel { padding-top:4vh; }
  ${C} > .k-stage { -webkit-mask-image:linear-gradient(180deg, transparent 0, #000 5%, #000 90%, transparent 100%) !important;
    mask-image:linear-gradient(180deg, transparent 0, #000 5%, #000 90%, transparent 100%) !important; }
  ${C} .orr-cr-sec { scroll-margin-top:4vh; }
  ${C} .orr-cr-sec + .orr-cr-sec { margin-top:64px; }
  ${C} .of-credits-rows .k-row__name { font-size:15.5px !important; }
}
@media (max-width:900px) {
  ${C} { grid-template-columns:minmax(0, 1fr) !important; grid-template-areas:"title" "hang" "stage" "foot" !important; }
  ${C} > .orr-cr-orrery { display:none; }
}
@media (forced-colors: active) { ${C} > .orr-cr-orrery, ${C} > .orr-cr-drift { display:none; } }
`;

/**
 * Drift Field (ORRERY §4 #17): slow points of light on one canvas behind the credits, in three depths,
 * drifting up and shifted by the reel's scroll (parallax). It runs only while its screen is shown and
 * stands still under reduced motion (one drawn frame). Returns null on a shim document.
 */
export function createDriftField(host, { count = 90 } = {}) {
  const doc = host && host.ownerDocument;
  if (!doc || typeof doc.createElement !== 'function') return null;
  const canvas = doc.createElement('canvas');
  const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d', { alpha: true }) : null;
  if (!ctx) return null;
  canvas.className = 'orr-cr-drift';
  canvas.setAttribute('aria-hidden', 'true');
  // cosmetic randomness only (the sim's rng is never touched by presentation)
  const motes = Array.from({ length: count }, () => {
    const z = 0.25 + Math.random() * 0.75;
    return { x: Math.random(), y: Math.random(), z, r: 0.6 + z * 1.2, a: 0.14 + z * 0.42, vx: (Math.random() - 0.5) * 3 * z, vy: -(4 + Math.random() * 10) * z };
  });
  // Budget: the motes are slow (a few pixels a second), so the field draws at 20 Hz into a backing store
  // at half the layout size; the drawing is cheap enough to leave the menu its frame rate on an iGPU.
  const HZ_MS = 50;
  const SCALE = 0.5;
  let w = 0; let h = 0; let scroll = 0; let off = null; let last = 0; let lastDraw = 0;
  const size = () => {
    w = Math.max(1, host.offsetWidth || 0); h = Math.max(1, host.offsetHeight || 0);
    canvas.width = Math.max(1, Math.round(w * SCALE)); canvas.height = Math.max(1, Math.round(h * SCALE));
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  };
  const draw = () => {
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const m of motes) {
      const y = ((m.y * h - scroll * m.z * 0.18) % h + h) % h;
      const x = ((m.x * w) % w + w) % w;
      ctx.globalAlpha = m.a;
      ctx.fillStyle = m.z > 0.8 ? '#f8f4ea' : '#ece6d8';
      ctx.beginPath(); ctx.arc(x, y, Math.max(1.1, m.r), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  const step = (now) => {
    if (lastDraw && now - lastDraw < HZ_MS) return true;
    const dt = last ? Math.min(0.2, (now - last) / 1000) : 0;
    last = now; lastDraw = now;
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
      draw();
      if (off || reducedMotion() || typeof requestAnimationFrame !== 'function') return;
      last = 0; lastDraw = 0;
      off = onFrame(step);
    },
    stop() { if (off) { off(); off = null; } },
    setScroll(y) { scroll = Number(y) || 0; if (!off) draw(); },
    dispose() { if (off) { off(); off = null; } ro?.disconnect?.(); },
  };
}

/**
 * The Credits orrery (the screen's signature): the emblem, produced art, is turned by the reel. Each section
 * is a body on one of its orbits, 72 degrees apart; the amber Hand is fixed, pointing back at the reel, and
 * the orrery turns so the body being read comes round under it. `setPosition(s)` takes the reel's
 * position in sections (0 = the first, fractional between them) and swings there on the Hand's spring;
 * reduced motion goes there at once. Returns null on a document without SVG.
 */
export function createCreditsOrrery(doc = globalThis.document, sections = []) {
  if (!doc || typeof doc.createElementNS !== 'function' || typeof doc.createElement !== 'function') return null;
  const el = doc.createElement('div');
  el.className = 'orr-cr-orrery';
  el.setAttribute('aria-hidden', 'true');
  const art = doc.createElement('i');
  art.className = 'orr-cr-orrery__art';
  const litWrap = doc.createElement('i');
  litWrap.className = 'orr-cr-orrery__lit';
  const litArt = doc.createElement('i');
  litArt.className = 'orr-cr-orrery__art';
  litWrap.appendChild(litArt);
  const C0 = 500;
  const ORBIT = 400;
  const STEP = 72;
  const HAND = 270;
  const s = svg('svg', { class: 'orr-svg orr-cr-orrery__svg', viewBox: '0 0 1000 1000' });
  const rotor = svg('g', { class: 'orr-cr-orrery__rotor' });
  // the orbit the sections ride: an annulus of light with its ticks cut through, a rim core over its bloom
  rotor.appendChild(svg('circle', { cx: C0, cy: C0, r: ORBIT, fill: 'none', stroke: 'rgb(236 230 216 / .2)', 'stroke-width': 16 }));
  rotor.appendChild(svg('path', { d: ticksD(C0, C0, ORBIT + 8, 90, { len: 16, major: 0 }), stroke: 'rgb(5 7 10)', 'stroke-width': 2.5, fill: 'none' }));
  rotor.appendChild(svg('circle', { cx: C0, cy: C0, r: ORBIT + 8, fill: 'none', stroke: 'rgb(236 230 216 / .14)', 'stroke-width': 10 }));
  rotor.appendChild(svg('circle', { cx: C0, cy: C0, r: ORBIT + 8, fill: 'none', stroke: 'rgb(236 230 216 / .62)', 'stroke-width': 2.5 }));
  const bodies = sections.map((sec, i) => {
    const a = HAND + STEP * i;
    const [bx, by] = polar(C0, C0, ORBIT, a);
    const g = svg('g', { class: 'orr-cr-body' });
    g.appendChild(svg('circle', { cx: bx.toFixed(1), cy: by.toFixed(1), r: 30, class: 'orr-cr-body__halo' }));
    g.appendChild(svg('circle', { cx: bx.toFixed(1), cy: by.toFixed(1), r: 14, class: 'orr-cr-body__disc', 'stroke-width': 3 }));
    const label = svg('g', { class: 'orr-cr-body__label' });
    const num = svg('text', { x: bx.toFixed(1), y: (by - 34).toFixed(1), 'text-anchor': 'middle', class: 'orr-cr-body__num' });
    num.textContent = String(i + 1).padStart(2, '0');
    const nm = svg('text', { x: bx.toFixed(1), y: (by + 54).toFixed(1), 'text-anchor': 'middle', class: 'orr-cr-body__name' });
    nm.textContent = sec.label;
    label.append(num, nm);
    g.appendChild(label);
    rotor.appendChild(g);
    return { g, label, bx, by };
  });
  s.appendChild(rotor);
  // the Hand: fixed, from the hub back toward the reel, holding the current body at its tip
  const hand = svg('g', { class: 'orr-cr-orrery__hand' });
  const [h0x, h0y] = polar(C0, C0, 34, HAND);
  const [h1x, h1y] = polar(C0, C0, ORBIT - 24, HAND);
  hand.appendChild(svg('path', { d: `M ${h0x} ${h0y} L ${h1x} ${h1y}`, stroke: 'rgb(242 185 80 / .3)', 'stroke-width': 14, fill: 'none' }));
  hand.appendChild(svg('path', { d: `M ${h0x} ${h0y} L ${h1x} ${h1y}`, stroke: 'var(--dp-hand, #f2b950)', 'stroke-width': 4, fill: 'none' }));
  hand.appendChild(svg('path', { d: `M ${h1x + 12} ${h1y - 11} L ${h1x} ${h1y} L ${h1x + 12} ${h1y + 11}`, stroke: 'var(--dp-hand-hot, #ffd98c)', 'stroke-width': 4, fill: 'none', 'stroke-linejoin': 'miter' }));
  hand.appendChild(svg('circle', { cx: C0, cy: C0, r: 26, fill: 'rgb(8 10 14 / .9)', stroke: 'var(--dp-hand, #f2b950)', 'stroke-width': 4 }));
  hand.appendChild(svg('circle', { cx: C0, cy: C0, r: 8, fill: 'var(--dp-hand-hot, #ffd98c)' }));
  s.appendChild(hand);
  el.append(art, litWrap, s);

  let current = -1;
  const apply = (deg) => {
    const t = `${deg.toFixed(2)}deg`;
    el.style.setProperty('--orr-cr-turn', t);
    rotor.setAttribute('transform', `rotate(${deg.toFixed(2)} ${C0} ${C0})`);
    // the words on each body stay upright while the orrery turns
    for (const b of bodies) b.label.setAttribute('transform', `rotate(${(-deg).toFixed(2)} ${b.bx.toFixed(1)} ${b.by.toFixed(1)})`);
  };
  const spring = createSpring({ value: 0, preset: 'swing', onUpdate: apply });
  apply(0);
  const mark = (i) => {
    if (i === current) return;
    current = i;
    bodies.forEach((b, k) => b.g.classList.toggle('is-current', k === i));
  };
  mark(0);
  return {
    el,
    setPosition(pos, { instant = false } = {}) {
      const p = Math.max(0, Math.min(bodies.length - 1, Number(pos) || 0));
      spring.set(-STEP * p, { instant });
      mark(Math.round(p));
    },
    dispose() { spring.stop(); },
  };
}
/** The reel's progress as an arc: how far through the credits the reel has rolled. */
export function createReelProgress(doc = globalThis.document) {
  if (!doc || typeof doc.createElementNS !== 'function') return null;
  const el = doc.createElement('div');
  el.className = 'orr-cr-progress';
  el.setAttribute('aria-hidden', 'true');
  const s = svg('svg', { class: 'orr-svg', viewBox: '0 0 84 84' });
  s.appendChild(svg('path', { d: ticksD(42, 42, 41, 40, { len: 3, major: 10, majorLen: 6 }), class: 'orr-core orr-rest', 'stroke-width': 1.2, 'stroke-linecap': 'butt' }));
  s.appendChild(svg('path', { d: arcD(42, 42, 31, 0, 360), stroke: 'rgb(236 230 216 / .27)', fill: 'none', 'stroke-width': 6 }));
  const bloom = svg('path', { d: arcD(42, 42, 31, 0, 360), class: 'orr-bloom orr-phos', 'stroke-width': 8, pathLength: 1, 'stroke-dasharray': '0 1', 'stroke-linecap': 'butt', opacity: '.4' });
  const arc = svg('path', { d: arcD(42, 42, 31, 0, 360), class: 'orr-core orr-phos', 'stroke-width': 3, pathLength: 1, 'stroke-dasharray': '0 1', 'stroke-linecap': 'butt' });
  s.append(bloom, arc);  const read = doc.createElement('div');
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
  // a long label breaks after its slashes, never inside a word: <wbr> keeps the text (and the label's
  // accessible name) exactly as it was
  for (const label of pane.querySelectorAll('.k-row > label, .k-row > span.k-t-body')) {
    const text = label.textContent || '';
    if (!text.includes('/') || label.children.length || typeof label.append !== 'function') continue;
    const doc = label.ownerDocument;
    const parts = text.split('/');
    label.textContent = '';
    parts.forEach((part, i) => { label.append(part); if (i < parts.length - 1) { label.append('/'); label.append(doc.createElement('wbr')); } });
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
  // a short choice engraves its options beneath it: one tick per option, the chosen one lit
  const doc = pane.ownerDocument || globalThis.document;
  for (const sel of pane.querySelectorAll('select.k-select')) {
    const row = typeof sel.closest === 'function' ? sel.closest('.k-row') : null;
    const n = sel.options ? sel.options.length : 0;
    if (!row || n < 2 || n > 6 || row.querySelector('.orr-set-stops') || !doc) continue;
    const stops = doc.createElement('i');
    stops.className = 'orr-set-stops';
    stops.setAttribute('aria-hidden', 'true');
    stops.style.setProperty('--n', String(n));
    const marks = [];
    for (let i = 0; i < n; i += 1) { const b = doc.createElement('b'); stops.appendChild(b); marks.push(b); }
    row.appendChild(stops);
    const paint = () => marks.forEach((b, i) => b.classList.toggle('is-on', i === sel.selectedIndex));
    paint();
    sel.addEventListener('change', paint);
  }
  const controls = pane.querySelectorAll('.k-row:not([data-orr-kind="head"])').length;
  pane.classList.toggle('is-roomy', controls > 0 && controls <= 10);
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
