// ORRERY instruments: Arc Gauge, Orbit Ring, the Hand, Scale (design/frontend/ORRERY.md §4).
// Each returns { el, ...setters, dispose }. All geometry is SVG light (core + bloom strokes).
import { svg, arcD, ticksD, polar, lightPath } from './svg.js';
import { createSpring } from './motion.js';

const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

/**
 * Arc Gauge — a quantity as an arc. The fill is a pathLength=1 dash that a spring drives; a
 * ghost arc holds the previous value for a beat after a loss (so a hit reads as a bite taken out),
 * and a bright head marks the live end.
 */
export function arcGauge({
  cx, cy, r, from, to, width = 3, tone = 'phos', track = 'faint', segments = 0, segmentGap = 1.6,
  ghost = true, head = true, drawDelay = 0,
} = {}) {
  const g = svg('g', { class: 'orr-gauge' });
  const d = arcD(cx, cy, r, from, to);
  const span = to - from;
  g.appendChild(svg('path', { d, class: `orr-core orr-${track}`, 'stroke-width': width, 'stroke-linecap': 'butt' }));
  const ghostPath = ghost ? svg('path', { d, class: 'orr-core orr-hi', 'stroke-width': width, 'stroke-linecap': 'butt', pathLength: 1, 'stroke-dasharray': '0 1', opacity: '0.45' }) : null;
  if (ghostPath) g.appendChild(ghostPath);
  const bloom = svg('path', { d, class: `orr-bloom orr-${tone}`, 'stroke-width': width + 4, 'stroke-linecap': 'butt', pathLength: 1, 'stroke-dasharray': '0 1' });
  const fill = svg('path', { d, class: `orr-core orr-${tone}`, 'stroke-width': width, 'stroke-linecap': 'butt', pathLength: 1, 'stroke-dasharray': '0 1' });
  g.appendChild(bloom);
  g.appendChild(fill);
  // Segmentation is a mask of hairline gaps across the arc, so the cells read as shield cells.
  if (segments > 1) {
    const gaps = [];
    for (let i = 1; i < segments; i += 1) {
      const a = from + (span * i) / segments;
      const [x0, y0] = polar(cx, cy, r - width, a);
      const [x1, y1] = polar(cx, cy, r + width, a);
      gaps.push(`M ${x0} ${y0} L ${x1} ${y1}`);
    }
    g.appendChild(svg('path', { d: gaps.join(' '), stroke: 'var(--dp-void, #05070a)', 'stroke-width': segmentGap, fill: 'none' }));
  }
  const headDot = head ? svg('circle', { r: width * 0.9, class: `orr-gauge__head`, fill: `var(--dp-${tone === 'phos' ? 'phos' : tone === 'hand' ? 'hand' : tone === 'threat' ? 'danger' : 'ink'})` }) : null;
  if (headDot) g.appendChild(headDot);

  let shown = 0;
  let ghostValue = 0;
  let ghostTimer = 0;
  const paint = (v) => {
    shown = v;
    const dash = `${clamp01(v)} 1`;
    fill.setAttribute('stroke-dasharray', dash);
    bloom.setAttribute('stroke-dasharray', dash);
    if (headDot) {
      const [hx, hy] = polar(cx, cy, r, from + span * clamp01(v));
      headDot.setAttribute('cx', hx.toFixed(2));
      headDot.setAttribute('cy', hy.toFixed(2));
      headDot.setAttribute('opacity', v > 0.002 ? '1' : '0');
    }
  };
  const spring = createSpring({ value: 0, preset: 'settle', onUpdate: paint });
  paint(0);

  return {
    el: g,
    set(value, { instant = false } = {}) {
      const v = clamp01(value);
      if (ghostPath && v < shown - 0.01) {
        ghostValue = Math.max(ghostValue, shown);
        ghostPath.setAttribute('stroke-dasharray', `${ghostValue} 1`);
        clearTimeout(ghostTimer);
        ghostTimer = setTimeout(() => { ghostValue = 0; ghostPath.setAttribute('stroke-dasharray', '0 1'); }, 900);
      }
      spring.set(v, { instant });
    },
    setTone(nextTone) {
      for (const node of [fill, bloom]) node.setAttribute('class', node.getAttribute('class').replace(/orr-(phos|hand|threat|ink|hi|ice)/, `orr-${nextTone}`));
      if (headDot) headDot.setAttribute('fill', `var(--dp-${nextTone === 'threat' ? 'danger' : nextTone === 'hand' ? 'hand' : 'phos'})`);
    },
    dispose() { spring.stop(); clearTimeout(ghostTimer); },
  };
}

/** Orbit Ring — a tick scale on a ring, optionally drifting (compositor rotation). */
export function orbitRing({ cx, cy, r, count = 72, major = 6, len = 3, majorLen = 8, tone = 'faint', drift = 0, from = 0, to = 360, width = 1, inward = true } = {}) {
  const outer = svg('g', { class: 'orr-orbit' });
  const inner = svg('g', drift ? { class: `orr-drift${drift < 0 ? ' orr-drift--rev' : ''}`, style: `transform-origin:${cx}px ${cy}px; --orr-drift-s:${Math.abs(drift)}s` } : {});
  inner.appendChild(svg('path', { d: ticksD(cx, cy, r, count, { len, major, majorLen, from, to, inward }), class: `orr-core orr-${tone}`, 'stroke-width': width, 'stroke-linecap': 'butt' }));
  outer.appendChild(inner);
  return { el: outer, rotor: inner };
}

/** A plain ring of light (full circle or arc). */
export function ring({ cx, cy, r, from = 0, to = 360, tone = 'faint', width = 1, bloom = 0, dash = null, draw = false, delay = 0 } = {}) {
  const g = lightPath(arcD(cx, cy, r, from, to), { tone, width, bloom, draw, delay });
  if (dash) for (const p of g.querySelectorAll('path')) p.setAttribute('stroke-dasharray', dash);
  return g;
}

/**
 * The Hand — the one amber arm (ORRERY's signature). It pivots at (cx, cy), reaches from r0 to r1,
 * and swings to a bearing with a spring that overshoots a little and settles, like a needle.
 */
export function hand({ cx, cy, r0, r1, width = 1.6, pip = 5 } = {}) {
  const g = svg('g', { class: 'orr-handarm' });
  const arm = lightPath(`M ${cx} ${cy - r0} L ${cx} ${cy - r1}`, { tone: 'hand', width, bloom: 6 });
  g.appendChild(arm);
  // the pip: a small open chevron at the tip, pointing outward
  g.appendChild(svg('path', {
    d: `M ${cx - pip} ${cy - r1 + pip * 1.2} L ${cx} ${cy - r1 - pip * 0.4} L ${cx + pip} ${cy - r1 + pip * 1.2}`,
    class: 'orr-core orr-hand', 'stroke-width': width, 'stroke-linejoin': 'miter', fill: 'none',
  }));
  let deg = 0;
  const apply = (v) => { deg = v; g.setAttribute('transform', `rotate(${v.toFixed(2)} ${cx} ${cy})`); };
  const spring = createSpring({ value: 0, preset: 'swing', onUpdate: apply });
  apply(0);
  return {
    el: g,
    pointTo(bearing, { instant = false } = {}) {
      // take the short way round
      let target = Number(bearing) || 0;
      while (target - deg > 180) target -= 360;
      while (target - deg < -180) target += 360;
      spring.set(target, { instant });
    },
    get bearing() { return deg; },
    dispose() { spring.stop(); },
  };
}

/**
 * Scale — a horizontal ruler of light with a fill, a live cursor and an optional reference mark.
 * (x, y) is the left end of the baseline; ticks hang below it.
 */
export function scale({ x = 0, y = 0, w = 200, ticks = 20, major = 5, tone = 'phos', reference = null } = {}) {
  const g = svg('g', { class: 'orr-scale' });
  g.appendChild(svg('path', { d: `M ${x} ${y} L ${x + w} ${y}`, class: 'orr-core orr-faint', 'stroke-width': 1 }));
  const tickParts = [];
  for (let i = 0; ticks > 0 && i <= ticks; i += 1) {
    const tx = x + (w * i) / ticks;
    const l = i % major === 0 ? 6 : 3;
    tickParts.push(`M ${tx} ${y + 2} L ${tx} ${y + 2 + l}`);
  }
  if (tickParts.length) g.appendChild(svg('path', { d: tickParts.join(' '), class: 'orr-core orr-rest', 'stroke-width': 1, 'stroke-linecap': 'butt' }));
  const fillBloom = svg('path', { d: `M ${x} ${y} L ${x + w} ${y}`, class: `orr-bloom orr-${tone}`, 'stroke-width': 6, pathLength: 1, 'stroke-dasharray': '0 1', 'stroke-linecap': 'butt' });
  const fill = svg('path', { d: `M ${x} ${y} L ${x + w} ${y}`, class: `orr-core orr-${tone}`, 'stroke-width': 2, pathLength: 1, 'stroke-dasharray': '0 1', 'stroke-linecap': 'butt' });
  g.appendChild(fillBloom);
  g.appendChild(fill);
  const cursor = svg('path', { d: `M 0 ${y - 7} L 0 ${y + 9}`, class: `orr-core orr-${tone}`, 'stroke-width': 1.5 });
  g.appendChild(cursor);
  let refMark = null;
  if (reference != null) {
    refMark = svg('g', {});
    refMark.appendChild(svg('path', { d: `M 0 ${y - 9} L 0 ${y + 10}`, class: 'orr-core orr-hand', 'stroke-width': 1.5 }));
    refMark.appendChild(svg('path', { d: `M -4 ${y - 13} L 0 ${y - 9} L 4 ${y - 13}`, class: 'orr-core orr-hand', 'stroke-width': 1.2, fill: 'none' }));
    g.appendChild(refMark);
  }
  const paint = (v) => {
    const c = clamp01(v);
    fill.setAttribute('stroke-dasharray', `${c} 1`);
    fillBloom.setAttribute('stroke-dasharray', `${c} 1`);
    cursor.setAttribute('transform', `translate(${(x + w * c).toFixed(2)} 0)`);
  };
  const spring = createSpring({ value: 0, preset: 'settle', onUpdate: paint });
  paint(0);
  return {
    el: g,
    set(value, opts) { spring.set(clamp01(value), opts); },
    setReference(value) { if (refMark) refMark.setAttribute('transform', `translate(${(x + w * clamp01(value)).toFixed(2)} 0)`); },
    dispose() { spring.stop(); },
  };
}
