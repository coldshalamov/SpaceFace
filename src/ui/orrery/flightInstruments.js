// ORRERY flight instruments beyond the Cluster (design/frontend/ORRERY.md §6 Flight):
//   Radar Orrery — range rings, a turning tick orbit, an ice sweep (data in motion), contacts as
//     marks by kind, the Hand on the objective's bearing.
//   Objective Tape — a compass scale across the top; the objective's chevron rides it carrying its
//     own distance.
//   Lock Ring — world-space rings round the target: turning arcs, corner ticks, the target's hull as
//     an arc, a 45-degree leader to its name and range.
//   Threat Channel — red arcs round your hull toward hostiles; red chevrons on the screen edge for
//     the ones off-screen.
//   Signal Toasts — notifications on a right rail, each with a decay ring.
import { svg, arcD, ticksD, polar, circularText } from './svg.js';
import { orbitRing, ring, hand, arcGauge } from './instruments.js';
import { createCounter, decrypt } from './text.js';
import { hullPosterUrl } from '../hullPosters.js';

const STYLE_ID = 'sf-orrery-flight-style';
const CSS = `
.orr-radar { position:relative; width:280px; height:300px; pointer-events:none; }
.orr-radar svg { position:absolute; left:0; top:0; width:280px; height:280px; }
/* the sweep is data in motion, so it is ice: a conic trail that fades behind its leading edge */
.orr-radar__scope { position:absolute; left:14px; top:14px; width:252px; height:252px; border-radius:50%; overflow:hidden; background:rgb(5 7 10 / .42); }
.orr-radar__sweep { position:absolute; inset:0; border-radius:50%;
  background:conic-gradient(from 0deg, transparent 0deg 292deg, rgb(143 203 255 / .02) 292deg, rgb(143 203 255 / .16) 356deg, rgb(143 203 255 / .42) 359.5deg, transparent 360deg);
  animation:orr-drift 4.2s linear infinite; }
html.sf-reduce-motion .orr-radar__sweep { animation:none; }
.orr-radar__foot { position:absolute; left:0; right:0; bottom:0; display:flex; justify-content:center; gap:8px; align-items:baseline; }
.orr-radar__foot b { font-family:var(--dp-face-numeral); font-weight:520; font-size:13px; color:var(--dp-phos, #dfeeff); letter-spacing:.02em; }
.orr-tape { position:relative; width:640px; pointer-events:none; text-align:center; }
.orr-tape__title { font-family:var(--dp-face-read, "Instrument Sans"); font-size:16px; color:var(--dp-ink, #e8e2d4); letter-spacing:.005em; margin-bottom:10px; text-shadow:0 1px 10px rgb(0 0 0 / .8); }
.orr-tape__title .orr-label { margin-right:10px; color:var(--dp-ink-dim, #b7b4a6); }
.orr-tape svg { width:640px; height:58px; display:block; }
.orr-tape__marker { position:absolute; top:0; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; }
.orr-tape__dist { font-family:var(--dp-face-numeral); font-weight:520; font-size:15px; color:var(--dp-hand-hot, #ffd98c); font-variant-numeric:tabular-nums; white-space:nowrap; }
.orr-tape__dist small { font-family:var(--dp-face-label); font-weight:600; font-size:11px; letter-spacing:.12em; color:var(--dp-ink, #e8e2d4); margin-left:6px; text-shadow:0 0 8px rgb(0 0 0 / .9), 0 1px 2px rgb(0 0 0 / .9); }
.orr-lock { position:absolute; width:0; height:0; pointer-events:none; }
.orr-lock svg { position:absolute; left:-120px; top:-120px; width:240px; height:240px; overflow:visible; }
.orr-lock__ring { transform-box:view-box; transform-origin:120px 120px; animation:orr-drift 22s linear infinite; }
.orr-lock__label { position:absolute; left:64px; top:-78px; display:flex; flex-direction:column; gap:4px; white-space:nowrap; }
.orr-lock__name { font-family:var(--dp-face-label); font-stretch:112%; font-weight:700; font-size:12px; letter-spacing:.12em; text-transform:uppercase; color:var(--dp-phos, #dfeeff); }
.orr-lock__meta { display:flex; gap:10px; align-items:baseline; }
.orr-lock__meta b { font-family:var(--dp-face-numeral); font-weight:520; font-size:15px; color:var(--dp-ink, #e8e2d4); font-variant-numeric:tabular-nums; }
.orr-threat { position:absolute; width:0; height:0; pointer-events:none; }
.orr-threat svg { position:absolute; left:-110px; top:-110px; width:220px; height:220px; overflow:visible; }
.orr-threat__arc { animation:orr-threat-pulse 1.1s ease-in-out infinite; }
@keyframes orr-threat-pulse { 50% { opacity:.55; } }
.orr-edge { position:absolute; width:0; height:0; pointer-events:none; }
.orr-edge svg { position:absolute; left:-18px; top:-18px; width:36px; height:36px; overflow:visible; }
.orr-edge__label { position:absolute; top:22px; left:50%; transform:translateX(-50%); white-space:nowrap; font-size:10px; color:var(--dp-danger, #ff5038); }
.orr-toasts { display:flex; flex-direction:column; gap:10px; width:340px; pointer-events:none; }
.orr-toast { position:relative; display:grid; grid-template-columns:18px 1fr; column-gap:12px; row-gap:4px; align-items:start;
  padding:8px 4px 8px 0; background:none; text-shadow:0 0 14px rgb(0 0 0 / .95), 0 0 4px rgb(0 0 0 / .9), 0 1px 2px rgb(0 0 0 / .9); }
.orr-toast svg { grid-row:1 / span 2; width:18px; height:18px; margin-top:1px; }
.orr-toast .orr-label { color:var(--dp-ink-dim, #b7b4a6); }
.orr-toast__text { font-family:var(--dp-face-read, "Instrument Sans"); font-size:14px; line-height:1.35; color:var(--dp-ink, #e8e2d4); }
.orr-toast__text b { font-family:var(--dp-face-numeral); font-weight:600; color:var(--dp-phos, #dfeeff); }
.orr-toast.is-gain .orr-label { color:var(--dp-ink, #e8e2d4); }
.orr-toast__decay { animation:orr-decay var(--orr-life, 6s) linear forwards; }
@keyframes orr-decay { from { stroke-dashoffset:0; } to { stroke-dashoffset:1; } }
.orr-toast.is-arriving { animation:orr-toast-in 520ms var(--dp-ease-out) both; animation-delay:var(--orr-delay, 0ms); }
@keyframes orr-toast-in { from { opacity:0; transform:translateX(24px); filter:blur(4px); } to { opacity:1; transform:none; filter:none; } }
.orr-place { display:flex; flex-direction:column; gap:6px; pointer-events:none; }
.orr-place__name { font-size:20px; letter-spacing:.04em; }
.orr-place__purse { display:flex; align-items:baseline; gap:8px; margin-top:6px; }
.orr-place__purse .orr-counter, .orr-place__purse b { font-family:var(--dp-face-numeral); font-weight:360; font-size:24px; color:var(--dp-phos, #dfeeff); letter-spacing:-.01em; }
html.sf-reduce-motion .orr-radar__sweep, html.sf-reduce-motion .orr-lock__ring, html.sf-reduce-motion .orr-threat__arc, html.sf-reduce-motion .orr-toast__decay, html.sf-reduce-motion .orr-toast { animation:none !important; }
`;

function injectStyle(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

const el = (tag, cls, text) => {
  const node = globalThis.document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

// ------------------------------------------------------------------------------------ Radar Orrery
export function createRadarOrrery({ shipId = 'ship_kestrel', rangeLabel = '4.0k wu' } = {}) {
  injectStyle();
  const root = el('div', 'orr-radar');
  const c = 140;
  const s = svg('svg', { class: 'orr-svg', viewBox: '0 0 280 280', 'aria-hidden': 'true' });
  const scope = el('div', 'orr-radar__scope');
  scope.appendChild(el('span', 'orr-radar__sweep'));
  root.appendChild(scope);
  for (const r of [42, 84]) s.appendChild(ring({ cx: c, cy: c, r, tone: 'faint', width: 1, dash: '2 5' }));
  s.appendChild(ring({ cx: c, cy: c, r: 126, tone: 'rest', width: 1, bloom: 4 }));
  s.appendChild(svg('path', { d: `M ${c} ${c - 126} L ${c} ${c + 126} M ${c - 126} ${c} L ${c + 126} ${c}`, class: 'orr-core orr-faint', 'stroke-width': 1, 'stroke-dasharray': '1 6' }));
  const orbit = orbitRing({ cx: c, cy: c, r: 136, count: 72, major: 6, len: 3, majorLen: 7, tone: 'rest', drift: -2400, inward: false });
  s.appendChild(orbit.el);
  s.appendChild(circularText(c, c, 131, 'SENSOR ORRERY · PASSIVE · 72 CELL', { startDeg: 214, size: 6.5, className: 'orr-micro' }));
  // north
  s.appendChild(svg('path', { d: `M ${c - 5} ${c - 145} L ${c} ${c - 153} L ${c + 5} ${c - 145}`, class: 'orr-core orr-hi', 'stroke-width': 1.2, fill: 'none' }));
  const north = svg('text', { x: c, y: c - 158, 'text-anchor': 'middle', 'font-size': 10 });
  north.textContent = 'N';
  s.appendChild(north);
  const contactsG = svg('g');
  s.appendChild(contactsG);
  const objectiveHand = hand({ cx: c, cy: c, r0: 96, r1: 132, width: 1.5, pip: 4 });
  s.appendChild(objectiveHand.el);
  const holo = hullPosterUrl(shipId, 'holo');
  if (holo) s.appendChild(svg('image', { href: holo, x: c - 13, y: c - 13, width: 26, height: 26 }));
  root.appendChild(s);
  const foot = el('div', 'orr-radar__foot');
  const range = el('b', null, rangeLabel.toUpperCase());
  foot.append(el('span', 'orr-label', 'Range'), range);
  root.appendChild(foot);

  function setContacts(list = []) {
    contactsG.textContent = '';
    for (const k of list) {
      const x = c + (Number(k.x) || 0) * 120;
      const y = c + (Number(k.y) || 0) * 120;
      if (k.kind === 'hostile') {
        contactsG.appendChild(svg('path', { d: `M ${x} ${y - 5} L ${x + 4.5} ${y + 4} L ${x - 4.5} ${y + 4} Z`, fill: 'var(--dp-danger, #ff5038)', transform: `rotate(${k.heading || 0} ${x} ${y})` }));
      } else if (k.kind === 'objective') {
        contactsG.appendChild(svg('path', { d: `M ${x} ${y - 6} L ${x + 6} ${y} L ${x} ${y + 6} L ${x - 6} ${y} Z`, class: 'orr-bloom orr-hand', 'stroke-width': 6, fill: 'none' }));
        contactsG.appendChild(svg('path', { d: `M ${x} ${y - 5} L ${x + 5} ${y} L ${x} ${y + 5} L ${x - 5} ${y} Z`, fill: 'var(--dp-hand, #f2b950)' }));
      } else if (k.kind === 'station') {
        contactsG.appendChild(svg('circle', { cx: x, cy: y, r: 5, class: 'orr-core orr-hi', 'stroke-width': 1.2, fill: 'none' }));
        contactsG.appendChild(svg('circle', { cx: x, cy: y, r: 1.6, fill: 'var(--dp-ink, #e8e2d4)' }));
      } else {
        contactsG.appendChild(svg('path', { d: `M ${x} ${y - 3.5} L ${x + 3.5} ${y} L ${x} ${y + 3.5} L ${x - 3.5} ${y} Z`, fill: 'var(--dp-ink-dim, #b7b4a6)' }));
      }
    }
  }
  return {
    el: root,
    setContacts,
    setObjectiveBearing(deg) { objectiveHand.pointTo(deg); },
    setRange(label) { range.textContent = String(label).toUpperCase(); },
    dispose() { objectiveHand.dispose(); },
  };
}

// ---------------------------------------------------------------------------------- Objective Tape
const CARDINAL = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
export function createObjectiveTape({ width = 640, field = 150 } = {}) {
  injectStyle();
  const root = el('div', 'orr-tape');
  root.style.width = `${width}px`;
  const title = el('div', 'orr-tape__title');
  const kind = el('span', 'orr-label');
  const text = el('span');
  title.append(kind, text);
  const s = svg('svg', { class: 'orr-svg', viewBox: `0 0 ${width} 58`, 'aria-hidden': 'true' });
  const ticks = svg('g');
  const labels = svg('g');
  s.append(svg('path', { d: `M 0 20 L ${width} 20`, class: 'orr-core orr-faint', 'stroke-width': 1 }), ticks, labels);
  // the heading index, dead centre
  s.appendChild(svg('path', { d: `M ${width / 2 - 6} 32 L ${width / 2} 24 L ${width / 2 + 6} 32`, class: 'orr-core orr-hi', 'stroke-width': 1.3, fill: 'none' }));
  // edge fades so the tape dissolves instead of ending
  const defs = svg('defs');
  const mask = svg('linearGradient', { id: 'orr-tape-fade', x1: '0', x2: '1', y1: '0', y2: '0' });
  mask.append(svg('stop', { offset: '0', 'stop-color': 'white', 'stop-opacity': '0' }), svg('stop', { offset: '.16', 'stop-color': 'white', 'stop-opacity': '1' }), svg('stop', { offset: '.84', 'stop-color': 'white', 'stop-opacity': '1' }), svg('stop', { offset: '1', 'stop-color': 'white', 'stop-opacity': '0' }));
  const m = svg('mask', { id: 'orr-tape-mask' });
  m.appendChild(svg('rect', { x: 0, y: 0, width, height: 58, fill: 'url(#orr-tape-fade)' }));
  defs.append(mask, m);
  s.appendChild(defs);
  ticks.setAttribute('mask', 'url(#orr-tape-mask)');
  labels.setAttribute('mask', 'url(#orr-tape-mask)');
  const marker = el('div', 'orr-tape__marker');
  // the pin: an amber diamond sitting ON the tape's baseline, a hairline stem through the ticks
  const mSvg = svg('svg', { class: 'orr-svg', viewBox: '-12 0 24 44', width: 24, height: 44, 'aria-hidden': 'true', style: 'margin-top:26px;' });
  mSvg.append(
    svg('path', { d: 'M 0 6 L 0 34', class: 'orr-core orr-hand', 'stroke-width': 1.2 }),
    svg('path', { d: 'M 0 12 L 7 20 L 0 28 L -7 20 Z', class: 'orr-bloom orr-hand', 'stroke-width': 8, fill: 'none' }),
    svg('path', { d: 'M 0 13 L 6.5 20 L 0 27 L -6.5 20 Z', fill: 'var(--dp-hand, #f2b950)' }),
  );
  const dist = el('div', 'orr-tape__dist');
  const distNum = el('span');
  const eta = el('small');
  dist.append(distNum, eta);
  marker.append(mSvg, dist);
  const tapeWrap = el('div', 'orr-tape__scale');
  tapeWrap.style.position = 'relative';
  tapeWrap.append(s, marker);
  root.append(title, tapeWrap);
  const distCounter = createCounter(distNum, { format: (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k wu` : `${Math.round(n)} wu`).toUpperCase() });

  let heading = 0;
  function drawTicks() {
    ticks.textContent = '';
    labels.textContent = '';
    const parts = [];
    const pxPerDeg = width / field;
    const start = Math.floor((heading - field / 2) / 5) * 5;
    for (let a = start; a <= heading + field / 2; a += 5) {
      const x = width / 2 + (a - heading) * pxPerDeg;
      const norm = ((a % 360) + 360) % 360;
      const major = norm % 15 === 0;
      parts.push(`M ${x.toFixed(1)} ${major ? 12 : 16} L ${x.toFixed(1)} 20`);
      if (norm % 45 === 0 || norm % 30 === 0) {
        const t = svg('text', { x: x.toFixed(1), y: 8, 'text-anchor': 'middle', 'font-size': CARDINAL[norm] ? 11 : 9, fill: CARDINAL[norm] ? 'var(--dp-ink, #e8e2d4)' : 'var(--dp-ink-dim, #b7b4a6)' });
        t.textContent = CARDINAL[norm] || String(norm).padStart(3, '0');
        labels.appendChild(t);
      }
    }
    ticks.appendChild(svg('path', { d: parts.join(' '), class: 'orr-core orr-rest', 'stroke-width': 1 }));
  }
  drawTicks();

  return {
    el: root,
    setObjective({ kind: k = 'Objective', text: t = '', bearing = 0, distance = 0, etaS = null } = {}) {
      kind.textContent = k;
      if (text.textContent !== t) decrypt(text, t, { duration: 300 });
      const rel = ((((bearing - heading) % 360) + 540) % 360) - 180;
      const clamped = Math.max(-field / 2 + 4, Math.min(field / 2 - 4, rel));
      marker.style.left = `${width / 2 + clamped * (width / field)}px`;
      distCounter.set(distance);
      eta.textContent = Number.isFinite(etaS) ? `ETA ${Math.round(etaS)}S` : '';
    },
    setHeading(deg) { heading = Number(deg) || 0; drawTicks(); },
  };
}

// --------------------------------------------------------------------------------------- Lock Ring
export function createLockRing({ hostile = false } = {}) {
  injectStyle();
  const root = el('div', 'orr-lock');
  const c = 120;
  const tone = hostile ? 'threat' : 'hi';
  const s = svg('svg', { class: 'orr-svg', viewBox: '0 0 240 240', 'aria-hidden': 'true' });
  s.appendChild(ring({ cx: c, cy: c, r: 26, tone, width: 1.2, bloom: 4 }));
  const turning = svg('g', { class: 'orr-lock__ring' });
  turning.appendChild(svg('path', { d: ticksD(c, c, 34, 48, { len: 3, major: 4, majorLen: 7, inward: false }), class: `orr-core orr-${hostile ? 'threat' : 'rest'}`, 'stroke-width': 1 }));
  s.appendChild(turning);
  // the lead pip: where to aim, so a moving target is hit, not chased
  const lead = svg('g', { opacity: 0 });
  const leadLine = svg('path', { d: '', class: 'orr-core orr-faint', 'stroke-width': 1, 'stroke-dasharray': '2 3' });
  const leadDot = svg('circle', { r: 4, class: `orr-core orr-${hostile ? 'threat' : 'phos'}`, 'stroke-width': 1.4, fill: 'none' });
  lead.append(leadLine, leadDot);
  s.appendChild(lead);
  for (const a of [45, 135, 225, 315]) {
    const [x0, y0] = polar(c, c, 38, a);
    const [x1, y1] = polar(c, c, 46, a);
    s.appendChild(svg('path', { d: `M ${x0} ${y0} L ${x1} ${y1}`, class: `orr-core orr-${hostile ? 'threat' : 'phos'}`, 'stroke-width': 1.6 }));
  }
  const hp = arcGauge({ cx: c, cy: c, r: 52, from: -40, to: 40, width: 2.5, tone: hostile ? 'threat' : 'phos', ghost: true, head: false });
  s.appendChild(hp.el);
  // the leader: out at 45 degrees, then level to the label
  const [lx, ly] = polar(c, c, 48, 45);
  s.appendChild(svg('path', { d: `M ${lx} ${ly} L ${c + 60} ${c - 60} L ${c + 150} ${c - 60}`, class: 'orr-core orr-rest', 'stroke-width': 1 }));
  root.appendChild(s);
  const label = el('div', 'orr-lock__label');
  const name = el('span', 'orr-lock__name');
  const meta = el('div', 'orr-lock__meta');
  const detail = el('span', 'orr-label');
  const dist = el('b');
  meta.append(dist, detail);
  label.append(name, meta);
  root.appendChild(label);
  const distCounter = createCounter(dist, { format: (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k wu` : `${Math.round(n)} wu`).toUpperCase() });
  return {
    el: root,
    set({ x = 0, y = 0, name: n = '', detail: d = '', distance = 0, hull = 1, lead: leadAt = null } = {}) {
      if (leadAt) {
        lead.setAttribute('opacity', '1');
        leadDot.setAttribute('cx', String(c + leadAt.x));
        leadDot.setAttribute('cy', String(c + leadAt.y));
        leadLine.setAttribute('d', `M ${c} ${c} L ${c + leadAt.x} ${c + leadAt.y}`);
      }
      root.style.left = `${x}px`;
      root.style.top = `${y}px`;
      if (name.textContent !== n) decrypt(name, n, { duration: 280 });
      detail.textContent = d;
      distCounter.set(distance);
      hp.set(hull);
    },
    dispose() { hp.dispose(); },
  };
}

// ---------------------------------------------------------------------------------- Threat Channel
export function createThreatChannel() {
  injectStyle();
  const root = el('div', 'orr-threat');
  const s = svg('svg', { class: 'orr-svg', viewBox: '0 0 220 220', 'aria-hidden': 'true' });
  s.appendChild(svg('circle', { cx: 110, cy: 110, r: 82, class: 'orr-core orr-faint', 'stroke-width': 1, fill: 'none', 'stroke-dasharray': '1 5' }));
  const arcs = svg('g');
  s.appendChild(arcs);
  root.appendChild(s);
  const edges = [];
  return {
    el: root,
    set({ x = 0, y = 0, bearings = [] } = {}) {
      root.style.left = `${x}px`;
      root.style.top = `${y}px`;
      arcs.textContent = '';
      for (const b of bearings) {
        const g = svg('g', { class: 'orr-threat__arc' });
        g.appendChild(svg('path', { d: arcD(110, 110, 82, b - 9, b + 9), class: 'orr-bloom orr-threat', 'stroke-width': 9 }));
        g.appendChild(svg('path', { d: arcD(110, 110, 82, b - 9, b + 9), class: 'orr-core orr-threat', 'stroke-width': 2.4 }));
        const [tx, ty] = polar(110, 110, 93, b);
        g.appendChild(svg('path', { d: `M ${tx - 4} ${ty} L ${tx} ${ty - 6} L ${tx + 4} ${ty} Z`, fill: 'var(--dp-danger, #ff5038)', transform: `rotate(${b} ${tx} ${ty})` }));
        arcs.appendChild(g);
      }
    },
    edge(host, { x, y, bearing = 90, label = '', labelSide = 'below' } = {}) {
      const e = el('div', 'orr-edge');
      e.style.left = `${x}px`;
      e.style.top = `${y}px`;
      const es = svg('svg', { class: 'orr-svg', viewBox: '-18 -18 36 36', 'aria-hidden': 'true' });
      es.append(
        svg('path', { d: 'M -7 -9 L 5 0 L -7 9', class: 'orr-bloom orr-threat', 'stroke-width': 8, fill: 'none', transform: `rotate(${bearing - 90})` }),
        svg('path', { d: 'M -7 -9 L 5 0 L -7 9', class: 'orr-core orr-threat', 'stroke-width': 2.4, fill: 'none', 'stroke-linejoin': 'miter', transform: `rotate(${bearing - 90})` }),
      );
      e.appendChild(es);
      if (label) {
        const l = el('span', 'orr-label orr-edge__label', label);
        if (labelSide === 'left') { l.style.left = 'auto'; l.style.right = '26px'; l.style.top = '-6px'; l.style.transform = 'none'; }
        e.appendChild(l);
      }
      host.appendChild(e);
      edges.push(e);
      return e;
    },
  };
}

// ----------------------------------------------------------------------------------- Signal Toasts
export function createSignalToasts() {
  injectStyle();
  const root = el('div', 'orr-toasts');
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  return {
    el: root,
    push({ kind = 'Signal', html = '', gain = false, life = 6, delay = 0 } = {}) {
      const t = el('div', `orr-toast is-arriving${gain ? ' is-gain' : ''}`);
      t.style.setProperty('--orr-delay', `${delay}ms`);
      t.style.setProperty('--orr-life', `${life}s`);
      const ringSvg = svg('svg', { class: 'orr-svg', viewBox: '0 0 18 18', 'aria-hidden': 'true' });
      ringSvg.append(
        svg('circle', { cx: 9, cy: 9, r: 7, class: 'orr-core orr-faint', 'stroke-width': 1.2, fill: 'none' }),
        svg('path', { d: arcD(9, 9, 7, 0, 359.99), class: 'orr-core orr-phos orr-toast__decay', 'stroke-width': 1.8, pathLength: 1, 'stroke-dasharray': '1 1' }),
      );
      const k = el('span', 'orr-label', kind);
      const body = el('div', 'orr-toast__text');
      body.innerHTML = html;
      t.append(ringSvg, k, body);
      root.prepend(t);
      while (root.children.length > 4) root.lastChild.remove();
      return t;
    },
  };
}

// ------------------------------------------------------------------------------------- Place block
export function createPlaceBlock() {
  injectStyle();
  const root = el('div', 'orr-place');
  const name = el('b', 'orr-display orr-place__name');
  const zone = el('span', 'orr-label');
  const purse = el('div', 'orr-place__purse');
  const credits = el('span');
  purse.append(credits, el('span', 'orr-label', 'cr'));
  root.append(name, zone, purse);
  const counter = createCounter(credits);
  return {
    el: root,
    set({ place = '', zone: z = '', credits: cr = 0 } = {}) {
      if (name.textContent !== place) decrypt(name, place, { duration: 360 });
      if (zone.textContent !== z) decrypt(zone, z, { duration: 420, delay: 80 });
      counter.set(cr);
    },
  };
}

export { ticksD };
