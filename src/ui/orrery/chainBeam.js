// src/ui/orrery/chainBeam.js — the Production Chain (design/frontend/ORRERY.md §4 #6 Beam, §6 Station,
// Industry): a blueprint drawn as the thing it is -- its inputs as nodes on the left, beams of light
// carrying them into the process at the centre, one beam out to what it makes on the right. A node
// whose material is in the hold is a solid ring; one that is short is dashed, its count beside it in
// bone (a shortfall is not a threat). When the line can run, pulses travel the beams; when it cannot,
// the beams rest faint. Words stay the screen's own: the instrument places its labels as DOM.

import { svg, arcD, ticksD } from './svg.js';
import { injectOrrery } from './tokens.js';
import { reducedMotion } from './motion.js';

const STYLE_ID = 'orr-chain-beam-style';
const BONE = '236 230 216';

const CSS = `
.orr-chain { position:relative; width:100%; height:100%; min-height:150px; isolation:isolate; --orr-chain-s:1; }
.orr-chain::before { content:""; position:absolute; z-index:-1; inset:-14% -12% -14% -6%; pointer-events:none; background:radial-gradient(closest-side, rgb(6 8 11 / .8), rgb(6 8 11 / .55) 60%, rgb(6 8 11 / 0)); }
.orr-chain > svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
.orr-chain.is-off > svg, .orr-chain.is-off > .orr-chain__label { display:none; }
.orr-chain__label { position:absolute; display:flex; flex-direction:column; gap:2px; pointer-events:none; white-space:nowrap; }
/* a verb under a short input (source it in the market) is the one thing on the drawing that takes the pointer */
.orr-chain__verb { pointer-events:auto; margin-top:3px; }
.orr-chain__verb > * { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:calc(9.5px * var(--orr-chain-s)); letter-spacing:.16em; text-transform:uppercase;
  color:rgb(${BONE} / .78); background:none; border:0; padding:0; margin:0; cursor:pointer; min-height:0; height:auto; box-shadow:none; }
.orr-chain__verb > *::before { content:"›  "; color:rgb(${BONE} / .5); }
.orr-chain__verb > *:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950); outline:none; }
.orr-chain__label.is-left { align-items:flex-start; text-align:left; }
.orr-chain__label.is-ghost { opacity:.38; }
.orr-chain__label.is-after-block .orr-chain__verb { opacity:.5; }
.orr-chain__process.is-blocked { opacity:.55; }
.orr-svg .orr-chain__scale { stroke:rgb(${BONE} / .2); }
.orr-svg .orr-chain__timearc { stroke:rgb(248 244 234 / .7); }
.orr-svg .orr-chain__timearc-bloom { stroke:rgb(${BONE}); }
.orr-svg .orr-chain__timearc--off { stroke:rgb(${BONE} / .28); }
.orr-chain__label.is-right { align-items:flex-start; text-align:left; }
.orr-chain__label.is-centre { align-items:center; text-align:center; }
.orr-chain__name { font-family:var(--dp-face-body, "Instrument Sans"); font-size:calc(13px * var(--orr-chain-s)); font-weight:600; color:rgb(248 244 234); }
.orr-chain__label.is-short .orr-chain__name { color:rgb(${BONE} / .8); }
.orr-chain__count { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:calc(10px * var(--orr-chain-s)); letter-spacing:.14em; text-transform:uppercase; color:rgb(${BONE} / .62);
  font-variant-numeric:tabular-nums; }
.orr-chain__count b { font-weight:650; color:rgb(248 244 234); }
.orr-chain__label.is-short .orr-chain__count b { color:rgb(${BONE} / .85); }
.orr-chain__process { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:var(--orr-chain-p, 9px); letter-spacing:.12em; text-transform:uppercase; color:rgb(${BONE} / .7); }
.orr-chain__time { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-size:calc(9.5px * var(--orr-chain-s)); font-weight:650; letter-spacing:.14em; text-transform:uppercase; color:rgb(${BONE} / .6); }
.orr-chain__qty { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-weight:250; font-size:calc(40px * var(--orr-chain-g, 1)); line-height:1; letter-spacing:-.01em; color:rgb(248 244 234); font-variant-numeric:tabular-nums; }
.orr-chain__unit { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:calc(9.5px * var(--orr-chain-s)); white-space:nowrap; line-height:1.3; letter-spacing:.16em; text-transform:uppercase; color:rgb(${BONE} / .6); }
.orr-svg .orr-chain__node { fill:none; stroke:rgb(${BONE} / .85); stroke-width:1.3; }
.orr-svg .orr-chain__reason-leader { stroke:rgb(${BONE} / .6); }
.orr-chain__label.is-below .orr-chain__qty { display:block; text-align:center; }
.orr-chain__label.is-ghost .orr-chain__qty { font-size:calc(40px * var(--orr-chain-g, 1) * .55); }
.orr-chain__label.is-below .orr-chain__unit { display:block; text-align:center; }
.orr-svg .orr-chain__node--short { stroke:rgb(${BONE} / .55); stroke-dasharray:3.2 2.4; }
.orr-svg .orr-chain__node--process { stroke:rgb(248 244 234); fill:none; }
.orr-svg .orr-chain__node--process.orr-chain__node--blocked { stroke:rgb(${BONE} / .55); stroke-dasharray:4 3; }
.orr-svg .orr-chain__node-bloom { stroke:rgb(${BONE} / .9); }
.orr-svg .orr-chain__progress { stroke:rgb(248 244 234); }
.orr-svg .orr-chain__progress-bloom { stroke:rgb(${BONE}); }
.orr-svg .orr-chain__glyph { fill:none; stroke:rgb(${BONE} / .85); stroke-width:1.35; stroke-linecap:square; stroke-linejoin:miter; filter:drop-shadow(0 0 2px rgb(236 230 216 / .45)); }
.orr-svg .orr-chain__glyph.is-short { stroke:rgb(${BONE} / .5); }
.orr-svg .orr-chain__glyph :is(path, rect, circle, ellipse) { vector-effect:non-scaling-stroke; }
.orr-chain__reason { font-family:var(--dp-face-display, "Archivo"); font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 250; font-size:calc(30px * var(--orr-chain-s)); font-weight:250; line-height:1.05; color:rgb(248 244 234); letter-spacing:.14em; text-transform:uppercase; color:rgb(${BONE} / .62); white-space:nowrap; }
.orr-svg .orr-chain__node--out { stroke:rgb(248 244 234); stroke-width:1.6; }
.orr-svg .orr-chain__core { fill:rgb(246 241 230); }
.orr-svg .orr-chain__beam { stroke:rgb(${BONE} / .55); }
.orr-svg .orr-chain__beam--short { stroke:rgb(${BONE} / .3); }
.orr-svg .orr-chain__beam-bloom { stroke:rgb(${BONE} / .9); }
.orr-svg .orr-chain__beam--live { stroke:rgb(${BONE} / .8); }
.orr-svg .orr-chain__pulse { fill:var(--dp-ice, #8fcbff); }
.orr-svg .orr-chain__pulse-bloom { fill:var(--dp-ice, #8fcbff); opacity:.3; }
.orr-chain__rise { opacity:0; animation:orr-chain-rise .46s var(--dp-ease-out, ease-out) forwards; animation-delay:var(--orr-delay, 0ms); }
@keyframes orr-chain-rise { to { opacity:1; } }
html.sf-reduce-motion .orr-chain__rise { animation:none; opacity:1; }
`;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

const f = (n) => Math.round(n * 100) / 100;
let pathSeq = 0;

export function createChainBeam(host, { onLayout = null } = {}) {
  const doc = host && host.ownerDocument ? host.ownerDocument : globalThis.document;
  const inert = { el: host, set() {}, relayout() {}, active: () => false, dispose() {} };
  if (!host || !doc || typeof doc.createElementNS !== 'function' || typeof host.getBoundingClientRect !== 'function') return inert;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('orr-chain', 'is-off');
  const layer = svg('svg', { class: 'orr-svg', 'aria-hidden': 'true', focusable: 'false' });
  host.appendChild(layer);
  let labels = [];
  let data = null;
  let frame = 0;
  let ro = null;
  let on = false;
  let drawnKey = '';

  const schedule = () => {
    if (frame) return;
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf === 'function') frame = raf(() => { frame = 0; layout(); });
    else layout();
  };
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => schedule()); ro.observe(host); }

  function clearLabels() {
    for (const l of labels) if (l.parentNode) l.parentNode.removeChild(l);
    labels = [];
  }
  function standDown() {
    on = false;
    host.classList.add('is-off');
    layer.textContent = '';
    clearLabels();
  }
  const label = (cls, x, y, html) => {
    const el = doc.createElement('div');
    el.className = `orr-chain__label ${cls}`;
    el.innerHTML = html;
    el.style.left = `${f(x)}px`;
    el.style.top = `${f(y)}px`;
    host.appendChild(el);
    labels.push(el);
    return el;
  };

  function layout() {
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (!data || W < 320 || H < 96) { standDown(); return; }
    const key = `${W}x${H}|${JSON.stringify(data)}`;
    if (key === drawnKey) return;
    drawnKey = key;
    on = true;
    host.classList.remove('is-off');
    const arriveNow = !reducedMotion();
    const rise = (node, delay) => { if (!arriveNow) return node; node.classList.add('orr-chain__rise'); node.style.setProperty('--orr-delay', `${delay}ms`); return node; };
    layer.textContent = '';
    clearLabels();
    layer.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const inputs = Array.isArray(data.inputs) ? data.inputs : [];
    // the ring takes its size from the stage's width as well as its height; the geometry follows the
    // ring, the words stay near their reading size and only the product's numeral grows with it
    const rProc = Math.max(24, Math.min(130, W * 0.095, (H - 24) * 0.36));
    const sc = rProc / 24;
    const scL = Math.max(1, Math.min(1.25, rProc / 48));
    host.style.setProperty('--orr-chain-s', scL.toFixed(3));
    host.style.setProperty('--orr-chain-g', Math.min(2.6, sc).toFixed(3));
    host.style.setProperty('--orr-chain-p', `${(rProc * 0.28).toFixed(1)}px`);
    const cy = H / 2;
    const labelW = Math.min(220, W * 0.26);
    const xIn = labelW + 16 * scL;
    const xProc = W / 2 - 20;
    const live = !!data.live;
    const rIn = Math.max(6, 5.6 * sc); const rOut = Math.max(8, 7.4 * sc);
    // the output run: five ring-widths when the stage allows, never under three
    const xOut = Math.max(xProc + rProc * 3, Math.min(W - labelW - 16, xProc + rProc * 5));
    const riseG = (node, delay) => { const g = svg('g', {}); g.appendChild(node); return rise(g, delay); };
    // the input nodes, stacked on the left, each with its beam into the process
    const blocked = data.blocked && data.blocked.reason ? data.blocked : null;
    host.classList.toggle('is-blocked', !!blocked);
    const n = Math.max(1, inputs.length);
    const pitch = Math.min(52 * sc, (H - 20) / n);
    const gIn = Math.min(2.6, sc);
    // a commodity's pictogram (a 24-grid stroke drawing) inside a node, sized to its ring
    const glyphAt = (markup, x, y, r, cls) => {
      const gs = Math.max(10, Math.min(30, r * 0.95));
      const g = svg('g', { class: `orr-chain__glyph${cls ? ' ' + cls : ''}`, transform: `translate(${f(x - gs / 2)} ${f(y - gs / 2)}) scale(${f(gs / 24)})` });
      g.innerHTML = markup;
      return g;
    };
    const top = cy - (pitch * (n - 1)) / 2;
    inputs.forEach((inp, i) => {
      const y = top + pitch * i;
      const short = inp.have < inp.need;
      const toward = Math.atan2(y - cy, xIn - xProc);
      // the beam leaves the node at its rim and stops just inside the ring's stroke: no stub through a
      // dashed node, no knuckle where it meets the ring
      const endX = xProc + (rProc - 1) * Math.cos(toward);
      const endY = cy + (rProc - 1) * Math.sin(toward);
      const x0 = xIn + rIn;
      const d = `M ${f(x0)} ${f(y)} C ${f(x0 + (xProc - x0) * 0.5)} ${f(y)}, ${f(xProc - (xProc - x0) * 0.3)} ${f(endY)}, ${f(endX)} ${f(endY)}`;
      layer.appendChild(riseG(svg('path', { d, class: 'orr-bloom orr-chain__beam-bloom', 'stroke-width': 6, opacity: short ? '.08' : '.22' }), 80 + i * 40));
      const beam = svg('path', { d, class: `orr-core orr-chain__beam${short ? ' orr-chain__beam--short' : live ? ' orr-chain__beam--live' : ''}`, 'stroke-width': 1.2 });
      layer.appendChild(rise(beam, 80 + i * 40));
      if (live && arriveNow && !short) {
        const id = `orr-chain-${++pathSeq}`;
        beam.setAttribute('id', id);
        const pulse = svg('g', {});
        pulse.append(svg('circle', { r: 5, class: 'orr-chain__pulse-bloom' }), svg('circle', { r: 2, class: 'orr-chain__pulse' }));
        const m = svg('animateMotion', { dur: '2.2s', begin: `${(i * 0.5).toFixed(1)}s`, repeatCount: 'indefinite' });
        m.appendChild(svg('mpath', { href: `#${id}` }));
        pulse.appendChild(m);
        layer.appendChild(pulse);
      }
      layer.appendChild(riseG(svg('circle', { cx: f(xIn), cy: f(y), r: rIn, class: 'orr-bloom orr-chain__node-bloom', 'stroke-width': 4, opacity: short ? '.06' : '.16', fill: 'none' }), 60 + i * 40));
      layer.appendChild(rise(svg('circle', { cx: f(xIn), cy: f(y), r: rIn, class: `orr-chain__node${short ? ' orr-chain__node--short' : ''}` }), 60 + i * 40));
      if (inp.glyph) layer.appendChild(rise(glyphAt(inp.glyph, xIn, y, rIn, short ? 'is-short' : ''), 60 + i * 40));
      else if (!short) layer.appendChild(rise(svg('circle', { cx: f(xIn), cy: f(y), r: 2 * gIn, class: 'orr-chain__core' }), 60 + i * 40));
      const l = label(`is-left${short ? ' is-short' : ''}${blocked ? ' is-after-block' : ''}`, 0, y - 16 * scL, `<span class="orr-chain__name">${inp.nameHtml || ''}</span><span class="orr-chain__count"><b>${inp.have}</b> / ${inp.need}${short ? ' · short' : ''}</span>${inp.verbHtml ? `<span class="orr-chain__verb">${inp.verbHtml}</span>` : ''}`);
      l.style.width = `${f(xIn - rIn - 10 * scL)}px`;
      if (arriveNow) { l.classList.add('orr-chain__rise'); l.style.setProperty('--orr-delay', `${100 + i * 40}ms`); }
    });
    // the process: a ring with the word in it
    const proc = svg('g', {});
    proc.append(
      svg('path', { d: arcD(xProc, cy, rProc, 0, 360), class: 'orr-bloom orr-chain__beam-bloom', 'stroke-width': 5, opacity: blocked ? '.06' : '.14' }),
      svg('path', { d: arcD(xProc, cy, rProc, 0, 360), class: `orr-core orr-chain__node--process${blocked ? ' orr-chain__node--blocked' : ''}`, 'stroke-width': 1.2, fill: 'none' }),
      // the ring's own scale: sixty minor ticks inside the stroke, so the time arc has something to read against
      svg('path', { d: ticksD(xProc, cy, rProc - 3, rProc < 90 ? 30 : 60, { len: 3, major: rProc < 90 ? 5 : 15, majorLen: 6, inward: true }), class: 'orr-core orr-chain__scale', 'stroke-width': 1 }),
    );
    // the run time as an arc on that scale: full when instant, filling on a timed job, empty and dashed when blocked
    const timeFrac = blocked ? 0 : (Number.isFinite(data.timeFrac) ? Math.max(0, Math.min(1, data.timeFrac)) : 1);
    if (timeFrac > 0.005) {
      const dT = arcD(xProc, cy, rProc - 9, 0, 360 * timeFrac);
      proc.appendChild(svg('path', { d: dT, class: 'orr-bloom orr-chain__timearc-bloom', 'stroke-width': 5, opacity: '.16' }));
      proc.appendChild(svg('path', { d: dT, class: 'orr-core orr-chain__timearc', 'stroke-width': 1.5 }));
    } else if (blocked) {
      proc.appendChild(svg('path', { d: arcD(xProc, cy, rProc + 8 * scL, 0, 360), class: 'orr-core orr-chain__timearc--off', 'stroke-width': 1 }));
    }
    // a job on the line: its progress as an arc round the ring
    const progress = Number.isFinite(data.progress) ? Math.max(0, Math.min(1, data.progress)) : null;
    if (progress != null && progress > 0.005) {
      proc.appendChild(svg('path', { d: arcD(xProc, cy, rProc + 6 * scL, 0, 360 * progress), class: 'orr-bloom orr-chain__progress-bloom', 'stroke-width': 5, opacity: '.2' }));
      proc.appendChild(svg('path', { d: arcD(xProc, cy, rProc + 6 * scL, 0, 360 * progress), class: 'orr-core orr-chain__progress', 'stroke-width': 1.6 }));
    }
    layer.appendChild(rise(proc, 200));
    // the verb is sized from its ring, so it always sits inside the stroke
    const pl = label('is-centre', xProc - rProc, blocked ? cy - rProc * 0.62 : cy - rProc * 0.18, `<span class="orr-chain__process${blocked ? ' is-blocked' : ''}">${data.process || 'process'}</span>`);
    pl.style.width = `${f(rProc * 2)}px`;
    // the time under the ring; when the station cannot run the line, the reason takes that slot and the time stands over the ring
    // a process that cannot run has no duration: the time stands under the ring only when the line is open
    const tl = blocked ? null : label('is-centre', xProc - 60, cy + rProc + 10 * scL, `<span class="orr-chain__time">${data.timeLabel || ''}</span>`);
    if (tl) tl.style.width = '120px';
    if (blocked) {
      // the reason takes the twelve o'clock slot alone, at label weight in ink; a way out hangs under it when there is one
      const rl = label('is-centre', xProc - 150, cy - rProc - 74 * scL, `<span class="orr-chain__reason">${blocked.reason}</span>${blocked.verbHtml ? `<span class="orr-chain__verb">${blocked.verbHtml}</span>` : ''}`);
      rl.style.width = '300px';
      proc.appendChild(svg('path', { d: `M ${f(xProc)} ${f(cy - rProc - 2)} L ${f(xProc)} ${f(cy - rProc - 20 * scL)}`, class: 'orr-core orr-chain__reason-leader', 'stroke-width': 1.5 }));
      if (arriveNow) { rl.classList.add('orr-chain__rise'); rl.style.setProperty('--orr-delay', '260ms'); }
    }
    if (arriveNow && tl) { tl.classList.add('orr-chain__rise'); tl.style.setProperty('--orr-delay', '240ms'); }
    if (arriveNow) { pl.classList.add('orr-chain__rise'); pl.style.setProperty('--orr-delay', '220ms'); }
    // out: one beam to the product
    const dOut = `M ${f(xProc + rProc - 1)} ${f(cy)} L ${f(xOut - rOut)} ${f(cy)}`;
    layer.appendChild(riseG(svg('path', { d: dOut, class: 'orr-bloom orr-chain__beam-bloom', 'stroke-width': 6, opacity: blocked ? '.05' : live ? '.22' : '.14' }), 260));
    const outBeam = svg('path', { d: dOut, class: `orr-core orr-chain__beam${blocked ? ' orr-chain__beam--short' : live ? ' orr-chain__beam--live' : ''}`, 'stroke-width': 1.4 });
    layer.appendChild(rise(outBeam, 260));
    if (live && arriveNow) {
      const id = `orr-chain-${++pathSeq}`;
      outBeam.setAttribute('id', id);
      const pulse = svg('g', {});
      pulse.append(svg('circle', { r: 5, class: 'orr-chain__pulse-bloom' }), svg('circle', { r: 2, class: 'orr-chain__pulse' }));
      const m = svg('animateMotion', { dur: '1.6s', begin: '1.1s', repeatCount: 'indefinite' });
      m.appendChild(svg('mpath', { href: `#${id}` }));
      pulse.appendChild(m);
      layer.appendChild(pulse);
    }
    layer.appendChild(riseG(svg('circle', { cx: f(xOut), cy: f(cy), r: rOut, class: 'orr-bloom orr-chain__node-bloom', 'stroke-width': 4, opacity: blocked ? '.05' : '.18', fill: 'none' }), 300));
    layer.appendChild(rise(svg('circle', { cx: f(xOut), cy: f(cy), r: rOut, class: `orr-chain__node orr-chain__node--out${blocked ? ' orr-chain__node--short' : ''}` }), 300));
    if (data.output && data.output.glyph) layer.appendChild(rise(glyphAt(data.output.glyph, xOut, cy, rOut, blocked ? 'is-short' : ''), 300));
    const ol = label(`is-centre is-below${blocked ? ' is-ghost' : ''}`, xOut - 110, cy + rOut + 10 * scL, `<span class="orr-chain__qty">${data.output && data.output.qty != null ? data.output.qty : ''}</span><span class="orr-chain__unit">${String(data.output && data.output.unit ? data.output.unit : 'per run').split(' · ').join('<br>')}</span>`);
    if (arriveNow) { ol.classList.add('orr-chain__rise'); ol.style.setProperty('--orr-delay', '340ms'); }
    // the verb's seat: under the product's words, on the product's left edge
    ol.style.width = '220px';
    const yFoot = cy + rOut + 10 * scL + ((ol && ol.offsetHeight) || 60) + 12;
    if (typeof onLayout === 'function') onLayout({ W, H, xOut, rOut, cy, gIn, scL, rProc, xProc, xFoot: xOut - 87, yFoot });
  }

  return {
    el: host,
    /** @param {{ inputs:{nameHtml:string,have:number,need:number}[], process:string, timeLabel?:string, output:{qty:number,unit?:string}, live:boolean }} next */
    set(next) { data = next ? { ...next } : null; drawnKey = ''; schedule(); },
    relayout: schedule,
    active: () => on,
    dispose() {
      if (ro) ro.disconnect();
      if (frame && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(frame);
      frame = 0;
      standDown();
      if (layer.parentNode) layer.parentNode.removeChild(layer);
      host.classList.remove('orr-chain', 'is-off');
    },
  };
}
