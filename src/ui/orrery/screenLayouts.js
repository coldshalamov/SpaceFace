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
.of-pause.orr-pause .dp-title__name { font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-weight:800;
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
.of-pause > .sf-pause-brief.orr-brief::before { ${POOL} }
@media (max-width: 1100px) { .of-pause > .sf-pause-brief.orr-brief { width:min(420px, 40vw); } }

/* new game: the Field Hardware form becomes instruments. Selectors carry #screens so they meet the
   retired kit sheet's own specificity instead of losing to it. */
#screens .orr-newgame .orr-ng-title { font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-weight:800;
  font-size:clamp(44px, 6.4vh, 76px); line-height:.92; letter-spacing:-.005em; text-transform:uppercase; color:rgb(236 230 216);
  background:none; -webkit-text-fill-color:currentColor; text-shadow:0 2px 16px rgb(0 0 0 / .5); }
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
  background-image:linear-gradient(rgb(232 226 212 / .38), rgb(232 226 212 / .38)),
    repeating-linear-gradient(90deg, rgb(232 226 212 / .3) 0 1px, transparent 1px 10px) !important;
  background-size:100% 1px, 100% 5px !important; background-position:0 100%, 0 calc(100% - 1px) !important; background-repeat:no-repeat !important;
  caret-color:var(--dp-hand, #f2b950); outline:none; }
#screens .orr-newgame .orr-ng-input:focus { background-image:linear-gradient(var(--dp-hand, #f2b950), var(--dp-hand, #f2b950)),
    repeating-linear-gradient(90deg, rgb(242 185 80 / .5) 0 1px, transparent 1px 10px) !important; }
#screens .orr-newgame .orr-ng-input::placeholder { color:rgb(232 226 212 / .32); }
#screens .orr-newgame .orr-ng-input::selection { background:rgb(242 185 80 / .32); color:var(--dp-ink, #e8e2d4); }
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
#screens .orr-newgame .orr-ng-caption .sf-slot-card-title { font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-weight:800;
  font-size:clamp(34px, 4.6vh, 54px); letter-spacing:.01em; color:rgb(236 230 216); }
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
#screens .orr-newgame .sf-ng-launch { position:relative; overflow:hidden; border:0 !important; border-image:none !important; border-radius:0 !important;
  background:var(--dp-hand, #f2b950) !important; color:rgb(20 14 4) !important; box-shadow:0 0 28px rgb(242 185 80 / .28) !important;
  clip-path:polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%); padding:14px 40px !important; min-width:180px !important;
  width:max-content !important; flex:0 0 auto !important;
  font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:750; font-size:15px !important; letter-spacing:.3em; text-transform:uppercase; }
#screens .orr-newgame .sf-ng-launch::after { content:""; position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(105deg, transparent 35%, rgb(255 250 235 / .55) 50%, transparent 65%); transform:translateX(-120%);
  animation:orr-lamp-sheen 5.5s ease-in-out 1.2s infinite; }
@keyframes orr-lamp-sheen { 0% { transform:translateX(-120%); } 26%, 100% { transform:translateX(120%); } }
#screens .orr-newgame .sf-ng-launch:is(:hover, :focus-visible) { background:var(--dp-hand-hot, #ffd98c) !important; outline:none;
  box-shadow:0 0 40px rgb(255 217 140 / .45) !important; }
#screens .orr-newgame .sf-ng-launch[aria-disabled="true"] { background:rgb(242 185 80 / .35) !important; }
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
