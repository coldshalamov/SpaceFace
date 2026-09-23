// ORRERY screen compositions (design/frontend/ORRERY.md §6). Layout only: where a screen's library
// pieces sit relative to each other once the arc rail owns the leading edge. No chrome is drawn here;
// every surface keeps the ORRERY rule of free type on an edge-less pool of shadow.
const STYLE_ID = 'sf-orrery-screen-layouts';

const POOL = `content:""; position:absolute; inset:-26px -40px; z-index:-1; pointer-events:none;
  background:radial-gradient(closest-side, rgb(3 4 7 / .7), rgb(3 4 7 / .36) 60%, transparent);`;

export const ORRERY_SCREEN_CSS = `
/* title: the drawn mark in flat bone with one slow sweep of light, a size down so the dial carries the
   screen; the full-width divider (a web rule pointing at the planet) goes; the footer is a maker's mark */
.of-title.orr-title .dp-logotype { width:clamp(300px, 47vw, 900px); background:rgb(236 230 216);
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

/* pause: the title's grammar held mid-flight -- no web divider under the name */
.of-pause.orr-pause .dp-title__rule { display:none; }
/* pause: the dial owns the left edge, so the flight brief is a reading on the right */
.of-pause > .sf-pause-brief.orr-brief { position:absolute; right:clamp(24px, 3.4vw, 72px); top:clamp(84px, 11vh, 132px);
  width:min(520px, 34vw); margin:0; z-index:2; }
.of-pause > .sf-pause-brief.orr-brief::before { ${POOL} }
@media (max-width: 1100px) { .of-pause > .sf-pause-brief.orr-brief { width:min(420px, 40vw); } }
`;

export function injectOrreryScreens(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = ORRERY_SCREEN_CSS;
  doc.head.appendChild(style);
}
