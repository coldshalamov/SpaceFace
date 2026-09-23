// ORRERY screen compositions (design/frontend/ORRERY.md §6). Layout only: where a screen's library
// pieces sit relative to each other once the arc rail owns the leading edge. No chrome is drawn here;
// every surface keeps the ORRERY rule of free type on an edge-less pool of shadow.
const STYLE_ID = 'sf-orrery-screen-layouts';

const POOL = `content:""; position:absolute; inset:-26px -40px; z-index:-1; pointer-events:none;
  background:radial-gradient(closest-side, rgb(3 4 7 / .7), rgb(3 4 7 / .36) 60%, transparent);`;

export const ORRERY_SCREEN_CSS = `
/* title: the drawn mark in flat bone with one slow sweep of light, a size down so the dial carries the
   screen; the full-width divider (a web rule pointing at the planet) goes; the footer is a maker's mark */
.of-title.orr-title .dp-logotype { width:clamp(280px, 34vw, 660px); background:rgb(236 230 216);
  position:relative; overflow:hidden; filter:drop-shadow(0 2px 14px rgb(0 0 0 / .55)); }
.of-title.orr-title .dp-logotype::after { content:""; position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(100deg, transparent 38%, rgb(255 240 210 / .95) 50%, transparent 62%);
  transform:translateX(-130%); animation:orr-mark-sweep 11s ease-in-out 1.4s infinite; }
@keyframes orr-mark-sweep { 0% { transform:translateX(-130%); } 20%, 100% { transform:translateX(130%); } }
html.sf-reduce-motion .of-title.orr-title .dp-logotype::after { animation:none; display:none; }
.of-title.orr-title .dp-title__rule { display:none; }
.of-title.orr-title .dp-title__eyebrow { letter-spacing:.24em; }
.of-title.orr-title > .dp-frame__foot { opacity:.45; }
@media (forced-colors: active) { .of-title.orr-title .dp-logotype::after { display:none; } }

/* pause: the title's grammar held mid-flight -- no web divider under the name; the name in the
   extended display cut the rest of ORRERY uses; the keys in the foot are bare glyphs, no outlines */
.of-pause.orr-pause .dp-title__rule { display:none; }
#screens .of-pause.orr-pause .dp-title__name, html body #screens .of-pause.orr-pause .dp-title__name { font-family:var(--dp-face-display, "Archivo") !important; font-stretch:125%; font-weight:800 !important;
  font-variation-settings:"wght" 800, "wdth" 125; letter-spacing:.005em; text-transform:uppercase; color:rgb(236 230 216);
  background:none !important; -webkit-text-fill-color:currentColor; text-shadow:0 2px 16px rgb(0 0 0 / .5); }
.of-pause.orr-pause .sf-pause-foot .dp-kbd { background:none !important; border:0 !important; box-shadow:none !important; border-image:none !important;
  color:rgb(232 226 212 / .78) !important; padding:0 8px 0 0 !important; font-weight:700; letter-spacing:.12em; }
.of-pause.orr-pause .sf-pause-foot { align-items:baseline; }
.of-pause.orr-pause .sf-pause-foot .dp-kbd, .of-pause.orr-pause .sf-pause-foot .sf-pause-key-verb { vertical-align:baseline; line-height:1; margin:0 !important; }
.of-pause.orr-pause .sf-pause-foot .sf-pause-key-verb { margin-right:22px !important; }
/* the brief is an instrument reading: no rules, no link underline */
.of-pause > .sf-pause-brief.orr-brief > * { border:0 !important; box-shadow:none !important; background:none !important; }
.of-pause > .sf-pause-brief.orr-brief .dp-etch { font-size:10px; letter-spacing:.26em; color:rgb(232 226 212 / .55); }
.of-pause > .sf-pause-brief.orr-brief :is(a, [data-entity], .sf-entity) { text-decoration:none !important; border:0 !important;
  box-shadow:none !important; color:rgb(246 241 230) !important; background:none !important; }
.of-pause > .sf-pause-brief.orr-brief .sf-slot-name { font-size:18px; line-height:1.35; color:rgb(236 230 216); }
.of-pause > .sf-pause-brief.orr-brief .dp-copy--fine { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:rgb(232 226 212 / .5); }
.of-pause > .sf-pause-brief.orr-brief .sf-slot-name { display:flex; flex-direction:column; gap:6px; }
.orr-brief__kind { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:10px; letter-spacing:.26em; color:rgb(232 226 212 / .6); }
.orr-brief__name { font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-weight:800; font-variation-settings:"wght" 800, "wdth" 125;
  font-size:22px; line-height:1.1; letter-spacing:.005em; text-transform:uppercase; color:rgb(246 241 230); }
.orr-brief__read { display:flex; align-items:center; gap:10px; margin-top:2px; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%;
  font-size:12px; font-weight:600; letter-spacing:.16em; text-transform:uppercase; color:rgb(232 226 212 / .72); }
.orr-brief__read b { font-family:var(--dp-face-numeral, "Archivo"); font-size:16px; letter-spacing:.02em; color:#dfeeff; }
.orr-brief__ring { width:22px; height:22px; }
.orr-brief__track { fill:none; stroke:rgb(232 226 212 / .2); stroke-width:2; }
.orr-brief__fill { fill:none; stroke:#8fcbff; stroke-width:2.4; stroke-linecap:round; }
/* pause: the dial owns the left edge, so the flight brief is a reading on the right */
.of-pause > .sf-pause-brief.orr-brief { position:absolute; right:clamp(24px, 3.4vw, 72px); top:clamp(84px, 11vh, 132px);
  width:min(520px, 34vw); margin:0; z-index:2; }
.of-pause > .sf-pause-brief.orr-brief::before { ${POOL} background:radial-gradient(closest-side, rgb(4 6 9 / .84), rgb(4 6 9 / .56) 60%, transparent); inset:-34px -54px; }
@media (max-width: 1100px) { .of-pause > .sf-pause-brief.orr-brief { width:min(420px, 40vw); } }

#screens .k-screen.orr-newgame { background:
  linear-gradient(90deg, rgb(6 8 11 / .84) 0%, rgb(6 8 11 / .74) 30%, rgb(6 8 11 / .4) 58%, rgb(6 8 11 / .24) 100%),
  url("/assets/ui/backdrops/backdrop-title.jpg") center / cover no-repeat !important; }
/* the hull's choice at the hull: stations on an arc under the ship */
#screens .orr-newgame > .orr-ng-pick { position:absolute; inset:0; pointer-events:none; z-index:3; }
#screens .orr-newgame .orr-turntable .k-word { background:none !important; border:0 !important; box-shadow:none !important; border-image:none !important;
  min-width:0 !important; min-height:0 !important; padding:2px 4px !important; font-family:var(--dp-face-display, "Archivo"); font-stretch:125%;
  font-variation-settings:"wght" 760, "wdth" 125; font-size:15px !important; letter-spacing:.14em; text-transform:uppercase; color:rgb(232 226 212 / .58) !important;
  text-shadow:0 1px 0 rgb(0 0 0 / .6), 0 0 12px rgb(0 0 0 / .6); white-space:nowrap; }
#screens .orr-newgame .orr-turntable .k-word[aria-pressed="true"] { color:rgb(246 241 230) !important; text-shadow:0 0 1px rgb(255 226 178 / .5), 0 0 10px rgb(255 217 140 / .25), 0 1px 0 rgb(0 0 0 / .6); }
#screens .orr-newgame .orr-turntable .k-word:is(:hover, :focus-visible) { color:rgb(246 241 230) !important; outline:none; }
#screens .orr-newgame .orr-turntable .k-word-sub { text-align:center; font-size:10px; letter-spacing:.18em; text-transform:uppercase; color:rgb(232 226 212 / .45); margin-top:3px; }
#screens .orr-newgame .orr-ng-pick > div > .orr-ng-label, #screens .orr-newgame .orr-ng-pick #sf-ng-starter-label { display:none; }
#screens .orr-newgame .orr-ng-pick .k-sentence { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
#screens .orr-newgame .orr-stoparc .k-word { background:none !important; border:0 !important; box-shadow:none !important; border-image:none !important;
  min-width:0 !important; min-height:0 !important; padding:2px 4px !important; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%;
  font-weight:650; font-size:12px !important; letter-spacing:.22em; text-transform:uppercase; color:rgb(232 226 212 / .6) !important;
  text-shadow:0 1px 0 rgb(0 0 0 / .6); white-space:nowrap; }
#screens .orr-newgame .orr-stoparc .k-word[aria-pressed="true"] { color:rgb(246 241 230) !important; text-shadow:0 0 1px rgb(255 226 178 / .5), 0 0 9px rgb(255 217 140 / .22); }
#screens .orr-newgame .orr-stoparc .k-word:is(:hover, :focus-visible) { color:rgb(246 241 230) !important; outline:none; }
#screens .orr-newgame .orr-stoparc .k-word-sub { text-align:center; font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:rgb(232 226 212 / .42); margin-top:2px; }
/* the numbers as arcs of ice */
#screens .orr-newgame .orr-ng-stats { display:flex; gap:22px; margin:4px 0 2px; }
#screens .orr-newgame .orr-ng-stat { position:relative; width:64px; display:flex; flex-direction:column; align-items:center; }
#screens .orr-newgame .orr-ng-stat { width:78px; }
#screens .orr-newgame .orr-ng-stat svg { width:78px; height:58px; overflow:visible; }
#screens .orr-newgame .orr-ng-stat__ticks { fill:none; stroke:rgb(232 226 212 / .3); stroke-width:1; }
#screens .orr-newgame .orr-ng-stat__track { fill:none; stroke:rgb(232 226 212 / .16); stroke-width:1.6; stroke-linecap:round; }
#screens .orr-newgame .orr-ng-stat__fill { fill:none; stroke:rgb(246 241 230); stroke-width:2.4; stroke-linecap:round; filter:drop-shadow(0 0 4px rgb(255 236 200 / .35)); }
#screens .orr-newgame .orr-ng-stat__ghost { stroke:rgb(232 226 212 / .38); stroke-width:1.2; }
#screens .orr-newgame .orr-ng-stat b { position:static; margin-top:-6px; text-align:center; font-family:var(--dp-face-display, "Archivo");
  font-variation-settings:"wght" 760, "wdth" 125; font-size:17px; color:rgb(246 241 230); letter-spacing:.02em; }
#screens .orr-newgame .orr-ng-stat b i { font-style:normal; font-size:9px; margin-left:3px; color:rgb(232 226 212 / .55); letter-spacing:.1em; }
#screens .orr-newgame .orr-ng-stat span { margin-top:2px; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-size:9px; letter-spacing:.24em;
  text-transform:uppercase; color:rgb(232 226 212 / .55); }
/* the loadout: one module a line, the size a small ringed tag */
#screens .orr-newgame .orr-ng-caption .k-words--row { flex-direction:column; gap:5px; }
#screens .orr-newgame .orr-ng-caption .k-words--row .fh-legend { font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%;
  font-weight:600; font-size:12px !important; letter-spacing:.16em; text-transform:uppercase; color:rgb(236 230 216 / .82) !important; }
#screens .orr-newgame .orr-ng-size { margin-left:8px; font-size:10px; letter-spacing:.1em; color:rgb(232 226 212 / .45); }
#screens .orr-newgame .orr-ng-size::before { content:"·"; margin-right:8px; color:rgb(232 226 212 / .3); }
/* the first minutes: numbered stations on a traced line, no stepper dots */
#screens .orr-newgame .sf-ng-route__steps { counter-reset:orrbeat; }
#screens .orr-newgame .sf-ng-route__step { counter-increment:orrbeat; }
#screens .orr-newgame .sf-ng-route__step::before { content:counter(orrbeat, decimal-leading-zero); left:-26px; top:4px; width:auto; height:auto;
  border-radius:0; background:none !important; box-shadow:none !important; font-family:var(--dp-face-numeral, "Archivo"); font-size:10px;
  font-weight:700; letter-spacing:.06em; color:rgb(232 226 212 / .55); }
#screens .orr-newgame .sf-ng-route__step:first-child::before { color:var(--dp-hand, #f2b950); }
#screens .orr-newgame .sf-ng-route__steps { padding-left:34px !important; }
#screens .orr-newgame .sf-ng-route__steps::before { left:20px; }
/* crucible: the door's tile rows are stations on ruled lines; the smoked window is glass; the keys
   are light. (Door, armory, refit and results share the .orr-crucible root.) */
#screens .orr-crucible .orr-mark { font-family:var(--dp-face-display, "Archivo"); font-stretch:125%;
  font-variation-settings:"wght" 800, "wdth" 125 !important; font-size:clamp(56px, min(9vw, 12vh), 132px) !important; line-height:.9 !important;
  letter-spacing:.005em; text-transform:uppercase; color:rgb(236 230 216) !important; background:none !important; -webkit-text-fill-color:currentColor;
  margin:0; text-shadow:0 2px 18px rgb(0 0 0 / .5); }
#screens .orr-crucible .orr-window { position:relative; background:none !important; border:0 !important; border-image:none !important;
  box-shadow:none !important; padding:6px 0 !important; }
#screens .orr-crucible .orr-window::before { content:""; position:absolute; inset:-30px -70px -30px -40px; z-index:-1; pointer-events:none;
  background:radial-gradient(closest-side, rgb(4 6 9 / .74), rgb(4 6 9 / .46) 62%, transparent); }
#screens .orr-crucible .k-row { background:none !important; border:0 !important; box-shadow:none !important; }
#screens .orr-crucible .orr-legend { font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-weight:650 !important; font-size:10px !important;
  letter-spacing:.26em !important; text-transform:uppercase; color:rgb(232 226 212 / .58) !important; margin:0 0 8px !important; }
#screens .orr-crucible .orr-legend[data-fh-lit="on"] { color:rgb(232 226 212 / .72) !important; }
#screens .orr-crucible .orr-stationrow { gap:clamp(8px, 1.4vw, 26px) !important; }
#screens .orr-crucible .orr-tile { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important;
  display:flex !important; flex-direction:column; align-items:center; gap:6px; padding:4px 6px !important; min-width:0 !important; width:auto !important;
  min-height:0 !important; color:rgb(232 226 212 / .58) !important; cursor:pointer; }
#screens .orr-crucible .orr-tile .fh-tile-art img { width:calc(58px * var(--k-s, 1)) !important; height:calc(58px * var(--k-s, 1)) !important;
  opacity:.62; filter:saturate(.7); transition:opacity .18s linear, filter .18s linear, transform .24s var(--dp-ease-out, ease-out); }
#screens .orr-crucible .orr-tile .fh-tile-art svg { width:34px; height:34px; opacity:.6; color:rgb(232 226 212); }
#screens .orr-crucible .orr-tile .fh-tile-legend { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:11px;
  letter-spacing:.18em; text-transform:uppercase; text-align:center; line-height:1.25; }
#screens .orr-crucible .orr-tile:is([aria-pressed="true"], :hover, :focus-visible) { color:rgb(246 241 230) !important; outline:none; }
#screens .orr-crucible .orr-tile[aria-pressed="true"] .fh-tile-art img { opacity:1; filter:saturate(1) drop-shadow(0 0 10px rgb(255 190 110 / .35)); transform:scale(1.08); }
#screens .orr-crucible .orr-tile[aria-pressed="true"] .fh-tile-art svg { opacity:1; }
#screens .orr-crucible .orr-tile[aria-disabled="true"] { opacity:.45; }
#screens .orr-crucible .orr-input { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important;
  color:rgb(246 241 230) !important; font-family:var(--dp-face-display, "Archivo"); font-variation-settings:"wght" 800, "wdth" 125;
  font-size:clamp(28px, 3.6vh, 44px); font-variant-numeric:tabular-nums; letter-spacing:.04em; padding:0 2px 6px !important; min-height:0 !important;
  background-image:linear-gradient(90deg, rgb(232 226 212 / .5), rgb(232 226 212 / .06)) !important; background-size:100% 1px !important;
  background-position:0 100% !important; background-repeat:no-repeat !important; caret-color:var(--dp-hand, #f2b950); outline:none; }
#screens .orr-crucible .orr-input:focus { background-image:linear-gradient(90deg, var(--dp-hand, #f2b950), rgb(242 185 80 / .08)) !important; }
#screens .orr-crucible :is(.orr-key--small, .orr-key--legend) { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important;
  min-width:0 !important; min-height:0 !important; padding:6px 2px !important; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650;
  font-size:12px !important; letter-spacing:.22em; text-transform:uppercase; color:rgb(232 226 212 / .7) !important; }
#screens .orr-crucible :is(.orr-key--small, .orr-key--legend):is(:hover, :focus-visible) { color:rgb(246 241 230) !important; outline:none; }
#screens .orr-crucible :is(.orr-key--hazard, .orr-key--primary) { position:relative; overflow:visible; border:0 !important; border-image:none !important;
  border-radius:0 !important; background:none !important; box-shadow:none !important; clip-path:none; min-width:0 !important; min-height:0 !important;
  color:var(--dp-hand, #f2b950) !important; padding:10px 4px 14px !important; font-family:var(--dp-face-display, "Archivo"); font-stretch:125%;
  font-variation-settings:"wght" 800, "wdth" 125; font-size:clamp(20px, 2.4vh, 28px) !important; letter-spacing:.1em; text-transform:uppercase;
  text-shadow:0 0 18px rgb(242 185 80 / .35);
  background-image:linear-gradient(90deg, var(--dp-hand, #f2b950), rgb(242 185 80 / 0)) !important; background-size:100% 2px !important;
  background-position:0 100% !important; background-repeat:no-repeat !important; }
#screens .orr-crucible :is(.orr-key--hazard, .orr-key--primary):is(:hover, :focus, :focus-visible) { color:var(--dp-hand-hot, #ffd98c) !important;
  outline:none !important; box-shadow:none !important; text-shadow:0 0 26px rgb(255 217 140 / .6);
  background-image:linear-gradient(90deg, var(--dp-hand-hot, #ffd98c), rgb(255 217 140 / 0)) !important; }
/* the share and ghost codes are secondary readings: a size down from the seed */
#screens .orr-crucible .sf-crd-share .orr-input, #screens .orr-crucible input.orr-input:not(#sf-crd-seed):not([inputmode="numeric"]) {
  font-size:clamp(16px, 2vh, 22px) !important; }
html body #screens .k-screen.orr-crucible .sf-back.k-word { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important;
  font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:13px !important; letter-spacing:.24em; color:rgb(232 226 212 / .7) !important; }
html body #screens .k-screen.orr-crucible .sf-back.k-word::after { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important;
  padding:0 !important; color:rgb(232 226 212 / .4) !important; font-size:10px !important; letter-spacing:.2em; }

/* crucible armory, refit, results: the printed cards and plates become readings. Each offer keeps
   its words and loses its card: a hairline leader down its left that lights amber when it is the
   choice, the quick-buy key in a ring, the name in display type, the price a numeral. */
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-card { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important;
  position:relative; padding:10px 8px 14px 20px !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-card::before { content:""; position:absolute; left:4px; top:12px; bottom:14px; width:1px;
  background:linear-gradient(rgb(232 226 212 / .45), rgb(232 226 212 / .06)); transition:background .16s linear, box-shadow .16s linear; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-card::after { content:""; position:absolute; left:20px; right:18%; top:4px; height:1px;
  background:linear-gradient(90deg, rgb(232 226 212 / .26), transparent); }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-card:is(:hover, :focus-visible):not(:disabled)::before { width:2px; left:3px;
  background:linear-gradient(var(--dp-hand, #f2b950), rgb(242 185 80 / .15)); box-shadow:0 0 10px rgb(242 185 80 / .45); }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-card:is(:hover, :focus-visible):not(:disabled) .sf-cru-name { color:rgb(246 241 230); text-shadow:0 0 1px rgb(255 226 178 / .5), 0 0 10px rgb(255 217 140 / .2); }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-card:focus-visible { outline:none !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-name { font-family:var(--dp-face-display, "Archivo") !important; font-variation-settings:"wght" 780, "wdth" 125 !important;
  letter-spacing:.02em !important; font-size:clamp(16px, 1.9vh, 22px) !important; color:rgb(236 230 216) !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-verb { font-family:var(--dp-face-label, "Archivo") !important; font-variation-settings:normal !important; font-stretch:112%; font-weight:650;
  font-size:10px !important; letter-spacing:.26em !important; color:rgb(232 226 212 / .55) !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-key { background:none !important; border:0 !important; border-image:none !important; box-shadow:inset 0 0 0 1px rgb(232 226 212 / .45) !important;
  border-radius:50%; width:20px; height:20px; min-width:20px; display:inline-grid; place-items:center; font-size:10px !important; color:rgb(236 230 216) !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) :is(.sf-cru-price, .sf-cru-wallet) { font-family:var(--dp-face-display, "Archivo"); font-variation-settings:"wght" 760, "wdth" 125;
  color:rgb(246 241 230) !important; letter-spacing:.02em; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-blurb { color:rgb(232 226 212 / .74) !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-slot { letter-spacing:.06em; }
/* the category words on their ruled line: no lamp bar, no rail */
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-filters { background:none !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-filters .k-word { background:none !important; padding:0 2px 4px !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-filters .k-word[aria-pressed='true'] { color:rgb(246 241 230) !important; background:none !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-filters .k-word:focus-visible { background:none !important; color:rgb(246 241 230) !important; }
/* refit and results: the plates go; rows part by space, not rules */
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) :is(.sf-cru-stage, .k-stage, .sf-crd-band, .sf-crd-ledger, .sf-crd-story) { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .k-row { background:none !important; border:0 !important; box-shadow:none !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-key:empty { display:none !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-rows .k-word { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; min-width:0 !important;
  min-height:0 !important; padding:6px 2px !important; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:12px !important;
  letter-spacing:.24em; text-transform:uppercase; color:rgb(232 226 212 / .72) !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-rows .k-word::before { content:""; display:inline-block; width:14px; height:1px; margin-right:10px; vertical-align:middle; background:rgb(232 226 212 / .4); }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-rows .k-word:is(:hover, :focus-visible) { color:rgb(246 241 230) !important; outline:none !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-rows .k-word:is(:hover, :focus-visible)::before { background:var(--dp-hand, #f2b950); box-shadow:0 0 8px rgb(242 185 80 / .5); }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-rows .k-word[aria-disabled="true"], html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-rows .k-word:disabled { color:rgb(232 226 212 / .34) !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) :is(.k-hang, .k-panel, .sf-crres__ledger) { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .k-stage { position:relative; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .k-stage::before { content:""; position:absolute; inset:-24px -50px; z-index:-1; pointer-events:none;
  background:radial-gradient(closest-side, rgb(4 6 9 / .66), rgb(4 6 9 / .38) 64%, transparent); }
/* the foot: the one forward key is light; the rest are words */
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-foot .k-word, html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .k-foot .k-word { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important;
  min-height:0 !important; padding:8px 2px !important; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650;
  font-size:13px !important; letter-spacing:.22em; text-transform:uppercase; color:rgb(232 226 212 / .72) !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-foot .k-word:is(:hover, :focus-visible), html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .k-foot .k-word:is(:hover, :focus-visible) { color:rgb(246 241 230) !important; outline:none !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .k-foot .k-word.k-word--primary { color:var(--dp-hand, #f2b950) !important; font-family:var(--dp-face-display, "Archivo");
  font-variation-settings:"wght" 800, "wdth" 125; font-size:clamp(17px, 2vh, 22px) !important; letter-spacing:.1em; text-shadow:0 0 18px rgb(242 185 80 / .35);
  background-image:linear-gradient(90deg, var(--dp-hand, #f2b950), rgb(242 185 80 / 0)) !important; background-size:100% 2px !important;
  background-position:0 100% !important; background-repeat:no-repeat !important; padding-bottom:12px !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .k-foot .k-word.k-word--primary:is(:hover, :focus-visible) { color:var(--dp-hand-hot, #ffd98c) !important; text-shadow:0 0 26px rgb(255 217 140 / .6); }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .k-foot .k-word::after { background:none !important; border:0 !important; box-shadow:none !important; color:rgb(232 226 212 / .4) !important; }
/* results: the round reached stands in light rays */
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .k-hero { position:relative; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .k-hero::before { content:""; position:absolute; left:50%; top:50%; width:360px; height:360px; margin:-180px 0 0 -180px; z-index:-1; pointer-events:none;
  background:repeating-conic-gradient(from 0deg, rgb(255 217 140 / .1) 0deg 2deg, transparent 2deg 12deg);
  -webkit-mask-image:radial-gradient(circle, #000 0%, rgb(0 0 0 / .5) 30%, transparent 70%); mask-image:radial-gradient(circle, #000 0%, rgb(0 0 0 / .5) 30%, transparent 70%);
  animation:orr-rays-turn 90s linear infinite; }
@keyframes orr-rays-turn { to { transform:rotate(360deg); } }
html.sf-reduce-motion body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .k-hero::before { animation:none; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .k-hero__n { font-family:var(--dp-face-display, "Archivo") !important; font-variation-settings:"wght" 800, "wdth" 125 !important; color:var(--dp-hand, #f2b950) !important;
  text-shadow:0 0 24px rgb(242 185 80 / .45); }

/* refit: the hull on the jig (src/ui/orrery/hullSchematic.js). The stage fills the screen under the
   title and the keys; the rows are labels round the ship, set by the schematic. Each label: the
   hardpoint's numeral and kind, what is fitted in display type, or the spares as words, and the
   verb at the end of its first line. Left-column labels read toward the ship. */
html body #screens > .k-screen.orr-refit > .k-title, html body #screens > .k-screen.orr-refit > .k-foot { position:relative; z-index:2; }
html body #screens > .k-screen.orr-refit > .k-title .sf-cru-note { margin:10px 0 0; max-width:34ch; font-size:13px; color:var(--dp-hand-hot, #ffd98c); }
/* the title names the place; the ship is the loud thing here */
html body #screens > .k-screen.orr-refit > .k-title .k-t-title { font-size:clamp(34px, 4.4vh, 50px) !important; letter-spacing:.04em; }
html body #screens > .k-screen.orr-refit > .k-title .sf-cru-sub { font-size:14px; color:rgb(232 226 212 / .66); max-width:44ch; }
/* one amber on the screen: the keys rest in bone and light only when the player reaches for them */
html body #screens > .k-screen.orr-refit.orr-crucible.sf-crucible-refit .k-foot .k-word.k-word--primary { color:rgb(246 241 230) !important; text-shadow:0 0 16px rgb(0 0 0 / .6) !important;
  background-image:none !important; padding-bottom:8px !important; }
html body #screens > .k-screen.orr-refit.orr-crucible.sf-crucible-refit .k-foot .k-word.k-word--primary:is(:hover, :focus-visible) { color:var(--dp-hand-hot, #ffd98c) !important; text-shadow:0 0 22px rgb(242 185 80 / .5) !important;
  background-image:linear-gradient(90deg, var(--dp-hand, #f2b950), rgb(242 185 80 / 0)) !important; }
html body #screens > .k-screen.orr-refit .k-foot .sf-cru-kbd { display:inline-grid; place-items:center; margin-left:12px; min-width:26px; height:18px; padding:0 5px; box-sizing:border-box;
  font-family:var(--dp-face-label, "Archivo"); font-size:10px; font-weight:650; letter-spacing:.08em; vertical-align:3px;
  color:rgb(236 230 216 / .78); box-shadow:inset 0 0 0 1px rgb(236 230 216 / .42); border-radius:3px; background:none; text-shadow:none; }
html body #screens > .k-screen.orr-refit > .k-title .sf-cru-note:empty { display:none; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on { position:absolute !important; inset:0 !important; margin:0 !important; padding:0 !important; max-height:none !important;
  overflow:visible !important; z-index:1; grid-area:auto; pointer-events:none;
  /* an abspos grid child honours align/justify-self: the stage's own start/start would shrink-wrap it to 0 x 0 */
  place-self:stretch !important; width:auto !important; height:auto !important; border:0 !important; background:none !important; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on::before { display:none !important; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on > .sf-cru-rows { position:absolute; inset:0; margin:0; padding:0; display:block; border:0; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .sf-cru-row { display:flex !important; flex-direction:column; align-items:stretch; gap:0; min-height:0 !important; padding:4px 0 6px !important;
  border:0 !important; pointer-events:auto; color:rgb(232 226 212 / .74); transition:color .18s linear; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__body { display:flex; flex-direction:column; gap:3px; min-width:0; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__head { display:flex; align-items:baseline; gap:10px; min-width:0; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-left .orr-hp__head { flex-direction:row-reverse; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-left { text-align:right; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__line { display:flex; align-items:baseline; gap:6px 16px; min-width:0; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-left .orr-hp__line { flex-direction:row-reverse; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__line > .orr-hp__value, html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__line > .orr-hp__spares { min-width:0; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__n { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-weight:300; font-size:21px; line-height:1;
  font-variant-numeric:tabular-nums lining-nums; letter-spacing:-.01em; color:rgb(232 226 212 / .5); transition:color .18s linear, text-shadow .18s linear; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .k-row__name { display:flex; align-items:baseline; gap:8px; overflow:visible; color:inherit; white-space:nowrap; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-left .k-row__name { flex-direction:row-reverse; }
/* the hardpoint's name is for the ear: its numeral already says which one */
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__label { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .sf-cru-slottag { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:11.5px; letter-spacing:.22em;
  text-transform:uppercase; color:rgb(232 226 212 / .62); margin:0; background:none; border:0; padding:0; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__value { font-family:var(--dp-face-display, "Archivo"); font-variation-settings:"wght" 720, "wdth" 118; font-size:17px; line-height:1.15;
  letter-spacing:.01em; color:rgb(240 235 224); text-shadow:0 1px 0 rgb(0 0 0 / .6), 0 0 14px rgb(0 0 0 / .8); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-bare .orr-hp__value { font-family:var(--dp-face-label, "Archivo"); font-variation-settings:normal; font-weight:500; font-size:13px;
  color:rgb(236 230 216 / .7); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__contrast { font-size:11.5px; line-height:1.35; color:rgb(232 226 212 / .58); max-width:100%; white-space:normal; }
/* the spares: words; the chosen one stands bright on a fine rule of its own */
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__spares { display:flex; flex-wrap:wrap; gap:2px 16px; margin:0; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-left .orr-hp__spares { justify-content:flex-end; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__spare { all:unset; box-sizing:border-box; cursor:pointer; position:relative; display:inline-flex; align-items:baseline; gap:7px;
  padding:2px 0 5px; color:rgb(232 226 212 / .56); transition:color .16s linear; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__spare-name { font-family:var(--dp-face-display, "Archivo"); font-variation-settings:"wght" 680, "wdth" 115; font-size:15px; letter-spacing:.01em; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__spare-stat { font-family:var(--dp-face-label, "Archivo"); font-size:12px; font-weight:500; letter-spacing:.03em; color:rgb(236 230 216 / .7); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__spare::after { content:""; position:absolute; left:0; right:0; bottom:0; height:1px; background:rgb(236 230 216 / .8);
  transform:scaleX(0); transform-origin:left; transition:transform .22s var(--dp-ease-out, ease-out); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-left .orr-hp__spare::after { transform-origin:right; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__spare[aria-checked="true"] { color:rgb(246 241 230); text-shadow:0 0 12px rgb(0 0 0 / .8); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__spare[aria-checked="true"]::after { transform:scaleX(1); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__spare:is(:hover, :focus-visible) { color:rgb(250 246 236); outline:none !important; box-shadow:none !important; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__spare:focus-visible::after { transform:scaleX(1); background:var(--dp-hand, #f2b950); box-shadow:0 0 8px rgb(242 185 80 / .5); }
/* the verb sits at the end of the label's first line */
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .sf-cru-act { flex:none; margin:0 !important; padding:2px 0 !important; font-size:12.5px !important; letter-spacing:.22em !important;
  color:rgb(236 230 216 / .82) !important; align-self:baseline; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .sf-cru-act[hidden] { display:none !important; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__line { gap:6px 12px !important; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__empty { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:11.5px; letter-spacing:.22em;
  text-transform:uppercase; color:rgb(236 230 216 / .7); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-open .orr-hp__spare-name { font-variation-settings:"wght" 560, "wdth" 112; }
/* an offered spare is not fitted: a plus, a quieter weight, a dashed rule under the chosen one */
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-open .orr-hp__spare { color:rgb(236 230 216 / .62); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-open .orr-hp__spare-name::before { content:"+"; margin-right:6px; font-weight:500; color:rgb(236 230 216 / .6); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-open .orr-hp__spare[aria-checked="true"] { color:rgb(236 230 216 / .9); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-open .orr-hp__spare::after { height:1px; background:repeating-linear-gradient(90deg, rgb(236 230 216 / .75) 0 4px, transparent 4px 7px); }
/* one hardpoint unfolds at a time: the lit one shows every spare and the scales; the rest show their pick */
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-open:not(.is-lit) .orr-hp__spare:not([aria-checked="true"]) { display:none; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .sf-cru-row:not(.is-lit) :is(.orr-hp__scales, .orr-hp__contrast) { display:none; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__contrast--drawn { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__scales { display:block; margin-top:6px; overflow:visible; }
/* the lit open hardpoint stacks its choice: spares, their scales, then the verb, all on the ship's side */
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-open.is-lit .orr-hp__line { flex-direction:column; align-items:flex-start; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-left.is-open.is-lit .orr-hp__line { align-items:flex-end; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-open.is-lit .orr-hp__spares { flex-direction:column; gap:1px; align-items:flex-start; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-left.is-open.is-lit .orr-hp__spares { align-items:flex-end; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .is-open.is-lit .sf-cru-act { margin-top:4px !important; align-self:auto; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__scales .orr-hp__scale-word { font-size:11px; font-weight:650; letter-spacing:.2em; fill:rgb(236 230 216 / .72); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__scales .orr-hp__scale-val { font-family:var(--dp-face-numeral, "Archivo"); font-size:14px; font-weight:600; letter-spacing:0; fill:rgb(246 241 230); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__scales .orr-hp__scale-delta { font-size:12px; font-weight:600; fill:var(--dp-ice, #8fcbff); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__scales .orr-hp__scale-max { font-size:10px; font-weight:600; letter-spacing:.06em; fill:rgb(236 230 216 / .5); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__scales .orr-hp__track { stroke:rgb(236 230 216 / .25); stroke-width:2; fill:none; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__scales .orr-hp__track-end { stroke:rgb(236 230 216 / .45); stroke-width:1; fill:none; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__scales .orr-hp__tick { stroke:rgb(236 230 216 / .62); stroke-width:1.6; fill:none; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .orr-hp__scales .orr-hp__tick.is-chosen { stroke:var(--dp-hand-hot, #ffd98c); stroke-width:2.6; }
/* the lit verb carries the key that presses it */
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .sf-cru-row.is-lit .sf-cru-act:not(:disabled)::after { content:"Enter"; position:static; display:inline-grid; place-items:center; transform:none;
  width:auto; height:17px; margin-left:9px; padding:0 5px; background:none !important; box-shadow:inset 0 0 0 1px rgb(236 230 216 / .42) !important; border-radius:3px;
  font-size:9.5px; letter-spacing:.08em; color:rgb(236 230 216 / .78); vertical-align:1px; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .sf-cru-act::before { display:none !important; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .sf-cru-act:disabled { color:rgb(232 226 212 / .26) !important; }
/* lit: the Hand is on this hardpoint -- its numeral takes the lamp, its words brighten, its verb is the one to press */
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .sf-cru-row.is-lit { color:rgb(246 241 230); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .sf-cru-row.is-lit .orr-hp__n { color:var(--dp-hand-hot, #ffd98c); text-shadow:0 0 14px rgb(242 185 80 / .45); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .sf-cru-row.is-lit .sf-cru-slottag { color:rgb(246 241 230 / .9); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .sf-cru-row.is-lit .sf-cru-act:not(:disabled) { color:var(--dp-hand, #f2b950) !important; text-shadow:0 0 12px rgb(242 185 80 / .35); }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .sf-cru-act:not(:disabled):is(:hover, :focus-visible) { color:var(--dp-hand-hot, #ffd98c) !important; outline:none !important; }
html body #screens > .k-screen.orr-refit > .sf-cru-stage.orr-hull--on .sf-cru-row :is(.orr-hp__n, .sf-cru-slottag, .orr-hp__contrast, .sf-cru-act) { text-shadow:0 1px 0 rgb(0 0 0 / .7), 0 0 10px rgb(0 0 0 / .85); }

/* results: the death dial takes the right of the plate; the ledger and the story keep the left two
   columns; the kill-chain and last-seconds rows it draws stay for the ear only */
html body #screens > .k-screen.orr-crucible.sf-crucible-results.has-deathdial .sf-crres__stage { grid-template-columns:minmax(260px, 330px) minmax(340px, 470px) minmax(0, 1fr) !important; column-gap:40px; }
html body #screens > .k-screen.orr-crucible.sf-crucible-results.has-deathdial .sf-crres__dial { order:2; align-self:stretch; min-height:520px; }
html body #screens > .k-screen.orr-crucible.sf-crucible-results.has-deathdial .sf-crres__band:is([data-band="kill_chain"], [data-band="last_seconds"]) { position:absolute !important; width:1px; height:1px; overflow:hidden;
  clip:rect(0 0 0 0); white-space:nowrap; margin:0 !important; }
html body #screens > .k-screen.orr-crucible.sf-crucible-results.has-deathdial .sf-crres__hero { z-index:3; }
/* the build's steps: the wave, then its verb, never run together */
html body #screens > .k-screen.orr-crucible.sf-crucible-results .sf-crres__step-verb { margin-left:10px; }

/* new game: the Field Hardware form becomes instruments. Selectors carry #screens so they meet the
   retired kit sheet's own specificity instead of losing to it. */
#screens .orr-newgame .orr-ng-title { font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-weight:800;
  font-variation-settings:"wght" 800, "wdth" 125 !important;
  font-size:clamp(44px, 6.4vh, 76px); line-height:.92; letter-spacing:-.005em; text-transform:uppercase; color:rgb(236 230 216);
  background:none !important; -webkit-text-fill-color:currentColor; text-shadow:0 2px 16px rgb(0 0 0 / .5); }
#screens .orr-newgame .orr-ng-label { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:600; font-size:10px;
  letter-spacing:.26em; text-transform:uppercase; color:rgb(232 226 212 / .55); margin:0 0 8px; }
#screens .orr-newgame .orr-ng-gap { height:14px; }
/* the retired kit drew a hairline under every word row */
#screens .orr-newgame .k-words { background:none !important; background-image:none !important; }
/* the hull's side: name, blurb, what it carries, the run it opens */
#screens .orr-newgame .orr-ng-caption { max-width:320px; display:flex; flex-direction:column; gap:10px; }
#screens .orr-newgame .orr-ng-caption .k-words--row { gap:6px 16px; flex-wrap:wrap; }
#screens .orr-newgame .orr-ng-caption .sf-ng-route { margin-top:6px; }
#screens .orr-newgame .orr-ng-caption .k-caps { font-size:10px; letter-spacing:.26em; color:rgb(232 226 212 / .55); margin-bottom:8px; }
#screens .orr-newgame .sf-ng-route__step .k-row__name { font-size:14px; color:rgb(236 230 216); }
#screens .orr-newgame .sf-ng-route__step .k-row__sub { font-size:12px; color:rgb(232 226 212 / .6); }
/* an input is a reading on a ruled scale, not a box */
#screens .orr-newgame .orr-ng-input { background:none !important; border:0 !important; border-radius:0 !important; box-shadow:none !important;
  min-height:40px; padding:0 2px 6px; width:min(100%, 300px); color:var(--dp-ink, #e8e2d4);
  font-family:var(--dp-face-display, "Archivo"); font-stretch:100%; font-weight:600; font-size:22px; letter-spacing:.04em;
  background-image:linear-gradient(90deg, rgb(232 226 212 / .5), rgb(232 226 212 / .08)) !important;
  background-size:100% 1px !important; background-position:0 100% !important; background-repeat:no-repeat !important;
  caret-color:var(--dp-hand, #f2b950); outline:none; }
#screens .orr-newgame .orr-ng-input:focus { background-image:linear-gradient(90deg, var(--dp-hand, #f2b950), rgb(242 185 80 / .1)) !important; }
#screens .orr-newgame .orr-ng-input::placeholder { color:rgb(232 226 212 / .32); }
#screens .orr-newgame .orr-ng-input::selection { background:transparent; color:var(--dp-hand-hot, #ffd98c); }
#screens .orr-newgame .orr-ng-key--small::before { content:"↻"; margin-right:8px; font-size:13px; letter-spacing:0; color:var(--dp-hand, #f2b950); }
/* choice words on the dials: engraved capitals; the chosen one is lit */
#screens .orr-newgame .orr-stopscale .k-word { background:none !important; border:0 !important; box-shadow:none !important; border-image:none !important;
  min-width:0 !important; min-height:0 !important; padding:2px 4px !important; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%;
  font-weight:650; font-size:12px !important; letter-spacing:.2em; text-transform:uppercase; color:rgb(232 226 212 / .6) !important;
  text-shadow:0 1px 0 rgb(0 0 0 / .5); white-space:nowrap; }
#screens .orr-newgame .orr-stopscale .k-word[aria-pressed="true"] { color:var(--dp-ink, #e8e2d4) !important;
  text-shadow:0 0 18px rgb(255 217 140 / .38), 0 1px 0 rgb(0 0 0 / .6); }
#screens .orr-newgame .orr-stopscale .k-word:is(:hover, :focus-visible) { color:var(--dp-ink, #e8e2d4) !important; outline:none; }
#screens .orr-newgame .orr-stopscale .k-word-sub { text-align:center; font-size:10px; letter-spacing:.14em; text-transform:uppercase;
  color:rgb(232 226 212 / .42); margin-top:2px; }
#screens .orr-newgame .k-sentence { font-family:var(--dp-face-read, "Instrument Sans"); font-size:14px; line-height:1.45; color:rgb(232 226 212 / .78); }
/* small keys (New seed) and the loadout: engraved words */
#screens .orr-newgame .orr-ng-key--small, #screens .orr-newgame .orr-ng-key--legend { background:none !important; border:0 !important; border-image:none !important;
  box-shadow:none !important; min-width:0 !important; padding:4px 0 4px 16px !important; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%;
  font-weight:650; font-size:11px !important; letter-spacing:.22em; text-transform:uppercase; color:rgb(232 226 212 / .62) !important; }
#screens .orr-newgame .orr-ng-key--small:is(:hover, :focus-visible) { color:var(--dp-ink, #e8e2d4) !important; outline:none; }
#screens .orr-newgame .k-words--row .fh-legend, #screens .orr-newgame .k-words--row .orr-ng-label { font-size:11px; letter-spacing:.18em; color:rgb(232 226 212 / .7); }
/* the first fifteen minutes: a traced timeline, a beam with a node per beat */
#screens .orr-newgame .sf-ng-route__steps { position:relative; padding-left:22px !important; background:none !important; }
#screens .orr-newgame .sf-ng-route__steps::before { content:""; position:absolute; left:6px; top:10px; bottom:10px; width:1px;
  background:linear-gradient(rgb(232 226 212 / .5), rgb(232 226 212 / .12)); }
#screens .orr-newgame .sf-ng-route__step { position:relative; background:none !important; border:0 !important; box-shadow:none !important; padding:4px 0 8px !important; }
#screens .orr-newgame .sf-ng-route__step::before { content:""; position:absolute; left:-19px; top:10px; width:7px; height:7px; border-radius:50%;
  background:rgb(12 14 18); box-shadow:inset 0 0 0 1.3px rgb(232 226 212 / .7); }
#screens .orr-newgame .sf-ng-route__step:first-child::before { background:var(--dp-hand, #f2b950); box-shadow:0 0 8px rgb(242 185 80 / .5); }
/* the stage caption: free type on a pool of shadow, the hull's name in display type */
#screens .orr-newgame .orr-ng-caption { position:relative; background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; padding:0 !important; }
#screens .orr-newgame .orr-ng-caption::before { content:""; position:absolute; inset:-26px -48px; z-index:-1; pointer-events:none;
  background:radial-gradient(closest-side, rgb(3 4 7 / .66), rgb(3 4 7 / .3) 60%, transparent); }
#screens .orr-newgame .orr-ng-caption .sf-slot-card-title { font-family:var(--dp-face-display, "Archivo") !important; font-stretch:125%; font-weight:800;
  font-variation-settings:"wght" 800, "wdth" 125 !important; font-size:clamp(34px, 4.6vh, 54px) !important; letter-spacing:.01em; color:rgb(236 230 216) !important;
  background:none !important; -webkit-text-fill-color:currentColor; text-transform:uppercase; }
/* the foot: Back is a word of light; Launch is the one Lamp Key -- amber, a 45 degree cut, a sheen */
#screens .orr-newgame .sf-ng-footer .sf-back { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important;
  font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:13px !important; letter-spacing:.24em; text-transform:uppercase;
  color:rgb(232 226 212 / .7) !important; padding:10px 4px !important; }
html body #screens .k-screen.orr-newgame .sf-back.k-word { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; }
html body #screens .k-screen.orr-newgame .sf-back.k-word::after { background:none !important; border:0 !important; border-image:none !important;
  box-shadow:none !important; padding:0 !important; color:rgb(232 226 212 / .4) !important; font-size:10px !important; letter-spacing:.2em; }
#screens .orr-newgame .sf-ng-footer .sf-back :is(.k-kbd, .dp-kbd, kbd) { background:none !important; border:0 !important; box-shadow:none !important;
  border-image:none !important; margin-left:12px; padding:0 !important; font-size:10px !important; letter-spacing:.2em; color:rgb(232 226 212 / .4) !important; }
#screens .orr-newgame .sf-ng-footer .sf-back:is(:hover, :focus-visible) { color:var(--dp-ink, #e8e2d4) !important; outline:none; }
#screens .orr-newgame .sf-ng-launch { position:relative; overflow:visible; border:0 !important; border-image:none !important; border-radius:0 !important;
  background:none !important; color:var(--dp-hand, #f2b950) !important; box-shadow:none !important; clip-path:none;
  padding:10px 4px 14px !important; min-width:0 !important; width:max-content !important; flex:0 0 auto !important;
  font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-variation-settings:"wght" 800, "wdth" 125; font-size:26px !important;
  letter-spacing:.12em; text-transform:uppercase; text-shadow:0 0 18px rgb(242 185 80 / .35);
  background-image:linear-gradient(90deg, var(--dp-hand, #f2b950), rgb(242 185 80 / 0)) !important; background-size:100% 2px !important;
  background-position:0 100% !important; background-repeat:no-repeat !important; }
#screens .orr-newgame .sf-ng-launch::after { content:""; position:absolute; left:-18px; top:50%; width:8px; height:8px; margin-top:-8px;
  border-radius:50%; background:var(--dp-hand-hot, #ffd98c); box-shadow:0 0 12px rgb(255 217 140 / .8); pointer-events:none;
  animation:orr-lamp-breathe 2.8s ease-in-out infinite; }
@keyframes orr-lamp-breathe { 0%, 100% { opacity:.55; } 50% { opacity:1; } }
@keyframes orr-lamp-sheen { 0% { transform:translateX(-120%); } 26%, 100% { transform:translateX(120%); } }
#screens .orr-newgame .sf-ng-launch:is(:hover, :focus-visible) { color:var(--dp-hand-hot, #ffd98c) !important; outline:none;
  text-shadow:0 0 26px rgb(255 217 140 / .6); background-image:linear-gradient(90deg, var(--dp-hand-hot, #ffd98c), rgb(255 217 140 / 0)) !important; }
#screens .orr-newgame .sf-ng-launch[aria-disabled="true"] { color:rgb(242 185 80 / .4) !important; }
html.sf-reduce-motion #screens .orr-newgame .sf-ng-launch::after { animation:none; display:none; }
/* a short screen keeps every Tab stop above the fold: tighter air, a smaller reading, and the seed's
   help sentence stays for the accessibility tree only */
@media (max-height: 860px) {
  #screens .orr-newgame .orr-ng-gap { height:4px; }
  #screens .orr-newgame .orr-ng-label { margin-bottom:4px; }
  #screens .orr-newgame .orr-ng-input { min-height:32px; font-size:18px; padding-bottom:4px; }
  #screens .orr-newgame .sf-ng-body .k-sentence { font-size:13px; line-height:1.3; margin:2px 0 0; }
  #screens .orr-newgame #sf-ng-seed-desc { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
  #screens .orr-newgame .orr-ng-title { font-size:clamp(34px, 6vh, 48px); }
}
@media (forced-colors: active) {
  #screens .orr-newgame .sf-ng-launch { background:ButtonFace !important; color:ButtonText !important; border:1px solid ButtonText !important; clip-path:none; }
  #screens .orr-newgame .orr-ng-input { border-bottom:1px solid CanvasText !important; }
}
`;

export function injectOrreryScreens(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = ORRERY_SCREEN_CSS;
  doc.head.appendChild(style);
}
