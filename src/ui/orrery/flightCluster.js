// ORRERY flight Cluster v2 (design/frontend/ORRERY.md §6 Flight) — ONE instrument, one pivot.
//
// Everything in the bottom-left radiates from a single centre, like an orrery:
//   · the hull's own plan view, as instrument light, at the pivot;
//   · the ring stack — shield (segmented), armour (hairline), hull — with a legend in the bottom gap
//     so each arc is named by its own swatch;
//   · energy and heat as arcs on the left flank, each read at its arc's end;
//   · speed as a curved Scale on the right flank (floating cursor, reference tick) beside the huge
//     thin numeral, boost as a labelled charge arc inside it;
//   · the heading track over the nose, with a velocity pip showing where the ship is really going;
//   · the ordnance ORBIT: the four groups as glyph nodes on a large concentric arc; the armed group
//     unfolds its keys further out, and the Hand — a hairline orrery arm with a counterweight —
//     swings from the pivot to the armed key;
//   · the tether: when a mass is on the line, a beam leaves the hull for a payload glyph with a
//     strain arc and a rolling mass counter.
// (Critic pass 1, 2026-09-23: 6.5/10 — "three detached islands", a carried-over web list, amber on
// nine things. This is the structural answer.)
import { svg, arcD, polar, circularText } from './svg.js';
import { arcGauge, orbitRing, ring } from './instruments.js';
import { createSpring } from './motion.js';
import { createCounter } from './text.js';
import { hullPosterUrl } from '../hullPosters.js';

const STYLE_ID = 'sf-orrery-cluster-style';
const ICON_ROOT = new URL('../../../assets/ui/kit/icons/48/', import.meta.url).href;

// viewBox 760 x 440; the pivot
const W = 760;
const H = 520;
const P = Object.freeze({ x: 250, y: 330 });
const R = Object.freeze({
  hull: 104, armor: 113, shield: 123, orbit: 145, heading: 154, flank: 164, speed: 176,
  groups: 220, unfold: 286,
});
const GAUGE_FROM = 225;
const GAUGE_TO = 495;
const SPEED_FROM = 146;  // zero, low on the right flank
const SPEED_TO = 34;     // full, high on the right flank

const CSS = `
.orr-cluster { position:relative; width:${W}px; height:${H}px; pointer-events:none; color:var(--dp-ink, #e8e2d4);
  transform-origin:0 100%; transform:scale(var(--orr-cluster-scale, 1)); }
.orr-cluster > svg { position:absolute; left:0; top:0; width:${W}px; height:${H}px; overflow:visible; }
.orr-cluster__id { position:absolute; left:216px; top:16px; display:flex; flex-direction:column; gap:5px; }
.orr-cluster__name { font-size:15px; letter-spacing:.06em; }
.orr-cluster__legend { position:absolute; left:${P.x - 62}px; top:${P.y + 80}px; width:124px; display:grid; grid-template-columns:16px auto 1fr; column-gap:7px; row-gap:4px; align-items:center; }
.orr-cluster__legend svg { width:16px; height:8px; overflow:visible; }
.orr-cluster__legend b { font-family:var(--dp-face-numeral); font-weight:520; font-size:13px; color:var(--dp-phos, #dfeeff); font-variant-numeric:tabular-nums; text-align:right; }
.orr-cluster__legend b.is-hull { font-weight:300; font-size:26px; line-height:.9; }
.orr-cluster__legend b.is-hull i { font-style:normal; font-size:12px; font-weight:500; color:var(--dp-ink-dim, #b7b4a6); margin-left:1px; }
.orr-cluster__legend .orr-label { font-size:10px; }
.orr-cluster__legend .is-critical, .orr-cluster__legend .is-critical i { color:var(--dp-danger, #ff5038); }
.orr-cluster__read { position:absolute; display:flex; flex-direction:column; gap:3px; }
.orr-cluster__read .orr-value { font-size:15px; }
.orr-cluster__speed { position:absolute; left:6px; top:2px; display:flex; flex-direction:column; gap:7px; }
.orr-cluster__speed .orr-numeral { font-size:106px; font-weight:250; line-height:.8; }
.orr-cluster__speedfoot { display:flex; gap:12px; align-items:baseline; }
.orr-cluster__speedfoot b { font-family:var(--dp-face-numeral); font-weight:520; font-size:12px; color:var(--dp-ink, #e8e2d4); margin-left:4px; letter-spacing:.02em; }
.orr-cluster__key { position:absolute; width:56px; height:56px; margin:-28px 0 0 -28px; }
.orr-cluster__key svg { position:absolute; inset:0; width:56px; height:56px; overflow:visible; }
.orr-cluster__icon { position:absolute; left:50%; top:50%; width:22px; height:22px; margin:-11px 0 0 -11px; background:currentColor;
  -webkit-mask:var(--orr-icon) center / contain no-repeat; mask:var(--orr-icon) center / contain no-repeat; color:var(--dp-ink, #e8e2d4); opacity:.88; }
.orr-cluster__key.is-open .orr-cluster__keytag { display:none; }
.orr-cluster__key.is-node .orr-cluster__icon { width:18px; height:18px; margin:-9px 0 0 -9px; opacity:.72; }
.orr-cluster__key.is-armed .orr-cluster__icon { color:var(--dp-hand-hot, #ffd98c); opacity:1; }
.orr-cluster__key.is-spent .orr-cluster__icon { opacity:.42; }
.orr-cluster__key.is-locked .orr-cluster__icon { opacity:.26; }
.orr-cluster__keytag { position:absolute; left:44px; top:50%; transform:translateY(-50%); display:flex; flex-direction:column; gap:3px; white-space:nowrap; }
.orr-cluster__keytag .orr-label { font-size:10px; }
.orr-cluster__keytag .orr-label + .orr-label { color:var(--dp-ink-dim, #b7b4a6); opacity:.9; letter-spacing:.08em; }
.orr-cluster__key.is-armed .orr-cluster__keytag .orr-label:first-child { color:var(--dp-hand, #f2b950); }
.orr-cluster__key.is-locked .orr-cluster__keytag .orr-label:last-child::after { content:" · locked"; }
.orr-cluster__key.is-spent .orr-cluster__keytag .orr-label:last-child::after { content:" · cooling"; }
.orr-cluster__count { position:absolute; right:-2px; bottom:-2px; font-family:var(--dp-face-numeral); font-weight:600; font-size:10px; color:var(--dp-phos, #dfeeff); }
.orr-cluster__payload { position:absolute; display:flex; flex-direction:column; gap:3px; white-space:nowrap; }
.orr-cluster__payload .orr-counter, .orr-cluster__payload b { font-family:var(--dp-face-numeral); font-weight:360; font-size:20px; color:var(--dp-phos, #dfeeff); }
.orr-cluster__beam { stroke-dasharray:2 7; animation:orr-beam 1.1s linear infinite; }
@keyframes orr-beam { to { stroke-dashoffset:-18; } }
.orr-cluster__glyph { transform-box:fill-box; transform-origin:center; }
.orr-cluster.is-arriving .orr-cluster__glyph { animation:orr-glyph-in 900ms var(--dp-ease-out) both; }
@keyframes orr-glyph-in { from { opacity:0; transform:scale(.92); } to { opacity:1; transform:none; } }
.orr-cluster.is-arriving .orr-cluster__fade { animation:orr-rise 460ms var(--dp-ease-out) both; animation-delay:var(--orr-delay, 0ms); }
html.sf-reduce-motion .orr-cluster *, html.sf-reduce-motion .orr-cluster__beam { animation:none !important; }
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
const at = (r, deg) => polar(P.x, P.y, r, deg);
const place = (node, x, y) => { node.style.left = `${x}px`; node.style.top = `${y}px`; };

/**
 * @param {object} o
 * @param {{name:string, icon:string, slots:{key:string,name:string,icon:string}[]}[]} o.groups
 */
export function createFlightCluster({ shipId = 'ship_kestrel', name = 'Hitch', classLine = 'Kestrel class · starter', groups = [] } = {}) {
  injectStyle();
  const root = el('section', 'orr-cluster');
  root.setAttribute('aria-label', 'Ship status');
  const s = svg('svg', { class: 'orr-svg', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  root.appendChild(s);

  // ---- orbit, heading, drift ------------------------------------------------------------------
  const orbit = orbitRing({ cx: P.x, cy: P.y, r: R.orbit, count: 120, major: 10, len: 3, majorLen: 8, tone: 'faint', drift: 1500 });
  orbit.rotor.classList.add('orr-spin-in');
  s.appendChild(orbit.el);
  s.appendChild(ring({ cx: P.x, cy: P.y, r: R.heading, from: -46, to: 46, tone: 'faint', width: 1, draw: true, delay: 80 }));
  const [hx, hy] = at(R.heading, 0);
  s.appendChild(svg('path', { d: `M ${hx - 5} ${hy - 8} L ${hx} ${hy - 1} L ${hx + 5} ${hy - 8}`, class: 'orr-core orr-hi', 'stroke-width': 1.2, fill: 'none' }));
  const driftPip = svg('g');
  driftPip.append(
    svg('circle', { cx: hx, cy: hy, r: 4.5, class: 'orr-core orr-phos', 'stroke-width': 1.3, fill: 'none' }),
    svg('path', { d: `M ${hx} ${hy - 4.5} L ${hx} ${hy - 9} M ${hx - 4.5} ${hy} L ${hx - 8} ${hy} M ${hx + 4.5} ${hy} L ${hx + 8} ${hy}`, class: 'orr-core orr-phos', 'stroke-width': 1.2 }),
  );
  s.appendChild(driftPip);
  s.appendChild(circularText(P.x, P.y, R.orbit + 7, `${String(name).toUpperCase()} · ${String(classLine).toUpperCase()}`, { startDeg: 212, size: 6.5, className: 'orr-micro' }));

  // ---- the ring stack ----------------------------------------------------------------------------
  const shield = arcGauge({ cx: P.x, cy: P.y, r: R.shield, from: GAUGE_FROM, to: GAUGE_TO, width: 3.2, tone: 'phos', segments: 18, segmentGap: 2.4 });
  const armor = arcGauge({ cx: P.x, cy: P.y, r: R.armor, from: GAUGE_FROM, to: GAUGE_TO, width: 1.6, tone: 'hi', head: false });
  const hull = arcGauge({ cx: P.x, cy: P.y, r: R.hull, from: GAUGE_FROM, to: GAUGE_TO, width: 3, tone: 'phos' });
  s.append(shield.el, armor.el, hull.el);
  for (const a of [GAUGE_FROM, GAUGE_TO]) {
    const [x0, y0] = at(R.hull - 7, a);
    const [x1, y1] = at(R.shield + 7, a);
    s.appendChild(svg('path', { d: `M ${x0} ${y0} L ${x1} ${y1}`, class: 'orr-core orr-rest', 'stroke-width': 1 }));
  }

  // ---- left flank: energy (upper) and heat (lower) ------------------------------------------------
  const energy = arcGauge({ cx: P.x, cy: P.y, r: R.flank, from: 252, to: 306, width: 3, tone: 'phos', ghost: false });
  const heat = arcGauge({ cx: P.x, cy: P.y, r: R.flank, from: 204, to: 246, width: 3, tone: 'hi', ghost: false });
  s.append(energy.el, heat.el);
  const energyRead = el('div', 'orr-cluster__read orr-cluster__fade');
  const energyVal = el('b', 'orr-value');
  energyRead.append(el('span', 'orr-label', 'Energy'), energyVal);
  const [ex, ey] = at(R.flank + 16, 306);
  place(energyRead, ex - 62, ey - 30);
  const heatRead = el('div', 'orr-cluster__read orr-cluster__fade');
  const heatVal = el('b', 'orr-value');
  heatRead.append(el('span', 'orr-label', 'Heat'), heatVal);
  const [tx, ty] = at(R.flank + 16, 204);
  place(heatRead, tx - 56, ty - 6);

  // ---- right flank: speed Scale on an arc, boost inside it ---------------------------------------
  s.appendChild(svg('path', { d: arcD(P.x, P.y, R.speed, SPEED_TO, SPEED_FROM), class: 'orr-core orr-faint', 'stroke-width': 1 }));
  const tickParts = [];
  for (let i = 0; i <= 22; i += 1) {
    const a = SPEED_FROM + (SPEED_TO - SPEED_FROM) * (i / 22);
    const [x0, y0] = at(R.speed + 2, a);
    const [x1, y1] = at(R.speed + (i % 5 === 0 ? 9 : 5), a);
    tickParts.push(`M ${x0} ${y0} L ${x1} ${y1}`);
  }
  s.appendChild(svg('path', { d: tickParts.join(' '), class: 'orr-core orr-rest', 'stroke-width': 1 }));
  const speedArc = arcGauge({ cx: P.x, cy: P.y, r: R.speed, from: SPEED_FROM, to: SPEED_TO, width: 2.4, tone: 'phos', track: 'faint', ghost: false, head: false });
  s.appendChild(speedArc.el);
  const speedCursor = svg('path', { d: '', class: 'orr-core orr-phos', 'stroke-width': 1.6, fill: 'none', 'stroke-linejoin': 'miter' });
  s.appendChild(speedCursor);
  const refTick = svg('path', { d: '', class: 'orr-core orr-hi', 'stroke-width': 1.6 });
  s.appendChild(refTick);
  const refText = svg('text', { 'font-size': 9 });
  s.appendChild(refText);
  const boost = arcGauge({ cx: P.x, cy: P.y, r: R.flank, from: SPEED_FROM, to: SPEED_TO, width: 1.8, tone: 'phos', track: 'faint', ghost: false, head: false });
  s.appendChild(boost.el);
  const [bx, by] = at(R.flank + 2, SPEED_FROM + 7);
  const boostText = svg('text', { x: bx + 4, y: by + 10, 'font-size': 8, 'text-anchor': 'start' });
  boostText.textContent = 'BOOST';
  s.appendChild(boostText);

  const speedBlock = el('div', 'orr-cluster__speed orr-cluster__fade');
  const speedVal = el('b', 'orr-numeral');
  const speedFoot = el('div', 'orr-cluster__speedfoot');
  const refVal = el('b');
  const refLab = el('span', 'orr-label', 'Ref');
  refLab.appendChild(refVal);
  speedFoot.append(el('span', 'orr-label', 'Speed · wu/s'), refLab);
  speedBlock.append(speedVal, speedFoot);

  // ---- the hull at the pivot ----------------------------------------------------------------------
  const glyphUrl = hullPosterUrl(shipId, 'holo');
  if (glyphUrl) s.appendChild(svg('image', { class: 'orr-cluster__glyph', href: glyphUrl, x: P.x - 82, y: P.y - 96, width: 164, height: 164, preserveAspectRatio: 'xMidYMid meet' }));

  // ---- legend in the gap ---------------------------------------------------------------------------
  const legend = el('div', 'orr-cluster__legend orr-cluster__fade');
  const swatch = (kind) => {
    const sw = svg('svg', { viewBox: '0 0 16 8', class: 'orr-svg' });
    if (kind === 'shield') sw.appendChild(svg('path', { d: 'M 0 4 L 4 4 M 6 4 L 10 4 M 12 4 L 16 4', class: 'orr-core orr-phos', 'stroke-width': 3, 'stroke-linecap': 'butt' }));
    else if (kind === 'armor') sw.appendChild(svg('path', { d: 'M 0 4 L 16 4', class: 'orr-core orr-hi', 'stroke-width': 1.6 }));
    else sw.appendChild(svg('path', { d: 'M 0 4 L 16 4', class: 'orr-core orr-phos', 'stroke-width': 3, 'stroke-linecap': 'butt' }));
    return sw;
  };
  const legendRow = (kind, label) => {
    const val = el('b');
    const lab = el('span', 'orr-label', label);
    legend.append(swatch(kind), val, lab);
    return { val, lab };
  };
  const hullRow = legendRow('hull', 'Hull');
  hullRow.val.classList.add('is-hull');
  const shieldRow = legendRow('shield', 'Shield');
  const armorRow = legendRow('armor', 'Armor');

  // ---- the ordnance orbit + the Hand ----------------------------------------------------------------
  s.appendChild(svg('path', { d: arcD(P.x, P.y, R.groups, 36, 136), class: 'orr-core orr-faint', 'stroke-width': 1 }));
  const handArm = svg('g', { class: 'orr-cluster__hand' });
  const handLine = svg('path', { d: '', class: 'orr-core orr-hand', 'stroke-width': 1.2 });
  const handBloom = svg('path', { d: '', class: 'orr-bloom orr-hand', 'stroke-width': 5 });
  const handWeight = svg('circle', { r: 4, fill: 'var(--dp-hand, #f2b950)' });
  const handPivot = svg('circle', { cx: P.x, cy: P.y, r: 3.4, fill: 'none', class: 'orr-core orr-hand', 'stroke-width': 1.3 });
  handArm.append(handBloom, handLine, handWeight, handPivot);
  const handSpring = createSpring({ value: 70, preset: 'swing', onUpdate: (deg) => {
    const [x0, y0] = at(-34, deg);
    const [x1, y1] = at(R.unfold - 31, deg);
    const d = `M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    handLine.setAttribute('d', d);
    handBloom.setAttribute('d', d);
    handWeight.setAttribute('cx', x0.toFixed(1));
    handWeight.setAttribute('cy', y0.toFixed(1));
  } });
  const keyLayer = el('div');
  root.append(keyLayer);

  const groupAngles = [46, 72, 98, 124];
  const nodes = [];
  const keys = [];
  const mkSocket = (x, y, { icon, node = false, label = '', sub = '' }) => {
    const k = el('div', `orr-cluster__key${node ? ' is-node' : ''}`);
    place(k, x, y);
    const ks = svg('svg', { viewBox: '-28 -28 56 56', class: 'orr-svg' });
    const r0 = node ? 17 : 22;
    ks.appendChild(svg('circle', { r: r0, class: 'orr-core orr-faint', 'stroke-width': 1, fill: 'rgb(5 7 10 / .42)' }));
    const cdB = svg('path', { d: arcD(0, 0, r0 + 3.5, 0, 359.99), class: 'orr-bloom orr-phos', 'stroke-width': 4, pathLength: 1, 'stroke-dasharray': '0 1', 'stroke-linecap': 'butt' });
    const cd = svg('path', { d: arcD(0, 0, r0 + 3.5, 0, 359.99), class: 'orr-core orr-phos', 'stroke-width': node ? 1.4 : 1.8, pathLength: 1, 'stroke-dasharray': '0 1', 'stroke-linecap': 'butt' });
    const armedB = svg('circle', { r: r0, class: 'orr-bloom orr-hand', 'stroke-width': 7, fill: 'none', opacity: 0 });
    const armed = svg('circle', { r: r0, class: 'orr-core orr-hand', 'stroke-width': 1.6, fill: 'none', opacity: 0 });
    ks.append(cdB, cd, armedB, armed);
    k.appendChild(ks);
    const ic = el('span', 'orr-cluster__icon');
    ic.style.setProperty('--orr-icon', `url("${ICON_ROOT}icon-${icon}.svg")`);
    k.appendChild(ic);
    const tag = el('div', 'orr-cluster__keytag');
    tag.append(el('span', 'orr-label', label), el('span', 'orr-label', sub));
    k.appendChild(tag);
    const count = el('span', 'orr-cluster__count');
    k.appendChild(count);
    keyLayer.appendChild(k);
    const spring = createSpring({ value: 0, preset: 'settle', onUpdate: (v) => { const d = `${Math.max(0, Math.min(1, v))} 1`; cd.setAttribute('stroke-dasharray', d); cdB.setAttribute('stroke-dasharray', d); } });
    return { el: k, armed, armedB, spring, count, tag };
  };
  groups.forEach((group, gi) => {
    const a = groupAngles[gi] ?? (46 + gi * 26);
    const [nx, ny] = at(R.groups, a);
    const node = mkSocket(nx, ny, { icon: group.icon, node: true, label: group.name, sub: group.slots.map((sl) => sl.key).join(' · ') });
    nodes.push({ group, angle: a, node });
  });
  const unfoldLayer = svg('g');
  s.appendChild(unfoldLayer);
  s.appendChild(handArm);

  // ---- the tether ------------------------------------------------------------------------------------
  const tetherG = svg('g', { opacity: 0 });
  const [px, py] = at(232, 8);
  const [bx0, by0] = at(R.heading + 10, 8);
  tetherG.append(
    svg('path', { d: `M ${bx0} ${by0} L ${px} ${py}`, class: 'orr-core orr-phos orr-cluster__beam', 'stroke-width': 1.4 }),
    svg('circle', { cx: px, cy: py, r: 11, class: 'orr-core orr-phos', 'stroke-width': 1.4, fill: 'rgb(5 7 10 / .5)' }),
    svg('circle', { cx: px, cy: py, r: 3.2, fill: 'var(--dp-phos, #dfeeff)' }),
  );
  const strain = arcGauge({ cx: px, cy: py, r: 17, from: -120, to: 120, width: 2, tone: 'phos', ghost: false, head: false });
  tetherG.appendChild(strain.el);
  s.appendChild(tetherG);
  const payload = el('div', 'orr-cluster__payload orr-cluster__fade');
  const massEl = el('span');
  payload.append(el('span', 'orr-label', 'Payload · on the line'), massEl);
  place(payload, px - 58, py + 20);
  payload.style.alignItems = 'center';
  payload.style.width = '116px';
  payload.style.opacity = '0';
  const massCounter = createCounter(massEl, { format: (n) => `${Math.round(n)} T` });

  root.append(energyRead, heatRead, speedBlock, legend, payload);

  // ---- update --------------------------------------------------------------------------------------
  const last = {};
  const changed = (k, v) => { if (last[k] === v) return false; last[k] = v; return true; };
  let unfolded = -1;

  function unfold(groupIndex) {
    unfoldLayer.textContent = '';
    for (const k of keys) { k.spring.stop(); k.el.remove(); }
    keys.length = 0;
    const n = nodes[groupIndex];
    if (!n) return;
    const slots = n.group.slots;
    const spread = 11;
    const start = n.angle - ((slots.length - 1) * spread) / 2;
    slots.forEach((slot, i) => {
      const a = start + i * spread;
      const [kx, ky] = at(R.unfold, a);
      const [lx0, ly0] = at(R.groups + 20, n.angle);
      const [lx1, ly1] = at(R.unfold - 25, a);
      unfoldLayer.appendChild(svg('path', { d: `M ${lx0} ${ly0} L ${lx1} ${ly1}`, class: 'orr-core orr-rest', 'stroke-width': 1 }));
      const k = mkSocket(kx, ky, { icon: slot.icon, label: slot.name, sub: `Key ${slot.key}` });
      keys.push({ ...k, slot, angle: a });
    });
  }

  function update(d = {}) {
    const frac = (v, m) => (Number(m) > 0 ? Math.max(0, Math.min(1, Number(v) / Number(m))) : 0);
    const hullF = frac(d.hull, d.hullMax);
    if (changed('hull', Math.round(hullF * 1000))) {
      hull.set(hullF);
      hull.setTone(hullF < 0.3 ? 'threat' : 'phos');
      hullRow.val.innerHTML = `${Math.round(hullF * 100)}<i>%</i>`;
      hullRow.val.classList.toggle('is-critical', hullF < 0.3);
      hullRow.lab.classList.toggle('is-critical', hullF < 0.3);
    }
    const shieldF = frac(d.shield, d.shieldMax);
    if (changed('shield', Math.round(shieldF * 1000))) { shield.set(shieldF); shieldRow.val.textContent = String(Math.round(shieldF * 100)); }
    const armorF = frac(d.armor, d.armorMax);
    if (changed('armor', Math.round(armorF * 1000))) { armor.set(armorF); armorRow.val.textContent = String(Math.round(Number(d.armor) || 0)); }
    const energyF = frac(d.energy, d.energyMax);
    if (changed('energy', Math.round(energyF * 1000))) { energy.set(energyF); energyVal.textContent = String(Math.round(Number(d.energy) || 0)); }
    const heatF = Math.max(0, Math.min(1, Number(d.heat) || 0));
    if (changed('heat', Math.round(heatF * 1000))) { heat.set(heatF); heat.setTone(heatF > 0.75 ? 'threat' : 'hi'); heatVal.textContent = `${Math.round(heatF * 100)}%`; }
    const ref = Number(d.speedRef) || 180;
    const max = Number(d.speedMax) || ref * 1.25;
    const speed = Math.max(0, Number(d.speed) || 0);
    if (changed('speed', Math.round(speed))) {
      speedVal.textContent = String(Math.round(speed));
      const f = Math.min(1, speed / max);
      speedArc.set(f);
      const a = SPEED_FROM + (SPEED_TO - SPEED_FROM) * f;
      const [c0x, c0y] = at(R.speed - 11, a - 3.2);
      const [c1x, c1y] = at(R.speed - 3, a);
      const [c2x, c2y] = at(R.speed - 11, a + 3.2);
      speedCursor.setAttribute('d', `M ${c0x} ${c0y} L ${c1x} ${c1y} L ${c2x} ${c2y}`);
    }
    if (changed('ref', ref)) {
      refVal.textContent = String(Math.round(ref));
      const a = SPEED_FROM + (SPEED_TO - SPEED_FROM) * Math.min(1, ref / max);
      const [r0x, r0y] = at(R.speed - 4, a);
      const [r1x, r1y] = at(R.speed + 13, a);
      refTick.setAttribute('d', `M ${r0x} ${r0y} L ${r1x} ${r1y}`);
      const [lx, ly] = at(R.speed + 17, a);
      refText.setAttribute('x', lx.toFixed(1));
      refText.setAttribute('y', (ly + 3).toFixed(1));
      refText.textContent = 'REF';
    }
    if (changed('boost', Math.round((Number(d.boost) || 0) * 100))) boost.set(Number(d.boost) || 0);
    if (Number.isFinite(d.drift) && changed('drift', Math.round(d.drift))) {
      const deg = Math.max(-46, Math.min(46, d.drift));
      driftPip.setAttribute('transform', `rotate(${deg} ${P.x} ${P.y})`);
    }
    // ordnance: the armed group unfolds; the Hand swings to the armed key
    const slotStates = d.ordnance || {};
    let armedGroup = 0;
    nodes.forEach((n, gi) => { if (n.group.slots.some((sl) => (slotStates[sl.key] || {}).state === 'armed')) armedGroup = gi; });
    if (armedGroup !== unfolded) { unfolded = armedGroup; unfold(armedGroup); }
    nodes.forEach((n, gi) => {
      const readiness = n.group.slots.reduce((m, sl) => {
        const st = slotStates[sl.key] || {};
        return Math.min(m, st.state === 'cooldown' ? Number(st.cooldown) || 0 : 1);
      }, 1);
      n.node.spring.set(readiness);
      n.node.el.style.opacity = gi === armedGroup ? '1' : '0.86';
      n.node.el.classList.toggle('is-open', gi === armedGroup);
    });
    let armedAngle = null;
    for (const k of keys) {
      const st = slotStates[k.slot.key] || {};
      const state = st.state || 'ready';
      k.el.className = `orr-cluster__key is-${state === 'cooldown' ? 'spent' : state}`;
      const on = state === 'armed' ? '1' : '0';
      k.armed.setAttribute('opacity', on);
      k.armedB.setAttribute('opacity', on);
      k.spring.set(state === 'cooldown' ? Number(st.cooldown) || 0 : (state === 'locked' ? 0 : 1));
      k.count.textContent = Number.isFinite(st.count) ? `×${st.count}` : '';
      if (state === 'armed') armedAngle = k.angle;
    }
    if (armedAngle != null) handSpring.set(armedAngle);
    // tether
    const t = d.tether || null;
    const tethered = !!(t && t.state && t.state !== 'Idle' && Number(t.mass) > 0);
    if (changed('tethered', tethered)) { tetherG.setAttribute('opacity', tethered ? '1' : '0'); payload.style.opacity = tethered ? '1' : '0'; }
    if (tethered) { massCounter.set(Number(t.mass)); strain.set(Number(t.strain) || 0); strain.setTone(Number(t.strain) > 0.85 ? 'threat' : 'phos'); }
  }

  function arrive() {
    root.classList.add('is-arriving');
    [energyRead, heatRead, speedBlock, legend, payload].forEach((node, i) => node.style.setProperty('--orr-delay', `${160 + i * 50}ms`));
    setTimeout(() => root.classList.remove('is-arriving'), 1400);
  }

  return {
    el: root,
    update,
    arrive,
    dispose() {
      for (const g of [shield, armor, hull, energy, heat, speedArc, boost, strain]) g.dispose();
      handSpring.stop();
      for (const n of nodes) n.node.spring.stop();
      for (const k of keys) k.spring.stop();
    },
  };
}

export const CLUSTER_GEOMETRY = Object.freeze({ W, H, P, R });
