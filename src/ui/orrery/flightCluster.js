// ORRERY flight Cluster (design/frontend/ORRERY.md §6 Flight): ONE instrument in place of the old
// card + bar rows + readout stack. The hull's own plan view, drawn as instrument light, sits at the
// centre of a ring stack — shield (segmented, outer), armour, hull (inner) — with energy and heat as
// two horns above it, a slowly turning tick orbit, the heading pip, and the amber Hand pointing where
// the ship is actually GOING (its drift against the nose: the reading a momentum game lives on).
// Speed is a big thin numeral on a Scale with the reference mark; target, tether and threat are
// three quiet reads beneath it, the threat read lit red only by threat.
import { svg, arcD, polar, circularText } from './svg.js';
import { arcGauge, orbitRing, ring, hand, scale } from './instruments.js';
import { decrypt, createCounter } from './text.js';
import { hullPosterUrl } from '../hullPosters.js';

const STYLE_ID = 'sf-orrery-cluster-style';
const CLUSTER_CSS = `
.orr-cluster { position:relative; display:flex; align-items:flex-end; gap:6px; pointer-events:none; color:var(--dp-ink, #e8e2d4); }
.orr-cluster__dialwrap { position:relative; width:330px; flex:0 0 330px; }
.orr-cluster__id { position:absolute; left:4px; top:-50px; display:flex; flex-direction:column; gap:5px; }
.orr-cluster__name { font-size:15px; letter-spacing:.06em; }
.orr-cluster__dial { width:330px; height:330px; }
.orr-cluster__horn { position:absolute; top:22px; display:flex; flex-direction:column; gap:4px; }
.orr-cluster__horn--l { left:0; align-items:flex-start; }
.orr-cluster__horn--r { right:0; align-items:flex-end; text-align:right; }
.orr-cluster__horn .orr-value { font-size:17px; }
.orr-cluster__hull { position:absolute; left:50%; top:238px; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:5px; }
.orr-cluster__hullnum { display:flex; align-items:baseline; gap:2px; }
.orr-cluster__hullnum .orr-numeral { font-size:42px; }
.orr-cluster__hullnum > i { font-style:normal; font-family:var(--dp-face-label); font-weight:500; font-size:15px; color:var(--dp-ink-dim, #b7b4a6); }
.orr-cluster__layers { display:flex; gap:12px; }
.orr-cluster__layers b { font-family:var(--dp-face-numeral); font-weight:520; color:var(--dp-phos, #dfeeff); margin-left:4px; letter-spacing:0; }
.orr-cluster__flight { display:flex; flex-direction:column; gap:10px; width:262px; padding:0 0 18px 4px; }
.orr-cluster__speedhead { display:flex; justify-content:space-between; align-items:baseline; width:236px; }
.orr-cluster__speedhead b { color:var(--dp-hand); font-weight:700; margin-left:4px; }
.orr-cluster__speed { display:flex; align-items:flex-end; gap:10px; height:88px; }
.orr-cluster__speed .orr-numeral { font-size:98px; font-weight:260; }
.orr-cluster__speed .orr-label { margin-bottom:12px; }
.orr-cluster__scale { width:236px; height:30px; margin-top:-4px; }
.orr-cluster__reads { display:grid; grid-template-columns:auto 1fr; column-gap:14px; row-gap:7px; margin:4px 0 0; align-items:baseline; }
.orr-cluster__reads dt { display:flex; align-items:center; gap:7px; }
.orr-cluster__reads dt::before { content:""; width:5px; height:5px; border-radius:50%; background:var(--dp-line); }
.orr-cluster__reads dd { margin:0; font-family:var(--dp-face-read, "Instrument Sans"); font-size:14px; color:var(--dp-ink, #e8e2d4); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.orr-cluster__reads dd.is-quiet { color:var(--dp-ink-dim, #b7b4a6); }
.orr-cluster__reads .is-threat dt::before { background:var(--dp-danger, #ff5038); box-shadow:0 0 8px var(--dp-danger, #ff5038); }
.orr-cluster__reads dd.is-threat { color:var(--dp-danger, #ff5038); }
.orr-cluster__reads .is-live dt::before { background:var(--dp-hand); }
.orr-cluster__glyph { opacity:.96; }
.orr-cluster.is-arriving .orr-cluster__flight > *, .orr-cluster.is-arriving .orr-cluster__horn, .orr-cluster.is-arriving .orr-cluster__hull, .orr-cluster.is-arriving .orr-cluster__id { animation:orr-rise 460ms var(--dp-ease-out) both; animation-delay:var(--orr-delay, 0ms); }
.orr-cluster.is-arriving .orr-cluster__glyph { animation:orr-glyph-in 900ms var(--dp-ease-out) both; }
@keyframes orr-glyph-in { from { opacity:0; transform:scale(.92); } to { opacity:.96; transform:none; } }
.orr-cluster__glyph { transform-box:fill-box; transform-origin:center; }
html.sf-reduce-motion .orr-cluster * { animation:none !important; }
`;

function injectStyle(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CLUSTER_CSS;
  doc.head.appendChild(style);
}

const el = (tag, cls, text) => {
  const node = globalThis.document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

// Dial geometry (viewBox 0 0 330 330)
const C = 165;
const R = Object.freeze({ orbit: 144, heading: 152, shield: 127, armor: 117, hull: 108, horn: 160 });
const GAUGE_FROM = 225;   // the gap at the bottom (135..225) holds the hull reading
const GAUGE_TO = 495;

export function createFlightCluster({ shipId = 'ship_kestrel', name = 'Hitch', classLine = 'Kestrel class · starter' } = {}) {
  injectStyle();
  const root = el('section', 'orr-cluster');
  root.setAttribute('aria-label', 'Ship status');

  // ---- the dial ------------------------------------------------------------------------------
  const dialWrap = el('div', 'orr-cluster__dialwrap');
  const dial = svg('svg', { class: 'orr-svg orr-cluster__dial', viewBox: '0 0 330 330', 'aria-hidden': 'true' });

  const orbit = orbitRing({ cx: C, cy: C, r: R.orbit, count: 120, major: 10, len: 3, majorLen: 8, tone: 'faint', drift: 1500 });
  orbit.rotor.classList.add('orr-spin-in');
  dial.appendChild(orbit.el);
  // engraved micro-lettering along the orbit's lower flanks: the hull's plate, like equipment
  dial.appendChild(circularText(C, C, R.orbit + 7, 'HX-47A · VECTOR REACTION DRIVE M', { startDeg: 218, size: 6.5, className: 'orr-micro' }));
  // the heading track: a faint arc over the nose, with the heading pip dead ahead
  dial.appendChild(ring({ cx: C, cy: C, r: R.heading, from: -58, to: 58, tone: 'faint', width: 1, draw: true, delay: 80 }));
  dial.appendChild(svg('path', { d: `M ${C - 5} ${C - R.heading - 9} L ${C} ${C - R.heading - 2} L ${C + 5} ${C - R.heading - 9}`, class: 'orr-core orr-hi', 'stroke-width': 1.2, fill: 'none' }));

  // gauges
  const shield = arcGauge({ cx: C, cy: C, r: R.shield, from: GAUGE_FROM, to: GAUGE_TO, width: 3.2, tone: 'phos', segments: 18, segmentGap: 2.2 });
  const armor = arcGauge({ cx: C, cy: C, r: R.armor, from: GAUGE_FROM, to: GAUGE_TO, width: 2, tone: 'hi', head: false });
  const hull = arcGauge({ cx: C, cy: C, r: R.hull, from: GAUGE_FROM, to: GAUGE_TO, width: 3, tone: 'phos' });
  dial.appendChild(shield.el);
  dial.appendChild(armor.el);
  dial.appendChild(hull.el);
  // gauge end ticks, so the gap reads as deliberate
  for (const a of [GAUGE_FROM, GAUGE_TO]) {
    const [x0, y0] = polar(C, C, R.hull - 7, a);
    const [x1, y1] = polar(C, C, R.shield + 7, a);
    dial.appendChild(svg('path', { d: `M ${x0} ${y0} L ${x1} ${y1}`, class: 'orr-core orr-rest', 'stroke-width': 1 }));
  }
  // horns: energy (left, rising) and heat (right)
  const energy = arcGauge({ cx: C, cy: C, r: R.horn, from: 250, to: 312, width: 3, tone: 'phos', ghost: false });
  const heat = arcGauge({ cx: C, cy: C, r: R.horn, from: 110, to: 48, width: 3, tone: 'hi', ghost: false });
  dial.appendChild(energy.el);
  dial.appendChild(heat.el);

  // the hull, as instrument light
  const glyphUrl = hullPosterUrl(shipId, 'holo');
  if (glyphUrl) {
    dial.appendChild(svg('image', { class: 'orr-cluster__glyph', href: glyphUrl, x: C - 84, y: C - 100, width: 168, height: 168, preserveAspectRatio: 'xMidYMid meet' }));
  }
  // the Hand: where the ship is going, against where it points
  const driftHand = hand({ cx: C, cy: C, r0: R.orbit - 12, r1: R.heading + 6 });
  dial.appendChild(driftHand.el);
  dialWrap.appendChild(dial);

  const id = el('header', 'orr-cluster__id');
  const nameEl = el('b', 'orr-display orr-cluster__name');
  const classEl = el('span', 'orr-label');
  id.append(nameEl, classEl);

  const hornL = el('span', 'orr-cluster__horn orr-cluster__horn--l');
  const energyVal = el('b', 'orr-value');
  hornL.append(el('i', 'orr-label', 'Energy'), energyVal);
  const hornR = el('span', 'orr-cluster__horn orr-cluster__horn--r');
  const heatVal = el('b', 'orr-value');
  hornR.append(el('i', 'orr-label', 'Heat'), heatVal);

  const hullBlock = el('div', 'orr-cluster__hull');
  const hullNum = el('div', 'orr-cluster__hullnum');
  const hullVal = el('b', 'orr-numeral');
  hullNum.append(hullVal, el('i', null, '%'));
  const hullState = el('span', 'orr-label');
  const layers = el('div', 'orr-cluster__layers');
  const shieldVal = el('b');
  const armorVal = el('b');
  const sLab = el('span', 'orr-label', 'Shield'); sLab.appendChild(shieldVal);
  const aLab = el('span', 'orr-label', 'Armor'); aLab.appendChild(armorVal);
  layers.append(sLab, aLab);
  hullBlock.append(hullNum, hullState, layers);
  dialWrap.append(id, hornL, hornR, hullBlock);

  // ---- flight readings --------------------------------------------------------------------------
  const flight = el('div', 'orr-cluster__flight');
  const speedHead = el('div', 'orr-cluster__speedhead');
  const refVal = el('b');
  const refLab = el('span', 'orr-label', 'Ref'); refLab.appendChild(refVal);
  speedHead.append(el('span', 'orr-label', 'Speed'), refLab);
  const speedRow = el('div', 'orr-cluster__speed');
  const speedVal = el('b', 'orr-numeral');
  speedRow.append(speedVal, el('span', 'orr-label', 'wu/s'));
  const scaleSvg = svg('svg', { class: 'orr-svg orr-cluster__scale', viewBox: '0 0 236 30', 'aria-hidden': 'true' });
  const speedScale = scale({ x: 0, y: 9, w: 236, ticks: 24, major: 6, tone: 'phos', reference: true });
  scaleSvg.appendChild(speedScale.el);
  const boostScale = scale({ x: 0, y: 26, w: 110, ticks: 0, major: 1, tone: 'phos' });
  scaleSvg.appendChild(boostScale.el);

  const reads = el('dl', 'orr-cluster__reads');
  const mkRead = (label) => {
    const row = { dt: el('dt', 'orr-label', label), dd: el('dd') };
    reads.append(row.dt, row.dd);
    return row;
  };
  const targetRead = mkRead('Target');
  const tetherRead = mkRead('Tether');
  const threatRead = mkRead('Threat');
  flight.append(speedHead, speedRow, scaleSvg, reads);

  root.append(dialWrap, flight);

  const hullCounter = createCounter(hullVal, { format: (n) => String(Math.round(n)) });
  const last = {};
  const changed = (key, value) => { if (last[key] === value) return false; last[key] = value; return true; };

  function update(d = {}) {
    const frac = (v, m) => (Number(m) > 0 ? Math.max(0, Math.min(1, Number(v) / Number(m))) : 0);
    const hullF = frac(d.hull, d.hullMax);
    if (changed('hull', Math.round(hullF * 1000))) {
      hull.set(hullF);
      hull.setTone(hullF < 0.3 ? 'threat' : 'phos');
      hullCounter.set(hullF * 100);
      hullState.textContent = hullF < 0.3 ? 'Hull · critical' : hullF < 0.6 ? 'Hull · damaged' : 'Hull · stable';
    }
    const shieldF = frac(d.shield, d.shieldMax);
    if (changed('shield', Math.round(shieldF * 1000))) { shield.set(shieldF); shieldVal.textContent = String(Math.round(shieldF * 100)); }
    const armorF = frac(d.armor, d.armorMax);
    if (changed('armor', Math.round(armorF * 1000))) { armor.set(armorF); armorVal.textContent = String(Math.round(Number(d.armor) || 0)); }
    const energyF = frac(d.energy, d.energyMax);
    if (changed('energy', Math.round(energyF * 1000))) { energy.set(energyF); energyVal.textContent = String(Math.round(Number(d.energy) || 0)); }
    const heatF = Math.max(0, Math.min(1, Number(d.heat) || 0));
    if (changed('heat', Math.round(heatF * 1000))) { heat.set(heatF); heat.setTone(heatF > 0.75 ? 'threat' : 'hi'); heatVal.textContent = `${Math.round(heatF * 100)}%`; }
    const ref = Number(d.speedRef) || 180;
    const max = Number(d.speedMax) || ref * 1.25;
    const speed = Math.max(0, Number(d.speed) || 0);
    if (changed('speed', Math.round(speed))) { speedVal.textContent = String(Math.round(speed)); speedScale.set(speed / max); }
    if (changed('ref', ref)) { refVal.textContent = String(Math.round(ref)); speedScale.setReference(ref / max); }
    if (changed('boost', Math.round((Number(d.boost) || 0) * 100))) boostScale.set(Number(d.boost) || 0);
    if (Number.isFinite(d.drift) && changed('drift', Math.round(d.drift))) driftHand.pointTo(d.drift);
    const target = d.target && d.target.name ? `${d.target.name}${d.target.detail ? ` · ${d.target.detail}` : ''}` : 'No lock';
    if (changed('target', target)) { targetRead.dd.textContent = target; targetRead.dd.classList.toggle('is-quiet', !d.target); }
    const tether = d.tether && d.tether.state ? `${d.tether.state}${d.tether.detail ? ` · ${d.tether.detail}` : ''}` : 'Idle';
    if (changed('tether', tether)) {
      tetherRead.dd.textContent = tether;
      tetherRead.dd.classList.toggle('is-quiet', !(d.tether && d.tether.state && d.tether.state !== 'Idle'));
      tetherRead.dt.classList.toggle('is-live', !!(d.tether && d.tether.state && d.tether.state !== 'Idle'));
    }
    const level = d.threat && d.threat.level || 'clear';
    const threatText = d.threat && d.threat.text || (level === 'clear' ? 'Clear' : 'Contact');
    if (changed('threat', `${level}|${threatText}`)) {
      threatRead.dd.textContent = threatText;
      const hot = level !== 'clear';
      threatRead.dd.classList.toggle('is-threat', hot);
      threatRead.dd.classList.toggle('is-quiet', !hot);
      threatRead.dt.classList.toggle('is-threat', hot);
    }
  }

  function arrive() {
    root.classList.add('is-arriving');
    const staged = [id, hornL, hornR, hullBlock, speedHead, speedRow, scaleSvg, reads];
    staged.forEach((node, i) => node.style.setProperty('--orr-delay', `${160 + i * 45}ms`));
    decrypt(nameEl, name, { duration: 320, delay: 120 });
    decrypt(classEl, classLine, { duration: 380, delay: 180 });
    setTimeout(() => root.classList.remove('is-arriving'), 1400);
  }

  nameEl.textContent = name;
  classEl.textContent = classLine;

  return {
    el: root,
    update,
    arrive,
    dispose() { for (const g of [shield, armor, hull, energy, heat, speedScale, boostScale, driftHand]) g.dispose(); },
  };
}

// exported for the showcase
export const CLUSTER_GEOMETRY = Object.freeze({ C, R, GAUGE_FROM, GAUGE_TO });
export { arcD };
