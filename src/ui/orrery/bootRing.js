// ORRERY boot ring (design/frontend/ORRERY.md §6 Loading: "the Emblem spins up; the load's real stages
// are ticks round the outer ring (never a timer)").
//
// The loading presenter already models progress honestly (a smoothed value chasing the stages the
// boot reports). This is only its face: the engraved emblem turning slowly inside a ring, the
// progress as an arc of ice (data in motion), and a bone tick on the outer ring for every stage the
// boot has actually reported. Plain DOM + SVG, no library imports: it mounts before the game does.
// The old 2 px bar stays in the DOM (the presenter and its checks still write and read it), hidden.
const NS = 'http://www.w3.org/2000/svg';
const EMBLEM = new URL('../../../assets/ui/generated/emblem/emblem.thumb.webp', import.meta.url).href;
const R = 60;

function node(doc, tag, attrs) {
  const el = doc.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function arc(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.sin(a * Math.PI / 180), cy - r * Math.cos(a * Math.PI / 180)];
  if (a1 - a0 >= 359.999) {
    const [x0, y0] = p(a0); const [x1, y1] = p(a0 + 180);
    return `M ${x0} ${y0} A ${r} ${r} 0 1 1 ${x1} ${y1} A ${r} ${r} 0 1 1 ${x0} ${y0}`;
  }
  const [x0, y0] = p(a0); const [x1, y1] = p(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/** Mount the ring into the boot overlay's progress row. Returns { set(fraction), mark(fraction) }. */
export function mountBootRing(document, overlay) {
  const row = overlay && overlay.querySelector ? overlay.querySelector('.boot-progress-row') : null;
  if (!row || typeof document.createElementNS !== 'function') return { set() {}, mark() {} };
  if (row.querySelector('.boot-ring')) row.querySelector('.boot-ring').remove();
  overlay.classList.add('boot-overlay--orrery');
  const c = 72;
  const svg = node(document, 'svg', { class: 'boot-ring', viewBox: '0 0 144 144', 'aria-hidden': 'true' });
  const emblem = node(document, 'image', { href: EMBLEM, x: c - 50, y: c - 50, width: 100, height: 100, class: 'boot-ring__emblem' });
  // outer graduations, the track, the progress arc (ice) over a soft bloom, the stage marks
  const ticks = [];
  for (let i = 0; i < 72; i += 1) {
    const a = i * 5;
    const len = i % 6 === 0 ? 6 : 3;
    const [x0, y0] = [c + (R + 5) * Math.sin(a * Math.PI / 180), c - (R + 5) * Math.cos(a * Math.PI / 180)];
    const [x1, y1] = [c + (R + 5 + len) * Math.sin(a * Math.PI / 180), c - (R + 5 + len) * Math.cos(a * Math.PI / 180)];
    ticks.push(`M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}`);
  }
  const grad = node(document, 'path', { d: ticks.join(' '), class: 'boot-ring__grad' });
  const track = node(document, 'path', { d: arc(c, c, R, 0, 360), class: 'boot-ring__track' });
  const bloom = node(document, 'path', { d: arc(c, c, R, 0, 360), class: 'boot-ring__bloom', pathLength: 1, 'stroke-dasharray': '0 1' });
  const fill = node(document, 'path', { d: arc(c, c, R, 0, 360), class: 'boot-ring__fill', pathLength: 1, 'stroke-dasharray': '0 1' });
  const head = node(document, 'circle', { r: 2.6, cx: c, cy: c - R, class: 'boot-ring__head' });
  const marks = node(document, 'g', { class: 'boot-ring__marks' });
  svg.append(emblem, grad, track, bloom, fill, marks, head);
  row.insertBefore(svg, row.firstChild);

  let shown = -1;
  const marked = new Set();
  return {
    set(fraction) {
      const f = Math.max(0, Math.min(1, Number(fraction) || 0));
      if (Math.abs(f - shown) < 0.001) return;
      shown = f;
      const dash = `${f.toFixed(4)} 1`;
      fill.setAttribute('stroke-dasharray', dash);
      bloom.setAttribute('stroke-dasharray', dash);
      const a = f * 360;
      head.setAttribute('cx', (c + R * Math.sin(a * Math.PI / 180)).toFixed(2));
      head.setAttribute('cy', (c - R * Math.cos(a * Math.PI / 180)).toFixed(2));
    },
    /** A reported stage: a bone tick on the outer ring where the boot really is, never a timer's. */
    mark(fraction) {
      const f = Math.max(0, Math.min(1, Number(fraction) || 0));
      const key = Math.round(f * 200);
      if (marked.has(key) || f <= 0) return;
      marked.add(key);
      const a = f * 360;
      const [x0, y0] = [c + (R - 6) * Math.sin(a * Math.PI / 180), c - (R - 6) * Math.cos(a * Math.PI / 180)];
      const [x1, y1] = [c + (R + 13) * Math.sin(a * Math.PI / 180), c - (R + 13) * Math.cos(a * Math.PI / 180)];
      marks.appendChild(node(document, 'path', { d: `M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}` }));
    },
  };
}
