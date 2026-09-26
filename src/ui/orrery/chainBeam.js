// src/ui/orrery/chainBeam.js — the Production Chain (design/frontend/ORRERY.md §4 #6 Beam, §6 Station,
// Industry): a blueprint drawn as the thing it is -- its inputs as nodes on the left, beams of light
// carrying them into the process at the centre, one beam out to what it makes on the right. A node
// whose material is in the hold is a solid ring; one that is short is dashed, its count beside it in
// bone (a shortfall is not a threat). When the line can run, pulses travel the beams; when it cannot,
// the beams rest faint. Words stay the screen's own: the instrument places its labels as DOM.

import { svg, arcD, ticksD, polar } from './svg.js';
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
.orr-svg .orr-chain__scale { stroke:rgb(${BONE} / .34); }
.orr-svg .orr-chain__timearc { stroke:rgb(248 244 234 / .7); }
.orr-svg .orr-chain__timearc-bloom { stroke:rgb(${BONE}); }
.orr-svg .orr-chain__timearc--off { stroke:rgb(${BONE} / .28); }
/* weight, not wire: the run track and every stock gauge are bands under an edge; their fills are lit values with beads */
.orr-svg .orr-chain__track { --orr-band-a:.08; --orr-edge-a:.42; --orr-w-edge:1.5px; }
.orr-svg .orr-chain__track-cap { fill:rgb(${BONE} / .66); }
.orr-svg .orr-chain__stock-track { --orr-band-a:.09; --orr-edge-a:.44; --orr-w-edge:1.5px; }
.orr-svg .orr-chain__stock-div { stroke:rgb(${BONE} / .6); }
.orr-svg .orr-chain__stock-fill { stroke:rgb(248 244 234); }
.orr-svg .orr-chain__stock-bloom { stroke:rgb(${BONE} / .22); }
.orr-svg .orr-chain__beam--short { stroke:rgb(${BONE} / .33); stroke-dasharray:none; }
.orr-chain.is-blocked .orr-svg .orr-chain__node--process.orr-chain__node--blocked { stroke:rgb(${BONE} / .45); }
.orr-chain.is-blocked .orr-svg .orr-chain__node.orr-chain__node--short { stroke:rgb(${BONE} / .4); }
.orr-chain.is-blocked .orr-svg .orr-chain__glyph.is-short { stroke:rgb(${BONE} / .4); }
.orr-chain__label .orr-chain__reason, .orr-chain__reason { color:rgb(248 244 234 / .74) !important; opacity:1 !important; }
/* while the line is blocked, light stops at the block: the product is drawn at the ring's own alpha */
.orr-svg .orr-chain__node.orr-chain__node--short { stroke:rgb(${BONE} / .45); }
.orr-svg .orr-chain__glyph.is-short { stroke:rgb(${BONE} / .45); }
.orr-chain__label.is-ghost { opacity:.5; }
.orr-svg text.orr-chain__procarc { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-size:calc(9.5px * var(--orr-chain-s)); font-weight:650; letter-spacing:.22em; fill:rgb(${BONE} / .72); text-transform:uppercase; }
.orr-svg text.orr-chain__procarc.is-blocked { fill:rgb(${BONE} / .42); }
.orr-chain__tnum { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-weight:250; font-size:calc(46px * var(--orr-chain-t, 1)); line-height:1; letter-spacing:-.01em; color:rgb(248 244 234); }
.orr-chain__tnum.is-blocked { color:rgb(${BONE} / .45); }
.orr-chain__tunit { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-size:calc(9px * var(--orr-chain-s)); font-weight:650; letter-spacing:.16em; color:rgb(${BONE} / .6); margin-top:4px; }
.orr-chain__reason.is-compact { font-size:calc(22px * var(--orr-chain-s)); text-align:left; }
.orr-chain__label.is-left .orr-chain__verb { align-items:flex-start; text-align:left; }
.orr-chain__verb > .orr-chain__blocknote::before { content:none; }
.orr-chain__verb > .orr-chain__wayout { display:block; margin-top:6px; color:rgb(${BONE} / .64); }
.orr-chain__verb > .orr-chain__wayout::before { content:"›  "; color:rgb(${BONE} / .45); }
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
.orr-svg .orr-chain__node { fill:none; stroke:rgb(${BONE} / .85); stroke-width:2; }
.orr-svg .orr-chain__reason-leader { stroke:rgb(${BONE} / .6); }
.orr-chain__label.is-below .orr-chain__qty { display:block; text-align:center; }
.orr-chain__label.is-ghost .orr-chain__qty { font-size:calc(40px * var(--orr-chain-g, 1) * .55); }
.orr-chain__label.is-below .orr-chain__unit { display:block; text-align:center; }
.orr-svg .orr-chain__node--short { stroke:rgb(${BONE} / .55); stroke-dasharray:3.2 2.4; }
.orr-svg .orr-chain__node--process { stroke:rgb(248 244 234); fill:none; }
.orr-svg .orr-chain__node--process.orr-chain__node--blocked { stroke:rgb(${BONE} / .55); stroke-dasharray:4 3; }
.orr-svg .orr-chain__node-bloom { stroke:rgb(${BONE} / .9); }
.orr-svg .orr-chain__progress { stroke:rgb(248 244 234); }
.orr-svg .orr-chain__progress-bloom { stroke:rgb(${BONE} / .22); }
.orr-svg .orr-chain__glyph { fill:none; stroke:rgb(${BONE} / .85); stroke-width:1.35; stroke-linecap:square; stroke-linejoin:miter; filter:drop-shadow(0 0 2px rgb(236 230 216 / .45)); }
.orr-svg .orr-chain__glyph.is-short { stroke:rgb(${BONE} / .5); }
.orr-svg .orr-chain__glyph :is(path, rect, circle, ellipse) { vector-effect:non-scaling-stroke; }
.orr-chain__reason { font-family:var(--dp-face-display, "Archivo"); font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 250; font-size:calc(30px * var(--orr-chain-s)); font-weight:250; line-height:1.05; color:rgb(248 244 234); letter-spacing:.14em; text-transform:uppercase; color:rgb(${BONE} / .62); white-space:nowrap; }
.orr-svg .orr-chain__node--out { stroke:rgb(248 244 234); stroke-width:2.4; }
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
      // the beam lands on the run track (the ring's outer gauge) and arrives flat: no knuckle on the ring's
      // stroke, no hook where a small ring pulls the curve back on itself
      const rT = rProc + 8 * scL;
      const endX = xProc + (rT + 1) * Math.cos(toward);
      const endY = cy + (rT + 1) * Math.sin(toward);
      const x0 = xIn + rIn;
      const run = Math.max(24, Math.min(60 * scL, (endX - x0) * 0.35));
      const d = `M ${f(x0)} ${f(y)} C ${f(x0 + (endX - x0) * 0.45)} ${f(y)}, ${f(endX - run)} ${f(endY)}, ${f(endX)} ${f(endY)}`;
      layer.appendChild(riseG(svg('path', { d, class: 'orr-bloom orr-chain__beam-bloom', 'stroke-width': 9, opacity: short ? '.08' : '.2' }), 80 + i * 40));
      const beam = svg('path', { d, class: `orr-core orr-chain__beam${short ? ' orr-chain__beam--short' : live ? ' orr-chain__beam--live' : ''}`, 'stroke-width': 2 });
      layer.appendChild(rise(beam, 80 + i * 40));
      if (live && arriveNow && !short) {
        const id = `orr-chain-${++pathSeq}`;
        beam.setAttribute('id', id);
        const pulse = svg('g', {});
        pulse.append(svg('circle', { r: 7, class: 'orr-chain__pulse-bloom' }), svg('circle', { r: 2.6, class: 'orr-chain__pulse' }));
        const m = svg('animateMotion', { dur: '2.2s', begin: `${(i * 0.5).toFixed(1)}s`, repeatCount: 'indefinite' });
        m.appendChild(svg('mpath', { href: `#${id}` }));
        pulse.appendChild(m);
        layer.appendChild(pulse);
      }
      // the node is an arc gauge of held stock: a track with one division per unit needed (up to twelve), filled
      // clockwise from twelve o'clock to the fraction held; an empty track is visibly empty, a full one visibly full
      const need = Math.max(1, Number(inp.need) || 1);
      const have = Math.max(0, Math.min(need, Number(inp.have) || 0));
      const frac = have / need;
      const gauge = svg('g', { class: `orr-chain__stock${frac >= 1 ? ' is-full' : frac > 0 ? ' is-part' : ' is-empty'}` });
      const bandW = Math.max(4, Math.min(7, rIn * 0.42));
      gauge.appendChild(svg('circle', { cx: f(xIn), cy: f(y), r: rIn, class: 'orr-band orr-chain__stock-track', style: `--orr-w-band:${f(bandW)}px` }));
      gauge.appendChild(svg('circle', { cx: f(xIn), cy: f(y), r: rIn, class: 'orr-edge orr-chain__stock-track' }));
      if (need <= 12) gauge.appendChild(svg('path', { d: ticksD(xIn, y, rIn, need, { len: 6, major: need + 1, majorLen: 6, inward: true }), class: 'orr-core orr-chain__stock-div', 'stroke-width': 1.5 }));
      if (frac > 0.001) {
        const endDeg = 360 * Math.min(0.9999, frac);
        const dA = arcD(xIn, y, rIn, 0, endDeg);
        gauge.appendChild(svg('path', { d: dA, class: 'orr-lit-bloom orr-chain__stock-bloom', style: `--orr-w-lit-bloom:${f(Math.min(11, bandW * 1.7))}px; stroke-linecap:butt` }));
        gauge.appendChild(svg('path', { d: dA, class: 'orr-lit orr-chain__stock-fill', style: '--orr-w-lit:3px; stroke-linecap:butt' }));
        const [ex, ey] = polar(xIn, y, rIn, endDeg);
        gauge.appendChild(svg('circle', { cx: f(ex), cy: f(ey), r: 5.5, class: 'orr-bead-bloom' }));
        gauge.appendChild(svg('circle', { cx: f(ex), cy: f(ey), r: 2.8, class: 'orr-bead' }));
      }
      layer.appendChild(rise(gauge, 60 + i * 40));
      if (inp.glyph) layer.appendChild(rise(glyphAt(inp.glyph, xIn, y, rIn, short ? 'is-short' : ''), 60 + i * 40));
      else if (!short) layer.appendChild(rise(svg('circle', { cx: f(xIn), cy: f(y), r: 2 * gIn, class: 'orr-chain__core' }), 60 + i * 40));
      const l = label(`is-left${short ? ' is-short' : ''}${blocked ? ' is-after-block' : ''}`, 0, y - 16 * scL, `<span class="orr-chain__name">${inp.nameHtml || ''}</span><span class="orr-chain__count"><b>${inp.have}</b> / ${inp.need}${short ? ' · short' : ''}</span>${inp.verbHtml ? `<span class="orr-chain__verb">${inp.verbHtml}</span>` : ''}`);
      l.style.width = `${f(xIn - rIn - 10 * scL)}px`;
      if (arriveNow) { l.classList.add('orr-chain__rise'); l.style.setProperty('--orr-delay', `${100 + i * 40}ms`); }
    });
    // the process: a ring with the word in it
    const proc = svg('g', {});
    proc.append(
      svg('path', { d: arcD(xProc, cy, rProc, 0, 360), class: 'orr-bloom orr-chain__beam-bloom', 'stroke-width': 8, opacity: blocked ? '.06' : '.14' }),
      svg('path', { d: arcD(xProc, cy, rProc, 0, 360), class: `orr-core orr-chain__node--process${blocked ? ' orr-chain__node--blocked' : ''}`, 'stroke-width': 2, fill: 'none' }),
      // the ring's own scale: sixty minor ticks inside the stroke, so the time arc has something to read against
      svg('path', { d: ticksD(xProc, cy, rProc - 3, rProc < 90 ? 30 : 60, { len: 3, major: rProc < 90 ? 5 : 15, majorLen: 6, inward: true }), class: 'orr-core orr-chain__scale', 'stroke-width': 1.5 }),
    );
    // the run time as an arc on that scale: full when instant, filling on a timed job, empty and dashed when blocked
    const timeFrac = blocked ? 0 : (Number.isFinite(data.timeFrac) ? Math.max(0, Math.min(1, data.timeFrac)) : 1);
    if (timeFrac > 0.005) {
      const dT = arcD(xProc, cy, rProc - 9, 0, 360 * timeFrac);
      proc.appendChild(svg('path', { d: dT, class: 'orr-bloom orr-chain__timearc-bloom', 'stroke-width': 8, opacity: '.16' }));
      proc.appendChild(svg('path', { d: dT, class: 'orr-core orr-chain__timearc', 'stroke-width': 2.4 }));
    }
    // the run track: the ring's outer gauge, open at twelve o'clock (the reason's leader lands in the gap) and capped
    // at both ends so an empty track reads as a track that will fill; a job's progress fills it clockwise from the gap
    const rT = rProc + 8 * scL;
    const gapDeg = (7 / (2 * Math.PI * rT)) * 360;
    const trackW = Math.max(4, Math.min(6, 6 * scL - 1));
    proc.appendChild(svg('path', { d: arcD(xProc, cy, rT, gapDeg, 360 - gapDeg), class: 'orr-band orr-chain__track', style: `--orr-w-band:${f(trackW)}px; stroke-linecap:butt` }));
    proc.appendChild(svg('path', { d: arcD(xProc, cy, rT, gapDeg, 360 - gapDeg), class: 'orr-edge orr-chain__track' }));
    for (const a of [gapDeg, 360 - gapDeg]) { const [tx, ty] = polar(xProc, cy, rT, a); proc.appendChild(svg('circle', { cx: f(tx), cy: f(ty), r: 2.4, class: 'orr-chain__track-cap' })); }
    const progress = Number.isFinite(data.progress) ? Math.max(0, Math.min(1, data.progress)) : null;
    if (progress != null && progress > 0.005) {
      const dP = arcD(xProc, cy, rT, gapDeg, gapDeg + (360 - 2 * gapDeg) * progress);
      proc.appendChild(svg('path', { d: dP, class: 'orr-lit-bloom orr-chain__progress-bloom', style: '--orr-w-lit-bloom:10px' }));
      proc.appendChild(svg('path', { d: dP, class: 'orr-lit orr-chain__progress', style: '--orr-w-lit:3px' }));
      const [px2, py2] = polar(xProc, cy, rT, gapDeg + (360 - 2 * gapDeg) * progress);
      proc.appendChild(svg('circle', { cx: f(px2), cy: f(py2), r: 7, class: 'orr-bead-bloom' }));
      proc.appendChild(svg('circle', { cx: f(px2), cy: f(py2), r: 3.4, class: 'orr-bead' }));
    }
    // the process name rides the top of the ring's inner scale
    const arcId = `orr-chain-arc-${++pathSeq}`;
    proc.appendChild(svg('path', { id: arcId, d: arcD(xProc, cy, rProc - 19 * scL, -75, 75), fill: 'none', stroke: 'none' }));
    const arcText = svg('text', { class: `orr-chain__procarc${blocked ? ' is-blocked' : ''}` });
    const arcPath = svg('textPath', { href: `#${arcId}`, startOffset: '50%', 'text-anchor': 'middle' });
    arcPath.textContent = String(data.process || 'process').toUpperCase();
    arcText.appendChild(arcPath);
    proc.appendChild(arcText);
    layer.appendChild(rise(proc, 200));
    // the run's time stands at the ring's centre as the thin display numeral: the ring is the gauge of the run
    const tm = /^(\d+(?:\.\d+)?)\s*s$/i.exec(String(data.timeLabel || '').trim());
    const instant = /instant/i.test(String(data.timeLabel || ''));
    const tnum = blocked ? '\u2014' : tm ? tm[1] : instant ? '0' : String(data.timeLabel || '');
    const tunit = blocked ? '' : tm ? 'S' : instant ? 'S \u00b7 INSTANT' : '';
    const pl = label('is-centre', xProc - rProc, cy - 22 * scL, `<span class="orr-chain__tnum${blocked ? ' is-blocked' : ''}">${tnum}</span>${tunit ? `<span class="orr-chain__tunit">${tunit}</span>` : ''}`);
    pl.style.width = `${f(rProc * 2)}px`;
    pl.style.setProperty('--orr-chain-t', f(Math.max(0.55, Math.min(1, rProc / 130))));
    const tl = null;
    if (blocked) {
      // the reason takes the twelve o'clock slot alone, at label weight in ink; a way out hangs under it when there is one
      const compactW = W < 1000;
      const rl = label(compactW ? 'is-left' : 'is-centre', compactW ? xProc : xProc - 150, cy - rProc - (compactW ? 58 : 74) * scL, `<span class="orr-chain__reason${compactW ? ' is-compact' : ''}">${blocked.reason}</span>${blocked.verbHtml ? `<span class="orr-chain__verb">${blocked.verbHtml}</span>` : ''}`);
      rl.style.width = compactW ? '320px' : '300px';
      // the block's last line (the way out) clears the leader: seat the block's foot 26px above the ring
      if (rl.offsetHeight) rl.style.top = `${f(cy - rProc - 26 * scL - rl.offsetHeight)}px`;
      proc.appendChild(svg('path', { d: `M ${f(xProc)} ${f(cy - rProc - 2)} L ${f(xProc)} ${f(cy - rProc - 20 * scL)}`, class: 'orr-core orr-chain__reason-leader', 'stroke-width': 2 }));
      if (arriveNow) { rl.classList.add('orr-chain__rise'); rl.style.setProperty('--orr-delay', '260ms'); }
    }
    if (arriveNow && tl) { tl.classList.add('orr-chain__rise'); tl.style.setProperty('--orr-delay', '240ms'); }
    if (arriveNow) { pl.classList.add('orr-chain__rise'); pl.style.setProperty('--orr-delay', '220ms'); }
    // out: one beam to the product
    const dOut = `M ${f(xProc + rProc - 1)} ${f(cy)} L ${f(xOut - rOut - 2)} ${f(cy)}`;
    layer.appendChild(riseG(svg('path', { d: dOut, class: 'orr-bloom orr-chain__beam-bloom', 'stroke-width': 10, opacity: blocked ? '.05' : live ? '.2' : '.14' }), 260));
    const outBeam = svg('path', { d: dOut, class: `orr-core orr-chain__beam${blocked ? ' orr-chain__beam--short' : live ? ' orr-chain__beam--live' : ''}`, 'stroke-width': 2.4 });
    layer.appendChild(rise(outBeam, 260));
    if (live && arriveNow) {
      const id = `orr-chain-${++pathSeq}`;
      outBeam.setAttribute('id', id);
      const pulse = svg('g', {});
      pulse.append(svg('circle', { r: 7, class: 'orr-chain__pulse-bloom' }), svg('circle', { r: 2.6, class: 'orr-chain__pulse' }));
      const m = svg('animateMotion', { dur: '1.6s', begin: '1.1s', repeatCount: 'indefinite' });
      m.appendChild(svg('mpath', { href: `#${id}` }));
      pulse.appendChild(m);
      layer.appendChild(pulse);
    }
    layer.appendChild(riseG(svg('circle', { cx: f(xOut), cy: f(cy), r: rOut, class: 'orr-bloom orr-chain__node-bloom', 'stroke-width': 7, opacity: blocked ? '.05' : '.18', fill: 'none' }), 300));
    layer.appendChild(rise(svg('circle', { cx: f(xOut), cy: f(cy), r: rOut, class: `orr-chain__node orr-chain__node--out${blocked ? ' orr-chain__node--short' : ''}` }), 300));
    if (data.output && data.output.glyph) layer.appendChild(rise(glyphAt(data.output.glyph, xOut, cy, rOut, blocked ? 'is-short' : ''), 300));
    const ol = label(`is-centre is-below${blocked ? ' is-ghost' : ''}`, xOut - 110, cy + rOut + 10 * scL, `<span class="orr-chain__qty">${data.output && data.output.qty != null ? data.output.qty : ''}</span><span class="orr-chain__unit">${String(data.output && data.output.unit ? data.output.unit : 'per run').split(' · ').join('<br>')}</span>`);
    if (arriveNow) { ol.classList.add('orr-chain__rise'); ol.style.setProperty('--orr-delay', '340ms'); }
    // the verb's seat: under the product's words, on the product's left edge
    ol.style.width = '220px';
    const yFoot = cy + rOut + 10 * scL + ((ol && ol.offsetHeight) || 60) + 12;
    if (typeof onLayout === 'function') onLayout({ W, H, xOut, rOut, cy, gIn, scL, rProc, xProc, xFoot: xOut, yFoot });
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
