// ORRERY Stop Scale (design/frontend/ORRERY.md §4 #8 Scale + #2 the Hand; §6 New game: the starter
// hulls as stations, difficulty as a stop selector with the Hand).
//
// A ruled line of light with a station per choice and an amber index that slides (on the shared
// spring, one slight overshoot) to the chosen station. It builds no controls: it takes a row of real
// buttons a screen already made — aria-pressed marks the choice; the screen keeps its roving focus,
// Tab stops and click handlers — and only seats them under their stations and draws the scale.
// Optional produced art per station (a hull's holo plan view) stands above the ruler.
//
// (A dial was tried first: four labelled stops on a dial narrow enough for a form column put the two
// middle labels on top of each other, and the needle crossed the hull art. A scale keeps every
// station a full column apart.)
import { svg } from './svg.js';
import { createSpring } from './motion.js';
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-stopscale-style';
const CSS = `
.orr-stopscale { position:relative; width:var(--orr-scale-w, 460px); height:var(--orr-scale-h, 76px); margin:4px 0 2px; }
.orr-stopscale > svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
.orr-stopscale > .orr-stopscale__row { position:absolute !important; inset:0; margin:0 !important; padding:0 !important; display:block !important; }
.orr-stopscale > .orr-stopscale__row > li { position:absolute; margin:0; transform:translateX(-50%); list-style:none; text-align:center; }
.orr-stopscale__art { position:absolute; transform:translate(-50%, -50%); pointer-events:none; opacity:.42;
  background:center / contain no-repeat; transition:opacity .2s linear, transform .32s var(--dp-ease-out, ease-out), filter .2s linear; }
.orr-stopscale__art.is-on { opacity:1; transform:translate(-50%, -50%) scale(1.14); filter:drop-shadow(0 0 12px rgb(223 238 255 / .4)); }
html.sf-reduce-motion .orr-stopscale__art { transition:none; }
`;

function injectStyle(doc) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/**
 * @param {object} o
 * @param {HTMLElement} o.row        the row (ul) of buttons; the one with aria-pressed="true" is the choice
 * @param {number} [o.width]         scale width in px
 * @param {Object<string,string>} [o.art]  per-button produced art: data-action -> image url
 * @param {number} [o.artSize]       art size in px
 */
export function createStopScale({ row, width = 460, art = null, artSize = 72 } = {}) {
  const doc = (row && row.ownerDocument) || globalThis.document;
  if (!row || !doc || typeof doc.createElementNS !== 'function' || !row.parentNode) {
    return { el: null, update() {}, dispose() {} };
  }
  injectOrrery();
  injectStyle(doc);
  const hasArt = !!art;
  const ruleY = hasArt ? artSize + 26 : 16;
  // room under the ruler for a word and its one-line sub (a row without subs needs less)
  const hasSub = !!row.querySelector('.k-word-sub, .dp-menu__note, .dp-lit__note');
  const H = ruleY + (hasSub ? 56 : 40);
  const pad = 46;
  const wrap = doc.createElement('div');
  wrap.className = 'orr-stopscale';
  wrap.style.setProperty('--orr-scale-w', `${width}px`);
  wrap.style.setProperty('--orr-scale-h', `${H}px`);
  row.parentNode.insertBefore(wrap, row);
  const face = svg('svg', { class: 'orr-svg', viewBox: `0 0 ${width} ${H}`, 'aria-hidden': 'true' });
  wrap.appendChild(face);
  wrap.appendChild(row);
  row.classList.add('orr-stopscale__row');

  const items = () => [...row.children].filter((li) => li.querySelector && li.querySelector('button'));
  const n = Math.max(1, items().length);
  const xs = Array.from({ length: n }, (_, i) => (n > 1 ? pad + (i * (width - pad * 2)) / (n - 1) : width / 2));

  // the ruler: a line of light, fine graduations, a heavier tick at each station
  const x0 = Math.max(2, pad - 26);
  const x1 = Math.min(width - 2, width - pad + 26);
  face.appendChild(svg('path', { d: `M ${x0} ${ruleY} L ${x1} ${ruleY}`, class: 'orr-core orr-rest', 'stroke-width': 1 }));
  const fine = [];
  for (let x = x0 + 4; x < x1; x += 8) fine.push(`M ${x.toFixed(1)} ${ruleY} L ${x.toFixed(1)} ${ruleY + 4}`);
  face.appendChild(svg('path', { d: fine.join(' '), class: 'orr-core orr-faint', 'stroke-width': 1 }));
  const stationTicks = xs.map((x) => {
    const t = svg('path', { d: `M ${x.toFixed(1)} ${ruleY - 6} L ${x.toFixed(1)} ${ruleY + 8}`, class: 'orr-core orr-hi', 'stroke-width': 1.5 });
    face.appendChild(t);
    return t;
  });
  // the index: a short amber blade standing on the ruler, a bead at its foot, a faint bloom
  const bloom = svg('path', { d: '', class: 'orr-bloom orr-hand', 'stroke-width': 7, opacity: '.22' });
  const blade = svg('path', { d: '', fill: 'var(--dp-hand, #f2b950)' });
  const beadBloom = svg('circle', { r: 7, fill: 'var(--dp-hand, #f2b950)', opacity: '.22' });
  const bead = svg('circle', { r: 3.4, fill: 'var(--dp-hand-hot, #ffd98c)' });
  face.append(bloom, blade, beadBloom, bead);
  const top = ruleY - 16;
  const paint = (x) => {
    blade.setAttribute('d', `M ${(x - 2).toFixed(1)} ${ruleY} L ${x.toFixed(1)} ${top} L ${(x + 2).toFixed(1)} ${ruleY} Z`);
    bloom.setAttribute('d', `M ${x.toFixed(1)} ${ruleY} L ${x.toFixed(1)} ${top}`);
    for (const b of [bead, beadBloom]) { b.setAttribute('cx', x.toFixed(1)); b.setAttribute('cy', String(ruleY)); }
  };
  const spring = createSpring({ value: xs[0], preset: { k: 300, c: 25 }, onUpdate: paint });
  paint(xs[0]);

  // seat each button under its station; the art stands above it
  const arts = [];
  items().forEach((li, i) => {
    li.style.left = `${xs[i].toFixed(1)}px`;
    li.style.top = `${ruleY + 14}px`;
    const action = li.querySelector('button').dataset.action;
    if (hasArt && art[action]) {
      const img = doc.createElement('div');
      img.className = 'orr-stopscale__art';
      Object.assign(img.style, { left: `${xs[i].toFixed(1)}px`, top: `${(ruleY - 12 - artSize / 2).toFixed(1)}px`, width: `${artSize}px`, height: `${artSize}px`, backgroundImage: `url("${art[action]}")` });
      wrap.insertBefore(img, row);
      arts[i] = img;
    }
  });

  let current = -1;
  function update({ instant = false } = {}) {
    let idx = items().findIndex((li) => li.querySelector('button[aria-pressed="true"]'));
    if (idx < 0) idx = 0;
    if (idx === current && !instant) return;
    current = idx;
    spring.set(xs[idx], { instant });
    stationTicks.forEach((t, i) => {
      t.setAttribute('class', `orr-core ${i === idx ? 'orr-hand' : 'orr-hi'}`);
      t.setAttribute('opacity', i === idx ? '1' : '.5');
    });
    arts.forEach((img, i) => { if (img) img.classList.toggle('is-on', i === idx); });
  }
  // the screen flips aria-pressed on pick: follow it without the screen having to call us
  let mo = null;
  if (typeof MutationObserver === 'function') {
    mo = new MutationObserver(() => update());
    mo.observe(row, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
  }
  update({ instant: true });
  return {
    el: wrap,
    update,
    dispose() { spring.stop(); if (mo) mo.disconnect(); },
  };
}

/** Kept for callers of the first draft; the dial became a scale (see the file note). */
export const createStopDial = createStopScale;
