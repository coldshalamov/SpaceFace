import { injectOrrery } from './tokens.js';

// Match the mobile shell's specificity only for this screen's compact title/copy.
// Otherwise its generic 42px heading silently replaces the compact composition on phones.
const PHONE = 'html:root[data-sf-mobile="1"] body #screens#screens#screens > .screen.sf-crucible-fortify';

const CSS = `
html body #screens > .k-screen.sf-crucible-fortify {
  display:grid !important; grid-template-rows:auto minmax(0,1fr) auto !important;
  gap:20px !important; padding:28px 40px !important; height:100dvh !important;
  width:100% !important; max-width:none !important; margin:0 !important; overflow:hidden !important; box-sizing:border-box !important;
}
.sf-crucible-fortify .k-title,.sf-crucible-fortify .k-foot { position:static !important; margin:0 !important; padding:0 !important; }
.sf-crucible-fortify .k-title h1 { margin:0; font-size:clamp(28px,4vw,48px); }
.sf-fortify-layout { display:grid; grid-template-columns:minmax(0,1fr) minmax(260px,360px); gap:32px; min-height:0; }
.sf-fortify-plan { display:flex; flex-direction:column; min-width:0; min-height:0; }
.sf-fortify-plan svg { display:block; width:100%; flex:1 1 0; min-height:180px; color:var(--dp-ink); }
.sf-fortify-plan circle,.sf-fortify-plan path { vector-effect:non-scaling-stroke; }
.sf-fortify-plan .sf-fortify-orbit { fill:none; stroke:var(--dp-line); stroke-dasharray:4 8; }
.sf-fortify-plan .sf-fortify-link { fill:none; stroke:var(--dp-line); }
.sf-fortify-plan .sf-fortify-terrain { fill:var(--dp-void); stroke:var(--dp-ink-dim); stroke-width:1; opacity:.5; }
.sf-fortify-plan .sf-fortify-built { fill:var(--dp-hand); stroke:var(--dp-hand); stroke-width:2; }
.sf-fortify-plan .sf-fortify-approach { fill:none; stroke:var(--dp-ink-dim); stroke-width:1.5; }
.sf-fortify-plan .sf-fortify-preview { color:var(--dp-hand); }
.sf-fortify-plan .sf-fortify-preview[data-blocked=true] { color:var(--dp-ink-dim); opacity:.5; }
.sf-fortify-plan .sf-fortify-reach { fill:none; stroke:currentColor; stroke-width:1; stroke-dasharray:5 5; }
.sf-fortify-plan .sf-fortify-pair { fill:none; stroke:currentColor; stroke-width:3; }
.sf-fortify-plan .sf-fortify-footprint { fill:var(--dp-void); stroke:currentColor; stroke-width:3; }
.sf-fortify-plan .sf-fortify-face { fill:none; stroke:currentColor; stroke-width:2; }
.sf-fortify-plan .sf-fortify-bank { fill:none; stroke:currentColor; stroke-width:2.5; stroke-dasharray:8 5; }
.sf-fortify-plan polygon { vector-effect:non-scaling-stroke; }
.sf-fortify-facings { margin-top:10px; }
.sf-fortify-facings[hidden] { display:none !important; }
.sf-fortify-plan .sf-fortify-pilot { fill:var(--dp-phos); stroke:none; }
.sf-fortify-plan .sf-fortify-point { fill:var(--dp-void); stroke:var(--dp-ink); stroke-width:1.5; }
.sf-fortify-plan .sf-fortify-point[data-selected=true] { stroke:var(--dp-hand); stroke-width:3; }
.sf-fortify-plan .sf-fortify-point[data-blocked=true] { opacity:.4; stroke-dasharray:3 3; }
.sf-fortify-plan .sf-fortify-point[data-occupied=true] { fill:var(--dp-hand); }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-plan text { fill:var(--dp-ink); font:56px var(--dp-face-numeral) !important; text-anchor:middle; dominant-baseline:central; }
.sf-fortify-plan text[data-occupied=true] { fill:var(--dp-void); }
.sf-fortify-position { grid-column:1/-1; max-width:none; margin:0; min-height:1.5em; color:var(--dp-ink); overflow-wrap:anywhere; }
.sf-fortify-sockets { display:flex; gap:8px 18px; flex-wrap:wrap; }
.sf-fortify-sockets button,.sf-fortify-device { min-height:44px; text-align:left; }
.sf-fortify-shelf { overflow:auto; min-width:0; min-height:0; padding:4px 8px 4px 4px; scroll-padding:4px; }
.sf-fortify-shelf-title { margin:0; font:600 14px/1.4 var(--dp-face-read); }
.sf-fortify-device { width:100%; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px 18px; border:0; border-bottom:1px solid var(--dp-line); padding:14px 0; background:none; color:var(--dp-ink); cursor:pointer; text-transform:none !important; letter-spacing:normal !important; }
.sf-fortify-device strong { font:600 17px var(--dp-face-read); }
.sf-fortify-device small { grid-column:1/-1; font:14px/1.45 var(--dp-face-read); color:var(--dp-ink-dim); }
.sf-fortify-device[aria-pressed=true] strong,.sf-fortify-sockets [aria-pressed=true] { color:var(--dp-hand); }
.sf-fortify-device:focus-visible,.sf-fortify-sockets button:focus-visible { outline:2px solid var(--dp-hand); outline-offset:3px; }
.sf-fortify-state { border-top:1px solid var(--dp-line); margin-top:20px; padding-top:12px; }
.sf-fortify-state ul { list-style:none; padding:0; margin:8px 0; }
.sf-fortify-state li { padding:8px 0; font:14px/1.5 var(--dp-face-read); }
.sf-fortify-state button { margin-left:12px; }
.sf-fortify-balance { color:var(--dp-hand); font-variant-numeric:tabular-nums; }
.sf-crucible-fortify .k-foot { display:grid; grid-template-columns:auto auto minmax(0,1fr); gap:10px 28px; align-items:center; }
/* the commit verbs are keys: the build is the one amber primary (the 45° cut), the close a
   secondary (STATION_STANDARD §5) — not amber and bone words a player could miss. */
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-build {
  font:600 15px var(--dp-face-read) !important; letter-spacing:.04em; text-transform:none;
  color:var(--dp-metal-0, #0b0d10) !important; min-height:42px; padding:0 20px;
  background:var(--dp-lamp, #f2b950); border:1px solid rgb(242 185 80 / .9); border-radius:2px;
  clip-path:polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 0 100%);
  transition:background var(--dp-d-cut, 80ms) linear, box-shadow var(--dp-d-cut, 80ms) linear; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-build:not([disabled]):is(:hover, :focus-visible) {
  background:var(--dp-lamp-hot, #ffd98c); box-shadow:0 0 14px rgb(242 185 80 / .24); }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-build[disabled],
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-build[aria-disabled="true"] {
  opacity:.45; cursor:not-allowed; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-close {
  font:600 14px var(--dp-face-read) !important; letter-spacing:.03em; text-transform:none;
  color:rgb(236 230 216 / .92) !important; min-height:42px; padding:0 16px;
  background:rgb(236 230 216 / .05); border:1px solid rgb(236 230 216 / .38); border-radius:2px;
  transition:background var(--dp-d-cut, 80ms) linear, border-color var(--dp-d-cut, 80ms) linear; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-close:is(:hover, :focus-visible) {
  color:#fff; background:rgb(236 230 216 / .12); border-color:rgb(236 230 216 / .75); }
.sf-fortify-receipt { min-width:0; margin:0; min-height:1.5em; overflow-wrap:anywhere; }
/* polish277: the armory's choices read as controls, not loose type. Positions are hairline
   chips, devices hairline cards, built structures framed rows with a hairline Repair/Rearm key,
   and an empty field a dashed well. Radius 8 and faint fills, the same family as the other
   console cards; selection stays amber. */
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets { gap:8px; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets button {
  min-height:36px; padding:0 12px; border:1px solid rgb(236 230 216 / .16) !important; border-radius:8px;
  background:rgb(236 230 216 / .035) !important; clip-path:none !important; box-shadow:none;
  font:500 13px var(--dp-face-read) !important; letter-spacing:.01em !important; text-transform:none !important;
  color:rgb(236 230 216 / .82); transition:background var(--dp-d-cut, 80ms) linear, border-color var(--dp-d-cut, 80ms) linear; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets button:hover {
  background:rgb(236 230 216 / .08) !important; border-color:rgb(236 230 216 / .32) !important; color:var(--dp-ink); }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets button[aria-pressed=true] {
  color:var(--dp-hand); border-color:rgb(242 185 80 / .7) !important; background:rgb(242 185 80 / .1) !important; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-shelf { display:flex; flex-direction:column; gap:8px; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device {
  flex:0 0 auto; padding:12px 14px; border:1px solid rgb(236 230 216 / .14); border-radius:8px;
  background:rgb(236 230 216 / .03); transition:background var(--dp-d-cut, 80ms) linear, border-color var(--dp-d-cut, 80ms) linear; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device:hover {
  background:rgb(236 230 216 / .06); border-color:rgb(236 230 216 / .3); }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device[aria-pressed=true] {
  border-color:rgb(242 185 80 / .6); background:rgb(242 185 80 / .07); }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state { flex:0 0 auto; margin-top:12px; padding-top:14px; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state h2 { margin:0; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state ul { display:flex; flex-direction:column; gap:6px; margin:10px 0 0; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state li {
  display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; padding:8px 12px;
  border:1px solid rgb(236 230 216 / .14); border-radius:8px; background:rgb(236 230 216 / .03); }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state li.sf-fortify-empty {
  justify-content:center; padding:14px 12px; border-style:dashed; border-color:rgb(236 230 216 / .22);
  background:none; color:var(--dp-ink-dim); }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state button {
  margin-left:auto; min-height:30px; padding:0 10px; border:1px solid rgb(236 230 216 / .3) !important; border-radius:6px;
  background:rgb(236 230 216 / .05) !important; clip-path:none !important;
  font:600 12px var(--dp-face-read) !important; letter-spacing:.02em !important; text-transform:none !important; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state button + button { margin-left:0; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state button:not(:disabled):hover {
  background:rgb(236 230 216 / .12) !important; border-color:rgb(236 230 216 / .6) !important; }
html.sf-reduce-motion .k-screen.sf-crucible-fortify .sf-fortify-sockets button,
html.sf-reduce-motion .k-screen.sf-crucible-fortify .sf-fortify-device { transition:none !important; }
/* Keep navigation in the title and placement beside the commit action. The footer occupies
   its own grid row: no fade, mask or shadow may cover the decision or service controls. */
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-overview {
  display:flex; flex-wrap:wrap; gap:6px 16px; align-items:center; margin-top:8px;
}
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-overview .sf-fortify-balance { margin:0 !important; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-jump {
  min-height:36px; padding:4px 10px; border:1px solid var(--dp-line) !important;
  border-radius:6px; background:var(--dp-void) !important; color:var(--dp-ink);
  font:500 13px/1.35 var(--dp-face-read) !important; letter-spacing:normal !important; text-transform:none !important;
}
html body #screens > .k-screen.sf-crucible-fortify > .k-foot {
  gap:8px 16px; border-top:1px solid var(--dp-line); padding-top:8px !important;
}
@media (max-width:760px), (max-height:560px) {
  html body #screens > .k-screen.sf-crucible-fortify {
    gap:8px !important; padding:12px 14px 8px !important;
    height:100dvh !important; max-height:100dvh !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .k-title h1,
  html body #screens > .k-screen.sf-crucible-fortify .k-title .k-t-title {
    font-size:clamp(22px, 4vw, 30px) !important; line-height:1.05 !important; margin:0 !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .k-title :is(p, .k-sentence) {
    font-size:13px !important; line-height:1.35 !important; margin:4px 0 0 !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-intro { max-width:none; }
  ${PHONE} .k-title > h1 { font-size:22px !important; line-height:1.05 !important; }
  ${PHONE} .k-title > .sf-fortify-intro { font-size:13px !important; line-height:1.35 !important; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-layout {
    grid-template-columns:minmax(0,1fr) minmax(260px,1fr); gap:14px;
    min-height:0; overflow:hidden;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-plan {
    overflow:auto; padding:4px; scroll-padding:4px;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-plan svg {
    height:240px; min-height:240px; flex:none;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets { gap:6px; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets button {
    min-height:36px; padding:4px 8px; white-space:normal;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device {
    min-height:44px; padding:10px; gap:6px 10px;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device strong { font-size:14px; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device small { font-size:13px; line-height:1.4; }
  /* Compact choices expose names/prices together; selecting one reveals its complete description.
     Explicit aria-describedby retains the description for assistive technology on every choice. */
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device[aria-pressed=false] small { display:none; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-build,
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-close {
    min-height:36px; font-size:13px !important; padding:6px 12px;
  }
  html body #screens > .k-screen.sf-crucible-fortify :is(.sf-fortify-position, .sf-fortify-receipt) {
    font-size:13px !important; line-height:1.35 !important; margin:0 !important; min-height:0;
  }
}
/* Short wide frames need the choices BESIDE the schematic, not below a 240px picture.
   The 160px drawing with 84-unit numbers keeps the numerals at 12 CSS pixels. */
@media (max-height:560px) and (min-width:600px) {
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-plan {
    display:grid; grid-template-columns:160px minmax(0,1fr); gap:8px; align-content:start; align-items:start;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-plan svg {
    width:160px; height:160px; min-height:160px;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-plan text { font-size:84px !important; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets {
    display:grid; grid-template-columns:minmax(0,1fr); gap:4px;
  }
  /* Mouse/keyboard rows can be compact; the mobile shell's 44px !important floor still wins. */
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets button { min-height:32px; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-facings {
    grid-column:1/-1; grid-template-columns:repeat(2,minmax(0,1fr)); margin-top:0;
  }
}
@media (max-height:560px) and (min-width:780px) {
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets:not(.sf-fortify-facings) {
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
}
/* A phone gets one normal vertical scrollport, with the same reading and focus order.
   Landscape frames as narrow as 600px retain both the map and device choice columns. */
@media (max-width:599px) {
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-overview {
    display:grid; grid-template-columns:auto minmax(0,1fr); gap:6px 12px;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-balance { grid-column:1/-1; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-jump { white-space:normal; }
  html body #screens > .k-screen.sf-crucible-fortify > .k-foot { grid-template-columns:minmax(0,1.5fr) minmax(0,1fr); }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-receipt { grid-column:1/-1; }
  html body #screens > .k-screen.sf-crucible-fortify :is(.sf-fortify-build, .sf-fortify-close) { white-space:normal; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-layout {
    display:flex; flex-direction:column; overflow:auto; gap:16px; scroll-padding:4px;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-plan,
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-shelf { flex:none; overflow:visible; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
  html body #screens > .k-screen.sf-crucible-fortify :is(.sf-fortify-sockets button, .sf-fortify-jump, .sf-fortify-state button, .sf-fortify-build, .sf-fortify-close) { min-height:44px; }
}
`;

export function injectSwarmFortifyLayouts(doc = globalThis.document) {
  injectOrrery(doc);
  if (!doc?.head || doc.getElementById('sf-swarm-fortify-layout')) return;
  const style = doc.createElement('style');
  style.id = 'sf-swarm-fortify-layout';
  style.textContent = CSS;
  doc.head.appendChild(style);
}
