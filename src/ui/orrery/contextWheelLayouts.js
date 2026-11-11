// ORRERY composition for the context wheel (src/ui/contextWheel.js — G18-02 "one set of keys",
// design/frontend/ORRERY.md §6 Radials). One sheet, injected with the component; the shared
// flight-radials layer adds the owns-frame stand-down and the dial family's arrival/press verbs.
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-context-wheel';
const W = 'html body .sf-cwheel';

const CSS = `
/* ── the wheel: one machined dial — smoked-glass arc keys in a ring, a lamp per key set into
   the bezel, a glass hub that names the aimed slice. Same vocabulary as the wingman dial so
   the two hold-to-pick surfaces read as one instrument family. */
${W} { position:fixed; left:50%; top:62%; width:400px; height:400px; transform:translate(-50%,-50%);
  z-index:1800; pointer-events:none; opacity:0; transition:opacity .14s ease; --wr-type:12px; }
${W}::before { content:""; position:absolute; inset:-60px; border-radius:50%; pointer-events:none;
  background:radial-gradient(circle, rgb(5 7 10 / .55) 0%, rgb(5 7 10 / .35) 50%, transparent 70%);
  -webkit-mask-image:radial-gradient(circle, #000 60%, transparent 100%);
  mask-image:radial-gradient(circle, #000 60%, transparent 100%); }
${W}[hidden] { display:none; }
${W}.sf-cwheel--in { opacity:1; }
${W} .sf-cwheel__dial { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
${W} .sf-cwheel__bed { fill:rgb(8 10 14 / .6); stroke:none; }
${W} .sf-cwheel__bezel-edge { fill:none; stroke:rgb(232 226 212 / .22); stroke-width:1.5; }
${W} .sf-cwheel__wedgehost { position:absolute; inset:0; }

/* the keys: each button fills the dial box and is clipped to its own arc */
${W} .sf-cwheel__wedge { position:absolute; inset:0; width:400px; height:400px; margin:0; padding:0; border:0;
  background:none; color:var(--dp-ink-dim, #b7b4a6); cursor:pointer; pointer-events:auto;
  font-family:var(--dp-face-etch, sans-serif); transform-origin:200px 200px;
  transform:scale(.92); opacity:0;
  transition:transform .2s cubic-bezier(.2,.9,.3,1.2) var(--wr-delay, 0ms), opacity .14s ease var(--wr-delay, 0ms), color .12s; }
${W}.sf-cwheel--in .sf-cwheel__wedge { transform:none; opacity:1; }
${W} .sf-cwheel__seg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
${W} .sf-cwheel__seg path { fill:rgb(12 15 20 / .55); stroke:rgb(232 226 212 / .35); stroke-width:1px; transition:stroke .12s, fill .12s; }
${W} .sf-cwheel__wedge::after { content:""; position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(168deg, rgb(255 250 240 / .09) 0%, rgb(255 250 240 / .035) 36%, rgb(255 250 240 / 0) 37.5%); }
${W} .sf-cwheel__face { position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column;
  align-items:center; gap:3px; pointer-events:none; text-align:center; width:86px; }
${W} .sf-cwheel__glyph { color:rgb(232 230 216 / .9); opacity:.85; display:inline-flex; }
${W} .sf-cwheel__label { font-size:var(--wr-type); letter-spacing:.1em; text-transform:uppercase; line-height:1.15; }

/* the aimed slice lights: amber legend, lit inner edge — the Hand on the chosen key */
${W} .sf-cwheel__wedge.is-aimed { color:var(--dp-amber, #e8c98a); }
${W} .sf-cwheel__wedge.is-aimed .sf-cwheel__seg path { stroke:var(--dp-amber, #e8c98a); stroke-width:2.2px;
  fill:rgb(28 24 16 / .6); }
${W} .sf-cwheel__wedge.is-aimed .sf-cwheel__glyph { opacity:1; }

/* a bezel lamp per key: lit while its latch slice is engaged */
${W} .sf-cwheel__lamp { position:absolute; width:9px; height:9px; transform:translate(-50%,-50%);
  border-radius:50%; background:rgb(232 226 212 / .18); box-shadow:0 0 0 1.4px rgb(5 7 10); pointer-events:none; }
${W} .sf-cwheel__lamp.is-on { background:var(--dp-amber, #e8c98a);
  box-shadow:0 0 0 1.4px rgb(5 7 10), 0 0 9px 2px rgb(232 201 138 / .55); }

/* the hub names the aimed slice — one reading centre */
${W} .sf-cwheel__hub { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:132px; height:132px; border-radius:50%; display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:6px; pointer-events:none; text-align:center;
  background:radial-gradient(circle, rgb(7 9 13 / .96), rgb(7 9 13 / .9) 70%, rgb(7 9 13 / .6) 100%);
  box-shadow:inset 0 0 0 1.4px rgb(232 226 212 / .3); }
${W} .sf-cwheel__hub-title { font-size:14px; letter-spacing:.12em; color:rgb(232 230 216 / .95); max-width:110px; }
${W} .sf-cwheel__hub-sub { font-size:12px; letter-spacing:.08em; color:rgb(232 230 216 / .55); max-width:110px; }

/* condensed tier: hold the 12px floor on composited pixels (same compensation the dial uses) */
@media (max-width:1400px) and (min-width:761px) and (min-height:561px) {
  ${W} { --wr-type:15px; transform:translate(-50%,-50%) scale(.86); }
}
@media (max-width:760px), (max-height:560px) {
  ${W} { --wr-type:16.7px; transform:translate(-50%,-50%) scale(.72); }
}
@media (prefers-reduced-motion: reduce) { ${W} .sf-cwheel__wedge { transition:none; } }
html.sf-reduce-motion ${W} .sf-cwheel__wedge { transition:none; }
`;

export function injectContextWheelLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
