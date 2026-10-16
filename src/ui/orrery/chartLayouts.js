// ORRERY composition for the Chart (the M-key map, src/ui/galaxyMap.js — design/frontend/ORRERY.md §6
// Chart). The chart's chrome becomes instruments of light over the paused world:
//
//   - the scale words stand on a ruled ZOOM LEVER (chartInstruments.createZoomLever) with the Hand on
//     the chart's zoom;
//   - the lens rail is words hanging off one SPINE of light, a tick per lens, a lit tick and a bead
//     for each lens that is on — no icons in boxes;
//   - the inspector is glass with dissolved edges (no field, no border); its tabs are words on ruled
//     scales with the Hand under the open one (createTabScale);
//   - commands are words; ENGAGE ROUTE is the one Lamp Key (lampKey.js), its silhouette alone when
//     there is no route;
//   - the foot's four answers stand as stations on one TAPE of light, the leg you are on lit.
//
// It styles the chart's existing nodes (checks and tests read their ids, classes and data-* hooks)
// and pins nothing. Selectors carry one class more than the Deckplate CHART block
// (src/ui/deckplate/screens.js) so this sheet wins without touching it.
import { injectOrrery } from './tokens.js';
import { injectOrreryMobileScreens } from './mobileScreenLayouts.js';
import { injectLampKey } from './lampKey.js';

const STYLE_ID = 'sf-orrery-chart';
const C = 'html body #screens #sf-galaxymap.of-chart.orr-chart';
const BONE = '236 230 216';
const LABEL = 'font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112% !important; font-variation-settings:"wdth" 112, "wght" 650 !important; font-weight:650 !important; text-transform:uppercase !important;';
const PLAIN = 'background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; clip-path:none !important; border-radius:0 !important;';
const RESET_PSEUDO = 'content:none !important; display:none !important;';
/** the rail's spine, centred at x (px): a band of light with body under a crisp edge */
const SPINE_X = 9;
const SPINE = `linear-gradient(90deg, transparent ${SPINE_X - 1}px, rgb(${BONE} / .58) ${SPINE_X - 1}px, rgb(${BONE} / .58) ${SPINE_X + 1}px, transparent ${SPINE_X + 1}px) 0 0 / 100% 100% no-repeat,
  linear-gradient(90deg, transparent ${SPINE_X - 4}px, rgb(${BONE} / .34) ${SPINE_X - 4}px, rgb(${BONE} / .34) ${SPINE_X + 4}px, transparent ${SPINE_X + 4}px) 0 0 / 100% 100% no-repeat,
  repeating-linear-gradient(180deg, rgb(${BONE} / .30) 0 1.5px, transparent 1.5px 9px) ${SPINE_X + 2}px 0 / 4px 100% no-repeat`;
/** focus and hover on a word: a vertical segment of light at its leading edge (never an underline) */
const SEG = (a = 1, x = '0') => `background:linear-gradient(90deg, rgb(248 244 234 / ${a}) 0 2px, transparent 2px) ${x} 50% / 2px 72% no-repeat !important;`;
/** visually hidden, still read aloud */
// the chart in a desktop window: never the phone sheet (mobileScreenLayouts owns that)
const CD = 'html:not([data-sf-mobile="1"]) body #screens #sf-galaxymap.of-chart.orr-chart[data-layout="narrow"]';
const SR = 'position:absolute !important; width:1px !important; height:1px !important; overflow:hidden !important; clip-path:inset(50%) !important; white-space:nowrap !important; margin:0 !important; padding:0 !important;';
/** a word hanging off the spine: its tick */
const TICK = (w = 12, a = 0.5, h = 2) => `content:"" !important; display:block !important; position:absolute !important; left:${SPINE_X}px !important; top:50% !important;
  width:${w}px !important; height:${h}px !important; margin:${-h / 2}px 0 0 !important; padding:0 !important; background:rgb(${BONE} / ${a}) !important; border:0 !important; border-radius:0 !important;
  box-shadow:none !important; transform:none !important; translate:none !important; scale:none !important; rotate:none !important; clip-path:none !important; opacity:1 !important; mask:none !important; -webkit-mask:none !important;`;

const CSS = `
/* The canvas is the map's whole interaction surface (hover, click, drag to pan, wheel, lay the line).
   It sits at a negative z-index inside the screen root, so the root's own box was hit ABOVE it and a real
   pointer never reached it (the stage column was also pointer-events:none, which the canvas inherited).
   The root now lets pointers through to the canvas; the chrome (header words, rail, inspector, foot, the
   interaction layer) opts back in on its own. */
${C} { pointer-events:none; }
${C} .gm-viewport, ${C} .gm-viewport canvas { pointer-events:auto; }
/* ============================ THE HEADER ============================================ */
${C} .gm-title { text-shadow:0 2px 28px rgb(5 7 10 / .7); }
${C} .gm-stamp { ${LABEL} font-size:12px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .7) !important; }
/* CONTROLS and CLOSE are words; CLOSE keeps its ESC key glyph */
${C} :is(.gm-hint-btn, .gm-close) { ${PLAIN} ${LABEL} min-height:32px !important; padding:4px 2px 4px 12px !important; font-size:12px !important; letter-spacing:.2em !important;
  color:rgb(${BONE} / .86) !important; text-shadow:none !important; cursor:pointer; }
${C} :is(.gm-hint-btn, .gm-close)::before { ${RESET_PSEUDO} }
${C} .gm-hint-btn::after { ${RESET_PSEUDO} }
${C} :is(.gm-hint-btn, .gm-close):is(:hover, :focus-visible) { color:rgb(248 244 234) !important; outline:none !important; ${SEG()} }
${C} .gm-hint-btn[aria-expanded="true"] { color:rgb(248 244 234) !important; ${SEG(0.7)} }
${C} .gm-close.k-word::after { margin-left:12px !important; border:0 !important; border-radius:0 !important; background:none !important; box-shadow:none !important; padding:0 !important;
  min-width:0 !important; height:auto !important; color:rgb(${BONE} / .7) !important; letter-spacing:.18em !important; font-size:12px !important; }
${C} .gm-search-kbd { border:0 !important; border-radius:0 !important; background:none !important; box-shadow:none !important; padding:0 !important; min-width:0 !important;
  height:auto !important; color:rgb(${BONE} / .7) !important; font-size:13px !important; }
/* search: words on a band of light, the slash as its key glyph; focus lights the band, not amber */
${C} .gm-search-input.k-input { padding-bottom:10px !important; caret-color:rgb(255 250 238);
  background:linear-gradient(0deg, transparent 5px, rgb(${BONE} / .62) 5px 6.5px, transparent 6.5px) 0 100% / 100% 100% no-repeat,
    linear-gradient(0deg, transparent 2px, rgb(${BONE} / .32) 2px 9px, transparent 9px) 0 100% / 100% 100% no-repeat,
    repeating-linear-gradient(90deg, rgb(${BONE} / .42) 0 1.5px, transparent 1.5px 9px) 0 100% / 100% 3px no-repeat !important; }
${C} .gm-search-input.k-input:focus { background:linear-gradient(0deg, transparent 5px, rgb(248 244 234) 5px 7px, transparent 7px) 0 100% / 100% 100% no-repeat,
    linear-gradient(0deg, transparent 2px, rgb(${BONE} / .44) 2px 10px, transparent 10px) 0 100% / 100% 100% no-repeat,
    repeating-linear-gradient(90deg, rgb(${BONE} / .6) 0 1.5px, transparent 1.5px 9px) 0 100% / 100% 3px no-repeat !important; }
${C} .gm-weather { text-shadow:0 1px 12px rgb(5 7 10 / .8); }
${C} .gm-weather-head { color:rgb(${BONE} / .86); }

/* ============================ THE ZOOM LEVER ======================================== */
${C} .gm-rail { position:relative; align-items:center !important; }
${C} :is(.gm-rail-track, .gm-rail-marker) { display:none !important; }
/* the level reading is the lever's own word row now; its text stays for the checks and the reader */
${C} .gm-level { position:absolute !important; width:1px !important; height:1px !important; overflow:hidden !important; clip:rect(0 0 0 0) !important; white-space:nowrap !important; }
${C} .gm-scale-buttons.k-words { position:relative !important; gap:0 30px !important; background:none !important; padding:0 0 16px !important; isolation:isolate; }
${C} .gm-scale-btn.k-word { ${PLAIN} ${LABEL} position:relative; z-index:1; min-height:28px !important; padding:0 2px 0 8px !important; font-size:12px !important; letter-spacing:.2em !important;
  color:rgb(${BONE} / .66) !important; text-shadow:0 1px 8px rgb(5 7 10 / .9) !important; }
${C} .gm-scale-btn.k-word:is(:hover) { color:rgb(${BONE} / .95) !important; }
${C} .gm-scale-btn.k-word:focus-visible { outline:none !important; color:rgb(248 244 234) !important; ${SEG()} }
${C} .gm-scale-btn.k-word:is([aria-pressed="true"], .is-current) { color:rgb(248 244 234) !important; box-shadow:none !important; background:none !important; }
${C} .orr-chart-lever { position:absolute; top:0; z-index:0; overflow:visible; pointer-events:none; }
${C} .orr-chart-lever__bead { fill:var(--dp-hand-hot, #ffd98c); }
${C} .orr-chart-lever__beadbloom { fill:rgb(242 185 80 / .3); }

/* ============================ THE LENS SPINE ========================================= */
${C} .gm-left-rail { background:${SPINE} !important; background-attachment:local !important; padding-right:8px !important; }
${C} .gm-rail-sec { position:relative; background:none !important; border:0 !important; padding:2px 0 !important; }
${C} .gm-rail-sum { position:relative; padding:3px 0 3px 34px !important; min-height:26px; align-items:center !important; white-space:nowrap !important;
  ${LABEL} font-stretch:100% !important; font-variation-settings:"wdth" 100, "wght" 650 !important; font-size:12px !important; letter-spacing:.12em !important; color:rgb(${BONE} / .8) !important; }
${C} .gm-rail-sum::after { ${RESET_PSEUDO} }
${C} .gm-rail-sum-t { white-space:normal !important; line-height:1.25 !important; }
${C} .gm-rail-sum-n { font-family:"Archivo", system-ui, sans-serif !important; font-stretch:100% !important; font-variation-settings:"wdth" 100, "wght" 300 !important; font-weight:300 !important;
  font-size:17px !important; letter-spacing:0 !important; }
${C} .gm-rail-sum::before { ${TICK(18, 0.72)} }
${C} .gm-rail-sec[open] > .gm-rail-sum::before { background:rgb(248 244 234) !important; }
${C} :is(.gm-rail-sec[open] > .gm-rail-sum, .gm-rail-sum:hover) { color:rgb(248 244 234) !important; }
${C} .gm-rail-sum:focus-visible { outline:none !important; color:rgb(248 244 234) !important; ${SEG(1, '24px')} }
${C} .gm-rail-sum-n { color:rgb(${BONE} / .72) !important; font-variant-numeric:tabular-nums; }
${C} .gm-rail-body { padding-left:0 !important; }
${C} .gm-layer-buttons { gap:8px !important; }
${C} .gm-layer-bank { gap:0 !important; }
${C} .gm-layer-bank-title { position:relative; margin:0 0 2px !important; padding:3px 0 3px 34px !important; ${LABEL} font-size:12px !important; letter-spacing:.24em !important;
  color:rgb(${BONE} / .56) !important; text-shadow:none !important; }
${C} .gm-layer-bank-title::before { ${TICK(8, 0.5, 1.5)} }
${C} .gm-layer-btn.k-word { ${PLAIN} ${LABEL} position:relative !important; display:flex !important; align-items:center !important; width:100% !important; min-height:24px !important;
  padding:0 6px 0 34px !important; font-size:12px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .64) !important; text-shadow:0 1px 8px rgb(5 7 10 / .9) !important; }
${C} .gm-layer-btn.k-word::before { ${TICK(13, 0.32, 1.5)} }
${C} .gm-layer-btn.k-word::after { ${RESET_PSEUDO} }
${C} .gm-layer-ico { display:none !important; }
/* the lens is on: its tick lit, a bead on the spine */
${C} .gm-layer-btn.k-word:is([aria-pressed="true"], .active) { color:rgb(248 244 234) !important; background:none !important; }
${C} .gm-layer-btn.k-word:is([aria-pressed="true"], .active)::before { width:18px !important; height:2px !important; margin-top:-1px !important; background:rgb(248 244 234) !important; }
${C} .gm-layer-state { display:block !important; position:absolute !important; left:${SPINE_X - 4}px !important; top:50% !important; width:8px !important; height:8px !important; margin:-4px 0 0 !important;
  border-radius:50% !important; background:rgb(252 249 240) !important; box-shadow:0 0 0 3px rgb(255 240 214 / .16), 0 0 10px 2px rgb(255 240 214 / .45) !important; opacity:0; transform:scale(.4);
  transition:opacity .18s linear, transform .26s var(--dp-ease-over, cubic-bezier(.34, 1.36, .64, 1)); pointer-events:none; }
${C} .gm-layer-btn.k-word:is([aria-pressed="true"], .active) .gm-layer-state { opacity:0; }
${C} .gm-layer-btn.k-word[aria-pressed="false"]:not(.active) .gm-layer-state { opacity:1; transform:none; background:rgb(5 7 10) !important; box-shadow:0 0 0 1.5px rgb(${BONE} / .6) !important; }
${C} .gm-layer-btn.k-word:hover { color:rgb(${BONE} / .95) !important; ${SEG(0.7, '24px')} }
${C} .gm-layer-btn.k-word:focus-visible { outline:none !important; color:rgb(248 244 234) !important; ${SEG(1, '24px')} }
${C} .gm-layer-name { overflow:visible !important; }
/* the market lens reads one commodity: a word on the spine with its choice under it */
${C} .gm-rail-commodity { position:relative; padding:6px 0 2px 34px !important; }
${C} .gm-rail-commodity label { ${LABEL} font-stretch:100% !important; font-variation-settings:"wdth" 100, "wght" 650 !important; font-size:12px !important; letter-spacing:.06em !important; white-space:nowrap !important; color:rgb(${BONE} / .66) !important; }
${C} .gm-rail-commodity :is(select, .sf-select__field) { ${PLAIN} position:relative; min-height:26px !important; padding:0 0 0 12px !important; justify-content:flex-start !important;
  font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112% !important; font-variation-settings:"wdth" 112, "wght" 650 !important; font-size:13px !important;
  letter-spacing:.08em !important; text-transform:uppercase !important; color:rgb(248 244 234) !important; }
${C} .gm-rail-commodity .sf-select__field svg { display:none !important; }
${C} .gm-rail-commodity .sf-select__field::before { content:"" !important; position:absolute; left:0; top:50%; width:5px; height:5px; margin-top:-2.5px; border-radius:50%;
  background:rgb(252 249 240); box-shadow:0 0 8px 1px rgb(255 240 214 / .45); }
${C} .gm-rail-commodity .sf-select__field:is(:hover, :focus-visible) { outline:none !important; ${SEG(1, '-12px')} }
${C} .gm-rail-commodity .sf-select__list { background:rgb(8 10 14 / .96) !important; border:0 !important; box-shadow:none !important; }
${C} .gm-rail-commodity .sf-select__opt { ${LABEL} font-size:12px !important; letter-spacing:.1em !important; padding:5px 12px !important; background:none !important; }
${C} .gm-rail-commodity .sf-select__opt:is(:hover, .is-active) { color:rgb(248 244 234) !important; ${SEG(1, '4px')} }
${C} .gm-rail-commodity .sf-select__opt.is-selected { color:rgb(248 244 234) !important; ${SEG(0.8, '4px')} }
${C} :is(.gm-rail-item, .gm-legend-row) { background-image:none !important; }
${C} .gm-rail-item { position:relative; padding-left:34px !important; }
/* a tag on a rail row (the plotted alternative, the tracked mission) is lit bone: the Hand is the beam */
${C} :is(.gm-rail-item-tag, .gm-rail-track-g) { color:rgb(248 244 234) !important; }
${C} :is(.gm-rail-item-t, .gm-rail-item-s) { white-space:normal !important; overflow-wrap:anywhere; }
${C} .gm-rail-item-t { font-size:13px !important; line-height:1.3 !important; }
${C} .gm-rail-item-s { font-size:12px !important; line-height:1.3 !important; color:rgb(${BONE} / .7) !important; }
${C} .gm-rail-item::before { ${TICK(10, 0.34, 1.5)} }
${C} :is(.gm-rail-item.is-tracked, .gm-rail-item.is-current) { background:none !important; }
${C} .gm-rail-item:is(:hover, :focus-visible) { outline:none !important; ${SEG(1, '24px')} }
${C} :is(.gm-rail-item.is-tracked, .gm-rail-item.is-current)::before { width:18px !important; height:2px !important; background:rgb(248 244 234) !important; }
${C} .gm-rail-legend, ${C} .gm-hint-text, ${C} .gm-rail-add { margin-left:34px !important; }

/* ============================ THE INSPECTOR ========================================= */
/* glass, not a field: a pool of shade whose edges dissolve into the chart */
${C} .gm-right-inspector { background:none !important; border-color:transparent !important; box-shadow:none !important; }
${C} .gm-body-container::after { content:""; position:absolute; z-index:-1; pointer-events:none; right:0; top:0; bottom:0;
  width:calc(var(--k-margin, 96px) + var(--gm-inspector-w, 320px) + 120px);
  background:linear-gradient(270deg, rgb(4 5 7 / .88), rgb(4 5 7 / .78) 56%, rgb(4 5 7 / 0)); }
/* the tabs: words on ruled scales, the Hand under the open one */
${C} .gm-tabs.k-words { position:relative !important; display:grid !important; grid-auto-flow:column !important; grid-auto-columns:max-content !important; justify-content:start !important; width:max-content !important; min-width:100% !important; gap:4px 16px !important; padding:0 0 4px !important; background:none !important; }
${C} .gm-tab.k-word { ${PLAIN} ${LABEL} position:relative; z-index:1; min-height:0 !important; padding:3px 0 12px !important; justify-content:center !important; text-align:center;
  font-size:12px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .66) !important; white-space:nowrap !important; }
${C} .gm-tab.k-word::before, ${C} .gm-tab.k-word::after { ${RESET_PSEUDO} }
${C} .gm-tab.k-word:hover { color:rgb(${BONE} / .95) !important; }
${C} .gm-tab.k-word:focus-visible { outline:none !important; color:rgb(248 244 234) !important; text-shadow:0 0 14px rgb(255 240 214 / .5) !important; }
${C} .gm-tab.k-word[aria-selected="true"] { color:rgb(248 244 234) !important; background:none !important; }
${C} .gm-tab.k-word.is-empty:not([aria-selected="true"]) { color:rgb(${BONE} / .58) !important; }
/* Expanded copy is ~1.4× these words. The one-row strip then runs past the inspector, which
   clips overflow-x. Those locales wrap onto the scales the tab instrument already draws per
   row (the same wrap the deckplate tab grid used). English, and an unset locale, stays one row. */
html[data-locale]:not([data-locale="en-US"]) body #screens #sf-galaxymap.of-chart.orr-chart .gm-tabs.k-words {
  display:flex !important; flex-wrap:wrap !important; align-items:end;
  width:100% !important; max-width:100% !important; min-width:0 !important;
}
html[data-locale]:not([data-locale="en-US"]) body #screens #sf-galaxymap.of-chart.orr-chart .gm-tab.k-word {
  min-width:0 !important; max-width:100% !important;
  white-space:normal !important; overflow-wrap:anywhere !important;
}
/* Desktop English too: the one-row strip was ~875px of words in a 288px (wide) / ~227px (compact)
   column. The deckplate repeat(auto-fill, minmax(84px, 1fr)) template still sized every track at
   84px, so OVERVIEW (87px of type) lost its O to the inspector's clip, and ECONOMY…HISTORY sat past
   the right edge where no pointer could reach them. Above phone width the words wrap onto the
   scales the tab instrument already draws per row, so all nine stand inside the column. Phone
   (<=760) keeps its own strip in the mobile deck. */
@media (min-width: 761px) {
  ${C} .gm-tabs.k-words { display:flex !important; flex-wrap:wrap !important; align-items:end; grid-template-columns:none !important;
    width:100% !important; max-width:100% !important; min-width:0 !important; gap:10px 16px !important; }
  ${C} .gm-tab.k-word { flex:0 0 auto !important; }
}
/* compact chart (761-1179, ~227px column): smaller, tighter words so three share a row (4 rows, not 5) */
@media (min-width: 761px) and (max-width: 1179px) {
  ${C} .gm-tabs.k-words { gap:9px 12px !important; }
  ${C} .gm-tab.k-word { font-size:12px !important; letter-spacing:.08em !important; padding:2px 0 9px !important; }
}
${C} .orr-chart-tabscale { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; z-index:0; }
/* the two ways back: words with their notch */
${C} .gm-frame-group { gap:2px 18px !important; }
${C} .gm-frame-group .gm-frame-btn { ${PLAIN} ${LABEL} width:auto !important; min-height:30px !important; padding:4px 0 4px 10px !important; justify-content:flex-start !important;
  font-size:12px !important; letter-spacing:.16em !important; color:rgb(248 244 234) !important; white-space:nowrap !important; }
${C} .gm-frame-group .gm-frame-btn::before { ${RESET_PSEUDO} }
${C} .gm-frame-group .gm-frame-btn::after { ${RESET_PSEUDO} }
${C} .gm-frame-group .gm-frame-btn:not(:disabled):is(:hover, :focus-visible) { outline:none !important; ${SEG()} }
${C} .gm-frame-group .gm-frame-btn:disabled { color:rgb(${BONE} / .58) !important; }
/* setting a course is a commit verb in bone at the reading's weight; the Hand lights where you reach it */
${C} :is(#gm-set-course-btn, .gm-plot-btn) { ${PLAIN} width:auto !important; min-height:0 !important; padding:6px 0 8px 12px !important; justify-content:flex-start !important;
  font-family:var(--dp-face-display, "Archivo") !important; font-stretch:125% !important; font-variation-settings:"wdth" 125, "wght" 800 !important; font-weight:800 !important;
  font-size:16px !important; letter-spacing:.1em !important; text-transform:uppercase !important; color:rgb(248 244 234) !important; }
${C} :is(#gm-set-course-btn, .gm-plot-btn)::before, ${C} :is(#gm-set-course-btn, .gm-plot-btn)::after { ${RESET_PSEUDO} }
${C} :is(#gm-set-course-btn, .gm-plot-btn):not(:disabled):is(:hover, :focus-visible) { color:rgb(255 250 238) !important; outline:none !important; ${SEG()}
  text-shadow:0 0 18px rgb(255 240 214 / .35) !important; }
/* the primary commit already says it: the place row does not repeat PLOT COURSE */
${C} .gm-inspector-actions:has(#gm-set-course-btn:not([hidden])) .gm-place-btn[data-place-action="plot"] { display:none !important; }
${C} :is(#gm-set-course-btn, .gm-plot-btn):disabled { color:rgb(${BONE} / .58) !important; }
${C} #gm-engage-route-btn.orr-lampkey:disabled { color:rgb(${BONE} / .66) !important; }
${C} #gm-engage-route-btn.orr-lampkey.is-locking { color:#1c1406 !important; }
${C} #gm-engage-route-btn.orr-lampkey.is-locking::before { background:var(--dp-hand-hot, #ffd98c) !important; box-shadow:0 0 22px 2px rgb(242 185 80 / .45) !important; }
${C} #gm-engage-route-btn.orr-lampkey.is-locking .orr-lampkey__rim { display:none !important; }
${C} #gm-engage-route-btn.is-locking + #gm-engage-reason { ${SR} }
/* ENGAGE ROUTE: the one Lamp Key — its natural width, not a bar */
${C} #gm-engage-route-btn.orr-lampkey { width:auto !important; align-self:flex-start !important; margin-top:6px !important; }
${C} #gm-engage-route-btn.orr-lampkey[data-engage-state="nav:abortRoute"]:not(:disabled)::before { background:var(--dp-danger, #ff5038) !important; }
html:not(.sf-reduce-motion) ${C} #gm-engage-route-btn.orr-lampkey:not(:disabled)::after { animation:orr-lampkey-sheen 6s linear infinite !important; }
${C} :is(.gm-frame-reason, .gm-plot-reason, .gm-engage-reason, .gm-ribbon-reason) { color:rgb(${BONE} / .72) !important; }
${C} .gm-place-actions { gap:0 22px !important; }
${C} .gm-place-btn { ${PLAIN} ${LABEL} min-height:24px !important; padding:2px 0 2px 10px !important; font-size:12px !important; letter-spacing:.16em !important; color:rgb(248 244 234) !important; }
${C} .gm-place-btn::before { ${RESET_PSEUDO} }
${C} .gm-place-btn::after { ${RESET_PSEUDO} }
${C} .gm-place-btn:not(:disabled):is(:hover, :focus-visible) { outline:none !important; ${SEG()} }
${C} .gm-place-btn:is(:disabled, [aria-disabled="true"]) { color:rgb(${BONE} / .58) !important; }
${C} .gm-ins-section { background-image:linear-gradient(90deg, rgb(${BONE} / .34), rgb(${BONE} / .06)) !important; background-size:100% 1.5px !important; background-repeat:no-repeat !important; }
${C} .gm-ins-section:first-child { background-image:none !important; }
${C} .gm-ins-row-val { color:var(--dp-phos, #dfeeff) !important; }
/* the chosen sector's own render heads its record, slowly turning toward the pointer (a tilt plate) */
${C} .gm-ins-plate { position:relative; display:grid; grid-template-columns:auto minmax(0, 1fr); align-items:center; gap:12px; margin:0 0 6px; padding:8px 0 12px 8px; overflow:visible; --gm-plate:108px; }
${C} .gm-ins-plate__art { position:relative; width:var(--gm-plate, 128px); height:var(--gm-plate, 128px); border-radius:50%;
  background:radial-gradient(closest-side, rgb(5 7 10 / .95), rgb(5 7 10 / .9) 82%, rgb(5 7 10 / 0));
  box-shadow:0 0 0 1.5px rgb(${BONE} / .52), 0 0 0 6px rgb(${BONE} / .12); transform:perspective(600px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg)); transition:transform .3s var(--dp-ease-out); }
${C} .gm-ins-plate__art img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
${C} .gm-ins-plate__crest { width:26px; height:26px; object-fit:contain; opacity:.9; }
${C} .gm-ins-plate .gm-ins-target-name { margin:0; font-size:clamp(18px, 1.15vw, 23px) !important; overflow-wrap:normal !important; word-break:normal !important; hyphens:none; }
${C} .gm-ins-plate .gm-ins-kind { white-space:nowrap; }
html.sf-reduce-motion ${C} .gm-ins-plate__art { transition:none; transform:none; }

/* Pilot Situational Briefing (Overview default tab) */
${C} .gm-ov-wp-box { border-left:2px solid var(--dp-hand, #f2b950); background:linear-gradient(90deg, rgb(242 185 80 / .1), rgb(242 185 80 / .01) 88%); padding:6px 8px 6px 10px; margin:4px 0 8px; }
${C} .gm-ov-wp-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:2px; }
${C} .gm-ov-wp-kind { ${LABEL} font-size:12px !important; letter-spacing:.12em !important; color:var(--dp-hand-hot, #ffd98c) !important; }
${C} .gm-ov-wp-dist { font-family:var(--dp-face-mono, "JetBrains Mono", monospace); font-size:12px; font-weight:600; color:var(--dp-phos, #dfeeff); font-variant-numeric:tabular-nums; }
${C} .gm-ov-wp-name { font-size:14px; font-weight:700; color:rgb(252 249 240); line-height:1.25; margin-bottom:2px; }
${C} .gm-ov-wp-reason { font-size:12px; color:rgb(${BONE} / .78); line-height:1.35; }
${C} .gm-ov-contract { padding:6px 0 4px; margin-top:4px; border-top:1px solid rgb(${BONE} / .16); }
${C} .gm-ov-contract-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:2px; }
${C} .gm-ov-contract-tag { ${LABEL} font-size:12px !important; letter-spacing:.12em !important; color:rgb(${BONE} / .72) !important; }
${C} .gm-ov-contract-prog { font-family:var(--dp-face-mono, "JetBrains Mono", monospace); font-size:12px; font-weight:600; color:var(--dp-phos, #dfeeff); }
${C} .gm-ov-contract-title { font-size:14px; font-weight:700; color:rgb(252 249 240); line-height:1.25; margin-bottom:4px; }
${C} .gm-ov-contract-bar { height:3px; background:rgb(${BONE} / .16); margin:4px 0 6px; overflow:hidden; }
${C} .gm-ov-contract-bar > span { display:block; height:100%; background:linear-gradient(90deg, var(--dp-hand, #f2b950), var(--dp-hand-hot, #ffd98c)); }
${C} .gm-ov-contract-brief { font-size:12px; color:rgb(${BONE} / .84); line-height:1.35; margin-bottom:3px; }
${C} .gm-ov-contract-loc { font-size:12px; color:var(--dp-phos, #dfeeff); line-height:1.3; }
${C} .gm-ov-mission-switch { margin-top:6px; padding-top:5px; border-top:1px dashed rgb(${BONE} / .14); }
${C} .gm-ov-mission-switch-k { ${LABEL} display:block; font-size:12px !important; letter-spacing:.1em !important; color:rgb(${BONE} / .64) !important; margin-bottom:4px; }
${C} .gm-ov-mission-pills { display:flex; flex-direction:column; gap:3px; }
${C} .gm-ov-mission-pill { ${PLAIN} display:flex !important; align-items:center; gap:6px; width:100%; min-height:24px !important; padding:2px 6px 2px 8px !important; font-size:12px !important; color:rgb(${BONE} / .78) !important; text-align:left; cursor:pointer; }
${C} .gm-ov-mission-pill.is-active { color:rgb(252 249 240) !important; background:linear-gradient(90deg, rgb(242 185 80 / .16), transparent) !important; border-left:2px solid var(--dp-hand, #f2b950) !important; }
${C} .gm-ov-mission-pill:is(:hover, :focus-visible) { color:rgb(252 249 240) !important; outline:none !important; ${SEG()} }
${C} .gm-ov-mission-pill-g { color:var(--dp-hand-hot, #ffd98c); font-size:12px; flex:0 0 12px; }
${C} .gm-ov-mission-pill-t { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
${C} .gm-ov-markers { display:flex; flex-direction:column; gap:2px; margin:4px 0 8px; }
${C} .gm-ov-marker-row { ${PLAIN} display:grid !important; grid-template-columns:16px minmax(0, 1fr) auto auto; align-items:center; gap:6px; width:100%; min-height:26px !important; padding:3px 4px 3px 6px !important; font-size:12px !important; color:rgb(${BONE} / .88) !important; text-align:left; cursor:pointer; border-bottom:1px solid rgb(${BONE} / .08) !important; }
${C} .gm-ov-marker-row:is(:hover, :focus-visible) { color:rgb(252 249 240) !important; outline:none !important; background:linear-gradient(90deg, rgb(${BONE} / .1), transparent) !important; }
${C} .gm-ov-marker-row[data-marker-tone="goal"] { background:linear-gradient(90deg, rgb(242 185 80 / .14), transparent) !important; }
${C} .gm-ov-marker-row[data-marker-tone="goal"] .gm-ov-marker-g { color:var(--dp-hand-hot, #ffd98c); }
${C} .gm-ov-marker-row[data-marker-tone="hostile"] :is(.gm-ov-marker-g, .gm-ov-marker-n) { color:var(--dp-danger, #ff5038); }
${C} .gm-ov-marker-g { font-size:13px; text-align:center; color:rgb(248 244 234); }
${C} .gm-ov-marker-n { font-weight:600; color:rgb(252 249 240); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
${C} .gm-ov-marker-k { font-size:12px; color:rgb(${BONE} / .64); white-space:nowrap; }
${C} .gm-ov-marker-d { font-family:var(--dp-face-mono, "JetBrains Mono", monospace); font-size:12px; color:var(--dp-phos, #dfeeff); font-variant-numeric:tabular-nums; white-space:nowrap; }
${C} .gm-ov-key-grid { display:flex; flex-wrap:wrap; gap:4px 10px; padding-top:4px; border-top:1px solid rgb(${BONE} / .14); }
${C} .gm-ov-key-item { display:inline-flex; align-items:center; gap:4px; font-size:12px; color:rgb(${BONE} / .72); white-space:nowrap; }
${C} .gm-ov-key-g { color:rgb(252 249 240); font-weight:700; }
${C} .gm-ov-key-item[data-key-tone="goal"] .gm-ov-key-g { color:var(--dp-hand-hot, #ffd98c); }
${C} .gm-ov-key-item[data-key-tone="hostile"] .gm-ov-key-g { color:var(--dp-danger, #ff5038); }

/* ============================ THE FOOT: ONE TAPE ==================================== */
${C} .gm-navfoot { position:relative; padding-top:24px !important; border:0 !important;
  background:linear-gradient(180deg, transparent 6px, rgb(${BONE} / .56) 6px, rgb(${BONE} / .56) 7.5px, transparent 7.5px) 0 0 / 100% 100% no-repeat,
    linear-gradient(180deg, transparent 3px, rgb(${BONE} / .34) 3px, rgb(${BONE} / .34) 11px, transparent 11px) 0 0 / 100% 100% no-repeat,
    repeating-linear-gradient(90deg, rgb(${BONE} / .28) 0 1.5px, transparent 1.5px 10px) 0 12px / 100% 4px no-repeat !important; }
${C} .gm-navfoot .gm-nav-row { position:relative; padding-left:0 !important; background:none !important; box-shadow:none !important; }
/* each answer is a station on the tape: a bead on the band */
${C} .gm-navfoot .gm-nav-row::before { content:""; position:absolute; left:0; top:-20px; width:10px; height:10px; border-radius:50%;
  background:rgb(5 7 10); box-shadow:inset 0 0 0 2px rgb(${BONE} / .62); }
${C} .gm-navfoot .gm-nav-row:not([data-tone="muted"])::before { background:rgb(252 249 240); box-shadow:0 0 0 3px rgb(255 240 214 / .14), 0 0 10px 2px rgb(255 240 214 / .4); }
/* the leg you are on: its station lit and the band lit up to it */
${C} .gm-navfoot .gm-nav-row[data-tone="tracked"]::before { width:12px; height:12px; left:-1px; top:-21px; background:rgb(255 250 238); box-shadow:0 0 0 4px rgb(255 240 214 / .18), 0 0 16px 4px rgb(255 240 214 / .5); }
${C} .gm-navfoot .gm-nav-row[data-tone="tracked"]:not(:first-child)::after { content:""; position:absolute; top:-17px; height:3px; left:calc(-100% - var(--k-gap, 32px)); width:calc(100% + var(--k-gap, 32px));
  background:linear-gradient(90deg, rgb(248 244 234 / .2), rgb(248 244 234 / .95)); box-shadow:0 0 10px 1px rgb(255 240 214 / .3); pointer-events:none; }
${C} .gm-navfoot .gm-nav-row-k { ${LABEL} font-size:12px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .7) !important; }
${C} .gm-navfoot .gm-nav-row-v { color:rgb(248 244 234) !important; }
${C} .gm-navfoot .gm-nav-row[data-tone="tracked"] .gm-nav-row-v { color:var(--dp-phos, #dfeeff) !important; }
${C} .gm-navfoot .gm-nav-row[data-tone="muted"] .gm-nav-row-v { color:rgb(${BONE} / .66) !important; }
${C} .gm-navfoot .gm-nav-row-d { color:rgb(${BONE} / .66) !important; white-space:normal !important; overflow:visible !important; text-overflow:clip !important; line-height:1.3 !important; }
/* the route's own controls are words */
${C} .gm-ribbon-btn { ${PLAIN} ${LABEL} min-height:26px !important; padding:2px 0 2px 10px !important; font-size:12px !important; letter-spacing:.18em !important; color:rgb(248 244 234) !important; }
${C} .gm-ribbon-btn::before { ${RESET_PSEUDO} }
${C} .gm-ribbon-btn::after { ${RESET_PSEUDO} }
${C} .gm-ribbon-btn:not(:disabled):not([aria-disabled="true"]):is(:hover, :focus-visible) { outline:none !important; ${SEG()} }
/* the course in the inspector: its state in one line, its verbs as words; the itinerary rides the beam
   (leg callouts on the chart) and the Travel tab; the reasons stay for the reader, off the glass */
${C} .gm-right-inspector .gm-ribbon { margin:6px 0 0 !important; padding:0 !important; gap:4px !important; }
${C} .gm-right-inspector .gm-ribbon-main { display:block !important; }
${C} .gm-right-inspector .gm-ribbon-head { display:flex !important; flex-wrap:wrap; gap:0 !important; font-size:13px !important; line-height:1.35 !important; color:rgb(${BONE} / .86) !important; margin:0 !important; }
${C} .gm-right-inspector .gm-ribbon-arrival { order:-1; color:rgb(248 244 234) !important; }
${C} .gm-right-inspector .gm-ribbon-arrival:not(:empty)::before { content:none !important; }
${C} .gm-right-inspector .gm-ribbon-head:has(.gm-ribbon-arrival:not(:empty)) .gm-ribbon-status::before { content:" · "; }
${C} .gm-right-inspector .gm-ribbon-status { order:0; }
${C} .gm-inspector-actions:has(#gm-route-ribbon:not([hidden])) #gm-engage-reason { ${SR} }
${C} .gm-right-inspector :is(.gm-ribbon-legs, .gm-ribbon-meta, .gm-ribbon-reason) { ${SR} }
${C} .gm-right-inspector .gm-ribbon-btn[data-ribbon-action="engage"] { display:none !important; }
${C} .gm-right-inspector .gm-ribbon-actions.k-words { gap:0 20px !important; }
${C} .gm-ribbon-btn:is(:disabled, [aria-disabled="true"]) { color:rgb(${BONE} / .58) !important; }

${C} .gm-ribbon-actions.k-words { background:none !important; gap:4px 26px !important; }
${C} .gm-ribbon-status[data-ribbon-state="live"] { color:var(--dp-phos, #dfeeff) !important; }
${C} .gm-ribbon-leg[data-leg-state="active"] .gm-ribbon-leg-g { color:rgb(248 244 234) !important; }
${C} .gm-ribbon-haz[data-haz="watched"] { color:rgb(${BONE} / .86) !important; }

/* the course locking in: one ice pulse runs the tape as the chart hands over to the flight */
${C} .gm-navfoot.is-locking::after { content:""; position:absolute; left:0; top:2px; height:10px; width:18%; pointer-events:none;
  background:linear-gradient(90deg, rgb(143 203 255 / 0), rgb(214 236 255 / .9)); border-radius:5px; animation:orr-chart-lock .5s var(--dp-ease-out) forwards; }
@keyframes orr-chart-lock { from { transform:translateX(-20%); opacity:.2; } 70% { opacity:1; } to { transform:translateX(455%); opacity:0; } }
html.sf-reduce-motion ${C} .gm-navfoot.is-locking::after { animation:none; display:none; }

/* ============================ THE WIDE CHART (owner 2026-10-04: the map takes the screen) ========= */
/* The map is the hero. Above 820 px the page margin tightens, the header folds to two rows, and the
   lens rail becomes a DOCK: its lenses are icon beads at rest, and it opens over the map (never
   pushing it) while the pointer or the focus is in it. The clear field the chart fits itself to grows
   by about half, and nothing moves when the dock opens. */
@media (min-height: 820px) {
  ${C} { --k-margin: clamp(28px, 2.4vw, 48px); row-gap:10px !important; }
  ${C} .gm-head { grid-template-columns:minmax(0, 1fr) auto auto auto !important; grid-template-rows:auto auto !important; row-gap:6px !important; }
  ${C} .gm-title-lockup { grid-column:1 !important; grid-row:1 !important; flex-direction:row !important; align-items:baseline !important; gap:0 26px !important; flex-wrap:wrap; }
  ${C} .gm-title { font-size:clamp(22px, 1.6vw, 30px) !important; }
  ${C} .gm-rail { grid-column:1 !important; grid-row:2 !important; align-self:end; }
  ${C} .gm-search-container { grid-column:2 !important; grid-row:1 !important; width:clamp(220px, 19vw, 360px) !important; }
  ${C} .gm-hint-btn { grid-column:3 !important; grid-row:1 !important; }
  ${C} .gm-close { grid-column:4 !important; grid-row:1 !important; }
  ${C} .gm-weather { grid-column:2 / span 3 !important; grid-row:2 !important; align-self:end; }
  ${C} .gm-weather-bar { display:none !important; }
  ${C} .gm-navfoot { padding-top:20px !important; }
  ${C} .gm-navfoot .gm-nav-row::before { top:-16px; }
  ${C} .gm-navfoot .gm-nav-row[data-tone="tracked"]::before { top:-17px; }
  ${C} .gm-navfoot .gm-nav-row[data-tone="tracked"]:not(:first-child)::after { top:-13px; }
}
/* the foot keeps the stage's width on an ultrawide, like the header and the stage above it */
${C} .gm-apron { width:min(100%, var(--sf-stage-max)); margin-inline:auto; }
/* the dock: one spine of icon beads; the words open over the map on pointer or focus */
@media (min-height: 1px) {
  ${C}[data-layout="wide"] { --gm-rail-w:52px; }
  ${C}[data-layout="wide"] .gm-left-rail { position:relative; z-index:6; width:var(--gm-rail-w); overflow:hidden; align-self:start; max-height:100%; transition:width .3s var(--dp-ease-out, cubic-bezier(.2, .8, .2, 1)); }
  ${C}[data-layout="wide"] .gm-left-rail.is-open { width:252px; overflow:hidden auto;
    background:linear-gradient(90deg, rgb(4 5 7 / .9), rgb(4 5 7 / .84) 70%, rgb(4 5 7 / 0)), ${SPINE}; background-attachment:local; }
  /* at rest: only the lenses, only their icons */
  ${C}[data-layout="wide"] .gm-left-rail:not(.is-open) { background:none !important; padding-right:0 !important; }
  ${C}[data-layout="wide"] .gm-left-rail:not(.is-open) :is(.gm-rail-sec:not([data-rail-sec="lenses"]), .gm-rail-sum, .gm-layer-bank-title, .gm-rail-commodity) { display:none !important; }
  ${C}[data-layout="wide"] .gm-left-rail:not(.is-open) .gm-rail-sec[data-rail-sec="lenses"] { padding:0 !important; }
  ${C}[data-layout="wide"] .gm-left-rail:not(.is-open) .gm-rail-body { padding:0 !important; }
  ${C}[data-layout="wide"] .gm-left-rail:not(.is-open) .gm-layer-buttons { gap:14px !important; align-items:center; position:relative; padding:6px 0; }
  /* the spine behind the beads */
  ${C}[data-layout="wide"] .gm-left-rail:not(.is-open) .gm-layer-buttons::before { content:""; position:absolute; left:calc(50% - 3px); top:0; bottom:0; width:6px; z-index:0; pointer-events:none;
    background:linear-gradient(90deg, transparent 2px, rgb(${BONE} / .6) 2px 4px, transparent 4px), linear-gradient(90deg, rgb(${BONE} / .3) 0 6px); }
  ${C}[data-layout="wide"] .gm-left-rail:not(.is-open) .gm-layer-bank { gap:2px !important; align-items:center; position:relative; z-index:1; }
  ${C}[data-layout="wide"] .gm-left-rail:not(.is-open) .gm-layer-btn.k-word { ${PLAIN} width:44px !important; min-height:32px !important; padding:0 !important; justify-content:center !important;
    margin:0 4px !important; position:relative; }
  /* the bead's own ground: a pool of shade so the spine never prints through the glyph */
  ${C}[data-layout="wide"] .gm-left-rail:not(.is-open) .gm-layer-btn.k-word::after { content:"" !important; display:block !important; position:absolute !important; inset:-4px 3px !important; z-index:-1;
    background:radial-gradient(closest-side, rgb(5 7 10 / 1), rgb(5 7 10 / .96) 62%, rgb(5 7 10 / 0)) !important; border:0 !important; box-shadow:none !important; }
  ${C}[data-layout="wide"] .gm-left-rail:not(.is-open) .gm-layer-btn.k-word:focus-visible { outline:none !important; ${SEG(1, '-1px')} }
  ${C}[data-layout="wide"] .gm-left-rail:not(.is-open) .gm-layer-btn.k-word::before { display:none !important; }
  ${C}[data-layout="wide"] .gm-left-rail:not(.is-open) .gm-layer-state { display:none !important; }
  ${C}[data-layout="wide"] .gm-left-rail:not(.is-open) .gm-layer-name { ${SR} }
  ${C}[data-layout="wide"] .gm-left-rail:not(.is-open) .gm-layer-ico { display:inline-flex !important; width:24px; height:24px; color:rgb(${BONE} / .42); }
  ${C}[data-layout="wide"] .gm-left-rail:not(.is-open) .gm-layer-ico svg { width:24px; height:24px; }
  /* the glyphs carry an amber accent in the Deckplate set; the Hand is the only amber, so it reads in bone here */
  ${C}[data-layout="wide"] .gm-left-rail .gm-layer-ico .dp-icon .accent { fill:currentColor !important; }
  ${C}[data-layout="wide"] .gm-left-rail:not(.is-open) .gm-layer-btn.k-word:is([aria-pressed="true"], .active) .gm-layer-ico { color:rgb(252 249 240); filter:none; }
  ${C}[data-layout="wide"] .gm-left-rail:not(.is-open) .gm-layer-btn.k-word:is([aria-pressed="true"], .active) .gm-layer-ico { filter:drop-shadow(0 0 5px rgb(255 240 214 / .55)); }
}

/* ============================ SHORT SCREENS (below 820 px) ============================ */
/* The map is the hero: the heading and the foot fold to one short line each, and the chart takes
   the height (the clear field runs under the fading chrome). */
@media (max-height: 819px) {
  ${C} { padding-top:20px !important; padding-bottom:14px !important; row-gap:10px !important; }
  ${C} .gm-head { row-gap:4px !important; }
  ${C} .gm-title-lockup { grid-row:1 !important; flex-direction:row !important; align-items:baseline !important; gap:0 22px !important; flex-wrap:wrap; }
  ${C} .gm-title { font-size:clamp(20px, 3.4vh, 28px) !important; }
  ${C} .gm-stamp { white-space:nowrap; }
  ${C} .gm-rail { grid-row:2 / span 2 !important; align-self:end; }
  ${C} .gm-hint-btn, ${C} .gm-close { min-height:28px !important; }
  ${C} .gm-search-input.k-input { min-height:34px !important; }
  ${C} .gm-weather { display:flex !important; gap:0 12px; align-items:baseline; }
  ${C} :is(.gm-weather-terms, .gm-weather-bar) { display:none !important; }
  ${C} .gm-weather-head { white-space:nowrap !important; }
  ${C} .gm-rail-commodity label { white-space:normal !important; }
  ${C} .gm-navfoot { padding-top:17px !important; }
  ${C} .gm-navfoot .gm-nav-row::before { top:-13px; }
  ${C} .gm-navfoot .gm-nav-row[data-tone="tracked"]::before { top:-14px; }
  ${C} .gm-navfoot .gm-nav-row[data-tone="tracked"]:not(:first-child)::after { top:-10px; }
  ${C} .gm-navfoot :is(.gm-nav-row-k, .gm-nav-row-v) { flex:none; }
  ${C} .gm-navfoot .gm-nav-row-v { font-size:14px !important; }
  ${C} .gm-navfoot .gm-nav-row-d { ${SR} }
  ${C} .gm-navfoot .gm-nav-from { ${SR} }
  ${C} .gm-navfoot .gm-nav-row-v { white-space:nowrap !important; overflow:hidden !important; text-overflow:ellipsis !important; flex:0 1 auto !important; min-width:0 !important; }
  ${C} .gm-tab.k-word { padding:2px 0 10px !important; }
  ${C} .gm-ins-plate { --gm-plate:72px; padding:4px 0 8px 6px; }
  /* the inspector's pinned verbs share the column with the sector's readings: on a short screen the
     explanatory sentences stand down to the screen reader and the framing words share one row, so the
     readings (the accordion) keep some of the column */
  ${C} :is(.gm-frame-reason, .gm-plot-reason, .gm-engage-reason) { ${SR} }
  ${C} .gm-frame-group { flex-wrap:nowrap !important; gap:0 18px !important; }
  ${C} .gm-frame-group .gm-frame-btn { min-height:26px !important; }
  ${C} .gm-inspector-actions { gap:2px !important; }
  ${C} :is(#gm-set-course-btn, .gm-plot-btn) { font-size:14px !important; padding:2px 0 4px 12px !important; }
  ${C} #gm-engage-route-btn.orr-lampkey { margin-top:2px !important; }
  ${C} .gm-place-actions { gap:0 14px !important; }
}

/* the foot folds each answer to one line (word beside value) only where a quarter of the band holds
   both: below 1180 px a long value ("No destination set") ran on under the next station's word, so
   there the word stays over its value and the value keeps the whole track */
@media (max-height: 819px) and (min-width: 1180px) {
  ${C} .gm-navfoot .gm-nav-row { flex-direction:row !important; align-items:baseline !important; gap:0 10px !important; }
}

/* a narrow desktop window (no phone sheet): the wide header's one row of title, search and two
   words gave the title a 0 px track and printed CONTROLS over CLOSE. Here the two words (CLOSE keeps
   its ESC) take the top row on the right, and the title, search, reading and scale each get a row. */
@media (max-width: 760px) {
  ${CD} .gm-head { grid-template-columns:minmax(0, 1fr) auto auto !important; grid-template-rows:auto !important; column-gap:18px !important; row-gap:8px !important; }
  ${CD} .gm-hint-btn { grid-column:2 !important; grid-row:1 !important; }
  ${CD} .gm-close { grid-column:3 !important; grid-row:1 !important; }
  ${CD} .gm-title-lockup { grid-column:1 / -1 !important; grid-row:2 !important; min-width:0; }
  ${CD} .gm-title { white-space:normal !important; overflow:visible !important; }
  ${CD} .gm-search-container { grid-column:1 / -1 !important; grid-row:3 !important; width:100% !important; }
  ${CD} .gm-weather { grid-column:1 / -1 !important; grid-row:4 !important; justify-self:start; text-align:left; }
  ${CD} .gm-rail { grid-column:1 / -1 !important; grid-row:5 !important; }
}

/* the two ways back keep their whole words above phone width: a second row, never a clipped ZOOM
   (after the short-screen block, which folds them onto one nowrap row) */
@media (min-width: 761px) {
  ${C} .gm-frame-group { flex-wrap:wrap !important; row-gap:0 !important; }
}
@media (min-width: 761px) and (max-width: 1179px) {
  ${C} .gm-frame-group .gm-frame-btn { max-width:100% !important; white-space:normal !important; text-align:left !important; line-height:1.25 !important; }
}

@media (forced-colors:active) {
  ${C} .gm-left-rail, ${C} .gm-navfoot { background:none !important; }
  ${C} .gm-layer-state, ${C} .gm-navfoot .gm-nav-row::before { background:Highlight !important; box-shadow:none !important; }
  ${C} .orr-chart-lever, ${C} .orr-chart-tabscale { display:none; }
}
`;

export function injectChartLayouts(doc = globalThis.document) {
  injectOrreryMobileScreens(doc);
  if (!doc?.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  injectOrrery(doc);
  injectLampKey(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
