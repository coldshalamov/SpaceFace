import { injectOrrery } from './tokens.js';

const CSS = `
html body #screens > .k-screen.sf-crucible-fortify {
  display:grid !important; grid-template-rows:auto minmax(0,1fr) auto !important;
  gap:20px !important; padding:28px 40px !important; height:100dvh !important;
  width:100% !important; max-width:none !important; margin:0 !important; overflow:hidden !important;
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
.sf-fortify-plan .sf-fortify-pilot { fill:var(--dp-phos); stroke:none; }
.sf-fortify-plan .sf-fortify-point { fill:var(--dp-void); stroke:var(--dp-ink); stroke-width:1.5; }
.sf-fortify-plan .sf-fortify-point[data-selected=true] { stroke:var(--dp-hand); stroke-width:3; }
.sf-fortify-plan .sf-fortify-point[data-blocked=true] { opacity:.4; stroke-dasharray:3 3; }
.sf-fortify-plan .sf-fortify-point[data-occupied=true] { fill:var(--dp-hand); }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-plan text { fill:var(--dp-ink); font:56px var(--dp-face-numeral) !important; text-anchor:middle; dominant-baseline:central; }
.sf-fortify-plan text[data-occupied=true] { fill:var(--dp-void); }
.sf-fortify-position { margin:8px 0; min-height:1.5em; }
.sf-fortify-sockets { display:flex; gap:8px 18px; flex-wrap:wrap; }
.sf-fortify-sockets button,.sf-fortify-device { min-height:44px; text-align:left; }
.sf-fortify-shelf { overflow:auto; min-height:0; padding-right:8px; }
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
.sf-crucible-fortify .k-foot { display:flex; gap:10px 28px; flex-wrap:wrap; align-items:center; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-build { font-size:clamp(18px,2vw,26px) !important; font-weight:600 !important; color:var(--dp-hand) !important; min-height:44px; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-close { font-size:20px !important; min-height:44px; }
.sf-fortify-receipt { flex:1 0 100%; margin:0; min-height:1.5em; }
@media (max-width:760px) {
  html body #screens > .k-screen.sf-crucible-fortify { padding:20px !important; gap:12px !important; }
  .sf-fortify-layout { display:flex; flex-direction:column; overflow:auto; gap:18px; }
  .sf-fortify-plan,.sf-fortify-shelf { flex:0 0 auto; }
  .sf-fortify-plan svg { height:240px; flex:none; }
  .sf-fortify-shelf { overflow:visible; }
}
@media (max-height:540px) and (min-width:761px) {
  html body #screens > .k-screen.sf-crucible-fortify { padding:16px 24px !important; gap:8px !important; }
  .sf-fortify-layout { overflow:auto; }
  .sf-fortify-plan,.sf-fortify-shelf { min-height:360px; }
  .sf-fortify-plan svg { min-height:240px; }
  .sf-fortify-shelf { overflow:visible; }
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
