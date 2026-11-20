import { injectOrrery } from './tokens.js';

const CSS = `
html body #screens > .k-screen.sf-crucible-fortify {
  display:grid !important; grid-template-rows:auto minmax(0,1fr) auto !important;
  gap:16px !important; padding:22px 36px 18px !important; height:100dvh !important;
  width:100% !important; max-width:none !important; margin:0 !important; overflow:hidden !important;
  background:
    radial-gradient(95% 75% at 50% 0%, rgb(20 44 62 / .38) 0%, transparent 68%),
    radial-gradient(80% 60% at 85% 100%, rgb(38 28 14 / .24) 0%, transparent 65%),
    repeating-linear-gradient(0deg, rgb(158 220 233 / .012) 0 1px, transparent 1px 4px),
    linear-gradient(180deg, #060d14 0%, #04080d 100%) !important;
}
.sf-crucible-fortify .k-title,.sf-crucible-fortify .k-foot { position:static !important; margin:0 !important; }
html body #screens > .k-screen.sf-crucible-fortify > .k-title {
  padding:10px 18px !important;
  border:1px solid rgb(154 198 218 / .34) !important; border-radius:2px !important;
  background:
    linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 160px, rgb(158 220 233 / .14) 160px 100%) top left / 100% 2px no-repeat,
    linear-gradient(180deg, rgb(25 36 47 / .96) 0%, rgb(14 21 29 / .98) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(215 238 248 / .20), inset 0 -2px 0 rgb(2 5 8 / .88), 0 10px 24px rgb(0 0 0 / .55) !important;
}
.sf-crucible-fortify .k-title h1,
.sf-crucible-fortify .k-title .k-t-title { margin:0; font-size:clamp(26px,3.4vw,42px); color:#edf6fa !important; }
.sf-crucible-fortify .k-title p { color:rgb(198 224 236 / .86); }
.sf-fortify-layout { display:grid; grid-template-columns:minmax(0,1fr) minmax(280px,380px); gap:24px; min-height:0; }
.sf-fortify-plan {
  display:flex; flex-direction:column; min-width:0; min-height:0;
  padding:14px 16px;
  border:1px solid rgb(154 198 218 / .34); border-radius:2px;
  background:
    linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 140px, rgb(158 220 233 / .14) 140px 100%) top left / 100% 2px no-repeat,
    repeating-linear-gradient(0deg, rgb(158 220 233 / .012) 0 1px, transparent 1px 3px),
    radial-gradient(120% 90% at 18% 0%, rgb(24 54 74 / .34), transparent 62%),
    linear-gradient(160deg, rgb(11 24 35 / .95) 0%, rgb(7 16 24 / .97) 100%);
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .14), inset 0 -2px 0 rgb(2 6 10 / .85), 0 12px 28px rgb(0 0 0 / .58);
}
.sf-fortify-plan svg {
  display:block; width:100%; flex:1 1 0; min-height:180px; color:#edf6fa;
  border:1px solid rgb(154 198 218 / .22); border-radius:2px;
  background:
    linear-gradient(rgb(158 220 233 / .04) 1px, transparent 1px) 0 0 / 32px 32px,
    linear-gradient(90deg, rgb(158 220 233 / .04) 1px, transparent 1px) 0 0 / 32px 32px,
    radial-gradient(circle at 50% 50%, rgb(18 46 64 / .42) 0%, rgb(6 14 22 / .94) 76%);
}
.sf-fortify-plan circle,.sf-fortify-plan path { vector-effect:non-scaling-stroke; }
.sf-fortify-plan .sf-fortify-orbit { fill:none; stroke:rgb(158 220 233 / .28); stroke-dasharray:4 8; }
.sf-fortify-plan .sf-fortify-link { fill:none; stroke:rgb(158 220 233 / .35); }
.sf-fortify-plan .sf-fortify-terrain { fill:rgb(7 16 24 / .9); stroke:#9edce9; stroke-width:1; opacity:.55; }
.sf-fortify-plan .sf-fortify-built { fill:#f2b950; stroke:#e6ca8f; stroke-width:2; }
.sf-fortify-plan .sf-fortify-approach { fill:none; stroke:rgb(158 220 233 / .55); stroke-width:1.5; }
.sf-fortify-plan .sf-fortify-preview { color:#f2b950; }
.sf-fortify-plan .sf-fortify-preview[data-blocked=true] { color:rgb(158 220 233 / .45); opacity:.5; }
.sf-fortify-plan .sf-fortify-reach { fill:none; stroke:currentColor; stroke-width:1; stroke-dasharray:5 5; }
.sf-fortify-plan .sf-fortify-pair { fill:none; stroke:currentColor; stroke-width:3; }
.sf-fortify-plan .sf-fortify-footprint { fill:rgb(8 18 27 / .92); stroke:currentColor; stroke-width:3; }
.sf-fortify-plan .sf-fortify-face { fill:none; stroke:currentColor; stroke-width:2; }
.sf-fortify-plan .sf-fortify-bank { fill:none; stroke:currentColor; stroke-width:2.5; stroke-dasharray:8 5; }
.sf-fortify-plan polygon { vector-effect:non-scaling-stroke; }
.sf-fortify-facings { margin-top:10px; }
.sf-fortify-facings[hidden] { display:none; }
.sf-fortify-plan .sf-fortify-pilot { fill:#9edce9; stroke:none; }
.sf-fortify-plan .sf-fortify-point { fill:rgb(9 21 32 / .94); stroke:#9edce9; stroke-width:1.5; }
.sf-fortify-plan .sf-fortify-point[data-selected=true] { stroke:#e6ca8f; stroke-width:3; }
.sf-fortify-plan .sf-fortify-point[data-blocked=true] { opacity:.4; stroke-dasharray:3 3; }
.sf-fortify-plan .sf-fortify-point[data-occupied=true] { fill:#f2b950; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-plan text { fill:#edf6fa; font:56px var(--dp-face-numeral) !important; text-anchor:middle; dominant-baseline:central; }
.sf-fortify-plan text[data-occupied=true] { fill:#060d14; }
.sf-fortify-position { margin:8px 0 0; min-height:1.5em; color:#d8eaf2; }
.sf-fortify-sockets { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
.sf-fortify-sockets button,.sf-fortify-device { min-height:40px; text-align:left; }
.sf-fortify-shelf { overflow:auto; min-height:0; padding-right:8px; }
.sf-fortify-device { width:100%; display:grid; grid-template-columns:52px minmax(0,1fr); align-items:start; gap:8px 14px; border:1px solid rgb(154 198 218 / .30); border-radius:2px; padding:12px 14px; background:linear-gradient(160deg, rgb(12 26 38 / .94), rgb(8 17 26 / .97)); color:#edf6fa; cursor:pointer; text-transform:none !important; letter-spacing:normal !important; }
.sf-fortify-device__body { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 12px; min-width:0; }
.sf-fortify-device strong { font:600 17px var(--dp-face-read); color:#edf6fa; }
.sf-fortify-device__cost { color:#f2b950 !important; font-weight:700 !important; font-variant-numeric:tabular-nums; }
.sf-fortify-device small { grid-column:1/-1; font:14px/1.45 var(--dp-face-read); color:rgb(198 224 236 / .84); }
.sf-fortify-device[aria-pressed=true] strong,.sf-fortify-sockets [aria-pressed=true] { color:#fff1cf; }
.sf-fortify-device:focus-visible,.sf-fortify-sockets button:focus-visible { outline:1px solid #9edce9; outline-offset:1px; }
.sf-fortify-state { border:1px solid rgb(154 198 218 / .30); border-radius:2px; background:linear-gradient(90deg, #f2b950 0 24px, rgb(158 220 233 / .45) 24px 120px, transparent 120px 100%) top left / 100% 2px no-repeat, linear-gradient(160deg, rgb(11 24 35 / .95), rgb(7 16 24 / .98)); box-shadow:inset 0 1px 0 rgb(208 238 250 / .12), 0 8px 20px rgb(0 0 0 / .5); margin-top:12px; padding:12px 14px; }
.sf-fortify-state h2 { color:#9edce9; font-size:13px; letter-spacing:.14em; text-transform:uppercase; }
.sf-fortify-state ul { list-style:none; padding:0; margin:8px 0 0; }
.sf-fortify-state li { padding:8px 0; font:14px/1.5 var(--dp-face-read); color:#edf6fa; }
.sf-fortify-state button { margin-left:12px; }
.sf-fortify-balance { color:#f2b950 !important; font-weight:600; font-variant-numeric:tabular-nums; }
.sf-fortify-ready { display:flex; flex-wrap:wrap; gap:2px 28px; margin-top:6px; }
.sf-fortify-ready p { margin:0; font:14px/1.4 var(--dp-face-read); overflow-wrap:anywhere; color:#d8eaf2; }
.sf-fortify-ready .sf-fortify-lost { color:#f1b059; }
.sf-fortify-ready [hidden] { display:none; }
html body #screens > .k-screen.sf-crucible-fortify > .k-foot {
  display:flex; gap:10px 20px; flex-wrap:wrap; align-items:center;
  padding:10px 18px !important;
  border:1px solid rgb(154 198 218 / .34) !important; border-radius:2px !important;
  background:linear-gradient(180deg, rgb(25 36 47 / .96) 0%, rgb(14 21 29 / .98) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(215 238 248 / .20), inset 0 -2px 0 rgb(2 5 8 / .88), 0 -10px 24px rgb(0 0 0 / .62) !important;
}
/* Authoritative chamfered hardware command keys */
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-build {
  font:700 14px var(--dp-face-read) !important; letter-spacing:.12em !important; text-transform:uppercase !important;
  color:#fff1cf !important; min-height:42px; padding:0 22px;
  background:linear-gradient(180deg, rgb(224 181 94 / .32) 0%, rgb(224 181 94 / .14) 100%) !important;
  border:1px solid #e6ca8f !important; border-radius:2px !important;
  box-shadow:inset 0 1px 0 rgb(255 241 207 / .30), 0 8px 22px rgb(0 0 0 / .55) !important;
  clip-path:polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px)) !important;
  transition:background var(--dp-d-cut, 80ms) linear, box-shadow var(--dp-d-cut, 80ms) linear, border-color var(--dp-d-cut, 80ms) linear; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-build:not([disabled]):is(:hover, :focus-visible) {
  border-color:#ffd98c !important;
  background:linear-gradient(180deg, rgb(242 185 80 / .42) 0%, rgb(224 181 94 / .22) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(255 248 228 / .45), 0 0 18px rgb(242 185 80 / .28) !important;
  color:#ffffff !important; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-build[disabled],
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-build[aria-disabled="true"] {
  opacity:.5; cursor:not-allowed; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-close {
  font:600 13px var(--dp-face-read) !important; letter-spacing:.08em !important; text-transform:uppercase !important;
  color:#d8eaf2 !important; min-height:42px; padding:0 18px;
  background:linear-gradient(180deg, rgb(20 35 48 / .92) 0%, rgb(12 22 32 / .96) 100%) !important;
  border:1px solid rgb(154 198 218 / .34) !important; border-radius:2px !important;
  box-shadow:inset 0 1px 0 rgb(210 238 250 / .14) !important;
  transition:background var(--dp-d-cut, 80ms) linear, border-color var(--dp-d-cut, 80ms) linear; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-close:is(:hover, :focus-visible) {
  color:#fff1cf !important; background:linear-gradient(180deg, rgb(28 48 66 / .95) 0%, rgb(16 30 43 / .98) 100%) !important; border-color:#e6ca8f !important; }
.sf-fortify-receipt { flex:1 0 100%; margin:0; min-height:1.5em; color:rgb(198 224 236 / .86); }
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
/* Laptop height (first-hour pass): the title closes up and the device shelf sets two to a row */
@media (min-width:761px) and (min-height:541px) and (max-height:800px) {
  html body #screens > .k-screen.sf-crucible-fortify { padding:12px 28px 10px !important; gap:8px !important; }
  .sf-crucible-fortify .k-title h1 { font-size:clamp(24px,3.2vw,34px); }
  .sf-crucible-fortify .k-title p { margin:3px 0 0; }
  .sf-fortify-layout { grid-template-columns:minmax(0,1fr) minmax(360px,580px); gap:20px; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-shelf {
    display:grid !important; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; align-content:start; align-items:stretch; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device { padding:10px 12px 12px !important; gap:4px 10px !important; min-height:0; height:auto !important; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device strong { font-size:15px !important; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device small { font-size:12.5px !important; line-height:1.35 !important; }
  html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state { grid-column:1 / -1; margin-top:4px; padding:10px 12px !important; }
}
/* Ruggedized metal-and-glass controls for positions, devices, and built structures */
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets { gap:8px; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets button {
  min-height:36px; padding:0 12px;
  border:1px solid rgb(154 198 218 / .30) !important; border-radius:2px !important;
  background:linear-gradient(165deg, rgb(16 32 45 / .92), rgb(10 20 30 / .96)) !important;
  clip-path:none !important; box-shadow:inset 0 1px 0 rgb(210 238 250 / .10) !important;
  font:600 12.5px var(--dp-face-read) !important; letter-spacing:.04em !important; text-transform:uppercase !important;
  color:#d8eaf2; transition:background var(--dp-d-cut, 80ms) linear, border-color var(--dp-d-cut, 80ms) linear; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets button:hover {
  background:linear-gradient(165deg, rgb(22 44 60 / .95), rgb(13 27 39 / .98)) !important;
  border-color:rgb(158 220 233 / .62) !important; color:#ffffff; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets button[aria-pressed=true] {
  color:#fff1cf !important;
  border:1px solid rgb(230 202 143 / .82) !important;
  background:linear-gradient(165deg, rgb(224 181 94 / .22) 0%, rgb(224 181 94 / .07) 60%, rgb(13 28 40 / .95) 100%) !important;
  box-shadow:inset 0 2px 0 #e6ca8f, inset 0 0 16px rgb(224 181 94 / .12), 0 4px 14px rgb(0 0 0 / .45) !important; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-shelf { display:flex; flex-direction:column; gap:8px; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device {
  flex:0 0 auto; padding:12px 14px;
  border:1px solid rgb(154 198 218 / .30); border-radius:2px;
  background:
    linear-gradient(90deg, #f2b950 0 22px, rgb(158 220 233 / .45) 22px 110px, rgb(158 220 233 / .12) 110px 100%) top left / 100% 2px no-repeat,
    linear-gradient(160deg, rgb(12 26 38 / .94) 0%, rgb(8 17 26 / .97) 100%);
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .12), inset 0 -2px 0 rgb(2 6 10 / .85), 0 8px 20px rgb(0 0 0 / .5);
  transition:background var(--dp-d-cut, 80ms) linear, border-color var(--dp-d-cut, 80ms) linear; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device:hover {
  border-color:rgb(158 220 233 / .62);
  background:
    linear-gradient(90deg, #f2b950 0 22px, rgb(158 220 233 / .55) 22px 110px, rgb(158 220 233 / .18) 110px 100%) top left / 100% 2px no-repeat,
    linear-gradient(160deg, rgb(18 36 52 / .96) 0%, rgb(11 23 34 / .98) 100%); }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device[aria-pressed=true] {
  border:1px solid rgb(230 202 143 / .82);
  background:linear-gradient(165deg, rgb(224 181 94 / .22) 0%, rgb(224 181 94 / .07) 60%, rgb(13 28 40 / .95) 100%);
  box-shadow:inset 0 2px 0 #e6ca8f, inset 0 0 18px rgb(224 181 94 / .12), 0 6px 18px rgb(0 0 0 / .5);
  color:#fff1cf; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state { flex:0 0 auto; margin-top:10px; padding:12px 14px; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state h2 { margin:0; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state ul { display:flex; flex-direction:column; gap:6px; margin:10px 0 0; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state li {
  display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; padding:8px 12px;
  border:1px solid rgb(154 198 218 / .26); border-radius:2px; background:rgb(9 20 30 / .88); }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state li.sf-fortify-empty {
  justify-content:center; padding:12px; border-style:dashed; border-color:rgb(154 198 218 / .28);
  background:rgb(7 16 24 / .65); color:rgb(198 224 236 / .72); }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state button {
  margin-left:auto; min-height:30px; padding:0 10px;
  border:1px solid rgb(158 220 233 / .38) !important; border-radius:2px !important;
  background:rgb(18 36 50 / .92) !important; clip-path:none !important;
  color:#d8eaf2 !important;
  font:600 12px var(--dp-face-read) !important; letter-spacing:.06em !important; text-transform:uppercase !important; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state button + button { margin-left:0; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state button:not(:disabled):hover {
  background:linear-gradient(180deg, rgb(224 181 94 / .28), rgb(224 181 94 / .14)) !important;
  border-color:#e6ca8f !important; color:#fff1cf !important; }
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
