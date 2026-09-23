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
  linear-gradient(90deg, rgb(6 8 11 / .96) 0%, rgb(6 8 11 / .9) 30%, rgb(6 8 11 / .52) 58%, rgb(6 8 11 / .34) 100%),
  url("/assets/ui/backdrops/backdrop-title.jpg") center / cover no-repeat !important; }
/* the hull's choice at the hull: stations on an arc under the ship */
#screens .orr-newgame > .orr-ng-pick { position:absolute; left:66%; bottom:clamp(8px, 2.6vh, 40px); transform:translateX(-50%); z-index:3; }
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
#screens .orr-newgame .orr-ng-stat svg { width:64px; height:54px; overflow:visible; }
#screens .orr-newgame .orr-ng-stat__track { fill:none; stroke:rgb(232 226 212 / .2); stroke-width:2; stroke-linecap:round; }
#screens .orr-newgame .orr-ng-stat__fill { fill:none; stroke:#8fcbff; stroke-width:2.6; stroke-linecap:round; filter:drop-shadow(0 0 4px rgb(143 203 255 / .5)); }
#screens .orr-newgame .orr-ng-stat b { position:absolute; top:22px; left:0; right:0; text-align:center; font-family:var(--dp-face-numeral, "Archivo");
  font-weight:600; font-size:14px; color:#dfeeff; letter-spacing:.01em; }
#screens .orr-newgame .orr-ng-stat b i { font-style:normal; font-size:9px; margin-left:2px; color:rgb(223 238 255 / .6); }
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
#screens .orr-newgame .orr-ng-caption { max-width:400px; display:flex; flex-direction:column; gap:10px; }
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
#screens .orr-newgame .orr-ng-input::selection { background:rgb(143 203 255 / .16); color:rgb(246 241 230); }
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
