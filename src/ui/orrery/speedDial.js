// ORRERY Speed Dial — the flight Cluster's speed instrument (design/frontend/ORRERY.md §4 Arc Gauge +
// Scale, §6 Flight). One dial, three reads, no panel:
//   · the BAND: 50 lit blades on a 240 degree sweep opening at the bottom, turned 15 degrees so its high
//     end clears the ring stack. Every blade owns a colour on
//     the speed ramp and is engraved in it faintly before you reach it, so the speed you can still enter
//     is visible before you enter it. 30 blades are the hull's reference speed (the gate); the last 20
//     are the overdrive band, and the final blade is V-MAX, the travel drive's real ceiling;
//   · the NEEDLE: a wedge outside the bezel and a bead on the band, in the tint of the blade it stands on,
//     with a white-hot wake behind the head that stretches while the hull is accelerating;
//   · the READING: the numeral at the pivot of the sweep, in the same tint, over a dark pool.
// The colour is the speed's story and never borrows the Hand's amber or the threat red (ORRERY §3.3):
//   bone (asleep) -> phos (reading) -> ice (the reference gate) -> azure -> blue-shift violet (the ceiling).
// Satisfaction is geometry and motion, not a filter: blades ignite in order, the gate throws one soft ring
// when the hull first crosses it, a faint streak ring turns on the compositor at a rate that follows the
// speed (peripheral vision reads it), boost lights a wide halo along the sweep. Every motion honours
// html.sf-reduce-motion and html.sf-reduce-flash; a settled frame writes nothing.
import { svg, arcD, polar, circularText } from './svg.js';
import { arcGauge } from './instruments.js';
import { createSpring, reducedMotion } from './motion.js';

const STYLE_ID = 'sf-orrery-speeddial-style';

export const SPEED_DIAL = Object.freeze({
  size: 244, c: 122, from: 225, to: 465, blades: 50, refBlade: 30,
  rBand: 92, bandW: 13, rTick: 106, rBoost: 76,
});
const { size: SIZE, c: C, from: FROM, to: TO, blades: BLADES, refBlade: REF_BLADE, rBand: R_BAND, bandW: BAND_W, rTick: R_TICK, rBoost: R_BOOST } = SPEED_DIAL;
const SPAN = TO - FROM;
const T_REF = REF_BLADE / BLADES;       // where the reference gate stands on the sweep
const OVERDRIVE_AT_MAX = 0.97;          // the ceiling is the last blade, with a sliver of arc beyond it
const GHOST = 0.17;                     // an unlit blade: its colour, engraved
const TINT_STEPS = 24;                  // the tint is quantised: one custom-property write per crossing

/** The speed ramp, by position on the sweep. Warm bone asleep; cold light as the speed is earned. */
export const SPEED_RAMP = Object.freeze([
  [0.00, [226, 220, 206]],   // bone: the instrument asleep
  [0.10, [223, 238, 255]],   // phos: a reading
  [0.38, [178, 219, 255]],
  [0.60, [143, 203, 255]],   // ice: the reference gate
  [0.78, [92, 160, 255]],    // azure: above the gate
  [0.90, [142, 120, 255]],   // blue-shift
  [1.00, [214, 190, 255]],   // ultraviolet white: the ceiling
]);

const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

/** Position on the sweep (0..1) for a speed. Linear to the reference, then the overdrive band to V-MAX. */
export function speedDialFraction(speed, ref, max) {
  const s = Math.max(0, Number(speed) || 0);
  const r = Number(ref) > 0 ? Number(ref) : 180;
  if (s <= r) return T_REF * (s / r);
  // with no published ceiling the overdrive band still exists: ref x 1.6 reads as its end
  const m = Number(max) > r * 1.05 ? Number(max) : r * 1.6;
  const over = (s - r) / (m - r);
  const band = over <= 1
    ? OVERDRIVE_AT_MAX * over
    // beyond the ceiling (a sling, a tether, an impulse) the needle creeps and never leaves the arc
    : OVERDRIVE_AT_MAX + (1 - OVERDRIVE_AT_MAX) * (1 - 1 / (1 + (over - 1) * 2));
  return Math.min(1, T_REF + (1 - T_REF) * band);
}

/** The ramp's colour at a position on the sweep, as [r, g, b]. */
export function speedTint(t) {
  const x = clamp01(t);
  for (let i = 1; i < SPEED_RAMP.length; i += 1) {
    const [t1, c1] = SPEED_RAMP[i];
    if (x <= t1) {
      const [t0, c0] = SPEED_RAMP[i - 1];
      const k = t1 === t0 ? 1 : (x - t0) / (t1 - t0);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k));
    }
  }
  return [...SPEED_RAMP[SPEED_RAMP.length - 1][1]];
}

/** The tint step for a position on the sweep: what a write to the dial's colour variable is keyed on. */
export const speedTintStep = (t) => Math.round(clamp01(t) * TINT_STEPS);

/** The numeral: whole units to 9999, then compact so a long figure never outgrows the dial. */
export function formatSpeedReading(speed) {
  const n = Math.max(0, Math.round(Number(speed) || 0));
  if (n < 10000) return String(n);
  if (n < 999500) { const k = n / 1000; return `${k < 99.95 ? k.toFixed(1) : Math.round(k)}k`; }
  return `${Math.min(99.9, n / 1e6).toFixed(1)}M`;
}

/**
 * The speed Scale's colour phase, pure so the contract is testable without DOM. The phase is
 * decided against the DISPLAYED (rounded) reading, so the colour can never disagree with the
 * numeral: 'rest' when the numeral reads 0, 'over' when it rounds above the reference
 * (beyond the hull's reference envelope), else 'flight'.
 */
export function speedPhase(speed, ref) {
  const s = Math.max(0, Number(speed) || 0);
  const r = Number(ref) || 180;
  if (Math.round(s) === 0) return 'rest';
  return Math.round(s) > Math.round(r) ? 'over' : 'flight';
}

const CSS = `
.orr-speeddial { position:absolute; width:${SIZE}px; height:${SIZE}px; pointer-events:none; isolation:isolate; --orr-speed-rgb:226 220 206; }
/* the dial's own pool of shade: a radial fade to nothing, never an edge, so the figure reads over a sunlit hull */
.orr-speeddial::before { content:""; position:absolute; inset:-16px; z-index:-1; border-radius:50%; pointer-events:none;
  background:radial-gradient(closest-side, rgb(3 4 7 / .66), rgb(3 4 7 / .5) 60%, rgb(3 4 7 / .2) 84%, transparent); }
.orr-speeddial__face { position:absolute; left:0; top:0; width:${SIZE}px; height:${SIZE}px; overflow:visible; }
.orr-speeddial__streaks { position:absolute; left:-12px; top:-12px; width:${SIZE + 24}px; height:${SIZE + 24}px; opacity:0; transition:opacity 420ms var(--dp-ease-out); }
.orr-speeddial__streaks svg { width:100%; height:100%; overflow:visible; display:block; }
.orr-speeddial__halo { opacity:0; transition:opacity 260ms var(--dp-ease-out); }
.orr-speeddial.is-boost .orr-speeddial__halo { opacity:1; }
.orr-speeddial__tint { stroke:rgb(var(--orr-speed-rgb)); }
.orr-speeddial__tint-fill { fill:rgb(var(--orr-speed-rgb)); }
.orr-speeddial__read { position:absolute; left:50%; top:calc(50% - 7px); transform:translate(-50%, -50%); display:flex; flex-direction:column; align-items:center; gap:9px; }
.orr-speeddial .orr-numeral { font-size:68px; font-weight:260; line-height:.8; color:rgb(var(--orr-speed-rgb)); transform-origin:50% 62%;
  text-shadow:0 0 22px rgb(var(--orr-speed-rgb) / .34), 0 0 2px rgb(3 4 7 / .55); }
.orr-speeddial .orr-numeral.is-l4 { font-size:54px; }
.orr-speeddial .orr-numeral.is-l5 { font-size:44px; }
.orr-speeddial.is-rest .orr-numeral { color:var(--dp-ink-dim, #b7b4a6); text-shadow:0 0 2px rgb(3 4 7 / .55); }
/* labels hold a 12 px floor on screen whatever the Cluster's scale (the same rule the keys and legend keep) */
.orr-speeddial { --orr-lab:max(12px, calc(12px / var(--orr-cluster-scale, 1))); }
.orr-speeddial .orr-label, .orr-speeddial__lab b { font-size:var(--orr-lab); }
.orr-speeddial .orr-cluster__speedfoot { display:flex; justify-content:center; white-space:nowrap; }
.orr-speeddial .orr-label, .orr-speeddial__lab { text-shadow:0 0 1px rgb(3 4 7 / .95), 0 0 3px rgb(3 4 7 / .85), 0 0 9px rgb(3 4 7 / .6); }
.orr-speeddial__lab { position:absolute; transform:translate(-50%, -50%); white-space:nowrap; display:flex; gap:5px; align-items:baseline; }
.orr-speeddial__lab b { font-family:var(--dp-face-numeral); font-weight:520; letter-spacing:.02em; color:var(--dp-ink, #e8e2d4); }
/* a floor-sized label no longer fits inside the ring once the Cluster scales down: the unit alone names the figure */
@media (max-width: 1700px) { .orr-speeddial__word { display:none; } }
.orr-speeddial__lab.is-max b { color:rgb(var(--orr-max-rgb, 214 190 255)); }
.orr-speeddial__lab[hidden] { display:none; }
.orr-speeddial__tag { position:absolute; left:50%; top:${C + 92}px; transform:translate(-50%, -50%); letter-spacing:.2em; white-space:nowrap; }
.orr-speeddial__tag[hidden] { display:none; }
.orr-speeddial__tag.is-lit { color:rgb(var(--orr-speed-rgb)); }
html.sf-reduce-motion .orr-speeddial__streaks, html.sf-reduce-motion .orr-speeddial__halo { transition:none; }
html.sf-reduce-motion .orr-speeddial__streaks { display:none; }
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
const rgb = ([r, g, b]) => `${r} ${g} ${b}`;
const f1 = (n) => (Math.round(n * 10) / 10).toString();
const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const flashReduced = () => globalThis.document?.documentElement?.classList.contains('sf-reduce-flash') === true;

/** Streak ring: irregular short dashes, so the turning reads as speed and not as a ruler. */
function streakPath(r) {
  const parts = [];
  const n = 30;
  for (let i = 0; i < n; i += 1) {
    const a = (360 * i) / n + ((i * 37) % 11) - 5;
    const len = 5 + ((i * 53) % 7) * 2.2;
    const [x0, y0] = polar(C + 12, C + 12, r, a);
    const [x1, y1] = polar(C + 12, C + 12, r + len, a);
    parts.push(`M ${f1(x0)} ${f1(y0)} L ${f1(x1)} ${f1(y1)}`);
  }
  return parts.join(' ');
}

/**
 * @returns {{ el: HTMLElement, size: number, update(d: {speed:number, ref:number, max?:number, boost?:number, boosting?:boolean, drive?:boolean}): void, arrive(): void, dispose(): void }}
 */
export function createSpeedDial() {
  injectStyle();
  const root = el('div', 'orr-speeddial orr-cluster__fade');
  root.setAttribute('role', 'meter');
  root.setAttribute('aria-label', 'Speed');
  root.setAttribute('aria-valuemin', '0');

  // ---- the streak ring: turns on the compositor, rate follows the speed --------------------------------
  const streaks = el('div', 'orr-speeddial__streaks');
  const streakSvg = svg('svg', { class: 'orr-svg', viewBox: `0 0 ${SIZE + 24} ${SIZE + 24}`, 'aria-hidden': 'true' });
  streakSvg.appendChild(svg('path', { d: streakPath(R_TICK + 24), fill: 'none', stroke: 'rgb(223 238 255 / .34)', 'stroke-width': 1.4, 'stroke-linecap': 'round' }));
  streaks.appendChild(streakSvg);
  root.appendChild(streaks);

  // ---- the face ------------------------------------------------------------------------------------------
  const s = svg('svg', { class: 'orr-svg orr-speeddial__face', viewBox: `0 0 ${SIZE} ${SIZE}`, 'aria-hidden': 'true' });
  root.appendChild(s);

  // boost halo: one wide stroke along the lit sweep, lit only while the afterburner burns
  const haloPath = svg('path', { d: arcD(C, C, R_BAND, FROM, TO), class: 'orr-speeddial__halo orr-speeddial__tint', fill: 'none', 'stroke-width': 30, 'stroke-linecap': 'butt', pathLength: 1, 'stroke-dasharray': '0 1', 'stroke-opacity': '.2' });
  s.appendChild(haloPath);

  // the bezel: a ruler on the outside of the band; the over-reference ticks wear ice
  const minor = [];
  const majorLow = [];
  const majorHigh = [];
  for (let i = 0; i <= BLADES; i += 1) {
    const a = FROM + (SPAN * i) / BLADES;
    const isMajor = i % 5 === 0;
    const [x0, y0] = polar(C, C, R_TICK, a);
    const [x1, y1] = polar(C, C, R_TICK + (isMajor ? 9 : 4), a);
    const seg = `M ${f1(x0)} ${f1(y0)} L ${f1(x1)} ${f1(y1)}`;
    if (!isMajor) minor.push(seg);
    else (i <= REF_BLADE ? majorLow : majorHigh).push(seg);
  }
  s.append(
    svg('path', { d: minor.join(' '), fill: 'none', stroke: 'rgb(236 230 216 / .34)', 'stroke-width': 1.3, 'stroke-linecap': 'butt' }),
    svg('path', { d: majorLow.join(' '), fill: 'none', stroke: 'rgb(236 230 216 / .72)', 'stroke-width': 2, 'stroke-linecap': 'butt' }),
    svg('path', { d: majorHigh.join(' '), fill: 'none', stroke: 'rgb(143 203 255 / .8)', 'stroke-width': 2, 'stroke-linecap': 'butt' }),
  );

  // the band's edges: two hairlines, so the track reads as an instrument and the blades as light on it
  for (const [r, a] of [[R_BAND + BAND_W / 2 + 2, 0.4], [R_BAND - BAND_W / 2 - 2, 0.26]]) {
    s.appendChild(svg('path', { d: arcD(C, C, r, FROM, TO), fill: 'none', stroke: `rgb(236 230 216 / ${a})`, 'stroke-width': 1.2 }));
  }

  // the blades: a bloom twin under each core. Lit = full colour; unlit = its colour, engraved.
  const GAP = 1.2;
  const bloomG = svg('g');
  const coreG = svg('g');
  const bladeCore = [];
  const bladeBloom = [];
  const bladeShown = new Array(BLADES).fill(-1);
  for (let i = 0; i < BLADES; i += 1) {
    const d = arcD(C, C, R_BAND, FROM + (SPAN * i) / BLADES + GAP / 2, FROM + (SPAN * (i + 1)) / BLADES - GAP / 2);
    const tint = `rgb(${rgb(speedTint((i + 0.5) / BLADES))})`;
    const bloom = svg('path', { d, fill: 'none', stroke: tint, 'stroke-width': BAND_W + 9, 'stroke-linecap': 'butt', 'stroke-opacity': '.24', opacity: 0 });
    const core = svg('path', { d, fill: 'none', stroke: tint, 'stroke-width': BAND_W, 'stroke-linecap': 'butt', opacity: GHOST });
    bloomG.appendChild(bloom);
    coreG.appendChild(core);
    bladeBloom.push(bloom);
    bladeCore.push(core);
  }
  s.append(bloomG, coreG);

  // the gate: the reference speed, a bar across the band and a notch on the bezel
  const aRef = FROM + SPAN * T_REF;
  const [g0x, g0y] = polar(C, C, R_BAND - BAND_W / 2 - 5, aRef);
  const [g1x, g1y] = polar(C, C, R_TICK + 30, aRef);
  s.appendChild(svg('path', { d: `M ${f1(g0x)} ${f1(g0y)} L ${f1(g1x)} ${f1(g1y)}`, fill: 'none', stroke: 'rgb(248 244 234 / .92)', 'stroke-width': 2, 'stroke-linecap': 'butt' }));

  // the wake: three stacked white arcs ending at the head; their length is the acceleration
  const wakes = [0.34, 0.67, 1].map((k, i) => ({
    k, path: svg('path', { d: '', fill: 'none', stroke: 'rgb(255 252 246)', 'stroke-width': 5, 'stroke-linecap': 'butt', opacity: [0.9, 0.5, 0.24][i] }),
  }));
  for (const w of wakes) s.appendChild(w.path);

  // the needle: a wedge outside the bezel pointing in, a bead on the band; one group, one rotation
  const needle = svg('g', { opacity: 0 });
  const wedge = `M ${C} ${C - R_TICK - 10} L ${C + 6} ${C - R_TICK - 22} L ${C - 6} ${C - R_TICK - 22} Z`;
  needle.append(
    svg('path', { d: wedge, class: 'orr-speeddial__tint', fill: 'none', 'stroke-width': 7, 'stroke-linejoin': 'round', 'stroke-opacity': '.28' }),
    svg('path', { d: wedge, class: 'orr-speeddial__tint-fill', stroke: 'none' }),
    svg('circle', { cx: C, cy: C - R_BAND, r: 10, class: 'orr-speeddial__tint-fill', 'fill-opacity': '.3' }),
    svg('circle', { cx: C, cy: C - R_BAND, r: 4.6, fill: 'rgb(252 249 240)' }),
  );
  s.appendChild(needle);

  // boost: a segmented charge arc inside the band, engraved by name along the bottom opening
  const boostArc = arcGauge({ cx: C, cy: C, r: R_BOOST, from: FROM, to: TO, width: 2.6, tone: 'hi', segments: 20, segmentGap: 2.2, ghost: true, head: false });
  s.appendChild(boostArc.el);
  s.appendChild(circularText(C, C, R_BOOST - 14, 'BOOST', { startDeg: 192, size: 6.5, className: 'orr-micro orr-micro--hi', upright: true }));

  // the gate ring: thrown once when the hull first crosses the reference, and once at the ceiling
  const pulse = svg('circle', { cx: C, cy: C, r: R_TICK + 6, class: 'orr-speeddial__tint', fill: 'none', 'stroke-width': 2, opacity: 0 });
  pulse.style.transformOrigin = `${C}px ${C}px`;
  s.appendChild(pulse);

  // ---- the reading and the labels -------------------------------------------------------------------------
  const read = el('div', 'orr-cluster__speed orr-speeddial__read');
  const numeral = el('b', 'orr-numeral', '0');
  const foot = el('div', 'orr-cluster__speedfoot');
  const unit = el('span', 'orr-label');
  unit.append(el('span', 'orr-speeddial__word', 'Speed · '), 'wu/s');
  foot.appendChild(unit);
  read.append(numeral, foot);
  root.appendChild(read);

  const lab = (cls, word) => {
    const node = el('span', `orr-label orr-speeddial__lab ${cls}`.trim());
    if (word) node.appendChild(el('span', null, word));
    const val = el('b');
    node.appendChild(val);
    root.appendChild(node);
    return { node, val };
  };
  const place = (node, r, deg) => { const [x, y] = polar(C, C, r, deg); node.style.left = `${f1(x)}px`; node.style.top = `${f1(y)}px`; };
  // the labels stand beyond the pointer's reach (it spans R_TICK + 10..22), so the needle never crosses a word.
  // The ceiling is a bare violet figure, like the last number on a real scale; its blade is V-MAX.
  const zeroLab = el('span', 'orr-label orr-speeddial__lab', '0');
  place(zeroLab, R_TICK + 20, FROM);
  root.appendChild(zeroLab);
  const refLab = lab('', 'Ref');
  place(refLab.node, R_TICK + 40, aRef);
  const maxLab = lab('is-max', '');
  place(maxLab.node, R_TICK + 32, TO);
  maxLab.node.hidden = true;
  const tag = el('span', 'orr-label orr-speeddial__tag');
  tag.hidden = true;
  root.appendChild(tag);

  // ---- state -----------------------------------------------------------------------------------------------
  let target = 0;
  let sweeping = false;
  let sweepTimer = 0;
  let haloOn = false;
  let wasOver = false;
  let wasTop = false;
  let tintStep = -1;
  let wakeDeg = 0;
  let headAngle = FROM;
  let accel = 0;
  let lastT = 0;
  let lastS = 0;
  let lastAria = 0;
  let spin = null;
  let spinBucket = -1;
  const last = {};
  const changed = (k, v) => { if (last[k] === v) return false; last[k] = v; return true; };

  const paintWake = () => {
    const live = wakeDeg > 0 && headAngle > FROM + 0.4;
    for (const w of wakes) {
      const d = live ? arcD(C, C, R_BAND, Math.max(FROM, headAngle - wakeDeg * w.k), headAngle) : '';
      if (w.d === d) continue;   // an idle wake writes nothing
      w.d = d;
      w.path.setAttribute('d', d);
    }
  };

  const throwRing = (tint, popNumeral) => {
    if (reducedMotion() || flashReduced() || typeof pulse.animate !== 'function') return;
    pulse.style.setProperty('--orr-speed-rgb', rgb(tint));
    pulse.animate([{ opacity: 0.8, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.3)' }], { duration: 640, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    if (popNumeral && typeof numeral.animate === 'function') {
      numeral.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.09)', offset: 0.32 }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.34, 1.36, .64, 1)' });
    }
  };

  const paintFraction = (v) => {
    const f = clamp01(v);
    // the lit blades: only the ones between the old reading and the new are touched
    const lit = f * BLADES;
    for (let i = 0; i < BLADES; i += 1) {
      const a = Math.round(clamp01(lit - i) * 20);
      if (bladeShown[i] === a) continue;
      bladeShown[i] = a;
      const k = a / 20;
      bladeCore[i].setAttribute('opacity', f1(GHOST + (1 - GHOST) * k));
      bladeBloom[i].setAttribute('opacity', f1(k));
    }
    headAngle = FROM + SPAN * f;
    needle.setAttribute('opacity', f > 0.004 ? '1' : '0');
    needle.setAttribute('transform', `rotate(${f1(headAngle)} ${C} ${C})`);
    if (haloOn) haloPath.setAttribute('stroke-dasharray', `${f.toFixed(4)} 1`);   // only lit while boosting
    paintWake();
    const step = speedTintStep(f);
    if (step !== tintStep) {
      tintStep = step;
      root.style.setProperty('--orr-speed-rgb', rgb(speedTint(step / TINT_STEPS)));
    }
    if (sweeping) return;
    // gates: hysteresis keeps the ring from chattering when a hull rides the reference
    if (!wasOver && f >= T_REF + 0.004) { wasOver = true; throwRing(speedTint(T_REF), true); }
    else if (wasOver && f < T_REF - 0.02) wasOver = false;
    if (!wasTop && f >= 0.985) { wasTop = true; throwRing(speedTint(1), true); }
    else if (wasTop && f < 0.95) wasTop = false;
  };
  const fraction = createSpring({ value: 0, preset: 'settle', onUpdate: paintFraction });
  paintFraction(0);

  const setSpin = (rate) => {
    if (typeof streaks.animate !== 'function' || reducedMotion()) return;
    const bucket = Math.round(rate * 4);
    if (bucket === spinBucket) return;
    spinBucket = bucket;
    if (!spin) {
      if (!rate) return;
      spin = streaks.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 24000, iterations: Infinity });
    }
    if (!rate) spin.pause();
    else { spin.playbackRate = rate; if (spin.playState !== 'running') spin.play(); }
  };

  const setLabelValue = (node, text) => { if (node.textContent !== text) node.textContent = text; };

  function update({ speed = 0, ref = 180, max = 0, boost = 0, boosting = false, drive = false } = {}) {
    const sp = Math.max(0, Number(speed) || 0);
    const r = Number(ref) > 0 ? Number(ref) : 180;
    const hasMax = Number(max) > r * 1.05;
    const reading = Math.round(sp);

    // the sweep position: the spring owns the motion and ignores a repeat target
    target = speedDialFraction(sp, r, hasMax ? max : 0);
    if (!sweeping) fraction.set(target);

    // acceleration, smoothed, sampled at 20 Hz at most: the wake is how hard the hull is pushing
    const t = nowMs();
    if (!lastT) { lastT = t; lastS = sp; }
    else if (t - lastT >= 50) {
      const a = (sp - lastS) / ((t - lastT) / 1000);
      accel += (a - accel) * 0.4;
      lastT = t; lastS = sp;
      const deg = Math.round(clamp01(accel / (r * 0.5)) * 40);
      if (deg !== wakeDeg) { wakeDeg = deg; paintWake(); }
    }

    if (changed('reading', reading)) {
      const text = formatSpeedReading(sp);
      numeral.textContent = text;
      numeral.classList.toggle('is-l4', text.length === 4);
      numeral.classList.toggle('is-l5', text.length >= 5);
      setSpin(reading === 0 ? 0 : Math.min(18, 0.6 + (sp / r) * 6));
      // the streaks are the "really moving" cue: absent at a crawl, full at ref x 1.3, never at rest
      const seen = Math.round(clamp01((sp / r - 0.4) / 0.9) * 10) / 10;
      if (changed('streaks', seen)) streaks.style.opacity = String(seen);
    }
    if (changed('ref', Math.round(r))) setLabelValue(refLab.val, String(Math.round(r)));
    if (changed('max', hasMax ? Math.round(Number(max)) : 0)) {
      maxLab.node.hidden = !hasMax;
      if (hasMax) {
        setLabelValue(maxLab.val, formatSpeedReading(Number(max)));
        root.style.setProperty('--orr-max-rgb', rgb(speedTint(1)));
      }
    }

    const phase = speedPhase(sp, r);
    const word = drive ? 'Drive' : boosting ? 'Boost' : phase === 'over' ? 'Above ref' : phase === 'rest' ? 'At rest' : '';
    if (changed('phase', `${phase}|${word}|${boosting ? 1 : 0}`)) {
      root.classList.toggle('is-rest', phase === 'rest');
      root.classList.toggle('is-boost', boosting || drive);
      haloOn = boosting || drive;
      if (haloOn) haloPath.setAttribute('stroke-dasharray', `${clamp01(fraction.value).toFixed(4)} 1`);
      root.dataset.phase = phase;
      tag.hidden = !word;
      tag.textContent = word;
      tag.classList.toggle('is-lit', phase !== 'rest');
      boostArc.setTone(boosting ? 'ice' : 'hi');
    }
    const b = clamp01(Number(boost) || 0);
    if (changed('boost', Math.round(b * 100))) boostArc.set(b);

    // the meter's words move at 4 Hz: a reading, not a live region
    if (t - lastAria > 250 && changed('aria', `${reading}|${Math.round(r)}`)) {
      lastAria = t;
      root.setAttribute('aria-valuemax', String(Math.max(1, reading, Math.round(hasMax ? Number(max) : r))));
      root.setAttribute('aria-valuenow', String(reading));
      root.setAttribute('aria-valuetext', `${reading} world units per second; reference ${Math.round(r)}${phase === 'over' ? '; above reference' : ''}`);
    }
  }

  /** The self-test: the needle runs the full sweep once and settles back onto the real reading. */
  function arrive() {
    if (reducedMotion()) return;
    sweeping = true;
    fraction.set(1);
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(() => {
      sweeping = false;
      wasOver = target >= T_REF + 0.004;
      wasTop = target >= 0.985;
      fraction.set(target);
    }, 620);
  }

  return {
    el: root,
    size: SIZE,
    update,
    arrive,
    dispose() {
      fraction.stop();
      boostArc.dispose();
      clearTimeout(sweepTimer);
      if (spin) spin.cancel();
    },
  };
}
