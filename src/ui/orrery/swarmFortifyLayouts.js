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
.sf-fortify-plan .sf-fortify-face { fill:none; stroke:currentColor; stroke-width:2; }
.sf-fortify-plan .sf-fortify-bank { fill:none; stroke:currentColor; stroke-width:2.5; stroke-dasharray:8 5; }
.sf-fortify-plan polygon { vector-effect:non-scaling-stroke; }
.sf-fortify-facings { margin-top:10px; }
.sf-fortify-facings[hidden] { display:none; }
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
  background:rgb(236 230 216 / .05); border:1px solid rgb(236 230 216 / .38); border-radius:6px;
  transition:background var(--dp-d-cut, 80ms) linear, border-color var(--dp-d-cut, 80ms) linear; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-close:is(:hover, :focus-visible) {
  color:#fff; background:rgb(236 230 216 / .12); border-color:rgb(236 230 216 / .75); }
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
@media (max-width:760px) {
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets button { min-height:44px; }
}

/* —— UI polish: short densify (sockets/shelf ∩ transparent foot + off-bottom clips) ——
   At ≤560 tall the plan SVG + position chips + device shelf outgrew the 1fr mid row while
   the foot stayed transparent (651/700 socket labels offB ~19; 801/960 shelf/device offB
   ~31–35; shelf∩foot mash tens of k). Compress chrome, turn the mid row into a real
   scrollport, drop the short-desktop 360px floors that forced overflow, and raise an
   opaque foot curtain + fade apron so Build / Return stay clear. */
@media (max-height:560px) {
  html body #screens > .k-screen.sf-crucible-fortify {
    gap:8px !important; padding:12px 18px 8px !important;
    overflow:hidden !important; height:100dvh !important; max-height:100dvh !important;
    box-sizing:border-box !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .k-title h1,
  html body #screens > .k-screen.sf-crucible-fortify .k-title .k-t-title {
    font-size:clamp(22px, 5.2vh, 32px) !important; line-height:.94 !important; margin:0 !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .k-title :is(p, .k-sentence, .sf-fortify-balance) {
    font-size:12px !important; line-height:1.3 !important; margin:2px 0 0 !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-layout {
    min-height:0 !important; max-height:100% !important; overflow:auto !important;
    gap:14px !important; align-content:start !important;
    -webkit-mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 18px), transparent 100%) !important;
    mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 18px), transparent 100%) !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-plan,
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-shelf {
    min-height:0 !important; max-height:none !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-plan svg {
    min-height:120px !important; max-height:min(220px, 42vh) !important; flex:0 1 auto !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-shelf {
    overflow:visible !important; padding-bottom:4px !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device {
    padding:8px 10px !important; gap:4px 12px !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device strong { font-size:14px !important; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device small {
    font-size:12px !important; line-height:1.3 !important;
    display:-webkit-box !important; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-clamp:2;
    overflow:hidden !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets { gap:6px !important; margin-top:4px !important; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets button {
    min-height:28px !important; padding:0 8px !important; font-size:12px !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state {
    margin-top:8px !important; padding-top:8px !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify > .k-foot {
    z-index:8 !important; position:relative !important; isolation:isolate;
    flex:none !important; grid-row:3 !important;
    margin:0 !important; padding:6px 0 4px !important;
    border-top:1px solid rgb(236 230 216 / .16) !important;
    background:rgb(5 7 10) !important;
    box-shadow:0 48px 0 0 rgb(5 7 10), 0 -28px 28px -2px rgb(5 7 10 / .97) !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify > .k-foot::before {
    content:'' !important; display:block !important; pointer-events:none !important;
    position:absolute !important; left:0 !important; right:0 !important; bottom:100% !important;
    height:22px !important;
    background:linear-gradient(180deg, transparent, rgb(5 7 10)) !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify > .k-foot > :is(.k-words, .sf-fortify-build, .sf-fortify-close, .sf-fortify-receipt) {
    position:relative; z-index:1;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-build,
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-close {
    min-height:32px !important; font-size:13px !important; padding:0 12px !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-receipt {
    font-size:12px !important; margin:0 !important; min-height:0 !important;
  }
}
/* Very short: keep purchase feedback beside the verbs when space permits.
   This live status owns refusals and build/repair/rearm results, so it must remain readable. */
@media (max-height:500px) {
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-receipt {
    flex:1 1 22ch !important; min-width:0 !important;
    line-height:1.3 !important; overflow-wrap:anywhere;
  }
  html body #screens > .k-screen.sf-crucible-fortify > .k-foot { padding:4px 0 2px !important; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-plan svg {
    min-height:100px !important; max-height:min(180px, 38vh) !important;
  }
}
/* Narrow+short: keep foot verbs on one compact row. */
@media (min-width:641px) and (max-width:820px) and (max-height:560px) {
  html body #screens > .k-screen.sf-crucible-fortify > .k-foot { gap:6px 10px !important; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-build,
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-close {
    min-height:30px !important; font-size:12px !important; padding:0 8px !important; white-space:nowrap !important;
  }
}
/* Phone portrait: height often clears ≤560, but stacked shelf still paints under the foot. */
@media (max-width:560px) {
  html body #screens > .k-screen.sf-crucible-fortify {
    gap:8px !important; padding:12px 14px 8px !important;
    overflow:hidden !important; height:100dvh !important; max-height:100dvh !important;
    box-sizing:border-box !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .k-title h1,
  html body #screens > .k-screen.sf-crucible-fortify .k-title .k-t-title {
    font-size:clamp(22px, 6vw, 30px) !important; line-height:.94 !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-layout {
    min-height:0 !important; overflow:auto !important; gap:12px !important;
    -webkit-mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 18px), transparent 100%) !important;
    mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 18px), transparent 100%) !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-plan svg {
    height:200px !important; min-height:140px !important; flex:none !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-shelf { overflow:visible !important; }
  html body #screens > .k-screen.sf-crucible-fortify > .k-foot {
    z-index:8 !important; position:relative !important; isolation:isolate;
    flex:none !important; grid-row:3 !important;
    margin:0 !important; padding:6px 0 4px !important;
    border-top:1px solid rgb(236 230 216 / .16) !important;
    background:rgb(5 7 10) !important;
    box-shadow:0 48px 0 0 rgb(5 7 10), 0 -28px 28px -2px rgb(5 7 10 / .97) !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify > .k-foot::before {
    content:'' !important; display:block !important; pointer-events:none !important;
    position:absolute !important; left:0 !important; right:0 !important; bottom:100% !important;
    height:22px !important;
    background:linear-gradient(180deg, transparent, rgb(5 7 10)) !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-build,
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-close {
    min-height:34px !important; font-size:13px !important;
  }
}
/* polish486: on desktop frames taller than 560 the device shelf is its own scrollport, but it
   ended on a hard cut (1280x720 sliced the Reflector Fin copy mid-line and hid In the field with
   no hint). Fade its last 24px like the short-frame layout, and pad the scroll end so the final
   row clears the fade once scrolled to. */
@media (min-width:761px) and (min-height:561px) {
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-shelf {
    padding-bottom:24px;
    -webkit-mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 24px), transparent 100%);
    mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 24px), transparent 100%);
  }
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
