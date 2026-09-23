// ORRERY vector geometry: rings, arcs, ticks, polar placement (design/frontend/ORRERY.md §3.2).
// Angles are in degrees, 0 = straight up, increasing clockwise — the way a dial is read.

export const SVGNS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = {}, children = []) {
  const node = globalThis.document.createElementNS(SVGNS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    node.setAttribute(key, String(value));
  }
  for (const child of children) if (child) node.appendChild(child);
  return node;
}

export function polar(cx, cy, r, deg) {
  const a = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

const f = (n) => Math.round(n * 100) / 100;

/** An arc from a0 to a1 (clockwise, degrees). */
export function arcD(cx, cy, r, a0, a1) {
  const span = a1 - a0;
  if (Math.abs(span) >= 359.999) {
    const [x0, y0] = polar(cx, cy, r, a0);
    const [xm, ym] = polar(cx, cy, r, a0 + 180);
    return `M ${f(x0)} ${f(y0)} A ${r} ${r} 0 1 1 ${f(xm)} ${f(ym)} A ${r} ${r} 0 1 1 ${f(x0)} ${f(y0)}`;
  }
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(span) > 180 ? 1 : 0;
  const sweep = span >= 0 ? 1 : 0;
  return `M ${f(x0)} ${f(y0)} A ${r} ${r} 0 ${large} ${sweep} ${f(x1)} ${f(y1)}`;
}

/** Radial tick marks around a ring. Major ticks every `major` ticks are `majorLen` long. */
export function ticksD(cx, cy, r, count, { len = 4, major = 0, majorLen = 9, from = 0, to = 360, inward = true } = {}) {
  const parts = [];
  const span = to - from;
  const closed = Math.abs(span) >= 360;
  const n = closed ? count : count + 1;
  for (let i = 0; i < n; i += 1) {
    const a = from + (span * i) / count;
    const l = major && i % major === 0 ? majorLen : len;
    const r0 = inward ? r - l : r;
    const r1 = inward ? r : r + l;
    const [x0, y0] = polar(cx, cy, r0, a);
    const [x1, y1] = polar(cx, cy, r1, a);
    parts.push(`M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`);
  }
  return parts.join(' ');
}

/** A path drawn as light: a bloom stroke under a core stroke. Returns a <g>. */
export function lightPath(d, { tone = 'rest', width = 1, bloom = 5, bloomTone = null, draw = false, delay = 0, className = '' } = {}) {
  const g = svg('g', { class: `orr-light ${className}`.trim() });
  if (bloom > 0) g.appendChild(svg('path', { d, class: `orr-bloom orr-${bloomTone || tone}`, 'stroke-width': bloom, pathLength: draw ? 1 : null }));
  const core = svg('path', { d, class: `orr-core orr-${tone}${draw ? ' orr-draw' : ''}`, 'stroke-width': width, pathLength: draw ? 1 : null });
  if (draw && delay) core.style.setProperty('--orr-delay', `${delay}ms`);
  g.appendChild(core);
  return g;
}

/** Text on a circular path (for ring legends). */
let textPathSeq = 0;
export function circularText(cx, cy, r, text, { startDeg = 0, size = 9, className = '', anchor = 'start' } = {}) {
  const id = `orr-tp-${++textPathSeq}`;
  const g = svg('g', { class: className });
  const [x0, y0] = polar(cx, cy, r, startDeg);
  const [x1, y1] = polar(cx, cy, r, startDeg + 180);
  g.appendChild(svg('path', { id, d: `M ${f(x0)} ${f(y0)} A ${r} ${r} 0 1 1 ${f(x1)} ${f(y1)} A ${r} ${r} 0 1 1 ${f(x0)} ${f(y0)}`, fill: 'none', stroke: 'none' }));
  const t = svg('text', { 'font-size': size, 'text-anchor': anchor });
  const tp = svg('textPath', { href: `#${id}`, startOffset: anchor === 'middle' ? '25%' : '0' });
  tp.textContent = text;
  t.appendChild(tp);
  g.appendChild(t);
  return g;
}
