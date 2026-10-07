// The powers wheel, drawn as an ORRERY Radial Menu (design/frontend/ORRERY.md §4 #18): six powers on an
// arc rail, a lit sector under the choice, and the Hand, the one amber arm, that swings on a spring to
// whatever the thumb is over. It opens from the edge handle as a half ring turned inward; releasing on a
// power requests it and releasing in the middle cancels.
//
// Presentation only. The gesture (which sector a thumb is in, when to cancel) is model.wheelSlot, and what a
// request does is the bridge and the existing gameplay owners; this module draws a choice and reports taps.
import { svg, polar } from '../../ui/orrery/svg.js';
import { createSpring } from '../../ui/orrery/motion.js';
import { clamp } from './model.js';

const U = 100;                       // the rail's radius in drawing units; CSS scales the drawing to the real radius
const HALF = 135;
const SECTORS = 6;
const SECTOR = 180 / SECTORS;
const NODE_R = 0.76;                 // where the powers sit, as a fraction of the radius
const WEDGE_IN = 0.56, WEDGE_OUT = 0.95;

const el = (doc, tag, cls, text) => {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** Centre of sector `i` in dial degrees (0 = up, clockwise). The right-hand wheel opens leftward (counter-clockwise). */
export const sectorDeg = (i, side) => (side === 'left' ? 1 : -1) * (i + 0.5) * SECTOR;

function wedgeD(a0, a1, r0, r1) {
  const [x0, y0] = polar(0, 0, r0, a0);
  const [x1, y1] = polar(0, 0, r1, a0);
  const [x2, y2] = polar(0, 0, r1, a1);
  const [x3, y3] = polar(0, 0, r0, a1);
  const sweep = a1 >= a0 ? 1 : 0;
  const f = (n) => Math.round(n * 100) / 100;
  return `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)} A ${r1} ${r1} 0 0 ${sweep} ${f(x2)} ${f(y2)} L ${f(x3)} ${f(y3)} A ${r0} ${r0} 0 0 ${sweep ? 0 : 1} ${f(x0)} ${f(y0)} Z`;
}

export function createWheel(doc, { pages, icon, onUse, onPage }) {
  const root = el(doc, 'div', 'mf-wheel');
  root.hidden = true;

  // ---- the drawing -------------------------------------------------------------------------------------
  const art = el(doc, 'div', 'mf-wheel-art');
  const s = svg('svg', { class: 'mf-wheel-svg', viewBox: `${-HALF} ${-HALF} ${HALF * 2} ${HALF * 2}`, 'aria-hidden': 'true', focusable: 'false' });
  const plate = svg('circle', { class: 'mf-w-plate', cx: 0, cy: 0, r: U * 1.06 });
  const band = svg('circle', { class: 'mf-w-band', cx: 0, cy: 0, r: U });
  const edge = svg('circle', { class: 'mf-w-edge', cx: 0, cy: 0, r: U });
  const tickCount = 72;
  const tickR = U + 8;
  const tickPeriod = (2 * Math.PI * tickR) / tickCount;
  const ticks = svg('circle', {
    class: 'mf-w-ticks', cx: 0, cy: 0, r: tickR, 'stroke-width': 5,
    'stroke-dasharray': `1.6 ${(tickPeriod - 1.6).toFixed(3)}`, 'stroke-dashoffset': 0.8, transform: 'rotate(-90)',
  });
  const track = svg('circle', { class: 'mf-w-track', cx: 0, cy: 0, r: U * NODE_R });
  const wedge = svg('path', { class: 'mf-w-wedge', d: '' });
  const rule = svg('path', { class: 'mf-w-rule', d: '' });
  const hand = svg('g', { class: 'mf-w-hand' }, [
    svg('line', { class: 'mf-w-hand-bloom', x1: 0, y1: -10, x2: 0, y2: -U * 0.9 }),
    svg('line', { class: 'mf-w-hand-core', x1: 0, y1: -10, x2: 0, y2: -U * 0.9 }),
    svg('circle', { class: 'mf-w-hand-bead', cx: 0, cy: -U * NODE_R, r: 5.5 }),
  ]);
  const hub = svg('circle', { class: 'mf-w-hub', cx: 0, cy: 0, r: 9 });
  for (const n of [plate, band, ticks, track, rule, wedge, edge, hand, hub]) s.appendChild(n);
  art.appendChild(s);

  // ---- the choices, the banks, the readout ------------------------------------------------------------
  const nodes = el(doc, 'div', 'mf-nodes');
  const top = el(doc, 'div', 'mf-wheel-top');
  const tabs = el(doc, 'div', 'mf-tabs');
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Power banks');
  const pick = el(doc, 'div', 'mf-pick');
  const pickName = el(doc, 'b', 'mf-pick-name');
  const pickText = el(doc, 'span', 'mf-pick-text');
  pick.append(pickName, pickText);
  top.append(tabs, pick);
  root.append(art, nodes, top);

  const tabButtons = pages.map((page, i) => {
    const b = el(doc, 'button', 'mf-tab', page.name);
    b.type = 'button';
    b.addEventListener('click', () => onPage?.(i));
    tabs.appendChild(b);
    return b;
  });

  let geom = { cx: 0, cy: 0, radius: 150, side: 'right' };
  let page = 0, selected = -1, pinned = false;

  const spring = createSpring({
    value: -90, preset: 'swing',
    onUpdate: (a) => hand.setAttribute('transform', `rotate(${a.toFixed(2)})`),
  });

  function layout() {
    const { cx, cy, radius, side } = geom;
    const size = (HALF * 2 / U) * radius;
    art.style.width = art.style.height = `${size}px`;
    art.style.left = `${cx - size / 2}px`;
    art.style.top = `${cy - size / 2}px`;
    root.style.setProperty('--mf-wheel-r', `${radius}px`);
    rule.setAttribute('d', Array.from({ length: SECTORS + 1 }, (_, k) => {
      const a = (side === 'left' ? 1 : -1) * k * SECTOR;
      const [x0, y0] = polar(0, 0, U * WEDGE_IN, a);
      const [x1, y1] = polar(0, 0, U * WEDGE_OUT, a);
      return `M ${x0.toFixed(2)} ${y0.toFixed(2)} L ${x1.toFixed(2)} ${y1.toFixed(2)}`;
    }).join(' '));
    // the visible half of the rail, as a lit track over the full-circle band
    track.setAttribute('stroke-dasharray', `${(Math.PI * U * NODE_R).toFixed(2)} ${(Math.PI * U * NODE_R * 3).toFixed(2)}`);
    track.setAttribute('transform', `rotate(${side === 'left' ? -90 : 90})`);
  }

  function fillNodes() {
    nodes.replaceChildren();
    const { cx, cy, radius, side } = geom;
    pages[page].powers.forEach((power, i) => {
      const a = sectorDeg(i, side);
      const [ux, uy] = polar(0, 0, radius * NODE_R, a);
      const b = el(doc, 'button', 'mf-node');
      b.type = 'button';
      b.dataset.index = String(i);
      b.style.left = `${cx + ux}px`;
      b.style.top = `${cy + uy}px`;
      b.style.setProperty('--i', String(i));
      b.innerHTML = `${icon(power.symbol)}<span>${power.label}</span>`;
      b.setAttribute('aria-label', `${power.label}. ${power.description}`);
      b.title = power.description;
      b.addEventListener('click', () => onUse?.(power));
      nodes.appendChild(b);
    });
    tabButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === page)));
  }

  function paintSelection() {
    [...nodes.children].forEach((b, i) => { b.dataset.selected = i === selected ? '1' : '0'; });
    const { side } = geom;
    if (selected >= 0) {
      const a = sectorDeg(selected, side);
      wedge.setAttribute('d', wedgeD(a - SECTOR / 2, a + SECTOR / 2, U * WEDGE_IN, U * WEDGE_OUT));
      wedge.removeAttribute('data-off');
      hand.removeAttribute('data-idle');
      spring.set(a);
      const power = pages[page].powers[selected];
      pickName.textContent = power.label;
      pickText.textContent = power.description;
      root.dataset.choice = '1';
    } else {
      wedge.setAttribute('data-off', '1');
      hand.setAttribute('data-idle', '1');
      spring.set(side === 'left' ? 90 : -90);
      pickName.textContent = pages[page].name;
      pickText.textContent = pinned ? 'Tap a power.' : 'Slide to a power, lift to use it. The middle cancels.';
      root.dataset.choice = '0';
    }
  }

  return {
    root,
    get page() { return page; },
    get selected() { return selected; },
    /** Open on `geometry` ({cx, cy, radius, side}) showing bank `bank`. */
    open(geometry, bank = 0, isPinned = false) {
      geom = { ...geom, ...geometry };
      page = clamp(bank, 0, pages.length - 1);
      pinned = isPinned;
      selected = -1;
      root.hidden = false;
      root.dataset.pinned = isPinned ? '1' : '0';
      root.dataset.side = geom.side;
      layout();
      fillNodes();
      spring.set(geom.side === 'left' ? 90 : -90, { instant: true });
      paintSelection();
    },
    setPinned(on) { pinned = on; root.dataset.pinned = on ? '1' : '0'; paintSelection(); },
    setPage(i) { page = clamp(i, 0, pages.length - 1); selected = -1; fillNodes(); paintSelection(); },
    /** Swing the Hand to sector `i`; -1 leaves it idle at the middle. */
    select(i) { if (i === selected) return; selected = i; paintSelection(); },
    close() { selected = -1; root.hidden = true; spring.stop(); },
    destroy() { spring.stop(); root.remove(); },
  };
}
