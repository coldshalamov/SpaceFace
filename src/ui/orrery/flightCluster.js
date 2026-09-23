// ORRERY flight Cluster v3 (design/frontend/ORRERY.md §6 Flight) — ONE instrument, one pivot.
//
// Everything in the bottom-left radiates from a single centre, like an orrery:
//   · the hull's own plan view, as instrument light, at the pivot;
//   · the ring stack — shield (segmented), armour (hairline), hull — with a swatch legend in the gap;
//   · SPEED on the upper-left arc, a 1 px ticked Scale with a floating cursor and the reference tick,
//     directly under its huge thin numeral; BOOST a 3 px charge arc just inside it;
//   · energy and heat on the lower-left flank, each read at its arc end;
//   · the heading track over the nose with a velocity pip (where the ship is really going);
//   · the ORDNANCE CRESCENT wrapping the right side: collapsed groups as small nodes, the armed group
//     unfolded into full keys along the same radius, labels outside;
//   · the Hand: a hub at the pivot, a counterweight stub on the far ring edge, and the arm itself
//     drawn only OUTSIDE the rings, swinging to the armed key — it never crosses the hull art;
//   · the TETHER: when a mass is on the line, one continuous beam from the hull out through the rings
//     to the payload, a pulse travelling along it, a ticked 0-100 % strain dial, a rolling mass count.
// Critic passes: 6.5 (three islands, web list, amber everywhere) → 7.2 (Hand slashes the hull, keys
// zig-zag, speed 400 px from its scale, bronze donuts, tether too small) → this.
import { svg, arcD, polar, circularText, ticksD } from './svg.js';
import { arcGauge, orbitRing, ring } from './instruments.js';
import { createSpring } from './motion.js';
import { createCounter } from './text.js';
import { hullPosterUrl } from '../hullPosters.js';

const STYLE_ID = 'sf-orrery-cluster-style';
const ICON_ROOT = new URL('../../../assets/ui/kit/icons/48/', import.meta.url).href;

const W = 760;
const H = 540;
const P = Object.freeze({ x: 250, y: 350 });
const R = Object.freeze({
  hull: 104, armor: 113, shield: 123, orbit: 145, heading: 154, flank: 170, boost: 164, speed: 177,
  crescent: 262, payload: 318,
});
const GAUGE_FROM = 225;
const GAUGE_TO = 495;
const SPEED_FROM = 282;   // zero, on the left
const SPEED_TO = 350;     // full, up under the numeral
const KEY_R = 20;
const NODE_R = 14;
const STEP_KEY = 14;
const STEP_NODE = 12;
const CRESCENT_START = 34;

const CSS = `
.orr-cluster { position:relative; width:${W}px; height:${H}px; pointer-events:none; color:var(--dp-ink, #e8e2d4);
  transform-origin:0 100%; transform:scale(var(--orr-cluster-scale, 1)); }
.orr-cluster > svg { position:absolute; left:0; top:0; width:${W}px; height:${H}px; overflow:visible; }
/* free type over a live world needs a soft, edge-less shadow — never a box */
.orr-cluster .orr-soft::before { content:""; position:absolute; inset:-18px -26px; z-index:-1; pointer-events:none;
  background:radial-gradient(closest-side, rgb(3 4 7 / .72), rgb(3 4 7 / .38) 55%, transparent); }
.orr-cluster__legend { position:absolute; left:${P.x - 62}px; top:${P.y + 68}px; width:124px; display:grid; grid-template-columns:16px auto 1fr; column-gap:7px; row-gap:4px; align-items:center; }
.orr-cluster__legend svg { width:16px; height:8px; overflow:visible; }
.orr-cluster__legend b { font-family:var(--dp-face-numeral); font-weight:520; font-size:13px; color:var(--dp-phos, #dfeeff); font-variant-numeric:tabular-nums; text-align:right; }
.orr-cluster__legend b.is-hull { font-weight:300; font-size:26px; line-height:.9; }
.orr-cluster__legend b.is-hull i { font-style:normal; font-size:12px; font-weight:500; color:var(--dp-ink-dim, #b7b4a6); margin-left:1px; }
.orr-cluster__legend .orr-label { font-size:10px; }
.orr-cluster__legend .is-critical, .orr-cluster__legend .is-critical i { color:var(--dp-danger, #ff5038); }
.orr-cluster__read { position:absolute; display:flex; flex-direction:column; gap:3px; }
.orr-cluster__read .orr-value { font-size:15px; }
.orr-cluster__speed { position:absolute; left:22px; top:18px; display:flex; flex-direction:column; gap:8px; }
.orr-cluster__speed .orr-numeral { font-size:104px; font-weight:250; line-height:.8; text-shadow:0 0 18px rgb(0 0 0 / .55); }
.orr-cluster__speedfoot { display:flex; gap:12px; align-items:baseline; }
.orr-cluster__speedfoot b { font-family:var(--dp-face-numeral); font-weight:520; font-size:12px; color:var(--dp-ink, #e8e2d4); margin-left:4px; letter-spacing:.02em; }
.orr-cluster__key { position:absolute; width:48px; height:48px; margin:-24px 0 0 -24px; }
.orr-cluster__key svg { position:absolute; inset:0; width:48px; height:48px; overflow:visible; }
.orr-cluster__icon { position:absolute; left:50%; top:50%; width:20px; height:20px; margin:-10px 0 0 -10px; background:currentColor;
  -webkit-mask:var(--orr-icon) center / contain no-repeat; mask:var(--orr-icon) center / contain no-repeat; color:var(--dp-ink, #e8e2d4); opacity:.9; }
.orr-cluster__key.is-node .orr-cluster__icon { width:14px; height:14px; margin:-7px 0 0 -7px; opacity:.66; }
.orr-cluster__key.is-armed .orr-cluster__icon { color:var(--dp-hand-hot, #ffd98c); opacity:1; }
.orr-cluster__key.is-cooldown .orr-cluster__icon { opacity:.5; }
.orr-cluster__key.is-locked .orr-cluster__icon, .orr-cluster__key.is-empty .orr-cluster__icon { opacity:.24; }
.orr-cluster__keytag { position:absolute; top:50%; transform:translateY(-50%); white-space:nowrap; font-size:10px; }
.orr-cluster__key:not(.is-node) .orr-cluster__keytag { left:${24 + KEY_R + 10}px; }
.orr-cluster__key.is-node .orr-cluster__keytag { left:${24 + NODE_R + 9}px; color:var(--dp-ink-dim, #b7b4a6); }
.orr-cluster__keytag b { font-weight:700; color:var(--dp-ink, #e8e2d4); margin-left:6px; letter-spacing:.08em; }
.orr-cluster__key.is-armed .orr-cluster__keytag { color:var(--dp-hand, #f2b950); }
.orr-cluster__key.is-armed .orr-cluster__keytag b { color:var(--dp-hand-hot, #ffd98c); }
.orr-cluster__key.is-locked .orr-cluster__keytag, .orr-cluster__key.is-empty .orr-cluster__keytag { opacity:.55; }
.orr-cluster__count { position:absolute; left:50%; top:50%; transform:translate(17px, 11px); font-family:var(--dp-face-numeral); font-weight:700; font-size:9px; color:var(--dp-phos, #dfeeff); }
.orr-cluster__payload { position:absolute; display:flex; flex-direction:column; gap:3px; white-space:nowrap; }
.orr-cluster__payload .orr-counter { font-family:var(--dp-face-numeral); font-weight:320; font-size:26px; color:var(--dp-phos, #dfeeff); }
.orr-cluster__payload small { font-family:var(--dp-face-label); font-stretch:112%; font-weight:600; font-size:11px; letter-spacing:.12em; color:var(--dp-ink-dim, #b7b4a6); }
.orr-cluster__beam { stroke-dasharray:1 5; }
.orr-cluster__pulse { stroke-dasharray:14 400; animation:orr-pulse 1.6s linear infinite; }
@keyframes orr-pulse { from { stroke-dashoffset:14; } to { stroke-dashoffset:-400; } }
.orr-cluster__glyph { transform-box:fill-box; transform-origin:center; }
.orr-cluster.is-arriving .orr-cluster__glyph { animation:orr-glyph-in 900ms var(--dp-ease-out) both; }
@keyframes orr-glyph-in { from { opacity:0; transform:scale(.92); } to { opacity:1; transform:none; } }
.orr-cluster.is-arriving .orr-cluster__fade, .orr-cluster.is-arriving .orr-cluster__key { animation:orr-rise 460ms var(--dp-ease-out) both; animation-delay:var(--orr-delay, 0ms); }
html.sf-reduce-motion .orr-cluster *, html.sf-reduce-motion .orr-cluster__pulse { animation:none !important; }
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
const f1 = (n) => n.toFixed(1);

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

  // ---- orbit, heading, drift, engraving -------------------------------------------------------
  const orbit = orbitRing({ cx: P.x, cy: P.y, r: R.orbit, count: 90, major: 10, len: 3, majorLen: 8, tone: 'faint', from: 232, to: 488 });
  orbit.rotor.classList.add('orr-spin-in');
  s.appendChild(orbit.el);
  s.appendChild(ring({ cx: P.x, cy: P.y, r: R.heading, from: -40, to: 40, tone: 'faint', width: 1, draw: true, delay: 80 }));
  const [hx, hy] = at(R.heading, 0);
  s.appendChild(svg('path', { d: `M ${hx - 5} ${hy - 8} L ${hx} ${hy - 1} L ${hx + 5} ${hy - 8}`, class: 'orr-core orr-hi', 'stroke-width': 1.2, fill: 'none' }));
  const driftPip = svg('g');
  driftPip.append(
    svg('circle', { cx: hx, cy: hy, r: 4.5, class: 'orr-core orr-phos', 'stroke-width': 1.3, fill: 'none' }),
    svg('path', { d: `M ${hx} ${hy - 4.5} L ${hx} ${hy - 9} M ${hx - 4.5} ${hy} L ${hx - 8} ${hy} M ${hx + 4.5} ${hy} L ${hx + 8} ${hy}`, class: 'orr-core orr-phos', 'stroke-width': 1.2 }),
  );
  s.appendChild(driftPip);
  s.appendChild(circularText(P.x, P.y, R.orbit + 9, `${String(name).toUpperCase()} · ${String(classLine).toUpperCase()}`, { startDeg: 160, size: 6.5, className: 'orr-micro', upright: true }));

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

  // ---- the tether (drawn under the hull so the beam leaves from beneath the art) -----------------
  const TETHER_A = 16;
  const tetherG = svg('g', { opacity: 0 });
  const [tx0, ty0] = at(58, TETHER_A);
  const [tx1, ty1] = at(R.payload - 13, TETHER_A);
  const lineBase = svg('path', { d: '', class: 'orr-core orr-hi', 'stroke-width': 1.2 });
  const lineBloom = svg('path', { d: '', class: 'orr-bloom orr-phos', 'stroke-width': 4, opacity: '.14' });
  const linePulse = svg('path', { d: '', class: 'orr-core orr-ice orr-cluster__pulse', 'stroke-width': 2 });
  const setSag = (strainV) => {
    // a loaded line sags a little and straightens as the strain rises
    const sag = 26 * (1 - Math.max(0, Math.min(1, strainV)));
    const mx = (tx0 + tx1) / 2;
    const my = (ty0 + ty1) / 2;
    const dx = tx1 - tx0;
    const dy = ty1 - ty0;
    const len = Math.hypot(dx, dy) || 1;
    const cx = mx - (dy / len) * sag;
    const cy = my + (dx / len) * sag;
    const d = `M ${f1(tx0)} ${f1(ty0)} Q ${f1(cx)} ${f1(cy)} ${f1(tx1)} ${f1(ty1)}`;
    for (const p of [lineBase, lineBloom, linePulse]) p.setAttribute('d', d);
  };
  setSag(0.5);
  tetherG.append(lineBloom, lineBase, linePulse,
    svg('circle', { cx: f1(tx0), cy: f1(ty0), r: 3.4, class: 'orr-core orr-hi', 'stroke-width': 1.2, fill: 'rgb(5 7 10 / .7)' }));
  const [px, py] = at(R.payload, TETHER_A);
  tetherG.appendChild(svg('path', { d: ticksD(px, py, 27, 10, { from: -130, to: 130, len: 3, major: 5, majorLen: 6, inward: false }), class: 'orr-core orr-rest', 'stroke-width': 1 }));
  const strain = arcGauge({ cx: px, cy: py, r: 22, from: -130, to: 130, width: 2.4, tone: 'phos', ghost: false, head: true });
  tetherG.appendChild(strain.el);
  tetherG.append(
    svg('circle', { cx: px, cy: py, r: 12, class: 'orr-core orr-hi', 'stroke-width': 1.2, fill: 'rgb(5 7 10 / .55)' }),
    svg('circle', { cx: px, cy: py, r: 4, fill: 'var(--dp-phos, #dfeeff)' }),
  );
  s.appendChild(tetherG);

  // ---- the hull at the pivot ----------------------------------------------------------------------
  const glyphUrl = hullPosterUrl(shipId, 'holo');
  if (glyphUrl) s.appendChild(svg('image', { class: 'orr-cluster__glyph', href: glyphUrl, x: P.x - 82, y: P.y - 96, width: 164, height: 164, preserveAspectRatio: 'xMidYMid meet' }));

  // ---- lower-left flank: heat (lower) and energy (upper) --------------------------------------------
  const heat = arcGauge({ cx: P.x, cy: P.y, r: R.flank, from: 198, to: 232, width: 3, tone: 'hi', ghost: false });
  const energy = arcGauge({ cx: P.x, cy: P.y, r: R.flank, from: 238, to: 274, width: 3, tone: 'phos', ghost: false });
  s.append(heat.el, energy.el);
  const energyRead = el('div', 'orr-cluster__read orr-cluster__fade orr-soft');
  const energyVal = el('b', 'orr-value');
  energyRead.append(el('span', 'orr-label', 'Energy'), energyVal);
  const [enx, eny] = at(R.flank + 12, 274);
  place(energyRead, 22, eny - 42);
  const heatRead = el('div', 'orr-cluster__read orr-cluster__fade orr-soft');
  const heatVal = el('b', 'orr-value');
  heatRead.append(el('span', 'orr-label', 'Heat'), heatVal);
  const [htx, hty] = at(R.flank + 12, 198);
  place(heatRead, htx - 70, hty - 14);

  // ---- upper-left: the speed Scale under its numeral, boost inside ------------------------------------
  s.appendChild(svg('path', { d: arcD(P.x, P.y, R.speed, SPEED_FROM, SPEED_TO), class: 'orr-core orr-faint', 'stroke-width': 1 }));
  const tickParts = [];
  for (let i = 0; i <= 20; i += 1) {
    const a = SPEED_FROM + (SPEED_TO - SPEED_FROM) * (i / 20);
    const [x0, y0] = at(R.speed + 2, a);
    const [x1, y1] = at(R.speed + (i % 5 === 0 ? 9 : 5), a);
    tickParts.push(`M ${f1(x0)} ${f1(y0)} L ${f1(x1)} ${f1(y1)}`);
  }
  s.appendChild(svg('path', { d: tickParts.join(' '), class: 'orr-core orr-rest', 'stroke-width': 1 }));
  const speedArc = arcGauge({ cx: P.x, cy: P.y, r: R.speed, from: SPEED_FROM, to: SPEED_TO, width: 1.6, tone: 'phos', track: 'faint', ghost: false, head: false });
  s.appendChild(speedArc.el);
  const speedCursor = svg('path', { d: '', class: 'orr-core orr-phos', 'stroke-width': 1.6, fill: 'none', 'stroke-linejoin': 'miter' });
  s.appendChild(speedCursor);
  const refTick = svg('path', { d: '', class: 'orr-core orr-hi', 'stroke-width': 1.6 });
  s.appendChild(refTick);
  const boost = arcGauge({ cx: P.x, cy: P.y, r: R.boost, from: SPEED_FROM, to: SPEED_TO, width: 3, tone: 'phos', track: 'faint', ghost: false, head: false });
  s.appendChild(boost.el);
  // boost is named by engraving along its own arc, so the label can never collide with a flank read
  s.appendChild(circularText(P.x, P.y, R.boost - 9, 'BOOST', { startDeg: 300, size: 6.5, className: 'orr-micro' }));

  const speedBlock = el('div', 'orr-cluster__speed orr-cluster__fade orr-soft');
  const speedVal = el('b', 'orr-numeral');
  const speedFoot = el('div', 'orr-cluster__speedfoot');
  const refVal = el('b');
  const refLab = el('span', 'orr-label', 'Ref');
  refLab.appendChild(refVal);
  speedFoot.append(el('span', 'orr-label', 'Speed · wu/s'), refLab);
  speedBlock.append(speedVal, speedFoot);

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

  // ---- the ordnance crescent + the Hand --------------------------------------------------------------
  const crescentTrack = svg('path', { d: '', class: 'orr-core orr-faint', 'stroke-width': 1 });
  s.appendChild(crescentTrack);
  const hand = svg('g');
  const armGhost = svg('path', { d: '', class: 'orr-core orr-hand', 'stroke-width': 1, opacity: '.16' });
  const armLine = svg('path', { d: '', class: 'orr-core orr-hand', 'stroke-width': 1.3 });
  const armBloom = svg('path', { d: '', class: 'orr-bloom orr-hand', 'stroke-width': 5 });
  const armPip = svg('circle', { r: 2.2, fill: 'var(--dp-hand, #f2b950)' });
  const weightDot = svg('circle', { r: 2.6, fill: 'var(--dp-hand, #f2b950)', opacity: '.34' });
  const hub = svg('circle', { cx: P.x, cy: P.y, r: 3.6, fill: 'none', class: 'orr-core orr-hand', 'stroke-width': 1.3 });
  hand.append(armGhost, armBloom, armLine, armPip, weightDot, hub);
  s.appendChild(hand);
  const handSpring = createSpring({ value: 40, preset: 'swing', onUpdate: (deg) => {
    const [a0x, a0y] = at(R.speed + 12, deg);
    const [a1x, a1y] = at(R.crescent - KEY_R - 5, deg);
    const [g0x, g0y] = at(-R.orbit + 12, deg);
    const d = `M ${f1(a0x)} ${f1(a0y)} L ${f1(a1x)} ${f1(a1y)}`;
    armGhost.setAttribute('d', `M ${f1(g0x)} ${f1(g0y)} L ${f1(a0x)} ${f1(a0y)}`);
    armLine.setAttribute('d', d);
    armBloom.setAttribute('d', d);
    armPip.setAttribute('cx', f1(a0x));
    armPip.setAttribute('cy', f1(a0y));
    // the counterweight is the far end of the ghost line: faint, on the inner edge of the orbit
    weightDot.setAttribute('cx', f1(g0x));
    weightDot.setAttribute('cy', f1(g0y));
  } });

  const keyLayer = el('div');
  root.appendChild(keyLayer);
  const sockets = [];
  const mkSocket = ({ node, icon, label, sub }) => {
    const k = el('div', `orr-cluster__key${node ? ' is-node' : ''}`);
    const ks = svg('svg', { viewBox: '-24 -24 48 48', class: 'orr-svg' });
    const r0 = node ? NODE_R : KEY_R;
    ks.appendChild(svg('circle', { r: r0, class: 'orr-core orr-rest', 'stroke-width': 1, fill: 'rgb(5 7 10 / .34)' }));
    const cd = svg('path', { d: arcD(0, 0, r0 + 3.5, 0, 360), class: 'orr-core orr-phos', 'stroke-width': node ? 1.6 : 2, pathLength: 1, 'stroke-dasharray': '0 1', 'stroke-linecap': 'butt', opacity: '.8' });
    const armedB = svg('circle', { r: r0, class: 'orr-bloom orr-hand', 'stroke-width': 6, fill: 'none', opacity: 0 });
    const armed = svg('circle', { r: r0, class: 'orr-core orr-hand', 'stroke-width': 1.5, fill: 'none', opacity: 0 });
    ks.append(cd, armedB, armed);
    k.appendChild(ks);
    const ic = el('span', 'orr-cluster__icon');
    ic.style.setProperty('--orr-icon', `url("${ICON_ROOT}icon-${icon}.svg")`);
    k.appendChild(ic);
    const tag = el('span', 'orr-label orr-cluster__keytag');
    tag.textContent = label;
    if (sub) tag.appendChild(el('b', null, sub));
    k.appendChild(tag);
    const count = el('span', 'orr-cluster__count');
    k.appendChild(count);
    keyLayer.appendChild(k);
    const spring = createSpring({ value: 0, preset: 'settle', onUpdate: (v) => cd.setAttribute('stroke-dasharray', `${Math.max(0, Math.min(1, v))} 1`) });
    return { el: k, armed, armedB, spring, count };
  };

  let openGroup = -1;
  function layoutCrescent(armedGroup) {
    for (const sk of sockets) { sk.spring.stop(); sk.el.remove(); }
    sockets.length = 0;
    let a = CRESCENT_START;
    let first = null;
    let lastA = a;
    groups.forEach((group, gi) => {
      if (gi === armedGroup) {
        group.slots.forEach((slot) => {
          const sk = mkSocket({ node: false, icon: slot.icon, label: slot.name, sub: slot.key });
          const [x, y] = at(R.crescent, a);
          place(sk.el, x, y);
          sockets.push({ ...sk, slot, angle: a });
          if (first == null) first = a;
          lastA = a;
          a += STEP_KEY;
        });
        a += 2;
      } else {
        const sk = mkSocket({ node: true, icon: group.icon, label: group.name, sub: group.slots.map((sl) => sl.key).join(' ') });
        const [x, y] = at(R.crescent, a);
        place(sk.el, x, y);
        sockets.push({ ...sk, group, angle: a });
        if (first == null) first = a;
        lastA = a;
        a += STEP_NODE;
      }
    });
    crescentTrack.setAttribute('d', arcD(P.x, P.y, R.crescent, (first ?? CRESCENT_START) - 10, lastA + 10));
    sockets.forEach((sk, i) => sk.el.style.setProperty('--orr-delay', `${200 + i * 40}ms`));
  }

  const payload = el('div', 'orr-cluster__payload orr-cluster__fade orr-soft');
  const massEl = el('span');
  const strainEl = el('small');
  payload.append(el('span', 'orr-label', 'Payload · on the line'), massEl, strainEl);
  place(payload, px + 36, py - 26);
  payload.style.opacity = '0';
  const massCounter = createCounter(massEl, { format: (n) => `${Math.round(n)} T` });

  root.append(energyRead, heatRead, speedBlock, legend, payload);

  // ---- update --------------------------------------------------------------------------------------
  const last = {};
  const changed = (k, v) => { if (last[k] === v) return false; last[k] = v; return true; };

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
      const fr = Math.min(1, speed / max);
      speedArc.set(fr);
      const a = SPEED_FROM + (SPEED_TO - SPEED_FROM) * fr;
      const [c0x, c0y] = at(R.speed - 10, a - 2.6);
      const [c1x, c1y] = at(R.speed - 2, a);
      const [c2x, c2y] = at(R.speed - 10, a + 2.6);
      speedCursor.setAttribute('d', `M ${f1(c0x)} ${f1(c0y)} L ${f1(c1x)} ${f1(c1y)} L ${f1(c2x)} ${f1(c2y)}`);
    }
    if (changed('ref', ref)) {
      refVal.textContent = String(Math.round(ref));
      const a = SPEED_FROM + (SPEED_TO - SPEED_FROM) * Math.min(1, ref / max);
      const [r0x, r0y] = at(R.speed - 4, a);
      const [r1x, r1y] = at(R.speed + 13, a);
      refTick.setAttribute('d', `M ${f1(r0x)} ${f1(r0y)} L ${f1(r1x)} ${f1(r1y)}`);
    }
    if (changed('boost', Math.round((Number(d.boost) || 0) * 100))) boost.set(Number(d.boost) || 0);
    if (Number.isFinite(d.drift) && changed('drift', Math.round(d.drift))) {
      driftPip.setAttribute('transform', `rotate(${Math.max(-40, Math.min(40, d.drift))} ${P.x} ${P.y})`);
    }
    // ordnance: the armed group opens along the crescent; the Hand swings to the armed key
    const slotStates = d.ordnance || {};
    let armedGroup = 0;
    groups.forEach((g, gi) => { if (g.slots.some((sl) => (slotStates[sl.key] || {}).state === 'armed')) armedGroup = gi; });
    if (armedGroup !== openGroup) { openGroup = armedGroup; layoutCrescent(armedGroup); }
    let armedAngle = null;
    for (const sk of sockets) {
      if (sk.slot) {
        const st = slotStates[sk.slot.key] || {};
        const state = st.state || 'ready';
        sk.el.className = `orr-cluster__key is-${state}`;
        sk.armed.setAttribute('opacity', state === 'armed' ? '1' : '0');
        sk.armedB.setAttribute('opacity', state === 'armed' ? '.26' : '0');
        sk.spring.set(state === 'cooldown' ? Number(st.cooldown) || 0 : 0);
        sk.count.textContent = Number.isFinite(st.count) ? `×${st.count}` : '';
        if (state === 'armed') armedAngle = sk.angle;
      } else {
        const readiness = sk.group.slots.reduce((m, sl) => {
          const st = slotStates[sl.key] || {};
          return Math.min(m, st.state === 'cooldown' ? Number(st.cooldown) || 0 : 1);
        }, 1);
        sk.el.className = 'orr-cluster__key is-node';
        sk.spring.set(readiness < 1 ? readiness : 0);
      }
    }
    if (armedAngle != null) handSpring.set(armedAngle);
    // tether
    const t = d.tether || null;
    const tethered = !!(t && t.state && t.state !== 'Idle' && Number(t.mass) > 0);
    if (changed('tethered', tethered)) { tetherG.setAttribute('opacity', tethered ? '1' : '0'); payload.style.opacity = tethered ? '1' : '0'; }
    if (tethered) {
      const st = Math.max(0, Math.min(1, Number(t.strain) || 0));
      massCounter.set(Number(t.mass));
      strain.set(st);
      setSag(st);
      strain.setTone(st > 0.85 ? 'threat' : 'phos');
      strainEl.textContent = `STRAIN ${Math.round(st * 100)}%`;
    }
  }

  function arrive() {
    root.classList.add('is-arriving');
    [speedBlock, energyRead, heatRead, legend, payload].forEach((node, i) => node.style.setProperty('--orr-delay', `${160 + i * 50}ms`));
    setTimeout(() => root.classList.remove('is-arriving'), 1500);
  }

  return {
    el: root,
    update,
    arrive,
    dispose() {
      for (const g of [shield, armor, hull, energy, heat, speedArc, boost, strain]) g.dispose();
      handSpring.stop();
      for (const sk of sockets) sk.spring.stop();
    },
  };
}

export const CLUSTER_GEOMETRY = Object.freeze({ W, H, P, R });
