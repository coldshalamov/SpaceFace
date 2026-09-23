// ORRERY Ordnance Arc (design/frontend/ORRERY.md §6 Flight): the weapon, fieldwork, rig and bay
// keys ride a shallow arc along the bottom of the screen — a segment of a very large orbit — instead
// of a row of boxed tiles. Each key is a socket of light: a rest ring, its icon, a cooldown arc that
// sweeps back to full, the key it answers to. The armed key wears the Hand's amber ring.
import { svg, arcD, polar } from './svg.js';
import { createSpring } from './motion.js';

const STYLE_ID = 'sf-orrery-ordnance-style';
const ICON_ROOT = new URL('../../../assets/ui/kit/icons/48/', import.meta.url).href;

const CSS = `
.orr-ordnance { position:relative; width:var(--orr-ord-w, 780px); height:164px; pointer-events:none; }
.orr-ordnance__rail { position:absolute; inset:0; width:100%; height:100%; }
.orr-ordnance__key { position:absolute; width:60px; height:60px; margin:-30px 0 0 -30px; }
.orr-ordnance__key svg { position:absolute; inset:0; width:60px; height:60px; overflow:visible; }
.orr-ordnance__icon { position:absolute; left:50%; top:50%; width:24px; height:24px; margin:-12px 0 0 -12px;
  background:currentColor; -webkit-mask:var(--orr-icon) center / contain no-repeat; mask:var(--orr-icon) center / contain no-repeat;
  color:var(--dp-ink, #e8e2d4); opacity:.9; }
.orr-ordnance__hint { position:absolute; left:-4px; top:-10px; font-size:10px; letter-spacing:.08em; color:var(--dp-ink-dim, #b7b4a6); }
.orr-ordnance__name { position:absolute; left:50%; top:66px; transform:translateX(-50%); white-space:nowrap; font-size:10px; }
.orr-ordnance__group { font-size:10px; letter-spacing:.2em; }
.orr-ordnance__key.is-armed .orr-ordnance__icon { color:var(--dp-hand-hot, #ffd98c); opacity:1; }
.orr-ordnance__key.is-armed .orr-ordnance__name { color:var(--dp-hand, #f2b950); }
.orr-ordnance__key.is-empty .orr-ordnance__icon, .orr-ordnance__key.is-locked .orr-ordnance__icon { opacity:.34; }
.orr-ordnance__key.is-empty .orr-ordnance__name, .orr-ordnance__key.is-locked .orr-ordnance__name { opacity:.62; }
.orr-ordnance__key.is-cooldown .orr-ordnance__icon { opacity:.55; }
.orr-ordnance__count { position:absolute; right:4px; bottom:2px; font-family:var(--dp-face-numeral); font-weight:600; font-size:11px; color:var(--dp-phos, #dfeeff); font-variant-numeric:tabular-nums; }
.orr-ordnance.is-arriving .orr-ordnance__key { animation:orr-rise 420ms var(--dp-ease-out) both; animation-delay:var(--orr-delay, 0ms); }
html.sf-reduce-motion .orr-ordnance * { animation:none !important; }
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

/**
 * @param {object} o
 * @param {{name:string, slots:{key:string,name:string,icon:string}[]}[]} o.groups
 */
export function createOrdnanceArc({ groups = [], width = 780 } = {}) {
  injectStyle();
  const root = el('div', 'orr-ordnance');
  root.style.setProperty('--orr-ord-w', `${width}px`);
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Ordnance');

  const H = 164;
  const baseY = 100;              // the lowest (centre) key sits here
  const RADIUS = 1500;            // a segment of a very large orbit: a gentle smile
  const cx = width / 2;
  const cy = baseY - RADIUS;
  const yAt = (x) => cy + Math.sqrt(RADIUS * RADIUS - (x - cx) * (x - cx));
  const tangentDeg = (x) => Math.atan2(-(x - cx), Math.sqrt(RADIUS * RADIUS - (x - cx) * (x - cx))) * 180 / Math.PI;

  const pitch = 64;
  const groupGap = 34;
  const count = groups.reduce((n, g) => n + g.slots.length, 0);
  const total = (count - 1) * pitch + (groups.length - 1) * groupGap;
  let x = cx - total / 2;

  const rail = svg('svg', { class: 'orr-svg orr-ordnance__rail', viewBox: `0 0 ${width} ${H}`, 'aria-hidden': 'true' });
  // the orbit the keys ride, drawn only between the first and last key, fading at the ends
  const x0 = x - 30;
  const x1 = cx + total / 2 + 30;
  const railPath = `M ${x0} ${yAt(x0) + 56} A ${RADIUS} ${RADIUS} 0 0 0 ${x1} ${yAt(x1) + 56}`;
  rail.appendChild(svg('path', { d: railPath, class: 'orr-core orr-faint', 'stroke-width': 1 }));
  root.appendChild(rail);

  const keys = [];
  groups.forEach((group, gi) => {
    const gStart = x;
    group.slots.forEach((slot, si) => {
      const kx = x;
      const ky = yAt(kx);
      const key = el('div', 'orr-ordnance__key');
      key.style.left = `${kx}px`;
      key.style.top = `${ky}px`;
      key.style.setProperty('--orr-delay', `${120 + keys.length * 34}ms`);
      const ks = svg('svg', { viewBox: '-30 -30 60 60', class: 'orr-svg', 'aria-hidden': 'true' });
      ks.appendChild(svg('circle', { r: 24, class: 'orr-core orr-faint', 'stroke-width': 1, fill: 'rgb(5 7 10 / .38)' }));
      const cdBloom = svg('path', { d: arcD(0, 0, 27.5, 0, 360), class: 'orr-bloom orr-phos', 'stroke-width': 5, pathLength: 1, 'stroke-dasharray': '0 1', 'stroke-linecap': 'butt' });
      const cd = svg('path', { d: arcD(0, 0, 27.5, 0, 360), class: 'orr-core orr-phos', 'stroke-width': 2, pathLength: 1, 'stroke-dasharray': '0 1', 'stroke-linecap': 'butt' });
      const armedBloom = svg('circle', { r: 24, class: 'orr-bloom orr-hand', 'stroke-width': 7, fill: 'none', opacity: 0 });
      const armed = svg('circle', { r: 24, class: 'orr-core orr-hand', 'stroke-width': 1.6, fill: 'none', opacity: 0 });
      ks.append(cdBloom, cd, armedBloom, armed);
      key.appendChild(ks);
      const icon = el('span', 'orr-ordnance__icon');
      icon.style.setProperty('--orr-icon', `url("${ICON_ROOT}icon-${slot.icon}.svg")`);
      key.appendChild(icon);
      key.appendChild(el('span', 'orr-label orr-ordnance__hint', slot.key));
      key.appendChild(el('span', 'orr-label orr-ordnance__name', slot.name));
      const countEl = el('span', 'orr-ordnance__count');
      key.appendChild(countEl);
      root.appendChild(key);
      const paint = (v) => {
        const d = `${Math.max(0, Math.min(1, v))} 1`;
        cd.setAttribute('stroke-dasharray', d);
        cdBloom.setAttribute('stroke-dasharray', d);
      };
      const spring = createSpring({ value: 0, preset: 'settle', onUpdate: paint });
      keys.push({ slot, key, armed, armedBloom, spring, countEl, state: null });
      if (si < group.slots.length - 1) x += pitch;
    });
    const gEnd = x;
    // group legend above the group, following the orbit's slope
    const gx = (gStart + gEnd) / 2;
    const gy = yAt(gx) - 58;
    const legend = svg('text', { x: gx, y: gy, 'text-anchor': 'middle', class: 'orr-ordnance__group', transform: `rotate(${tangentDeg(gx).toFixed(2)} ${gx} ${gy})` });
    legend.textContent = group.name.toUpperCase();
    rail.appendChild(legend);
    // a short bracket of light under the legend spanning the group
    const bx0 = gStart - 22;
    const bx1 = gEnd + 22;
    rail.appendChild(svg('path', { d: `M ${bx0} ${yAt(bx0) - 50} A ${RADIUS} ${RADIUS} 0 0 0 ${bx1} ${yAt(bx1) - 50}`, class: 'orr-core orr-rest', 'stroke-width': 1 }));
    for (const bx of [bx0, bx1]) {
      rail.appendChild(svg('path', { d: `M ${bx} ${yAt(bx) - 50} L ${bx} ${yAt(bx) - 45}`, class: 'orr-core orr-rest', 'stroke-width': 1 }));
    }
    if (gi < groups.length - 1) x += groupGap + pitch;
  });

  function update(states = {}) {
    for (const k of keys) {
      const s = states[k.slot.key] || {};
      const state = s.state || 'ready';
      if (state !== k.state) {
        k.state = state;
        k.key.className = `orr-ordnance__key is-${state}`;
        const on = state === 'armed' ? '1' : '0';
        k.armed.setAttribute('opacity', on);
        k.armedBloom.setAttribute('opacity', on === '1' ? '.26' : '0');
      }
      const ready = state === 'cooldown' ? Math.max(0, Math.min(1, Number(s.cooldown) || 0)) : (state === 'empty' || state === 'locked' ? 0 : 1);
      k.spring.set(ready);
      k.countEl.textContent = Number.isFinite(s.count) ? `×${s.count}` : '';
    }
  }

  function arrive() {
    root.classList.add('is-arriving');
    setTimeout(() => root.classList.remove('is-arriving'), 1200);
  }

  return { el: root, update, arrive, dispose() { for (const k of keys) k.spring.stop(); } };
}

export { polar };
