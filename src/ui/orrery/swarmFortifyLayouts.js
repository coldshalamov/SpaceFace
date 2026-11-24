/* Voice (2026-11-23): the Swarm front's — bone text, gold for the one primary or chosen thing, neutral
   hairlines on flat dark plates. No bevels, top gradient rules, ice borders or clipped corners; a rule that
   adds one back is a regression, not a flourish. */
import { injectOrrery } from './tokens.js';

const CSS = `
html body #screens > .k-screen.sf-crucible-fortify {
  display:grid !important; grid-template-rows:auto minmax(0,1fr) auto !important;
  gap:16px !important; padding:22px 36px 18px !important; height:100dvh !important;
  width:100% !important; max-width:none !important; margin:0 !important; overflow:hidden !important;
  background:
    rgb(29 29 30 / .24),
    repeating-linear-gradient(0deg, rgb(255 255 255 / .012) 0 1px, transparent 1px 4px),
    #080809 !important;
}
.sf-crucible-fortify .k-title,.sf-crucible-fortify .k-foot { position:static !important; margin:0 !important; }
html body #screens > .k-screen.sf-crucible-fortify > .k-title {
  padding:10px 18px !important;
  border:1px solid rgb(255 255 255 / .34) !important; border-radius:8px !important;
  background:
    rgb(22 22 23 / .98) !important;
  box-shadow:0 10px 24px rgb(0 0 1 / .55) !important;
}
.sf-crucible-fortify .k-title h1,
.sf-crucible-fortify .k-title .k-t-title { margin:0; font-size:clamp(26px,3.4vw,42px); color:#ffffff !important; }
.sf-crucible-fortify .k-title p { color:rgb(255 255 255 / .86); }
.sf-fortify-layout { display:grid; grid-template-columns:minmax(0,1fr) minmax(280px,380px); gap:24px; min-height:0; }
.sf-fortify-plan {
  display:flex; flex-direction:column; min-width:0; min-height:0;
  padding:14px 16px;
  border:1px solid rgb(255 255 255 / .34); border-radius:8px;
  background:
    rgb(17 17 18 / .97);
  box-shadow:0 12px 28px rgb(0 0 1 / .58);
}
.sf-fortify-plan svg {
  display:block; width:100%; flex:1 1 0; min-height:180px; color:#ffffff;
  border:1px solid rgb(255 255 255 / .22); border-radius:8px;
  background:
    linear-gradient(rgb(255 255 255 / .04) 1px, transparent 1px) 0 0 / 32px 32px,
    linear-gradient(90deg, rgb(255 255 255 / .04) 1px, transparent 1px) 0 0 / 32px 32px,
    rgb(15 15 16 / .94);
}
.sf-fortify-plan circle,.sf-fortify-plan path { vector-effect:non-scaling-stroke; }
.sf-fortify-plan .sf-fortify-orbit { fill:none; stroke:rgb(255 255 255 / .28); stroke-dasharray:4 8; }
.sf-fortify-plan .sf-fortify-link { fill:none; stroke:rgb(255 255 255 / .35); }
.sf-fortify-plan .sf-fortify-terrain { fill:rgb(17 17 18 / .9); stroke:rgb(255 255 255 / .66); stroke-width:1; opacity:.55; }
.sf-fortify-plan .sf-fortify-built { fill:#f2b950; stroke:#ffd98c; stroke-width:2; }
.sf-fortify-plan .sf-fortify-approach { fill:none; stroke:rgb(255 255 255 / .55); stroke-width:1.5; }
.sf-fortify-plan .sf-fortify-preview { color:#f2b950; }
.sf-fortify-plan .sf-fortify-preview[data-blocked=true] { color:rgb(255 255 255 / .45); opacity:.5; }
.sf-fortify-plan .sf-fortify-reach { fill:none; stroke:currentColor; stroke-width:1; stroke-dasharray:5 5; }
.sf-fortify-plan .sf-fortify-pair { fill:none; stroke:currentColor; stroke-width:3; }
.sf-fortify-plan .sf-fortify-footprint { fill:rgb(19 19 20 / .92); stroke:currentColor; stroke-width:3; }
.sf-fortify-plan .sf-fortify-face { fill:none; stroke:currentColor; stroke-width:2; }
.sf-fortify-plan .sf-fortify-bank { fill:none; stroke:currentColor; stroke-width:2.5; stroke-dasharray:8 5; }
.sf-fortify-plan polygon { vector-effect:non-scaling-stroke; }
.sf-fortify-facings { margin-top:10px; }
.sf-fortify-facings[hidden] { display:none; }
.sf-fortify-plan .sf-fortify-pilot { fill:rgb(255 255 255 / .66); stroke:none; }
.sf-fortify-plan .sf-fortify-point { fill:rgb(21 21 22 / .94); stroke:rgb(255 255 255 / .66); stroke-width:1.5; }
.sf-fortify-plan .sf-fortify-point[data-selected=true] { stroke:#ffd98c; stroke-width:3; }
.sf-fortify-plan .sf-fortify-point[data-blocked=true] { opacity:.4; stroke-dasharray:3 3; }
.sf-fortify-plan .sf-fortify-point[data-occupied=true] { fill:#f2b950; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-plan text { fill:#ffffff; font:56px var(--dp-face-read, "Instrument Sans") !important; text-anchor:middle; dominant-baseline:central; }
.sf-fortify-plan text[data-occupied=true] { fill:#0c0c0d; }
.sf-fortify-position { margin:8px 0 0; min-height:1.5em; color:#ffffff; }
.sf-fortify-sockets { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
.sf-fortify-sockets button,.sf-fortify-device { min-height:40px; text-align:left; }
.sf-fortify-shelf { overflow:auto; min-height:0; padding-right:8px; }
.sf-fortify-device { width:100%; display:grid; grid-template-columns:52px minmax(0,1fr); align-items:start; gap:8px 14px; border:1px solid rgb(255 255 255 / .30); border-radius:8px; padding:12px 14px; background:rgb(18 18 19 / .97); color:#ffffff; cursor:pointer; text-transform:none !important; letter-spacing:normal !important; }
.sf-fortify-device__body { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 12px; min-width:0; }
.sf-fortify-device strong { font:600 17px var(--dp-face-read); color:#ffffff; }
.sf-fortify-device__cost { color:#f2b950 !important; font-weight:700 !important; font-variant-numeric:tabular-nums; }
.sf-fortify-device small { grid-column:1/-1; font:14px/1.45 var(--dp-face-read); color:rgb(255 255 255 / .84); }
.sf-fortify-device[aria-pressed=true] strong,.sf-fortify-sockets [aria-pressed=true] { color:#ffd98c; }
.sf-fortify-device:focus-visible,.sf-fortify-sockets button:focus-visible { outline:1px solid rgb(255 255 255 / .66); outline-offset:1px; }
.sf-fortify-state { border:1px solid rgb(255 255 255 / .30); border-radius:8px; background:rgb(17 17 18 / .98); box-shadow:0 8px 20px rgb(0 0 1 / .5); margin-top:12px; padding:12px 14px; }
.sf-fortify-state h2 { color:rgb(255 255 255 / .66); font-size:13px; letter-spacing:0; text-transform:none; }
.sf-fortify-state ul { list-style:none; padding:0; margin:8px 0 0; }
.sf-fortify-state li { padding:8px 0; font:14px/1.5 var(--dp-face-read); color:#ffffff; }
.sf-fortify-state button { margin-left:12px; }
.sf-fortify-balance { color:#f2b950 !important; font-weight:600; font-variant-numeric:tabular-nums; }
.sf-fortify-ready { display:flex; flex-wrap:wrap; gap:2px 28px; margin-top:6px; }
.sf-fortify-ready p { margin:0; font:14px/1.4 var(--dp-face-read); overflow-wrap:anywhere; color:#ffffff; }
.sf-fortify-ready .sf-fortify-lost { color:#f1b059; }
.sf-fortify-ready [hidden] { display:none; }
html body #screens > .k-screen.sf-crucible-fortify > .k-foot {
  display:flex; gap:10px 20px; flex-wrap:wrap; align-items:center;
  padding:10px 18px !important;
  border:1px solid rgb(255 255 255 / .34) !important; border-radius:8px !important;
  background:rgb(22 22 23 / .98) !important;
  box-shadow:0 -10px 24px rgb(0 0 1 / .62) !important;
}
/* The command keys: one solid gold primary, dark hairline secondaries */
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-build {
  font:700 14px var(--dp-face-read) !important; letter-spacing:0 !important; text-transform:none !important;
  color:#121213 !important; min-height:42px; padding:0 22px;
  background:var(--dp-lamp, #f2b950) !important;
  border:0 !important; box-shadow:none !important;
  border-radius:8px !important;
  transition:background var(--dp-d-cut, 80ms) linear, box-shadow var(--dp-d-cut, 80ms) linear, border-color var(--dp-d-cut, 80ms) linear; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-build:not([disabled]):is(:hover, :focus-visible) {
  background:var(--dp-lamp-hot, #ffd98c) !important;
  box-shadow:none !important;
  color:#121213 !important; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-build[disabled],
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-build[aria-disabled="true"] {
  opacity:.5; cursor:not-allowed; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-close {
  font:600 13px var(--dp-face-read) !important; letter-spacing:0 !important; text-transform:none !important;
  color:#ffffff !important; min-height:42px; padding:0 18px;
  background:rgb(23 23 24 / .96) !important;
  border:1px solid rgb(255 255 255 / .34) !important; border-radius:8px !important;
  box-shadow:none !important;
  transition:background var(--dp-d-cut, 80ms) linear, border-color var(--dp-d-cut, 80ms) linear; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-close:is(:hover, :focus-visible) {
  color:#ffd98c !important; background:rgb(30 30 31 / .98) !important; border-color:#ffd98c !important; }
.sf-fortify-receipt { flex:1 0 100%; margin:0; min-height:1.5em; color:rgb(255 255 255 / .86); }
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
/* Position, device and structure keys */
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets { gap:8px; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets button {
  min-height:36px; padding:0 12px;
  border:1px solid rgb(255 255 255 / .30) !important; border-radius:8px !important;
  background:rgb(21 21 22 / .96) !important;
  clip-path:none !important; box-shadow:none !important;
  font:600 12.5px var(--dp-face-read) !important; letter-spacing:0 !important; text-transform:none !important;
  color:#ffffff; transition:background var(--dp-d-cut, 80ms) linear, border-color var(--dp-d-cut, 80ms) linear; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets button:hover {
  background:rgb(27 27 28 / .98) !important;
  border-color:rgb(255 255 255 / .62) !important; color:#ffffff; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets button[aria-pressed=true] {
  color:#ffd98c !important;
  border:1px solid rgb(230 202 143 / .82) !important;
  background:rgb(224 181 94 / .18) !important;
  box-shadow:inset 0 0 16px rgb(224 181 94 / .12) !important; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-shelf { display:flex; flex-direction:column; gap:8px; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device {
  flex:0 0 auto; padding:12px 14px;
  border:1px solid rgb(255 255 255 / .30); border-radius:8px;
  background:
    rgb(18 18 19 / .97);
  box-shadow:0 8px 20px rgb(0 0 1 / .5);
  transition:background var(--dp-d-cut, 80ms) linear, border-color var(--dp-d-cut, 80ms) linear; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device:hover {
  border-color:rgb(255 255 255 / .62);
  background:
    rgb(23 23 24 / .98); }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-device[aria-pressed=true] {
  border:1px solid rgb(230 202 143 / .82);
  background:rgb(224 181 94 / .18);
  box-shadow:inset 0 0 18px rgb(224 181 94 / .12), 0 6px 18px rgb(0 0 1 / .5);
  color:#ffd98c; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state { flex:0 0 auto; margin-top:10px; padding:12px 14px; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state h2 { margin:0; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state ul { display:flex; flex-direction:column; gap:6px; margin:10px 0 0; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state li {
  display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; padding:8px 12px;
  border:1px solid rgb(255 255 255 / .26); border-radius:8px; background:rgb(20 20 21 / .88); }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state li.sf-fortify-empty {
  justify-content:center; padding:12px; border-style:dashed; border-color:rgb(255 255 255 / .28);
  background:rgb(17 17 18 / .65); color:rgb(255 255 255 / .72); }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state button {
  margin-left:auto; min-height:30px; padding:0 10px;
  border:1px solid rgb(255 255 255 / .38) !important; border-radius:8px !important;
  background:rgb(35 35 36 / .92) !important; clip-path:none !important;
  color:#ffffff !important;
  font:600 12px var(--dp-face-read) !important; letter-spacing:0 !important; text-transform:none !important; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state button + button { margin-left:0; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-state button:not(:disabled):hover {
  background:rgb(242 185 80 / .28) !important;
  border-color:#ffd98c !important; color:#ffd98c !important; }
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
    border-top:1px solid rgb(255 255 255 / .16) !important;
    background:rgb(7 7 8) !important;
    box-shadow:0 48px 0 0 rgb(7 7 8), 0 -28px 28px -2px rgb(7 7 8 / .97) !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify > .k-foot::before {
    content:'' !important; display:block !important; pointer-events:none !important;
    position:absolute !important; left:0 !important; right:0 !important; bottom:100% !important;
    height:22px !important;
    background:linear-gradient(180deg, transparent, rgb(7 7 8)) !important;
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
    border-top:1px solid rgb(255 255 255 / .16) !important;
    background:rgb(7 7 8) !important;
    box-shadow:0 48px 0 0 rgb(7 7 8), 0 -28px 28px -2px rgb(7 7 8 / .97) !important;
  }
  html body #screens > .k-screen.sf-crucible-fortify > .k-foot::before {
    content:'' !important; display:block !important; pointer-events:none !important;
    position:absolute !important; left:0 !important; right:0 !important; bottom:100% !important;
    height:22px !important;
    background:linear-gradient(180deg, transparent, rgb(7 7 8)) !important;
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

/* The type system for every Swarm screen, in one place: sentence case, no letter-spacing, one text face.
   The base sheets still carry capitals, .08em-.22em tracking and the condensed "etch" and mono faces on
   individual classes (card labels, tabs, chips, key caps); a player read them as "W E A P O N  M". The
   display face is for titles and the biggest figures only. */
html body #screens > .k-screen.orr-crucible :is(button, a, h1, h2, h3, h4, p, span, li, label, summary, kbd, input, dt, dd, td, th) {
  text-transform:none !important; letter-spacing:0 !important;
  font-family:var(--dp-face-read, "Instrument Sans"), system-ui, sans-serif !important; }
html body #screens > .k-screen.orr-crucible :is(h1, .k-t-title, .sf-runover__title, .sf-play__title) {
  font-family:var(--dp-face-display, "Archivo"), sans-serif !important;
  font-variation-settings:normal !important; font-weight:800 !important; letter-spacing:-.02em !important; color:#ffffff !important; }

/* ── The paused scene behind a Swarm configuration screen: one flat dim, nothing else (2026-11-24) ──
   The base sheet lays a radial scrim over the whole screen and a 259px gradient band across the top
   that ends on a hard line 70px under the header. Both were invisible while the screen had an opaque
   navy background; with the plates flat and the scene showing through, the line showed from edge to
   edge and the scrim pooled. A single uniform dim is all a menu needs over a paused world. */
html body #screens > .k-screen.orr-crucible:not([data-door-view="play"]) { background:rgb(8 8 9 / .84) !important; }
html body #screens > .k-screen.orr-crucible:not([data-door-view="play"])::before,
html body #screens > .k-screen.orr-crucible:not([data-door-view="play"])::after { content:none !important; }
html body #screens > .k-screen.orr-crucible .sf-cru-stage::before { content:none !important; }

/* ── The page: a title, the work, the actions (2026-11-24) ─────────────────────────────────────
   The header and the footer were full-width plates with a title in one corner and ~1,300px of empty
   plate beside it. On the Swarm front and on Run Over the words stand straight on the dim, and these
   screens do the same now. The only framed things left on a screen are the things that are surfaces:
   the ship bay, the field map, a card. One page gutter, one title size, and 24px from the title to
   the work and from the work to the actions.
   The page's structure has the last word, so these rules outrank every screen sheet: #screens is
   named twice on purpose. Neither Refit layout is touched here: each has a composition of its own, and
   the line drawing of the ship is sized to the room under that screen's own header. */
html body #screens#screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-fortify, .sf-crucible-door:not([data-door-view="play"])) .k-title {
  background:none !important; border:0 !important; box-shadow:none !important; border-radius:0 !important;
  min-height:0 !important; margin:0 !important; padding:0 !important; }
html body #screens#screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-fortify, .sf-crucible-door:not([data-door-view="play"])) .k-foot {
  background:none !important; border:0 !important; box-shadow:none !important; border-radius:0 !important;
  min-height:0 !important; margin:0 !important; padding:0 !important; }
html body #screens#screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-fortify, .sf-crucible-door:not([data-door-view="play"])) {
  padding:24px clamp(24px, 5vw, 96px) !important; gap:24px !important; }
html body #screens#screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-fortify, .sf-crucible-door:not([data-door-view="play"])) .k-title :is(h1, .k-t-title) { font-size:40px !important; line-height:1.1 !important; }
/* Rearm is a sparse screen: a title, a row of tabs, three offers, two keys. Stretched between the top
   and bottom edges it had ~300px of nothing above the offers and ~340px below. It is one block now,
   centred, 24px between its parts. */
html body #screens#screens > .k-screen.orr-crucible.sf-crucible-draft.orr-visual-armory:has(.orr-rearm-card-thumb) {
  display:flex !important; flex-direction:column !important; justify-content:center !important; gap:24px !important; }
html body #screens#screens > .k-screen.orr-crucible.sf-crucible-draft.orr-visual-armory:has(.orr-rearm-card-thumb) > * { flex:none !important; margin-top:0 !important; margin-bottom:0 !important; }
html body #screens#screens > .k-screen.orr-crucible.sf-crucible-draft.orr-visual-armory:has(.orr-rearm-card-thumb) .sf-cru-stage {
  justify-content:flex-start !important; gap:32px !important; padding:0 !important; min-height:0 !important; }
html body #screens#screens > .k-screen.orr-crucible.sf-crucible-draft.orr-visual-armory:has(.orr-rearm-card-thumb) .sf-cru-filters { display:none !important; }

/* The schematic Refit is built round its drawing, and the drawing is sized to the room between that
   screen's header and footer. So those two keep their height and lose the box: a title in one corner of
   a full-width plate, with ~1,300px of empty plate beside it, is not a header. */
html body #screens#screens > .k-screen.orr-crucible.orr-refit:not(.sf-bench) .k-title {
  background:none !important; border:0 !important; box-shadow:none !important;
  padding-left:0 !important; padding-right:0 !important; }
html body #screens#screens > .k-screen.orr-crucible.orr-refit:not(.sf-bench) .k-foot {
  background:none !important; border:0 !important; box-shadow:none !important; }

/* ── Fortify: the same page gutter as the other Swarm screens, a title that fits its plate, one frame
   round the field map, and a shelf flush with the plates beside it (2026-11-23) ─────────────────── */
html body #screens > .k-screen.sf-crucible-fortify { padding:24px clamp(24px, 5vw, 96px) !important; }
html body #screens > .k-screen.sf-crucible-fortify > .k-title { padding:20px 24px 22px !important; }
html body #screens > .k-screen.sf-crucible-fortify > .k-title .k-t-title { font-size:40px !important; line-height:1.1 !important; }
/* the map draws its own frame; the plate round it drew a second one 17px outside it */
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-plan { border-color:transparent !important; }
/* the shelf kept 8px of dead space at its right edge, short of the header and footer beside it */
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-shelf > * { width:100% !important; box-sizing:border-box !important; }
html body #screens > .k-screen.sf-crucible-fortify :is(.sf-fortify-device, .sf-fortify-state) { border-radius:10px !important; }
html body #screens > .k-screen.sf-crucible-fortify .sf-fortify-sockets button { border-radius:8px !important; }
`;

export function injectSwarmFortifyLayouts(doc = globalThis.document) {
  injectOrrery(doc);
  if (!doc?.head || doc.getElementById('sf-swarm-fortify-layout')) return;
  const style = doc.createElement('style');
  style.id = 'sf-swarm-fortify-layout';
  style.textContent = CSS;
  doc.head.appendChild(style);
}
