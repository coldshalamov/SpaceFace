// src/ui/orrery/deathDial.js — how a run ended, as an instrument (design/frontend/ORRERY.md §6, the
// Crucible results).
//
// The ship at the centre as its bone line drawing, nose up. Round it, what was left of it when the
// killing blow landed: three arcs (shield, armour, hull), their gap turned to face the blow. Round
// those, the compass (bow, starboard, astern, port). The blow itself comes in from its bearing as a
// red blade to the hull's edge, with the danger sector lit on the compass and the killer named at
// the blade's tail. Opposite it, the last hits taken sit as red ticks on an arc of time, each as long
// as the damage it did, grouped and named by weapon.
//
// Red is threat, and only the blow and the hits are threat. Everything else is bone light. The
// words are the screen's own (crucible.js decides them); this only lays them out. No layout (node
// tests) or no SVG: it stands down, and the screen's rows carry the same facts.

import { svg, polar, arcD, ticksD, circularText } from './svg.js';
import { injectOrrery } from './tokens.js';
import { hullPosterUrl } from '../hullPosters.js';

const STYLE_ID = 'orr-death-dial-style';

const CSS = `
.orr-deathdial { position:relative; min-width:0; min-height:0; pointer-events:none; }
.orr-deathdial__pool { position:absolute; border-radius:50%; pointer-events:none;
  background:radial-gradient(closest-side, rgb(4 6 9 / .82), rgb(4 6 9 / .6) 60%, rgb(4 6 9 / 0)); }
.orr-deathdial__hull { position:absolute; pointer-events:none; opacity:.92; }
.orr-deathdial__svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; }
.orr-deathdial .orr-threat-fill { fill:var(--dp-danger, #ff5038); }
.orr-deathdial__caption { position:absolute; width:460px; box-sizing:border-box; }
.orr-deathdial__caption.is-left { text-align:right; }
.orr-deathdial__caption.is-centre { text-align:center; }
.orr-deathdial__k { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:10.5px; letter-spacing:.28em;
  text-transform:uppercase; color:rgb(255 120 96 / .9); margin:0 0 6px; }
.orr-deathdial__name { font-family:var(--dp-face-display, "Archivo"); font-variation-settings:"wght" 760, "wdth" 120; font-size:22px; line-height:1.1;
  color:rgb(246 241 230); margin:0; text-shadow:0 1px 0 rgb(0 0 0 / .6), 0 0 16px rgb(0 0 0 / .8); }
.orr-deathdial__detail { font-size:13px; line-height:1.4; color:rgb(236 230 216 / .78); margin:6px 0 0; text-shadow:0 0 10px rgb(0 0 0 / .8); }
.orr-deathdial__warn { font-size:12px; line-height:1.35; color:rgb(236 230 216 / .66); margin:4px 0 0; }
.orr-deathdial__groups { font-size:11.5px; line-height:1.35; letter-spacing:.02em; color:rgb(255 150 128 / .82); margin:8px 0 0; white-space:pre-wrap; }
.orr-deathdial .orr-deathdial__vital text { font-size:10px; font-weight:650; letter-spacing:.16em; fill:rgb(236 230 216 / .72); }
.orr-deathdial .orr-deathdial__vital text .orr-deathdial__pct { fill:rgb(255 120 96); }
.orr-deathdial .orr-deathdial__card text { font-size:10px; font-weight:650; letter-spacing:.3em; fill:rgb(236 230 216 / .5); }
.orr-deathdial .orr-deathdial__card.is-threat text { fill:rgb(255 120 96); }
.orr-deathdial .orr-deathdial__hits text { font-size:10.5px; font-weight:650; letter-spacing:.02em; fill:rgb(255 150 128 / .9); }
.orr-deathdial .orr-deathdial__hitsum text { font-size:10px; font-weight:650; letter-spacing:.3em; fill:rgb(236 230 216 / .55); }
.orr-deathdial__rise { opacity:0; animation:orr-dd-rise .6s var(--dp-ease-out, ease-out) forwards; animation-delay:var(--orr-delay, 0ms); }
@keyframes orr-dd-rise { to { opacity:1; } }
.orr-deathdial__blade { animation:orr-dd-strike .7s cubic-bezier(.2, .9, .2, 1) .5s both; transform-box:view-box; }
@keyframes orr-dd-strike { from { opacity:0; transform:var(--orr-strike-from, none); } to { opacity:1; transform:none; } }
html.sf-reduce-motion .orr-deathdial__rise, html.sf-reduce-motion .orr-deathdial__blade { animation:none; opacity:1; transform:none; }
`;

/** Where each bearing word points, in dial degrees (0 = the bow, clockwise). */
export const BEARING_DEG = Object.freeze({ FRONT: 0, STARBOARD: 90, AFT: 180, PORT: 270 });

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

const INERT = Object.freeze({ active: () => false, relayout() {}, dispose() {} });

/**
 * @param {object} o
 * @param {HTMLElement} o.host an empty positioned box the dial fills
 * @param {string} [o.hullId] the run's hull (its bone drawing stands at the centre)
 * @param {string} [o.direction] FRONT | AFT | PORT | STARBOARD | CONTACT (point blank) | unknown
 * @param {{word:string, value:number}[]} [o.vitals] what was left, 0..100, in shield/armour/hull order
 * @param {number[]} [o.hitAmounts] the last hits, oldest first
 * @param {{weapon:string, hits:number, amount:number}[]} [o.hitGroups] the same hits by weapon
 * @param {string} [o.hitSummary] e.g. "Last 5 hits · 74 damage"
 * @param {{label:string, name:string, detail:string, warn?:string}} [o.caption] the killer, named
 */
export function createDeathDial({ host, hullId = null, direction = null, vitals = [], hitAmounts = [], hitGroups = [], hitSummary = '', caption = null } = {}) {
  const doc = host && host.ownerDocument;
  if (!doc || typeof doc.createElementNS !== 'function' || typeof host.getBoundingClientRect !== 'function') return INERT;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('orr-deathdial');

  const pool = doc.createElement('div');
  pool.className = 'orr-deathdial__pool';
  const hull = doc.createElement('img');
  hull.className = 'orr-deathdial__hull';
  hull.alt = '';
  hull.decoding = 'async';
  const url = hullPosterUrl(hullId, 'jig');
  if (url) hull.src = url; else hull.hidden = true;
  const layer = svg('svg', { class: 'orr-svg orr-deathdial__svg' });
  for (const n of [pool, hull, layer]) n.setAttribute('aria-hidden', 'true');
  const cap = doc.createElement('div');
  cap.className = 'orr-deathdial__caption orr-deathdial__rise';
  cap.style.setProperty('--orr-delay', '900ms');
  cap.setAttribute('aria-hidden', 'true');
  if (caption) {
    const line = (tag, cls, text) => { if (!text) return; const n = doc.createElement(tag); n.className = cls; n.textContent = text; cap.appendChild(n); };
    line('p', 'orr-deathdial__k', caption.label);
    line('p', 'orr-deathdial__name', caption.name);
    line('p', 'orr-deathdial__detail', caption.detail);
    line('p', 'orr-deathdial__warn', caption.warn);
    const groups = hitGroups.slice(0, 3);
    if (groups.length) {
      const list = doc.createElement('p');
      list.className = 'orr-deathdial__groups';
      list.textContent = groups.map((grp) => `${grp.weapon} ${grp.hits}× · ${grp.amount}`).join('   ');
      cap.appendChild(list);
    }
  }
  host.append(pool, hull, layer, cap);

  const dirKey = String(direction || '').toUpperCase();
  const blowDeg = Object.prototype.hasOwnProperty.call(BEARING_DEG, dirKey) ? BEARING_DEG[dirKey] : null;
  const pointBlank = dirKey === 'CONTACT';
  let frame = 0;
  let drawn = false;

  function draw() {
    frame = 0;
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (W < 300 || H < 300) return;
    // which side the killer's name goes: out along the blow, or under the dial when there is none
    const capSide = blowDeg == null ? 'bottom'
      : (blowDeg === 0 ? 'top' : blowDeg === 180 ? 'bottom' : blowDeg === 90 ? 'right' : 'left');
    const capW = 460; const capH = caption ? 128 : 0;
    const Rc = Math.max(120, Math.min(236,
      (capSide === 'left' || capSide === 'right' ? (W - capW - 40) / 2 - 70 : W / 2 - 80),
      (capSide === 'top' || capSide === 'bottom' ? (H - capH - 60) / 2 - 80 : H / 2 - 80)));
    let cx = W / 2; let cy = H / 2;
    if (capSide === 'bottom') cy = Math.max(Rc + 70, (H - capH - 40) / 2);
    if (capSide === 'top') cy = Math.min(H - Rc - 70, (H + capH + 40) / 2);
    if (capSide === 'right') cx = Math.max(Rc + 70, (W - capW - 40) / 2);
    if (capSide === 'left') cx = Math.min(W - Rc - 70, (W + capW + 40) / 2);

    // words set on a ring, centred on a bearing, reading left to right on whichever half they sit
    // (circularText centres its words a quarter-turn on from where its path starts)
    const ringWord = (r, deg, text, className) => {
      const upright = deg > 90 && deg < 270;
      return circularText(cx, cy, r, text, { startDeg: upright ? deg + 90 : deg - 90, size: 10, anchor: 'middle', upright, className });
    };
    const reach = Rc + 150;
    Object.assign(pool.style, { left: `${cx - reach}px`, top: `${cy - reach}px`, width: `${reach * 2}px`, height: `${reach * 2}px` });
    // the drawing: its frame is square with the ship ~0.85 of it; the ship spans ~1.05 Rc
    const size = Rc * 1.25;
    Object.assign(hull.style, { left: `${cx - size / 2}px`, top: `${cy - size / 2}px`, width: `${size}px`, height: `${size}px` });

    layer.setAttribute('viewBox', `0 0 ${W} ${H}`);
    layer.textContent = '';
    const rise = (node, delay) => {
      if (drawn) return node;
      node.classList.add('orr-deathdial__rise');
      node.style.setProperty('--orr-delay', `${delay}ms`);
      return node;
    };

    // the compass
    const compass = svg('g');
    compass.append(
      svg('path', { d: arcD(cx, cy, Rc, 0, 360), class: 'orr-core orr-rest', 'stroke-width': 1 }),
      svg('path', { d: ticksD(cx, cy, Rc, 72, { len: 4, major: 9, majorLen: 11 }), class: 'orr-core orr-faint', 'stroke-width': 1 }),
    );
    layer.appendChild(rise(compass, 0));
    const cards = [['Bow', 0], ['Starboard', 90], ['Astern', 180], ['Port', 270]];
    // the blow's own bearing is named at its tail, not on the ring its blade crosses
    for (const [word, deg] of cards) {
      if (blowDeg === deg) continue;
      layer.appendChild(rise(ringWord(Rc + 16, deg, word.toUpperCase(), 'orr-deathdial__card'), 80));
    }

    // what was left: three arcs, their gap turned to the blow
    const gapAt = blowDeg == null ? 180 : blowDeg;
    const a0 = gapAt + 38; const a1 = gapAt + 322;
    const radii = [0.88, 0.76, 0.64].map((f) => f * Rc);
    vitals.slice(0, 3).forEach((vital, i) => {
      const r = radii[i];
      const g = svg('g', { class: 'orr-deathdial__vital' });
      g.appendChild(svg('path', { d: arcD(cx, cy, r, a0, a1), class: 'orr-core orr-faint', 'stroke-width': 3 }));
      const pct = Math.max(0, Math.min(100, Number(vital.value) || 0));
      if (pct > 0) g.appendChild(svg('path', { d: arcD(cx, cy, r, a0, a0 + ((a1 - a0) * pct) / 100), class: 'orr-core orr-hi', 'stroke-width': 3 }));
      // emptied: a red cap where the arc starts
      const [e0x, e0y] = polar(cx, cy, r - 5, a0);
      const [e1x, e1y] = polar(cx, cy, r + 5, a0);
      g.appendChild(svg('path', { d: `M ${e0x.toFixed(1)} ${e0y.toFixed(1)} L ${e1x.toFixed(1)} ${e1y.toFixed(1)}`, class: 'orr-core orr-threat', 'stroke-width': 2 }));
      // its word at the arc's start, set just inside the gap
      const [tx, ty] = polar(cx, cy, r, a0 - 5);
      const onLeft = tx < cx;
      const t = svg('text', { x: tx.toFixed(1), y: (ty + 3.5).toFixed(1), 'text-anchor': onLeft ? 'end' : 'start' });
      t.textContent = `${String(vital.word).toUpperCase()} `;
      const v = svg('tspan', { class: 'orr-deathdial__pct' });
      v.textContent = `${Math.round(pct)}%`;
      t.appendChild(v);
      g.appendChild(t);
      layer.appendChild(rise(g, 200 + i * 80));
    });

    // the last hits: red ticks on an arc of time opposite the blow, oldest first, clockwise
    const hits = hitAmounts.filter((n) => Number.isFinite(n) && n > 0);
    if (hits.length) {
      const mid = (gapAt + 180) % 360;
      const span = Math.min(84, 14 * hits.length + 16);
      const h0 = mid - span / 2; const h1 = mid + span / 2;
      const rh = Rc + 34;
      const g = svg('g', { class: 'orr-deathdial__hits' });
      g.appendChild(svg('path', { d: arcD(cx, cy, rh, h0, h1), class: 'orr-core orr-faint', 'stroke-width': 1 }));
      const max = Math.max(...hits);
      hits.forEach((amount, i) => {
        const a = hits.length > 1 ? h0 + 6 + ((span - 12) * i) / (hits.length - 1) : mid;
        // each tick stands out from the arc, as long as the damage it did
        const len = 6 + (20 * amount) / max;
        const [x0, y0] = polar(cx, cy, rh, a);
        const [x1, y1] = polar(cx, cy, rh + len, a);
        g.appendChild(svg('path', { d: `M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}`, class: 'orr-core orr-threat', 'stroke-width': 2.6 }));
        // what that hit took, at its tick
        const [nx, ny] = polar(cx, cy, rh + len + 10, a);
        const n = svg('text', { x: nx.toFixed(1), y: (ny + 3.5).toFixed(1), 'text-anchor': 'middle' });
        n.textContent = String(Math.round(amount));
        g.appendChild(n);
      });
      layer.appendChild(rise(g, 420));
      if (hitSummary) layer.appendChild(rise(ringWord(rh + 56, mid, hitSummary.toUpperCase(), 'orr-deathdial__hitsum'), 480));
    }

    // the blow: a red blade in from its bearing to the hull's edge, the danger sector on the compass
    const hullHalf = (blowDeg === 90 || blowDeg === 270 ? 0.3 : 0.5) * size;
    if (blowDeg != null) {
      const sector = svg('g');
      sector.append(
        svg('path', { d: arcD(cx, cy, Rc, blowDeg - 14, blowDeg + 14), class: 'orr-bloom orr-threat', 'stroke-width': 9, opacity: '.25' }),
        svg('path', { d: arcD(cx, cy, Rc, blowDeg - 14, blowDeg + 14), class: 'orr-core orr-threat', 'stroke-width': 2.4 }),
      );
      layer.appendChild(rise(sector, 460));
      const tipR = hullHalf * 0.86;
      const tailR = Rc + 78;
      const [tx, ty] = polar(cx, cy, tipR, blowDeg);
      const half = (Math.atan(7 / tailR) * 180) / Math.PI;
      const [b0x, b0y] = polar(cx, cy, tailR, blowDeg - half);
      const [b1x, b1y] = polar(cx, cy, tailR, blowDeg + half);
      const blade = svg('g', { class: 'orr-deathdial__blade' });
      const [ox, oy] = polar(cx, cy, 60, blowDeg);
      blade.style.setProperty('--orr-strike-from', `translate(${(ox - cx).toFixed(1)}px, ${(oy - cy).toFixed(1)}px)`);
      blade.append(
        svg('path', { d: `M ${b0x.toFixed(1)} ${b0y.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)} L ${b1x.toFixed(1)} ${b1y.toFixed(1)}`, class: 'orr-bloom orr-threat', 'stroke-width': 10, opacity: '.2' }),
        svg('path', { d: `M ${b0x.toFixed(1)} ${b0y.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)} L ${b1x.toFixed(1)} ${b1y.toFixed(1)} Z`, class: 'orr-threat-fill', opacity: '.92' }),
      );
      // the impact: a small star where it went in
      const burst = [];
      for (let k = 0; k < 8; k += 1) {
        const a = blowDeg + 180 + k * 45;
        const [r0x, r0y] = polar(tx, ty, 5, a);
        const [r1x, r1y] = polar(tx, ty, k % 2 ? 9 : 14, a);
        burst.push(`M ${r0x.toFixed(1)} ${r0y.toFixed(1)} L ${r1x.toFixed(1)} ${r1y.toFixed(1)}`);
      }
      blade.appendChild(svg('path', { d: burst.join(' '), class: 'orr-core orr-threat', 'stroke-width': 1.6 }));
      blade.appendChild(svg('circle', { cx: tx.toFixed(1), cy: ty.toFixed(1), r: 3.2, class: 'orr-threat-fill' }));
      layer.appendChild(blade);
    } else if (pointBlank) {
      layer.appendChild(rise(svg('path', { d: arcD(cx, cy, hullHalf * 0.95, 0, 360), class: 'orr-core orr-threat', 'stroke-width': 2, 'stroke-dasharray': '3 4' }), 460));
    }

    // the killer's name at the blade's tail
    if (caption) {
      const [px, py] = blowDeg == null ? [cx, cy + Rc + 60] : polar(cx, cy, Rc + 88, blowDeg);
      cap.classList.toggle('is-left', capSide === 'left');
      cap.classList.toggle('is-centre', capSide === 'top' || capSide === 'bottom');
      let left = px - capW / 2; let top = py;
      if (capSide === 'top') top = py - capH;
      if (capSide === 'right') { left = px + 6; top = py - capH / 2; }
      if (capSide === 'left') { left = px - capW - 6; top = py - capH / 2; }
      left = Math.max(0, Math.min(W - capW, left));
      Object.assign(cap.style, { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` });
    }
    drawn = true;
  }

  const schedule = () => {
    if (frame) return;
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf !== 'function') { draw(); return; }
    frame = raf(draw);
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  if (ro) ro.observe(host);
  schedule();

  return {
    active: () => true,
    relayout: schedule,
    dispose() {
      if (ro) ro.disconnect();
      if (frame && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(frame);
      for (const n of [pool, hull, layer, cap]) if (n.parentNode) n.parentNode.removeChild(n);
    },
  };
}
