// src/ui/orrery/barReplyDial.js — the Bar's signature: your replies as a dial seated round her voice
// (design/frontend/ORRERY.md §3.2: a set of choices of nine or fewer sits on an arc rail; §6 Bar).
//
// The contact's voice arc (waveform.js createVoiceArc) stands on the speaking side of her portrait, its
// bars radiating outward. The dial is a second, concentric arc outside those bars: one tick per reply,
// the reply's words hanging off its tick (the screen places the buttons), and a bone cursor that swings
// round the shared centre on the swing spring to the reply in focus. Focusing a reply draws THAT
// reply's own voice (its phrasing, from its words, the same way hers is drawn from her line) on the
// inner side of her track, so the player tunes what to say against what she said before saying it.
// The amber Hand stays on the contact rail (one amber thing per screen); the dial's cursor is bone.
//
// Everything is geometry in the voice arc's own svg (its viewBox is the stage's css px). At rest nothing
// runs per frame: the cursor moves only while its spring settles, the voices cross-fade on opacity, and
// under reduced motion the cursor lands at once and the voices swap without a fade.

import { injectOrrery } from './tokens.js';
import { createSpring } from './motion.js';
import { svg, arcD, polar } from './svg.js';
import { voicePhrases } from './waveform.js';

const STYLE_ID = 'orr-bardial-style';
const BONE = '236 230 216';

const CSS = `
/* the dial has body: a luminous band (about 2.5:1 on the glass) under a 2px core, ticks cut through it */
.orr-voicearc .orr-bardial__band { fill:none; stroke:rgb(${BONE} / .3); stroke-width:9px; stroke-linecap:butt; }
.orr-voicearc .orr-bardial__core { fill:none; stroke:rgb(${BONE} / .62); stroke-width:2px; stroke-linecap:butt; }
.orr-voicearc .orr-bardial__minor { fill:none; stroke:rgb(${BONE} / .42); stroke-width:1.5px; stroke-linecap:butt; }
.orr-voicearc .orr-bardial__tick { fill:none; stroke:rgb(${BONE} / .6); stroke-width:2px; stroke-linecap:butt; transition:stroke .18s ease-out; }
.orr-voicearc .orr-bardial__tick.is-on { stroke:rgb(250 247 238); }
.orr-voicearc .orr-bardial__num { font-family:var(--dp-face-label, "Archivo"); font-size:10px; font-weight:600; letter-spacing:0; fill:rgb(${BONE} / .55); text-anchor:middle; dominant-baseline:central; }
.orr-voicearc .orr-bardial__num.is-on { fill:rgb(250 247 238); }
/* the cursor: a needle across the band and a notched chevron pointing at her voice, in warm white with a bloom */
.orr-voicearc .orr-bardial__needle-bloom { fill:none; stroke:rgb(250 247 238 / .22); stroke-width:8px; stroke-linecap:butt; }
.orr-voicearc .orr-bardial__needle { fill:none; stroke:rgb(252 249 242); stroke-width:2.5px; stroke-linecap:butt; }
.orr-voicearc .orr-bardial__chev { fill:rgb(252 249 242); }
.orr-voicearc .orr-bardial__chev-bloom { fill:none; stroke:rgb(250 247 238 / .2); stroke-width:5px; stroke-linejoin:round; }
/* your voice, on her track's inner side: dimmer than hers, one reply at a time */
.orr-voicearc .orr-bardial__voice { opacity:0; transition:opacity .22s ease-out; }
.orr-voicearc .orr-bardial__voice.is-on { opacity:1; }
.orr-voicearc .orr-bardial__voice-bars { fill:none; stroke:rgb(${BONE} / .5); stroke-width:2.2px; stroke-linecap:butt; }
.orr-voicearc .orr-bardial__voice-bloom { fill:none; stroke:rgb(${BONE} / .1); stroke-width:6px; stroke-linecap:butt; }
/* a wide invisible stroke along the dial: the pointer scrubs it, the wheel turns it */
.orr-voicearc .orr-bardial__hit { fill:none; stroke:transparent; stroke-width:64px; pointer-events:stroke; cursor:pointer; }
html.sf-reduce-motion .orr-voicearc .orr-bardial__voice, html.sf-reduce-motion .orr-voicearc .orr-bardial__tick { transition:none; }
`;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

const f = (n) => Math.round(n * 100) / 100;

/**
 * The tick angles for `count` replies on a dial of radius R: top reply first, clockwise order reversed so the list
 * reads down the dial. `mid` is the dial's centre angle (degrees, 0 at twelve, clockwise; 270 is the left).
 */
export function replyDialAngles(count, { mid = 247, step = 15.5, span = 46 } = {}) {
  const n = Math.max(1, count | 0);
  const d = n > 1 ? Math.min(step, span / (n - 1)) : 0;
  return Array.from({ length: n }, (_, i) => mid + (d * (n - 1)) / 2 - i * d);
}

/**
 * @param {{ layer:SVGSVGElement, cx:number, cy:number, r:number, from:number, to:number, n:number, scale:number, reach:number, setLean?:(dir:number)=>void }} voice
 *   the contact's voice arc (createVoiceArc's return)
 * @param {{ replies:string[], R?:number, angles?:number[], focus?:number, leans?:number[], onHover?:(i:number)=>void, onPick?:(i:number)=>void, onTurn?:(dir:number)=>void }} o
 *   leans: per reply, how she takes it (+1 warm, -1 cold, 0 neutral) — the standing tick leans with focus.
 *   onTurn: the wheel turned the dial (dir +1/-1); the screen moves focus and previews.
 * @returns {{ el:SVGGElement, R:number, angles:number[], ticks:Array<{x:number,y:number,ox:number,oy:number}>, index:number, focus(i:number, o?:{instant?:boolean}):void, indexAt(clientX:number, clientY:number):number, dispose():void } | null}
 *   ticks: each reply's tick on the dial (x,y) and its outer end (ox,oy), in the layer's px
 */
export function createReplyDial(voice, { replies = [], R = 0, angles = null, focus = 0, leans = null, onHover = null, onPick = null, onTurn = null } = {}) {
  if (!voice || !voice.layer || !replies.length) return null;
  const doc = voice.layer.ownerDocument;
  injectOrrery(doc);
  injectStyle(doc);
  const { cx, cy, r, from, to, n, scale } = voice;
  const rad = R > 0 ? R : voice.reach + 26 + 10 * scale;
  const leanOf = (i) => (Array.isArray(leans) ? (leans[i] > 0 ? 1 : leans[i] < 0 ? -1 : 0) : 0);
  const at = Array.isArray(angles) && angles.length === replies.length ? angles.slice() : replyDialAngles(replies.length);
  const lo = Math.min(...at); const hi = Math.max(...at);
  const pad = 5.5;
  const g = svg('g', { class: 'orr-bardial' });

  // the dial's body: one band and one core, the length of the replies plus a margin (one path each: no seams)
  g.appendChild(svg('path', { d: arcD(cx, cy, rad, lo - pad, hi + pad), class: 'orr-bardial__band' }));
  g.appendChild(svg('path', { d: arcD(cx, cy, rad, lo - pad, hi + pad), class: 'orr-bardial__core' }));
  // minor ticks every 2.5 degrees on the band's inner half: a scale, not a wire
  let dMinor = '';
  for (let a = lo - pad + 1.25; a <= hi + pad - 1.2; a += 2.5) {
    const [x0, y0] = polar(cx, cy, rad - 4.5, a); const [x1, y1] = polar(cx, cy, rad - 1, a);
    dMinor += `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)} `;
  }
  g.appendChild(svg('path', { d: dMinor, class: 'orr-bardial__minor' }));
  // one major tick per reply, cut through the band and out toward its words
  const ticks = [];
  const tickEls = at.map((a) => {
    const [x0, y0] = polar(cx, cy, rad - 4.5, a); const [x1, y1] = polar(cx, cy, rad + 11, a);
    const [x, y] = polar(cx, cy, rad, a);
    ticks.push({ x, y, ox: x1, oy: y1 });
    const t = svg('path', { d: `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`, class: 'orr-bardial__tick' });
    g.appendChild(t);
    return t;
  });
  // the reply's numeral rides past its tick, so the dial reads as the replies, not an ornament
  const numEls = at.map((a, i) => {
    const [nx, ny] = polar(cx, cy, rad + 22, a);
    const t = svg('text', { x: f(nx), y: f(ny), class: 'orr-bardial__num' });
    t.textContent = String(i + 1);
    g.appendChild(t);
    return t;
  });

  // each reply's own voice, drawn inward from her track (her bars point out, yours point in: one line, two voices)
  const voices = replies.map((text) => {
    const lens = voicePhrases(text, n);
    let d = '';
    const span = to - from;
    for (let i = 0; i < n; i += 1) {
      const len = lens[i];
      if (!len) continue;
      const a = from + (span * (i + 0.5)) / n;
      const L = len <= 4 ? Math.max(3, Math.round(4 * scale)) : len * scale * 0.9;
      const [x0, y0] = polar(cx, cy, r - 5.5, a); const [x1, y1] = polar(cx, cy, r - 5.5 - L, a);
      d += `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)} `;
    }
    const vg = svg('g', { class: 'orr-bardial__voice' });
    vg.appendChild(svg('path', { d, class: 'orr-bardial__voice-bloom' }));
    vg.appendChild(svg('path', { d, class: 'orr-bardial__voice-bars' }));
    g.appendChild(vg);
    return vg;
  });

  // the cursor, drawn at twelve o'clock and swung round the shared centre
  const cur = svg('g', { class: 'orr-bardial__cursor' });
  const nd = `M ${f(cx)} ${f(cy - rad - 12)} L ${f(cx)} ${f(cy - rad + 8)}`;
  cur.appendChild(svg('path', { d: nd, class: 'orr-bardial__needle-bloom' }));
  cur.appendChild(svg('path', { d: nd, class: 'orr-bardial__needle' }));
  // the notched chevron (the Hand's own glyph), inside the dial, pointing at her voice
  const ty = cy - rad + 10;
  const chev = `M ${f(cx - 5.5)} ${f(ty)} L ${f(cx)} ${f(ty + 11)} L ${f(cx + 5.5)} ${f(ty)} L ${f(cx)} ${f(ty + 3)} Z`;
  cur.appendChild(svg('path', { d: chev, class: 'orr-bardial__chev-bloom' }));
  cur.appendChild(svg('path', { d: chev, class: 'orr-bardial__chev' }));
  g.appendChild(cur);

  const hit = svg('path', { d: arcD(cx, cy, rad + 6, lo - pad - 4, hi + pad + 4), class: 'orr-bardial__hit' });
  g.appendChild(hit);
  voice.layer.appendChild(g);

  const place = (a) => cur.setAttribute('transform', `rotate(${f(a)} ${f(cx)} ${f(cy)})`);
  let index = Math.max(0, Math.min(at.length - 1, focus | 0));
  const spring = createSpring({ value: at[index], preset: 'swing', onUpdate: place });
  place(at[index]);
  const paint = () => {
    voices.forEach((vg, i) => vg.classList.toggle('is-on', i === index));
    tickEls.forEach((t, i) => t.classList.toggle('is-on', i === index));
    numEls.forEach((t, i) => t.classList.toggle('is-on', i === index));
    if (typeof voice.setLean === 'function') voice.setLean(leanOf(index));
  };
  paint();

  /** The reply nearest the pointer's angle round the dial's centre. */
  function indexAt(clientX, clientY) {
    let px = clientX; let py = clientY;
    try {
      const m = voice.layer.getScreenCTM();
      if (m) { const p = voice.layer.createSVGPoint(); p.x = clientX; p.y = clientY; const q = p.matrixTransform(m.inverse()); px = q.x; py = q.y; }
    } catch (_) { /* the client point stands in */ }
    const a = ((Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90 + 360) % 360;
    let best = 0; let bd = Infinity;
    at.forEach((t, i) => { const d = Math.abs(t - a); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  const onMove = (ev) => { if (typeof onHover === 'function') onHover(indexAt(ev.clientX, ev.clientY)); };
  const onClick = (ev) => { if (typeof onPick === 'function') { ev.preventDefault(); onPick(indexAt(ev.clientX, ev.clientY)); } };
  // the wheel turns the dial where it is parked (one detent per pause, so a flick does not spin past)
  let lastTurn = 0;
  const onWheel = (ev) => {
    if (typeof onTurn !== 'function') return;
    ev.preventDefault();
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now - lastTurn < 140) return;
    lastTurn = now;
    const d = (ev.deltaY || 0) + (ev.deltaX || 0);
    onTurn(d >= 0 ? 1 : -1);
  };
  hit.addEventListener('pointermove', onMove);
  hit.addEventListener('click', onClick);
  hit.addEventListener('wheel', onWheel, { passive: false });

  return {
    el: g,
    R: rad,
    angles: at,
    ticks,
    get index() { return index; },
    focus(i, { instant = false } = {}) {
      const next = Math.max(0, Math.min(at.length - 1, i | 0));
      if (next === index && !instant) return;
      index = next;
      paint();
      spring.set(at[index], { instant });
    },
    indexAt,
    dispose() {
      spring.stop();
      hit.removeEventListener('pointermove', onMove);
      hit.removeEventListener('click', onClick);
      hit.removeEventListener('wheel', onWheel);
      if (typeof voice.setLean === 'function') voice.setLean(0);
      if (g.parentNode) g.parentNode.removeChild(g);
    },
  };
}
