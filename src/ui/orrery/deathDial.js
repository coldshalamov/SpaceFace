// src/ui/orrery/deathDial.js — how a run ended, as an instrument (design/frontend/ORRERY.md §6, the
// Crucible results).
//
// The ship at the centre as its bone line drawing, nose up. Round it, what was left of it when the
// killing blow landed: three gauges (shield, armour, hull) engraved with their own names, their gap
// turned to face the blow. Round those, the compass (bow, starboard, astern, port). The blow comes in
// from its bearing as a slim red blade to the hull's edge across a faint red danger wedge. Under the
// dial, the killer is named, and the last hits run left to right as a strip of ticks, each as tall as
// the damage it did, the last one the blow itself.
//
// Red is threat, and only the blow, the wedge, the emptied gauges and the hits are threat. Everything
// else is bone light. The words are the screen's own (crucible.js decides them); this only lays them
// out. No layout (node tests) or no SVG: it stands down, and the screen's rows carry the same facts.

import { svg, polar, arcD, ticksD, circularText } from './svg.js';
import { injectOrrery } from './tokens.js';
import { hullPosterUrl } from '../hullPosters.js';

const STYLE_ID = 'orr-death-dial-style';

const CSS = `
.orr-deathdial { position:relative; min-width:0; min-height:0; pointer-events:none; }
.orr-deathdial__pool { position:absolute; border-radius:50%; pointer-events:none;
  background:radial-gradient(closest-side, rgb(4 6 9 / .8), rgb(4 6 9 / .62) 40%, rgb(4 6 9 / .3) 75%, rgb(4 6 9 / 0)); }
.orr-deathdial__hull { position:absolute; pointer-events:none; opacity:.94; }
.orr-deathdial__svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; }
.orr-deathdial .orr-threat-fill { fill:var(--dp-danger, #ff5038); }
.orr-deathdial__caption { position:absolute; box-sizing:border-box; text-align:center; }
.orr-deathdial__k { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:11px; letter-spacing:.28em;
  text-transform:uppercase; color:rgb(255 120 96 / .92); margin:0 0 6px; }
.orr-deathdial__name { font-family:var(--dp-face-display, "Archivo"); font-variation-settings:"wght" 760, "wdth" 120; font-size:22px; line-height:1.1;
  color:rgb(246 241 230); margin:0; text-wrap:balance; text-shadow:0 1px 0 rgb(0 0 0 / .6), 0 0 16px rgb(0 0 0 / .8); }
.orr-deathdial__detail { font-size:13px; line-height:1.4; color:rgb(236 230 216 / .8); margin:6px 0 0; text-shadow:0 0 10px rgb(0 0 0 / .8); }
.orr-deathdial__warn { font-size:12.5px; line-height:1.35; color:rgb(236 230 216 / .7); margin:4px 0 0; }
.orr-deathdial__strip { display:block; margin:14px auto 0; overflow:visible; }
.orr-deathdial__strip text { font-family:var(--dp-face-label, "Archivo"); font-size:10.5px; font-weight:650; fill:rgb(255 150 128 / .92); }
.orr-deathdial__strip text.orr-deathdial__strip-word { font-size:10px; letter-spacing:.24em; fill:rgb(236 230 216 / .6); }
.orr-deathdial__strip text.orr-deathdial__strip-who { font-size:9.5px; letter-spacing:.08em; fill:rgb(236 230 216 / .66); }
.orr-deathdial__groups { font-size:12px; line-height:1.4; color:rgb(255 150 128 / .86); margin:6px 0 0; }
/* a short plate gives the dial the room: the legend's initials already sit under the ticks */
@media (max-height:820px) {
  .orr-deathdial__groups { display:none; }
  .orr-deathdial__name { font-size:19px; }
  .orr-deathdial__warn { display:none; }
}
.orr-deathdial .orr-deathdial__gauge text { font-weight:650; letter-spacing:.14em; fill:rgb(236 230 216 / .78); }
.orr-deathdial .orr-deathdial__gauge.is-empty text { fill:rgb(255 140 118 / .92); }
.orr-deathdial .orr-deathdial__card text { font-size:10px; font-weight:650; letter-spacing:.3em; fill:rgb(236 230 216 / .52); }
.orr-deathdial .orr-deathdial__engrave text { font-size:10px; font-weight:650; letter-spacing:.3em; fill:rgb(236 230 216 / .5); }
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
 * @param {HTMLElement} o.host an empty box the dial fills (the caption sits in its lower part)
 * @param {string} [o.hullId] the run's hull (its bone drawing stands at the centre)
 * @param {string} [o.direction] FRONT | AFT | PORT | STARBOARD | CONTACT (point blank) | unknown
 * @param {{word:string, value:number}[]} [o.vitals] what was left, 0..100, in shield/armour/hull order
 * @param {number[]} [o.hitAmounts] the last hits, oldest first (the last is the blow)
 * @param {string[]} [o.hitWeapons] the weapon behind each of those hits, same order
 * @param {{weapon:string, hits:number, amount:number}[]} [o.hitGroups] the same hits by weapon
 * @param {string} [o.hitSummary] e.g. "Last 5 hits · 74 damage"
 * @param {string} [o.engraving] set on the dial's rim opposite the blow (e.g. "Wave 6")
 * @param {{label:string, name:string, detail:string, warn?:string}} [o.caption] the killer, named
 */
/** A weapon's initials, for the hit strip and its legend: "Heavy Autocannon M" -> "HA". */
export function initials(name) {
  const words = String(name || '').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && w.length > 1);
  if (!words.length || /^unidentified/i.test(name)) return '?';
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

export function createDeathDial({ host, hullId = null, direction = null, vitals = [], hitAmounts = [], hitWeapons = [], hitGroups = [], hitSummary = '', engraving = '', caption = null } = {}) {
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
  const under = svg('svg', { class: 'orr-svg orr-deathdial__svg' });
  const layer = svg('svg', { class: 'orr-svg orr-deathdial__svg' });
  for (const n of [pool, under, hull, layer]) n.setAttribute('aria-hidden', 'true');

  // the caption: the killer, the tell, the last hits as a strip, the weapons behind them
  const cap = doc.createElement('div');
  cap.className = 'orr-deathdial__caption orr-deathdial__rise';
  cap.style.setProperty('--orr-delay', '900ms');
  cap.setAttribute('aria-hidden', 'true');
  const hits = hitAmounts.filter((n) => Number.isFinite(n) && n > 0);
  if (caption) {
    const line = (cls, text) => { if (!text) return; const n = doc.createElement('p'); n.className = cls; n.textContent = text; cap.appendChild(n); };
    line('orr-deathdial__k', caption.label);
    line('orr-deathdial__name', caption.name);
    line('orr-deathdial__detail', caption.detail);
    line('orr-deathdial__warn', caption.warn);
  }
  if (hits.length) {
    // time runs left to right; each tick is as tall as its damage; the last is the blow
    const n = hits.length;
    const pitch = 34;
    const Wd = Math.max(200, 80 + pitch * (n - 1) + 80);
    const x0 = (Wd - pitch * (n - 1)) / 2;
    const base = 56;
    const strip = svg('svg', { class: 'orr-svg orr-deathdial__strip', width: Wd, height: 86, viewBox: `0 0 ${Wd} 86` });
    const max = Math.max(...hits);
    strip.appendChild(svg('path', { d: `M ${x0 - 22} ${base} L ${x0 + pitch * (n - 1) + 22} ${base}`, class: 'orr-core orr-faint', 'stroke-width': 1 }));
    hits.forEach((amount, i) => {
      const x = x0 + pitch * i;
      const h = 6 + (30 * amount) / max;
      const last = i === n - 1;
      strip.appendChild(svg('path', { d: `M ${x} ${base} L ${x} ${base - h}`, class: 'orr-core orr-threat', 'stroke-width': last ? 4 : 2.4, opacity: last ? '1' : '.62' }));
      const t = svg('text', { x, y: base - h - 6, 'text-anchor': 'middle' });
      t.textContent = String(Math.round(amount));
      strip.appendChild(t);
      if (hitWeapons[i]) {
        const w = svg('text', { x, y: base + 12, 'text-anchor': 'middle', class: 'orr-deathdial__strip-who' });
        w.textContent = initials(hitWeapons[i]);
        strip.appendChild(w);
      }
    });
    if (hitSummary) {
      const w = svg('text', { x: Wd / 2, y: 84, 'text-anchor': 'middle', class: 'orr-deathdial__strip-word' });
      w.textContent = hitSummary.toUpperCase();
      strip.appendChild(w);
    }
    cap.appendChild(strip);
  }
  const groups = hitGroups.slice(0, 3);
  if (groups.length) {
    const list = doc.createElement('p');
    list.className = 'orr-deathdial__groups';
    list.textContent = groups.map((grp) => `${initials(grp.weapon)}  ${grp.weapon} \u2014 ${grp.hits} hit${grp.hits === 1 ? '' : 's'}, ${grp.amount}`).join('   \u00b7   ');
    cap.appendChild(list);
  }
  host.append(pool, under, hull, layer, cap);

  const dirKey = String(direction || '').toUpperCase();
  const blowDeg = Object.prototype.hasOwnProperty.call(BEARING_DEG, dirKey) ? BEARING_DEG[dirKey] : null;
  const pointBlank = dirKey === 'CONTACT';
  let frame = 0;
  let drawn = false;

  function draw() {
    frame = 0;
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (W < 260 || H < 300) return;
    // the caption always sits under the dial; the dial takes what is left, with room round it for
    // the compass words and the blade's tail
    const capW = Math.min(520, W);
    cap.style.width = `${capW}px`;
    const capH = cap.offsetHeight || 180;
    const room = H - capH - 24;
    const Rc = Math.max(90, Math.min(290, W / 2 - 58, room / 2 - 58));
    const cx = W / 2;
    const cy = 58 + Rc + Math.max(0, (room - 2 * (Rc + 58)) / 2);
    Object.assign(cap.style, { left: `${Math.round((W - capW) / 2)}px`, top: `${Math.round(cy + Rc + 72)}px` });
    const reach = Rc + 560;
    Object.assign(pool.style, { left: `${cx - reach}px`, top: `${cy - reach}px`, width: `${reach * 2}px`, height: `${reach * 2}px` });
    // the drawing: its frame is square with the ship ~0.85 of it; the ship spans ~1.05 Rc
    const size = Rc * 1.25;
    Object.assign(hull.style, { left: `${cx - size / 2}px`, top: `${cy - size / 2}px`, width: `${size}px`, height: `${size}px` });

    for (const l of [under, layer]) { l.setAttribute('viewBox', `0 0 ${W} ${H}`); l.textContent = ''; }
    const rise = (node, delay) => {
      if (drawn) return node;
      node.classList.add('orr-deathdial__rise');
      node.style.setProperty('--orr-delay', `${delay}ms`);
      return node;
    };
    // words set on a ring, centred on a bearing, reading left to right on whichever half they sit
    // (circularText centres its words a quarter-turn on from where its path starts)
    const ringWord = (r, deg, text, className) => {
      const upright = deg > 90 && deg < 270;
      return circularText(cx, cy, r, text, { startDeg: upright ? deg + 90 : deg - 90, size: 10, anchor: 'middle', upright, className });
    };

    // the danger wedge first, under everything: 20 degrees from the centre to the rim
    if (blowDeg != null) {
      const [ax, ay] = polar(cx, cy, Rc, blowDeg - 10);
      const [bx, by] = polar(cx, cy, Rc, blowDeg + 10);
      const wedge = `M ${cx.toFixed(1)} ${cy.toFixed(1)} L ${ax.toFixed(1)} ${ay.toFixed(1)} A ${Rc} ${Rc} 0 0 1 ${bx.toFixed(1)} ${by.toFixed(1)} Z`;
      under.appendChild(rise(svg('path', { d: wedge, class: 'orr-threat-fill', opacity: '.1' }), 440));
      under.appendChild(rise(svg('path', { d: `M ${cx.toFixed(1)} ${cy.toFixed(1)} L ${ax.toFixed(1)} ${ay.toFixed(1)} M ${cx.toFixed(1)} ${cy.toFixed(1)} L ${bx.toFixed(1)} ${by.toFixed(1)}`, class: 'orr-core orr-threat', 'stroke-width': 1, opacity: '.55' }), 440));
    }

    // the compass
    const compass = svg('g');
    compass.append(
      svg('path', { d: arcD(cx, cy, Rc, 0, 360), class: 'orr-core orr-rest', 'stroke-width': 1 }),
      svg('path', { d: ticksD(cx, cy, Rc, 72, { len: 4, major: 9, majorLen: 11 }), class: 'orr-core orr-faint', 'stroke-width': 1 }),
    );
    layer.appendChild(rise(compass, 0));
    // the blow's own bearing is named in the caption, not on the ring its blade crosses
    for (const [word, deg] of [['Bow', 0], ['Starboard', 90], ['Astern', 180], ['Port', 270]]) {
      if (blowDeg === deg) continue;
      layer.appendChild(rise(ringWord(Rc + 16, deg, word.toUpperCase(), 'orr-deathdial__card'), 80));
    }
    if (engraving) {
      const at = ((blowDeg == null ? 0 : blowDeg + 180) + 40) % 360;
      layer.appendChild(rise(ringWord(Rc + 18, at, engraving.toUpperCase(), 'orr-deathdial__engrave'), 120));
    }

    // what was left: three gauges, their gap turned to the blow, each engraved with its own name
    const gapAt = blowDeg == null ? 180 : blowDeg;
    const a0 = gapAt + 30; const a1 = gapAt + 330;
    const radii = [0.84, 0.72, 0.6].map((f) => f * Rc);
    vitals.slice(0, 3).forEach((vital, i) => {
      const r = radii[i];
      const pct = Math.max(0, Math.min(100, Number(vital.value) || 0));
      const g = svg('g', { class: `orr-deathdial__gauge${pct === 0 ? ' is-empty' : ''}` });
      // the label runs along the gauge's first stretch; the track and the reading start after it
      // the name and reading run along the outside of the gauge's first stretch, between it and the
      // next gauge out; the track runs the whole way under them
      const fs = 10;
      const rl = r + (Rc < 170 ? 9 : 12);
      const labelSpan = Math.min(140, (((String(vital.word).length + 5) * fs * 0.8) / rl) * (180 / Math.PI));
      const t0 = a0;
      const split = t0 + ((a1 - t0) * pct) / 100;
      g.appendChild(svg('path', { d: arcD(cx, cy, r, t0, a1), class: 'orr-core orr-rest', 'stroke-width': 3, opacity: '.28' }));
      if (pct > 0) g.appendChild(svg('path', { d: arcD(cx, cy, r, t0, split), class: 'orr-core orr-hi', 'stroke-width': 3, opacity: '.95' }));
      if (pct < 100) g.appendChild(svg('path', { d: arcD(cx, cy, r, split, a1), class: 'orr-core orr-threat', 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: '.7' }));
      // the emptied mark: a red cap where the gauge's reading stops
      const [c0x, c0y] = polar(cx, cy, r - 5, split);
      const [c1x, c1y] = polar(cx, cy, r + 5, split);
      g.appendChild(svg('path', { d: `M ${c0x.toFixed(1)} ${c0y.toFixed(1)} L ${c1x.toFixed(1)} ${c1y.toFixed(1)}`, class: 'orr-core orr-threat', 'stroke-width': 3 }));
      // the name and the reading, engraved along the gauge (upright on the lower half)
      const mid = a0 + 4 + labelSpan / 2;
      const norm = ((mid % 360) + 360) % 360;
      const upright = norm > 90 && norm < 270;
      const words = `${String(vital.word).toUpperCase()} ${Math.round(pct)}%`;
      g.appendChild(circularText(cx, cy, rl - 3.5, words, { startDeg: upright ? mid + 90 : mid - 90, size: fs, anchor: 'middle', upright }));
      layer.appendChild(rise(g, 200 + i * 80));
    });

    // the blow: a slim red blade from its bearing to the hull's edge, a bright tip where it went in
    const hullHalf = (blowDeg === 90 || blowDeg === 270 ? 0.3 : 0.5) * size;
    if (blowDeg != null) {
      const tipR = hullHalf * 0.88;
      const tailR = Rc + 52;
      const [tx, ty] = polar(cx, cy, tipR, blowDeg);
      const half = (Math.atan(3 / tailR) * 180) / Math.PI;
      const [b0x, b0y] = polar(cx, cy, tailR, blowDeg - half);
      const [b1x, b1y] = polar(cx, cy, tailR, blowDeg + half);
      const blade = svg('g', { class: 'orr-deathdial__blade' });
      const [ox, oy] = polar(cx, cy, 60, blowDeg);
      blade.style.setProperty('--orr-strike-from', `translate(${(ox - cx).toFixed(1)}px, ${(oy - cy).toFixed(1)}px)`);
      blade.append(
        svg('path', { d: `M ${b0x.toFixed(1)} ${b0y.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)} L ${b1x.toFixed(1)} ${b1y.toFixed(1)}`, class: 'orr-bloom orr-threat', 'stroke-width': 8, opacity: '.18' }),
        svg('path', { d: `M ${b0x.toFixed(1)} ${b0y.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)} L ${b1x.toFixed(1)} ${b1y.toFixed(1)} Z`, class: 'orr-threat-fill', opacity: '.95' }),
        svg('circle', { cx: tx.toFixed(1), cy: ty.toFixed(1), r: 6, class: 'orr-threat-fill', opacity: '.25' }),
        svg('circle', { cx: tx.toFixed(1), cy: ty.toFixed(1), r: 2.6, fill: 'rgb(255 214 200)' }),
      );
      layer.appendChild(blade);
    } else if (pointBlank) {
      layer.appendChild(rise(svg('path', { d: arcD(cx, cy, hullHalf * 0.95, 0, 360), class: 'orr-core orr-threat', 'stroke-width': 2, 'stroke-dasharray': '3 4' }), 460));
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
  if (doc.fonts && doc.fonts.ready && typeof doc.fonts.ready.then === 'function') doc.fonts.ready.then(schedule);
  schedule();

  return {
    active: () => true,
    relayout: schedule,
    dispose() {
      if (ro) ro.disconnect();
      if (frame && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(frame);
      for (const n of [pool, under, hull, layer, cap]) if (n.parentNode) n.parentNode.removeChild(n);
    },
  };
}
