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
  width:min(44.68vw, 747px); height:auto; transform:none; isolation:isolate;
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
  position:relative; display:grid; grid-template-columns:26.85% 23.15% 21.6% 28.4%;
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
.orr-visor__plan { display:block; width:100%; height:100%; min-height:0; object-fit:contain; padding:3px 1px; box-sizing:border-box;
  filter:drop-shadow(0 1px 1px rgb(3 12 19 / .8)); }
.orr-visor__plan[hidden] { visibility:hidden; }
.orr-visor__plan[data-view="holo"] { transform:rotate(-90deg); }
.orr-visor__portrait::before { content:""; position:absolute; inset:1px clamp(11px,2.1vw,35px) 28px clamp(8px,1.1vw,18px); pointer-events:none; opacity:.78;
  --corner:linear-gradient(#b8d5e3,#b8d5e3);
  background:var(--corner) left top / 11px 1px no-repeat, var(--corner) left top / 1px 10px no-repeat,
    var(--corner) right top / 11px 1px no-repeat, var(--corner) right top / 1px 10px no-repeat,
    var(--corner) left bottom / 11px 1px no-repeat, var(--corner) left bottom / 1px 10px no-repeat,
    var(--corner) right bottom / 11px 1px no-repeat, var(--corner) right bottom / 1px 10px no-repeat;
}
.orr-visor__portrait figcaption { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  font-size:clamp(12px,1.08vw,18px); line-height:1.2; font-weight:520; }
.orr-cluster--visor .orr-cluster__keys { display:flex; flex-wrap:wrap; margin:0 0 0 14px; padding:0 0 14px;
  border-bottom:1px solid rgb(216 236 240 / .7); }
.orr-cluster.orr-cluster--visor .orr-cluster__key {
  position:relative; width:auto; height:74px; flex:1 1 0; min-width:45px; margin:0;
  box-sizing:border-box; border-radius:0; cursor:pointer; will-change:auto; isolation:isolate;
  transition:background 120ms ease, opacity 120ms ease;
}
.orr-cluster--visor .orr-cluster__key + .orr-cluster__key::before {
  content:""; position:absolute; inset:3px auto 10px 0; width:1px; background:linear-gradient(transparent, rgb(216 236 240 / .5) 27%,rgb(216 236 240 / .5) 88%,transparent);
}
.orr-cluster--visor .orr-cluster__key::after {
  content:""; position:absolute; left:22%; right:22%; bottom:-7px; height:2px;
  background:currentColor; opacity:0; transform:scaleX(.45); transition:opacity 140ms ease, transform 180ms ease;
}
.orr-cluster--visor .orr-cluster__key > svg { top:0; left:calc(50% - 20px); width:40px; height:40px; }
.orr-cluster--visor .orr-cluster__key > svg > circle { visibility:hidden; }
.orr-cluster--visor .orr-cluster__key.is-firing > svg .orr-pulse-ring { visibility:visible; }
.orr-cluster--visor .orr-cluster__key .orr-cluster__icon {
  top:0; left:50%; width:52px; height:44px; margin:0 0 0 -26px; opacity:1;
}
.orr-cluster--visor .orr-cluster__icon.has-arsenal svg { stroke-width:1.62; }
.orr-cluster--visor .orr-cluster__key .orr-cluster__keytag {
  display:flex; justify-content:center; align-items:center; gap:10px; position:absolute;
  inset:auto 2px 0; max-width:none; transform:none; font:500 clamp(12px,1.02vw,17px)/1.2 var(--visor-font);
  text-transform:none; letter-spacing:0; text-shadow:0 1px 2px #060c13;
}
.orr-cluster--visor .orr-cluster__keytag::before { content:none; }
.orr-cluster.orr-cluster--visor .orr-cluster__key .orr-cluster__keyword { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; }
.orr-cluster.orr-cluster--visor .orr-cluster__key .orr-cluster__keyshort { display:none; }
.orr-cluster.orr-cluster--visor .orr-cluster__key .orr-cluster__keytag b {
  order:-1; margin:0; min-width:26px; padding:0 4px; border:1px solid rgb(230 239 240 / .86); border-radius:4px;
  background:rgb(8 18 26 / .42);
  font:670 max(12px, calc(var(--visor-type) - 1px))/1.26 var(--visor-font); letter-spacing:0; flex:none; text-align:center;
}
.orr-cluster--visor .orr-cluster__keytag b:empty { display:none; }
.orr-cluster--visor .orr-cluster__count { top:1px; left:calc(50% + 18px); transform:none; line-height:1; }
.orr-cluster--visor .orr-cluster__key:is(.is-locked,.is-empty,.is-cooldown) .orr-cluster__icon { opacity:.48; }
.orr-cluster.orr-cluster--visor .orr-cluster__key:is(:hover,:focus-visible) { background:linear-gradient(0deg, rgb(118 191 214 / .18), transparent); }
.orr-cluster.orr-cluster--visor .orr-cluster__key:focus-visible { outline:1px solid #a6dce8; outline-offset:1px; }
.orr-cluster--visor .orr-cluster__key:is(.is-active,.is-held,.is-armed,.is-firing) { color:var(--dp-hand-hot, #ffd98c); animation:none; }
.orr-cluster.orr-cluster--visor .orr-cluster__key:is(.is-active,.is-held,.is-armed,.is-firing) .orr-cluster__icon { color:currentColor; opacity:1; }
.orr-cluster--visor .orr-cluster__key:is(:hover,:focus-visible,.is-held,.is-firing)::after { opacity:1; transform:scaleX(1); }
.orr-cluster--visor .orr-cluster__key:is(.is-active,.is-armed) :is(.orr-cluster__icon,.orr-cluster__keytag b) {
  filter:drop-shadow(0 0 5px rgb(255 197 93 / .30));
}
.orr-cluster.orr-cluster--visor .orr-cluster__key:is(.is-active,.is-armed) .orr-cluster__keytag b {
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
@media (max-width:1200px) {
  .orr-cluster.orr-cluster--visor { --visor-dial-scale:.49; --visor-readout-height:102px; width:49.5vw; }
  .orr-visor__vitals { min-height:82px; margin-top:6px; gap:5px; }
  .orr-visor__vitals--systems { gap:12px; }
  .orr-visor__portrait { height:82px; margin-top:6px; grid-template-rows:56px auto; }
  .orr-cluster--visor .orr-cluster__keys { margin-left:3px; padding-bottom:8px; }
  .orr-cluster.orr-cluster--visor .orr-cluster__key { height:54px; }
  .orr-cluster--visor .orr-cluster__key .orr-cluster__icon { width:32px; height:32px; margin-left:-16px; }
  .orr-cluster--visor .orr-cluster__key .orr-cluster__keytag { gap:4px; }
  .orr-cluster.orr-cluster--visor .orr-cluster__key .orr-cluster__keytag b { min-width:15px; padding-inline:2px; }
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
`;

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
  const drawing = el('img', 'orr-visor__plan');
  drawing.alt = '';
  drawing.addEventListener('load', () => { drawing.hidden = !drawing.naturalWidth; });
  drawing.addEventListener('error', () => {
    const fallback = hullPosterUrl(portrait.dataset.ship, 'holo');
    if (!fallback || drawing.dataset.view === 'holo') return;
    drawing.dataset.view = 'holo';
    drawing.src = fallback;
  });
  function setHull(id, variant) {
    const url = hullPosterUrl(id, 'hud', variant);
    portrait.dataset.ship = id;
    drawing.dataset.view = 'hud';
    drawing.hidden = true;
    if (url) drawing.src = url;
    else drawing.removeAttribute('src');
  }
  setHull(shipId, variantId);
  const caption = el('figcaption', 'orr-visor__ship-name');
  caption.textContent = name;
  portrait.append(drawing, caption);
  root.append(dial, condition, systems, portrait);
  return {
    el: root,
    setMeter(key, fraction) {
      const meter = meters.get(key);
      meter.style.setProperty('--visor-meter', `${Math.round(fraction * 1000) / 10}%`);
      if (key === 'heat') meter.parentElement.classList.toggle('is-hot', fraction > .75);
    },
    setName(name, detail) {
      caption.textContent = name;
      portrait.title = detail;
    },
    setHull,
  };
}
