// src/ui/orrery/chainBeam.js — the Production Chain (design/frontend/ORRERY.md §4 #6 Beam, §6 Station,
// Industry): a blueprint drawn as the thing it is -- its inputs as nodes on the left, beams of light
// carrying them into the process at the centre, one beam out to what it makes on the right. A node
// whose material is in the hold is a solid ring; one that is short is dashed, its count beside it in
// bone (a shortfall is not a threat). When the line can run, pulses travel the beams; when it cannot,
// the beams rest faint. Words stay the screen's own: the instrument places its labels as DOM.

import { svg, arcD } from './svg.js';
import { injectOrrery } from './tokens.js';
import { reducedMotion } from './motion.js';

const STYLE_ID = 'orr-chain-beam-style';
const BONE = '236 230 216';

const CSS = `
.orr-chain { position:relative; width:100%; height:100%; min-height:150px; isolation:isolate; --orr-chain-s:1; }
.orr-chain::before { content:""; position:absolute; z-index:-1; inset:-12% -6%; pointer-events:none; background:radial-gradient(closest-side, rgb(6 8 11 / .8), rgb(6 8 11 / .55) 60%, rgb(6 8 11 / 0)); }
.orr-chain > svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
.orr-chain.is-off > svg, .orr-chain.is-off > .orr-chain__label { display:none; }
.orr-chain__label { position:absolute; display:flex; flex-direction:column; gap:2px; pointer-events:none; white-space:nowrap; }
.orr-chain__label.is-left { align-items:flex-end; text-align:right; }
.orr-chain__label.is-right { align-items:flex-start; text-align:left; }
.orr-chain__label.is-centre { align-items:center; text-align:center; }
.orr-chain__name { font-family:var(--dp-face-body, "Instrument Sans"); font-size:calc(13px * var(--orr-chain-s)); font-weight:600; color:rgb(248 244 234); }
.orr-chain__label.is-short .orr-chain__name { color:rgb(${BONE} / .8); }
.orr-chain__count { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:calc(10px * var(--orr-chain-s)); letter-spacing:.14em; text-transform:uppercase; color:rgb(${BONE} / .62);
  font-variant-numeric:tabular-nums; }
.orr-chain__count b { font-weight:650; color:rgb(248 244 234); }
.orr-chain__label.is-short .orr-chain__count b { color:rgb(${BONE} / .85); }
.orr-chain__process { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:calc(9px * var(--orr-chain-s)); letter-spacing:.2em; text-transform:uppercase; color:rgb(${BONE} / .7); }
.orr-chain__time { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-size:calc(9.5px * var(--orr-chain-s)); font-weight:650; letter-spacing:.14em; text-transform:uppercase; color:rgb(${BONE} / .6); }
.orr-chain__qty { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-weight:250; font-size:calc(40px * var(--orr-chain-s)); line-height:1; letter-spacing:-.01em; color:rgb(248 244 234); font-variant-numeric:tabular-nums; }
.orr-chain__unit { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:calc(9.5px * var(--orr-chain-s)); white-space:nowrap; line-height:1.3; letter-spacing:.16em; text-transform:uppercase; color:rgb(${BONE} / .6); }
.orr-svg .orr-chain__node { fill:rgb(6 8 11 / .9); stroke:rgb(${BONE} / .85); stroke-width:1.3; }
.orr-svg .orr-chain__node--short { stroke:rgb(${BONE} / .55); stroke-dasharray:3.2 2.4; }
.orr-svg .orr-chain__node--process { stroke:rgb(248 244 234); fill:none; }
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

export function createChainBeam(host) {
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
    const sc = Math.max(1, Math.min(2.5, H / 170));
    host.style.setProperty('--orr-chain-s', sc.toFixed(3));
    const cy = H / 2;
    const labelW = Math.min(220, W * 0.26);
    const xIn = labelW + 24 * sc;
    const xProc = W / 2 - 20;
    const xOut = W - labelW - 60 * sc;
    const live = !!data.live;
    const rIn = 6 * sc; const rProc = 24 * sc; const rOut = 8 * sc;
    // the input nodes, stacked on the left, each with its beam into the process
    const n = Math.max(1, inputs.length);
    const pitch = Math.min(52 * sc, (H - 20) / n);
    const top = cy - (pitch * (n - 1)) / 2;
    inputs.forEach((inp, i) => {
      const y = top + pitch * i;
      const short = inp.have < inp.need;
      const toward = Math.atan2(y - cy, xIn - xProc);
      const endX = xProc + rProc * Math.cos(toward);
      const endY = cy + rProc * Math.sin(toward);
      const d = `M ${f(xIn)} ${f(y)} C ${f(xIn + (xProc - xIn) * 0.5)} ${f(y)}, ${f(xProc - (xProc - xIn) * 0.3)} ${f(endY)}, ${f(endX)} ${f(endY)}`;
      layer.appendChild(rise(svg('path', { d, class: 'orr-bloom orr-chain__beam-bloom', 'stroke-width': 5, opacity: short ? '.06' : '.14' }), 80 + i * 40));
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
      layer.appendChild(rise(svg('circle', { cx: f(xIn), cy: f(y), r: rIn, class: `orr-chain__node${short ? ' orr-chain__node--short' : ''}` }), 60 + i * 40));
      if (!short) layer.appendChild(rise(svg('circle', { cx: f(xIn), cy: f(y), r: 2 * sc, class: 'orr-chain__core' }), 60 + i * 40));
      const l = label(`is-left${short ? ' is-short' : ''}`, 0, y - 16 * sc, `<span class="orr-chain__name">${inp.nameHtml || ''}</span><span class="orr-chain__count"><b>${inp.have}</b> / ${inp.need}${short ? ' · short' : ''}</span>`);
      l.style.width = `${f(xIn - 14 * sc)}px`;
      if (arriveNow) { l.classList.add('orr-chain__rise'); l.style.setProperty('--orr-delay', `${100 + i * 40}ms`); }
    });
    // the process: a ring with the word in it
    const proc = svg('g', {});
    proc.append(
      svg('path', { d: arcD(xProc, cy, rProc, 0, 360), class: 'orr-bloom orr-chain__beam-bloom', 'stroke-width': 5, opacity: '.14' }),
      svg('path', { d: arcD(xProc, cy, rProc, 0, 360), class: 'orr-core orr-chain__node--process', 'stroke-width': 1.2, fill: 'none' }),
      svg('path', { d: arcD(xProc, cy, rProc + 6 * sc, 0, 360), class: 'orr-core orr-faint', 'stroke-width': 1, 'stroke-dasharray': '2 3' }),
    );
    layer.appendChild(rise(proc, 200));
    const pl = label('is-centre', xProc - 60, cy - 6 * sc, `<span class="orr-chain__process">${data.process || 'process'}</span>`);
    pl.style.width = '120px';
    const tl = label('is-centre', xProc - 60, cy + rProc + 10 * sc, `<span class="orr-chain__time">${data.timeLabel || ''}</span>`);
    tl.style.width = '120px';
    if (arriveNow) { tl.classList.add('orr-chain__rise'); tl.style.setProperty('--orr-delay', '240ms'); }
    if (arriveNow) { pl.classList.add('orr-chain__rise'); pl.style.setProperty('--orr-delay', '220ms'); }
    // out: one beam to the product
    const dOut = `M ${f(xProc + rProc)} ${f(cy)} L ${f(xOut - rOut)} ${f(cy)}`;
    layer.appendChild(rise(svg('path', { d: dOut, class: 'orr-bloom orr-chain__beam-bloom', 'stroke-width': 5, opacity: live ? '.16' : '.08' }), 260));
    const outBeam = svg('path', { d: dOut, class: `orr-core orr-chain__beam${live ? ' orr-chain__beam--live' : ''}`, 'stroke-width': 1.4 });
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
    layer.appendChild(rise(svg('circle', { cx: f(xOut), cy: f(cy), r: rOut, class: 'orr-chain__node orr-chain__node--out' }), 300));
    layer.appendChild(rise(svg('circle', { cx: f(xOut), cy: f(cy), r: 2.4 * sc, class: 'orr-chain__core' }), 300));
    const ol = label('is-right', xOut + 18 * sc, cy - 26 * sc, `<span class="orr-chain__qty">${data.output && data.output.qty != null ? data.output.qty : ''}</span><span class="orr-chain__unit">${String(data.output && data.output.unit ? data.output.unit : 'per run').split(' · ').join('<br>')}</span>`);
    if (arriveNow) { ol.classList.add('orr-chain__rise'); ol.style.setProperty('--orr-delay', '340ms'); }
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
