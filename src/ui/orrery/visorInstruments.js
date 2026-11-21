import { hullPosterUrl } from '../hullPosters.js';

const STYLE_ID = 'sf-visor-instruments';

const CSS = `
.orr-cluster.orr-cluster--visor {
  --orr-cluster-scale:1;
  --visor-dial-scale:.795;
  --visor-dial-size:calc(244px * var(--visor-dial-scale));
  --visor-type:clamp(12px, .97vw, 16px);
  --visor-value-type:clamp(14px, 1.2vw, 20px);
  --visor-readout-height:141px;
  width:min(49vw, calc((100vw - 2 * var(--sf-safe-inset-x, 0px)) * .54), 792px); height:auto; transform:none; isolation:isolate;
  color:#f2f3ee; font-family:var(--visor-font);
  text-shadow:0 1px 2px rgb(3 8 12 / .72);
}
.orr-cluster--visor::before {
  content:""; position:absolute; inset:-24px -25px -12px -22px; z-index:-1;
  background:radial-gradient(ellipse closest-side at 49% 55%, rgb(6 14 23 / .57), rgb(6 14 23 / .25) 64%, transparent),
    radial-gradient(ellipse at 45% 55%, rgb(6 14 23 / .25), transparent 71%);
}
.orr-cluster--visor > svg { display:none; }
.orr-visor__readouts {
  position:relative; display:grid; grid-template-columns:max(26.85%, calc(var(--visor-dial-size) + 6px)) 23.15% 21.6% minmax(0, 1fr);
  align-items:start; min-height:var(--visor-readout-height);
}
.orr-visor__readouts .orr-speeddial {
  position:absolute; inset:0 auto auto 0; zoom:var(--visor-dial-scale);
  --orr-lab:calc(clamp(13px,1.18vw,20px) / var(--visor-dial-scale));
}
.orr-visor__readouts .orr-speeddial__read { top:calc(50% - 10px); gap:7px; }
.orr-visor__readouts .orr-speeddial .orr-numeral {
  font-family:var(--dp-face-numeral); font-weight:700; font-style:italic; font-variation-settings:normal;
  font-variant-numeric:tabular-nums; color:#f7f8f3; text-shadow:0 1px 4px #06101a;
}
.orr-visor__readouts .orr-speeddial__read .orr-label {
  font-family:var(--visor-font); font-weight:500; font-style:italic; line-height:1.08; letter-spacing:.02em;
}
.orr-visor__readouts .orr-speeddial__lab,
.orr-visor__readouts .orr-speeddial.is-rest:not(.is-boost) .orr-speeddial__tag { display:none; }
.orr-visor__readouts .orr-speeddial__tag { top:74%; font-size:16px; letter-spacing:.08em; }
.orr-visor__readouts .orr-speeddial::before { opacity:.24; }
.orr-visor__vitals { display:grid; align-content:start; gap:7px; min-width:0; margin-top:12px; min-height:104px; }
.orr-visor__vitals--condition { grid-column:2; padding-right:clamp(8px,1.6vw,27px); }
.orr-visor__vitals--systems { grid-column:3; gap:20px; padding-inline:clamp(9px,1.28vw,22px) clamp(8px,1.2vw,20px); }
.orr-visor__vitals--systems, .orr-visor__portrait { border-inline-start:1px solid rgb(200 226 233 / .46); }
.orr-visor__reading { min-width:0; --visor-fill:#92d9eb; }
.orr-visor__reading[data-meter="energy"] { --visor-fill:#f3d178; }
.orr-visor__reading[data-meter="heat"] { --visor-fill:#f1b059; }
.orr-visor__reading:has(.is-critical), .orr-visor__reading.is-hot { --visor-fill:var(--dp-danger, #ff7159); }
.orr-visor__line { display:flex; gap:6px; justify-content:space-between; align-items:baseline; line-height:1; }
.orr-visor__line .orr-label { font:500 var(--visor-type)/1.1 var(--visor-font); font-variation-settings:normal; letter-spacing:0; color:#ecf3f3; }
.orr-visor__line b { font:650 var(--visor-value-type)/1 var(--visor-font); font-variation-settings:normal; font-variant-numeric:tabular-nums; }
.orr-visor__line i { font:inherit; margin-left:1px; }
.orr-visor__line .is-critical { color:var(--dp-danger, #ff7159); }
.orr-visor__meter { position:relative; height:7px; margin:4px 3px 0; overflow:hidden; transform:skewX(-36deg); --visor-bar-step:7.15%; }
.orr-visor__vitals--systems .orr-visor__meter { height:9px; --visor-bar-step:14.29%; }
.orr-visor__meter::before, .orr-visor__meter::after {
  content:""; position:absolute; inset:0;
  background:repeating-linear-gradient(90deg,currentColor 0 calc(var(--visor-bar-step) - 1.5px),transparent calc(var(--visor-bar-step) - 1.5px) var(--visor-bar-step));
}
.orr-visor__meter::before { color:rgb(166 202 221 / .25); }
.orr-visor__meter::before { border-block:1px solid rgb(192 224 234 / .15); box-sizing:border-box; }
.orr-visor__meter::after { color:var(--visor-fill); clip-path:inset(0 calc(100% - var(--visor-meter, 0%)) 0 0); transition:clip-path 160ms ease-out; }
.orr-visor__portrait { position:relative; grid-column:4; min-width:0; margin:12px 0 0; padding-inline:clamp(8px,1.1vw,18px) clamp(11px,2.1vw,35px); height:104px; display:grid; justify-items:center; grid-template-rows:75px auto; gap:6px; }
.orr-visor__hull-stage { position:relative; width:100%; height:100%; min-height:0; display:grid; place-items:center; }
.orr-visor__plan { display:block; width:100%; height:100%; min-height:0; object-fit:contain; padding:5px 6px; box-sizing:border-box;
  filter:drop-shadow(0 1px 1px rgb(3 12 19 / .8)); }
.orr-visor__plan[hidden] { visibility:hidden; }
.orr-visor__plan[data-view="holo"] { transform:rotate(-90deg); }
.orr-visor__ship-hud { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
.orr-visor__hit-arc { fill:none; stroke:#ff5e47; stroke-width:3.2; stroke-linecap:round; opacity:0; transition:opacity 120ms ease-out; }
.orr-visor__hit-arc.is-lit { filter:drop-shadow(0 0 4px rgb(255 94 71 / .85)); }
.orr-visor__hp-core { fill:#a9edf4; stroke:#06121b; stroke-width:1.2; transition:fill 90ms ease, r 90ms ease; }
.orr-visor__hp-ring { fill:none; stroke:transparent; stroke-width:1.5; opacity:0; transition:opacity 90ms ease; }
.orr-visor__hp[data-state="firing"] .orr-visor__hp-core { fill:#fff3c8; }
.orr-visor__hp[data-state="firing"] .orr-visor__hp-ring { stroke:#ffbe4f; opacity:1; }
.orr-visor__hp[data-state="hot"] .orr-visor__hp-core { fill:#ff6048; }
.orr-visor__hp[data-state="hot"] .orr-visor__hp-ring { stroke:#ff6048; opacity:1; }
.orr-visor__tether-vec { stroke:#6ee5f5; stroke-width:1.6; stroke-dasharray:3 2; stroke-linecap:round; opacity:0; }
.orr-visor__tether-dot { fill:#6ee5f5; stroke:#06121b; stroke-width:1; opacity:0; }
.orr-visor__portrait[data-tethered="1"] .orr-visor__tether-vec,
.orr-visor__portrait[data-tethered="1"] .orr-visor__tether-dot { opacity:1; }
.orr-visor__portrait::before { content:""; position:absolute; inset:1px clamp(11px,2.1vw,35px) 28px clamp(8px,1.1vw,18px); pointer-events:none; opacity:.78;
  --corner:linear-gradient(#b8d5e3,#b8d5e3);
  background:var(--corner) left top / 11px 1px no-repeat, var(--corner) left top / 1px 10px no-repeat,
    var(--corner) right top / 11px 1px no-repeat, var(--corner) right top / 1px 10px no-repeat,
    var(--corner) left bottom / 11px 1px no-repeat, var(--corner) left bottom / 1px 10px no-repeat,
    var(--corner) right bottom / 11px 1px no-repeat, var(--corner) right bottom / 1px 10px no-repeat;
}
.orr-visor__portrait figcaption { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  display:inline-flex; align-items:center; justify-content:center; gap:5px;
  font-size:clamp(12px,1.02vw,16px); line-height:1.2; font-weight:560; }
.orr-visor__portrait[data-tethered="1"] figcaption { color:#8be9fd; font-weight:650; }
.orr-visor__line-badge { display:none; width:7px; height:7px; border-radius:50%; background:#6ee5f5;
  box-shadow:0 0 6px rgb(110 229 245 / .75); flex:0 0 auto; }
.orr-visor__portrait[data-tethered="1"] .orr-visor__line-badge { display:inline-block; }
.orr-cluster--visor .orr-cluster__keys { display:flex; flex-wrap:nowrap; align-items:stretch; margin:0 0 0 10px; padding:0 0 12px;
  border-bottom:1px solid rgb(216 236 240 / .7); }
.orr-cluster.orr-cluster--visor .orr-cluster__key {
  position:relative; width:auto; height:76px; flex:1 1 0; min-width:56px; margin:0;
  box-sizing:border-box; border-radius:0; cursor:pointer; will-change:auto; isolation:isolate;
  transition:background 120ms ease, opacity 120ms ease;
}
.orr-cluster.orr-cluster--visor .orr-cluster__key[data-power="pull"] { flex:.86 1 0; min-width:58px; }
.orr-cluster.orr-cluster--visor .orr-cluster__key[data-power="shove"] { flex:.96 1 0; min-width:66px; }
.orr-cluster.orr-cluster--visor .orr-cluster__key[data-power="pin"] { flex:.80 1 0; min-width:54px; }
.orr-cluster.orr-cluster--visor .orr-cluster__key[data-power="bomb"] { flex:1.34 1 0; min-width:94px; }
.orr-cluster.orr-cluster--visor .orr-cluster__key[data-power="rig"],
.orr-cluster.orr-cluster--visor .orr-cluster__key[data-power="plow"] { flex:1.02 1 0; min-width:74px; }
.orr-cluster.orr-cluster--visor .orr-cluster__key[data-power="line"] { flex:1.38 1 0; min-width:96px; }
.orr-cluster--visor .orr-cluster__key + .orr-cluster__key::before {
  content:""; position:absolute; inset:3px auto 10px 0; width:1px; background:linear-gradient(transparent, rgb(216 236 240 / .5) 27%,rgb(216 236 240 / .5) 88%,transparent);
}
.orr-cluster--visor .orr-cluster__key::after {
  content:""; position:absolute; left:18%; right:18%; bottom:-7px; height:2px;
  background:currentColor; opacity:0; transform:scaleX(.45); transition:opacity 140ms ease, transform 180ms ease;
}
.orr-cluster--visor .orr-cluster__key > svg { top:2px; left:calc(50% - 22px); width:44px; height:44px; }
.orr-cluster--visor .orr-cluster__key > svg > circle { visibility:hidden; }
.orr-cluster--visor .orr-cluster__key.is-firing > svg .orr-pulse-ring { visibility:visible; }
.orr-cluster--visor .orr-cluster__key .orr-cluster__icon {
  top:2px; left:50%; width:44px; height:44px; margin:0 0 0 -22px; opacity:1;
}
.orr-cluster--visor .orr-cluster__icon.has-arsenal svg { stroke-width:1.62; }
/* Active ring around the icon while a power is running or a charge is armed. */
.orr-cluster--visor .orr-cluster__ring {
  position:absolute; top:1px; left:50%; width:46px; height:46px; margin-left:-23px;
  border-radius:50%; border:2px solid transparent; box-sizing:border-box; pointer-events:none;
  opacity:0; transition:opacity 140ms ease, border-color 140ms ease;
}
.orr-cluster--visor .orr-cluster__key:is(.is-running,.is-active,.is-armed) .orr-cluster__ring {
  opacity:1; border-color:var(--orr-power-col, var(--dp-hand-hot, #ffd98c));
  box-shadow:inset 0 0 10px color-mix(in srgb, var(--orr-power-col, #ffd98c) 26%, transparent);
}
/* Armed charge: tile 4 reads Detonate and pulses visibly. */
.orr-cluster--visor .orr-cluster__key.is-detonate {
  color:#ffb357;
  background:linear-gradient(0deg, rgb(255 154 61 / .22), transparent 82%);
}
.orr-cluster--visor .orr-cluster__key.is-detonate .orr-cluster__ring {
  opacity:1; border-color:#ff9e42;
  box-shadow:inset 0 0 14px rgb(255 140 50 / .36);
  animation:orr-visor-detonate 0.95s ease-in-out infinite;
}
.orr-cluster--visor .orr-cluster__key.is-detonate .orr-cluster__keyword { color:#ffd99c; font-weight:700; }
@keyframes orr-visor-detonate {
  0%, 100% { transform:scale(1); opacity:1; }
  50% { transform:scale(1.1); opacity:.62; }
}
/* Bomb icon blinking fuse lamp. */
.orr-cluster--visor .arsenal-fuse-lamp { fill:#ffd37a; animation:orr-fuse-blink 1.2s steps(2, end) infinite; }
.orr-cluster--visor .arsenal-fuse-rays { stroke:#ffd37a; animation:orr-fuse-blink 1.2s steps(2, end) infinite; }
.orr-cluster--visor .orr-cluster__key.is-detonate .arsenal-fuse-lamp,
.orr-cluster--visor .orr-cluster__key.is-detonate .arsenal-fuse-rays { fill:#ff8f3d; stroke:#ff8f3d; animation-duration:0.45s; }
@keyframes orr-fuse-blink { 0%, 58% { opacity:1; } 59%, 100% { opacity:.22; } }
/* Cooldown wipe + whole-second numeral right inside the tile. */
.orr-cluster--visor .orr-cluster__cdwipe {
  display:none; position:absolute; top:2px; left:calc(50% - 22px); width:44px; height:44px;
  border-radius:4px; overflow:hidden; pointer-events:none;
  background:rgb(4 10 16 / .72); border-top:2px solid rgb(169 237 244 / .85);
  transform-origin:bottom center; transform:scaleY(var(--cd-rem, 0));
}
.orr-cluster--visor .orr-cluster__key.is-cooldown .orr-cluster__cdwipe { display:block; }
.orr-cluster--visor .orr-cluster__cdnum {
  display:none; position:absolute; top:2px; left:50%; width:44px; height:44px; margin-left:-22px;
  place-items:center; pointer-events:none;
  font:750 16px/1 var(--dp-face-numeral, var(--visor-font)); font-variant-numeric:tabular-nums;
  color:#f4f8fa; text-shadow:0 0 3px #04090e, 0 1px 4px #04090e;
}
.orr-cluster--visor .orr-cluster__key.is-cooldown .orr-cluster__cdnum:not(:empty) { display:grid; }
.orr-cluster--visor .orr-cluster__key .orr-cluster__keytag {
  display:flex; justify-content:center; align-items:center; gap:6px; position:absolute;
  inset:auto 3px 0; max-width:none; transform:none; font:540 clamp(12px,.95vw,15px)/1.2 var(--visor-font);
  text-transform:none; letter-spacing:0; text-shadow:0 1px 2px #060c13;
}
.orr-cluster--visor .orr-cluster__keytag::before { content:none; }
.orr-cluster.orr-cluster--visor .orr-cluster__key .orr-cluster__keyword { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; }
.orr-cluster.orr-cluster--visor .orr-cluster__key .orr-cluster__keyshort { display:none; }
.orr-cluster.orr-cluster--visor .orr-cluster__key .orr-cluster__keytag b {
  order:-1; margin:0; min-width:22px; padding:0 4px; border:1px solid rgb(230 239 240 / .86); border-radius:4px;
  background:rgb(8 18 26 / .52); white-space:nowrap;
  font:670 max(12px, calc(var(--visor-type) - 1px))/1.26 var(--visor-font); letter-spacing:0; flex:none; text-align:center;
}
.orr-cluster--visor .orr-cluster__keytag b:empty { display:none; }
.orr-cluster--visor .orr-cluster__count {
  top:1px; left:calc(50% + 14px); transform:none; line-height:1;
  font-size:12px; font-weight:700; color:#eef5f8;
  text-shadow:0 1px 2px #040a10, 0 0 4px #040a10;
}
.orr-cluster--visor .orr-cluster__count.is-plow-count {
  padding:1px 5px; border-radius:9px; background:rgb(255 186 82 / .24);
  border:1px solid rgb(255 206 120 / .85); color:#ffe5ad;
}
/* Small Q · More pill sitting after Line for the context wheel. */
.orr-visor__more {
  flex:0 0 auto; align-self:flex-end; display:inline-flex; align-items:center; gap:6px;
  margin:0 0 1px 10px; padding:4px 10px; min-height:28px; box-sizing:border-box;
  border:1px solid rgb(206 230 236 / .42); border-radius:4px;
  background:rgb(8 20 30 / .58); color:#e4eff2; cursor:pointer; pointer-events:auto;
  font:540 clamp(12px,.95vw,14px)/1.15 var(--visor-font); text-transform:none; letter-spacing:0;
  white-space:nowrap; text-shadow:0 1px 2px #060c13;
  transition:background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.orr-visor__more b {
  min-width:19px; padding:0 4px; border:1px solid rgb(230 239 240 / .82); border-radius:3px;
  background:rgb(8 18 26 / .55); font:700 12px/1.25 var(--visor-font); text-align:center;
}
.orr-visor__more:is(:hover,:focus-visible) {
  background:rgb(118 191 214 / .2); border-color:var(--visor-ice, #a9edf4); color:#ffffff;
}
.orr-visor__more:focus-visible { outline:2px solid var(--visor-ice, #a9edf4); outline-offset:2px; }
/* First-use one-line caption directly over the power bar (2.5 s). */
.orr-visor__caption {
  position:absolute; left:10px; bottom:calc(100% + 10px); max-width:min(520px, calc(100% - 20px));
  display:flex; align-items:baseline; gap:8px; padding:7px 14px; box-sizing:border-box;
  background:linear-gradient(95deg, rgb(10 25 36 / .94), rgb(8 18 26 / .86));
  border:1px solid rgb(169 237 244 / .42); border-left:3px solid var(--visor-ice, #a9edf4);
  color:#eef5f7; font:500 13px/1.3 var(--visor-font); pointer-events:none;
  text-shadow:0 1px 2px #04090e;
}
.orr-visor__caption[hidden] { display:none !important; }
.orr-visor__caption-name { color:var(--visor-ice, #a9edf4); font-weight:700; flex:0 0 auto; }
.orr-visor__caption-text { color:#eef5f7; min-width:0; }
.orr-cluster--visor:has(.orr-cluster__perk) .orr-visor__caption { left:74px; max-width:calc(100% - 84px); }
.orr-cluster--visor .orr-cluster__key:is(.is-locked,.is-empty,.is-cooldown) .orr-cluster__icon { opacity:.42; }
.orr-cluster.orr-cluster--visor .orr-cluster__key:is(:hover,:focus-visible) { background:linear-gradient(0deg, rgb(118 191 214 / .18), transparent); }
.orr-cluster.orr-cluster--visor .orr-cluster__key:focus-visible { outline:1px solid #a6dce8; outline-offset:1px; }
.orr-cluster--visor .orr-cluster__key:is(.is-active,.is-running,.is-held,.is-armed,.is-firing) { color:var(--dp-hand-hot, #ffd98c); animation:none; }
.orr-cluster.orr-cluster--visor .orr-cluster__key:is(.is-active,.is-running,.is-held,.is-armed,.is-firing) .orr-cluster__icon { color:currentColor; opacity:1; }
.orr-cluster--visor .orr-cluster__key:is(:hover,:focus-visible,.is-running,.is-held,.is-firing,.is-detonate)::after { opacity:1; transform:scaleX(1); }
.orr-cluster--visor .orr-cluster__key:is(.is-active,.is-running,.is-armed) :is(.orr-cluster__icon,.orr-cluster__keytag b) {
  filter:drop-shadow(0 0 5px rgb(255 197 93 / .30));
}
.orr-cluster.orr-cluster--visor .orr-cluster__key:is(.is-active,.is-running,.is-armed) .orr-cluster__keytag b {
  border-color:currentColor; color:inherit; background:rgb(218 145 47 / .12);
}
.orr-cluster--visor .orr-cluster__key.is-firing .orr-cluster__icon { animation:orr-visor-cast 230ms ease-out both; }
@keyframes orr-visor-cast { from { transform:scale(.86); } to { transform:none; } }
.orr-cluster--visor .orr-cluster__perks { top:auto !important; left:0 !important; bottom:calc(100% + 9px); flex-direction:row; }
.orr-cluster--visor .orr-cluster__payload { top:auto !important; left:auto !important; right:0; bottom:calc(100% + 9px); gap:3px; }
.orr-cluster--visor .orr-cluster__payload.is-quiet { display:none; }
.orr-cluster--visor .orr-cluster__next { top:auto; left:0; bottom:calc(100% + 9px); width:100%; }
.orr-cluster--visor.is-ship-under .orr-cluster__keytag { opacity:.8; }
.orr-cluster--visor.is-arriving .orr-visor__readouts { animation:orr-visor-enter 230ms cubic-bezier(.2,.7,.2,1) both; }
@keyframes orr-visor-enter { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
@media (max-width:1520px) {
  .orr-cluster.orr-cluster--visor { --visor-dial-scale:.66; --visor-readout-height:132px; }
  .orr-cluster--visor .orr-cluster__key .orr-cluster__keytag { gap:4px; }
}
@media (max-width:1200px) {
  .orr-cluster.orr-cluster--visor { --visor-dial-scale:.49; --visor-readout-height:102px; width:54vw; }
  .orr-visor__vitals { min-height:82px; margin-top:6px; gap:5px; }
  .orr-visor__vitals--systems { gap:12px; }
  .orr-visor__portrait { height:82px; margin-top:6px; grid-template-rows:56px auto; }
  .orr-cluster--visor .orr-cluster__keys { margin-left:3px; padding-bottom:8px; }
  .orr-cluster.orr-cluster--visor .orr-cluster__key { height:58px; min-width:44px; }
  .orr-cluster.orr-cluster--visor .orr-cluster__key[data-power="line"] { min-width:74px; }
  .orr-cluster--visor .orr-cluster__key .orr-cluster__icon,
  .orr-cluster--visor .orr-cluster__cdwipe,
  .orr-cluster--visor .orr-cluster__cdnum { width:32px; height:32px; margin-left:-16px; left:50%; }
  .orr-cluster--visor .orr-cluster__ring { width:34px; height:34px; margin-left:-17px; }
  .orr-cluster--visor .orr-cluster__key .orr-cluster__keytag { gap:4px; }
  .orr-cluster.orr-cluster--visor .orr-cluster__key .orr-cluster__keytag b { min-width:15px; padding-inline:3px; }
  .orr-visor__more { padding:4px 7px; min-height:30px; margin-left:4px; }
}
@media (max-width:760px) {
  .orr-cluster.orr-cluster--visor { --visor-dial-scale:.43; width:calc(100vw - 36px); }
  .orr-visor__readouts { grid-template-columns:calc(var(--visor-dial-size) + 10px) 1fr .9fr; }
  .orr-visor__portrait { display:none; }
}
@media (prefers-reduced-motion:reduce) {
  .orr-cluster--visor *, .orr-cluster--visor *::before, .orr-cluster--visor *::after { transition:none !important; animation:none !important; }
}
html.sf-reduce-motion .orr-cluster--visor *, html.sf-reduce-motion .orr-cluster--visor *::before,
html.sf-reduce-motion .orr-cluster--visor *::after { transition:none !important; animation:none !important; }
html.sf-reduce-flash .orr-cluster--visor .orr-cluster__key.is-detonate .orr-cluster__ring,
html.sf-reduce-flash .orr-cluster--visor .arsenal-fuse-lamp,
html.sf-reduce-flash .orr-cluster--visor .arsenal-fuse-rays { animation:none !important; opacity:1; }
@media (forced-colors:active) {
  .orr-visor__more, .orr-visor__caption { background:Canvas; color:CanvasText; border:1px solid CanvasText; }
  .orr-cluster--visor .orr-cluster__ring { border-color:Highlight; }
}
`;

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

// Mount positions around the left-facing top-down hull silhouette (viewBox 0 0 160 76).
const HARDPOINT_LAYOUTS = Object.freeze({
  1: [[30, 38]],
  2: [[56, 20], [56, 56]],
  3: [[28, 38], [62, 18], [62, 58]],
  4: [[38, 26], [38, 50], [74, 17], [74, 59]],
});

function el(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

export function createVisorReadouts(dial, shipId, variantId, name, rows) {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const root = el('div', 'orr-visor__readouts');
  const condition = el('div', 'orr-visor__vitals orr-visor__vitals--condition');
  const systems = el('div', 'orr-visor__vitals orr-visor__vitals--systems');
  const meters = new Map();
  for (const [key, label, value] of rows) {
    const reading = el('div', 'orr-visor__reading');
    reading.setAttribute('data-meter', key);
    const line = el('div', 'orr-visor__line');
    const meter = el('div', 'orr-visor__meter');
    meter.setAttribute('aria-hidden', 'true');
    line.append(label, value);
    reading.append(line, meter);
    (key === 'energy' || key === 'heat' ? systems : condition).appendChild(reading);
    meters.set(key, meter);
  }

  const portrait = el('figure', 'orr-visor__portrait');
  const stage = el('div', 'orr-visor__hull-stage');
  const drawing = el('img', 'orr-visor__plan');
  drawing.alt = '';
  drawing.addEventListener('load', () => { drawing.hidden = !drawing.naturalWidth; });
  drawing.addEventListener('error', () => {
    const fallback = hullPosterUrl(portrait.dataset.ship, 'holo');
    if (!fallback || drawing.dataset.view === 'holo') return;
    drawing.dataset.view = 'holo';
    drawing.src = fallback;
  });

  // Live ship-panel overlay: directional hull-hit arcs (bow=left, starboard=top, port=bottom,
  // stern=right), hardpoint firing/overheat pips, and taut Line tether vector.
  const shipHudSvg = svgEl('svg', { class: 'orr-visor__ship-hud', viewBox: '0 0 160 76', 'aria-hidden': 'true' });
  const hitArcs = {
    bow: svgEl('path', { class: 'orr-visor__hit-arc', 'data-side': 'bow', d: 'M 22 14 Q 6 38 22 62' }),
    starboard: svgEl('path', { class: 'orr-visor__hit-arc', 'data-side': 'starboard', d: 'M 38 8 Q 80 1 122 8' }),
    port: svgEl('path', { class: 'orr-visor__hit-arc', 'data-side': 'port', d: 'M 38 68 Q 80 75 122 68' }),
    stern: svgEl('path', { class: 'orr-visor__hit-arc', 'data-side': 'stern', d: 'M 138 14 Q 154 38 138 62' }),
  };
  for (const arc of Object.values(hitArcs)) shipHudSvg.appendChild(arc);

  const tetherVec = svgEl('line', { class: 'orr-visor__tether-vec', x1: 24, y1: 38, x2: 5, y2: 38 });
  const tetherDot = svgEl('circle', { class: 'orr-visor__tether-dot', cx: 5, cy: 38, r: 3.4 });
  shipHudSvg.append(tetherVec, tetherDot);

  const hpGroup = svgEl('g', { class: 'orr-visor__hardpoints' });
  const hpNodes = [];
  for (let i = 0; i < 4; i++) {
    const g = svgEl('g', { class: 'orr-visor__hp' });
    g.style.display = 'none';
    const ring = svgEl('circle', { class: 'orr-visor__hp-ring', cx: 0, cy: 0, r: 6.2 });
    const core = svgEl('circle', { class: 'orr-visor__hp-core', cx: 0, cy: 0, r: 3.1 });
    g.append(ring, core);
    hpGroup.appendChild(g);
    hpNodes.push({ g, ring, core, x: -1, y: -1, state: '', shown: false });
  }
  shipHudSvg.appendChild(hpGroup);
  stage.append(drawing, shipHudSvg);

  function setHull(id, variant) {
    const url = hullPosterUrl(id, 'hud', variant);
    portrait.dataset.ship = id;
    drawing.dataset.view = 'hud';
    drawing.hidden = true;
    if (url) drawing.src = url;
    else drawing.removeAttribute('src');
  }
  setHull(shipId, variantId);

  let baseShipName = name;
  let baseShipDetail = name;
  let lastCaptionShown = name;
  let lastTethered = false;
  const lastHitAlpha = { bow: -1, starboard: -1, port: -1, stern: -1 };

  const caption = el('figcaption', 'orr-visor__ship-name');
  const lineBadge = el('span', 'orr-visor__line-badge');
  lineBadge.setAttribute('aria-hidden', 'true');
  const captionText = el('span', 'orr-visor__ship-text');
  captionText.textContent = name;
  caption.append(lineBadge, captionText);
  portrait.append(stage, caption);
  root.append(dial, condition, systems, portrait);

  function updateShipPanel(status = {}) {
    const hits = status.hits || {};
    for (const side of ['bow', 'starboard', 'port', 'stern']) {
      const a = Math.max(0, Math.min(1, Number(hits[side]) || 0));
      const q = Math.round(a * 20) / 20;
      if (lastHitAlpha[side] !== q) {
        lastHitAlpha[side] = q;
        const arc = hitArcs[side];
        arc.style.opacity = q > 0 ? String(q) : '0';
        arc.classList?.toggle?.('is-lit', q > 0.15);
      }
    }

    const hps = Array.isArray(status.hardpoints) ? status.hardpoints.slice(0, 4) : [];
    const coords = HARDPOINT_LAYOUTS[hps.length] || [];
    for (let i = 0; i < hpNodes.length; i++) {
      const node = hpNodes[i];
      const hp = hps[i];
      if (!hp) {
        if (node.shown) { node.shown = false; node.g.style.display = 'none'; }
        continue;
      }
      if (!node.shown) { node.shown = true; node.g.style.display = ''; }
      const [cx, cy] = coords[i] || [30, 38];
      if (node.x !== cx || node.y !== cy) {
        node.x = cx; node.y = cy;
        node.core.setAttribute('cx', String(cx));
        node.core.setAttribute('cy', String(cy));
        node.ring.setAttribute('cx', String(cx));
        node.ring.setAttribute('cy', String(cy));
      }
      const st = hp.hot ? 'hot' : (hp.firing ? 'firing' : 'idle');
      if (node.state !== st) {
        node.state = st;
        node.g.setAttribute('data-state', st);
        node.core.setAttribute('r', st === 'idle' ? '2.8' : '3.7');
      }
    }

    const heldTag = typeof status.lineTag === 'string' ? status.lineTag.trim() : '';
    const tethered = heldTag.length > 0;
    if (lastTethered !== tethered) {
      lastTethered = tethered;
      if (tethered) portrait.setAttribute('data-tethered', '1');
      else portrait.removeAttribute('data-tethered');
    }
    const nextCaption = tethered ? heldTag : baseShipName;
    if (lastCaptionShown !== nextCaption) {
      lastCaptionShown = nextCaption;
      captionText.textContent = nextCaption;
      portrait.title = tethered ? `Line: ${heldTag}` : baseShipDetail;
    }
  }

  return {
    el: root,
    setMeter(key, fraction) {
      const meter = meters.get(key);
      if (!meter) return;
      meter.style.setProperty('--visor-meter', `${Math.round(fraction * 1000) / 10}%`);
      const parent = meter.parentElement || meter.parentNode;
      if (key === 'heat' && parent && parent.classList) parent.classList.toggle('is-hot', fraction > .75);
    },
    setName(nextName, detail) {
      baseShipName = nextName;
      baseShipDetail = detail || nextName;
      if (!lastTethered) {
        lastCaptionShown = nextName;
        captionText.textContent = nextName;
        portrait.title = baseShipDetail;
      }
    },
    setHull,
    updateShipPanel,
  };
}
