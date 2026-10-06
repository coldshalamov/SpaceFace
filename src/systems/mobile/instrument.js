// The phone deck's joystick, drawn as an ORRERY instrument (design/frontend/ORRERY.md §3, §4).
//
// It is not a stick graphic; it is a small orrery that powers up under the thumb:
//   · the RING is the thrust limit: a luminous band with a crisp edge, and a tick scale outside it;
//   · the HAND, the one amber arm, runs from the pivot toward where the thumb points, carried past the
//     thumb out to the ring so the heading stays readable with a finger on top of it;
//   · the THRUST ARC lies on the ring facing the Hand and widens with the push. Its colour is the speed
//     story from the flight dial (bone -> phos -> ice -> azure -> blue-shift), never amber and never red;
//   · the BOOST RING is the dashed outer scale. It brightens as the thumb approaches it and lights solid
//     when boost latches;
//   · BRAKE draws four chevrons closing on the pivot;
//   · the HEADING MARK, a small open chevron on the ring, is where the ship's nose actually points, so
//     the pilot sees the hull catch up with the Hand instead of guessing at its turn rate.
// Light, not material: bloom is a second wider stroke, never a filter (nothing here is allowed to cost a
// frame in flight). Reduced motion removes the arrival/release motion and keeps every state.
//
// Pure presentation: this module reads a pointer's geometry and writes attributes. It owns no gesture,
// no timers beyond the release fade, and nothing about the simulation.
import { svg, arcD, polar, circularText } from '../../ui/orrery/svg.js';
import { SPEED_RAMP } from '../../ui/orrery/speedDial.js';
import { TUNING, clamp, shapeStick } from './model.js';

/** The instrument is authored with the thrust ring at radius 100; CSS scales it to the real radius. */
export const STICK_UNITS = Object.freeze({
  R: 100,
  BOOST_R: Math.round(TUNING.boostEnter * 100),
  HALF: 170,
  /** the thumb's pull is drawn out to here at most, matching the model's clamp */
  KNOB_MAX: 1.45,
});
const { R, BOOST_R, HALF, KNOB_MAX } = STICK_UNITS;
const RAMP_STEPS = 24;
const LEAVE_MS = 190;
const RAD = 180 / Math.PI;

/** The speed ramp at position t (0..1), as [r, g, b]. */
export function rampRgb(t) {
  const x = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  for (let i = 1; i < SPEED_RAMP.length; i += 1) {
    const [t1, c1] = SPEED_RAMP[i];
    if (x <= t1) {
      const [t0, c0] = SPEED_RAMP[i - 1];
      const k = (x - t0) / ((t1 - t0) || 1);
      return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
    }
  }
  return SPEED_RAMP[SPEED_RAMP.length - 1][1].slice();
}

/** Where on the ramp a pull sits: the push itself below the ring, boost territory beyond it. */
export function pullToRamp(raw) {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (raw <= 1) return 0.10 + 0.50 * raw;
  return 0.60 + 0.40 * clamp((raw - 1) / (KNOB_MAX - 1), 0, 1);
}

/** Dial degrees (0 = up, clockwise) of a screen direction. */
export const dialDeg = (x, y) => Math.atan2(x, -y) * RAD;

const circle = (cls, r, extra = {}) => svg('circle', { class: cls, cx: 0, cy: 0, r, ...extra });
const line = (cls) => svg('line', { class: cls, x1: 0, y1: 0, x2: 0, y2: 0 });

/** Dashed circle used as a tick scale: `count` marks of radial length `len`, centred on the dial's top. */
function tickRing(cls, r, count, len, dash) {
  const period = (2 * Math.PI * r) / count;
  return svg('circle', {
    class: cls, cx: 0, cy: 0, r, 'stroke-width': len,
    'stroke-dasharray': `${dash} ${(period - dash).toFixed(3)}`, 'stroke-dashoffset': (dash / 2).toFixed(3),
    transform: 'rotate(-90)',
  });
}

export function createStick(doc = globalThis.document) {
  const root = doc.createElement('div');
  root.className = 'mf-stick';
  root.hidden = true;

  const s = svg('svg', {
    class: 'mf-stick-svg', viewBox: `${-HALF} ${-HALF} ${HALF * 2} ${HALF * 2}`,
    'aria-hidden': 'true', focusable: 'false',
  });
  const plate = circle('mf-plate', R + 4);
  const ticks = svg('g', { class: 'mf-ticks' }, [
    tickRing('mf-tick', 113, 72, 5, 1.6),
    tickRing('mf-tick mf-tick--major', 115, 12, 9, 2.4),
  ]);
  const band = circle('mf-band', R);
  const edge = circle('mf-edge-ring', R);
  const boostBand = svg('circle', {
    class: 'mf-boost-dash', cx: 0, cy: 0, r: BOOST_R,
    'stroke-dasharray': `10 ${((2 * Math.PI * BOOST_R) / 44 - 10).toFixed(3)}`, transform: 'rotate(-90)',
  });
  const boostBloom = circle('mf-boost-bloom', BOOST_R);
  const boostLit = circle('mf-boost-lit', BOOST_R);
  const boostLabel = circularText(0, 0, BOOST_R + 13, 'BOOST', { startDeg: -9, size: 8.5, className: 'mf-micro' });
  const dead = circle('mf-dead', 12);
  const brake = svg('g', { class: 'mf-brake' },
    [0, 90, 180, 270].map(a => svg('path', { d: 'M -7 -86 L 0 -77 L 7 -86', transform: `rotate(${a})` })));
  const heading = svg('g', { class: 'mf-heading' }, [svg('path', { d: 'M -10 -88 L 0 -101 L 10 -88' })]);
  const litBloom = svg('path', { class: 'mf-lit-bloom', d: '' });
  const lit = svg('path', { class: 'mf-lit', d: '' });
  const arm = line('mf-arm');
  const armBloom = line('mf-arm-bloom');
  const armHot = line('mf-arm-hot');
  const beadBloom = circle('mf-bead-bloom', 17);
  const bead = circle('mf-bead', 7.5);
  const pivotRing = circle('mf-pivot', 8);
  const pivotDot = circle('mf-pivot-dot', 2.6);
  for (const n of [plate, ticks, band, edge, boostBand, boostBloom, boostLit, boostLabel, dead, brake, heading,
    litBloom, lit, armBloom, arm, armHot, beadBloom, bead, pivotRing, pivotDot]) s.appendChild(n);
  root.appendChild(s);

  const readout = doc.createElement('div');
  readout.className = 'mf-readout';
  const num = doc.createElement('b'); num.className = 'mf-num';
  const unit = doc.createElement('i'); unit.className = 'mf-unit';
  readout.append(num, unit);
  root.appendChild(readout);

  // Last-written values: a settled frame writes nothing, and a custom property is touched once per colour step.
  const last = { deg: 0, tintStep: -1, d: '', text: '', unit: '', approach: -1, boost: '', reach: '', brake: '',
    kx: NaN, ky: NaN, head: NaN };
  let leaveTimer = 0;

  const setLine = (el, x, y) => { el.setAttribute('x2', x.toFixed(1)); el.setAttribute('y2', y.toFixed(1)); };
  const setData = (key, value) => { if (last[key] !== value) { last[key] = value; root.dataset[key] = value; } };

  /**
   * Draw the instrument for a live contact.
   * `pointer` is the model's stick contact; `view` carries what only the caller knows
   * (the brake latch, the ship's nose on screen, which side the readout sits).
   */
  function update(pointer, { brake: braking = false, heading: nose = null, labelSide = 'below' } = {}) {
    const dx = pointer.x - pointer.ox, dy = pointer.y - pointer.oy;
    const sh = shapeStick(dx, dy, pointer.radius, pointer.boost);
    // A finger resting on the pivot has no heading; keep the last one rather than jitter.
    if (sh.raw * pointer.radius > 3) last.deg = dialDeg(sh.x, sh.y);
    const ext = Math.min(sh.raw, KNOB_MAX);
    const kx = sh.x * ext * R, ky = sh.y * ext * R;
    const tx = Math.sin(last.deg / RAD) * R, ty = -Math.cos(last.deg / RAD) * R;

    // `!(<=)` rather than `>`: the first frame compares against NaN, which must count as a change
    if (!(Math.abs(kx - last.kx) <= 0.15) || !(Math.abs(ky - last.ky) <= 0.15)) {
      last.kx = kx; last.ky = ky;
      setLine(armHot, kx, ky); setLine(armBloom, kx, ky);
      setLine(arm, tx, ty);
      for (const c of [bead, beadBloom]) { c.setAttribute('cx', kx.toFixed(1)); c.setAttribute('cy', ky.toFixed(1)); }
    }

    // thrust arc: centred on the Hand, widening with the push
    const half = 7 + 80 * sh.magnitude;
    const d = sh.magnitude > 0 ? arcD(0, 0, R, last.deg - half, last.deg + half) : '';
    if (d !== last.d) { last.d = d; lit.setAttribute('d', d); litBloom.setAttribute('d', d); }

    const step = Math.round(pullToRamp(sh.raw) * RAMP_STEPS);
    if (step !== last.tintStep) {
      last.tintStep = step;
      const [r, g, b] = rampRgb(step / RAMP_STEPS);
      root.style.setProperty('--mf-tint', `${r} ${g} ${b}`);
    }

    // the boost ring wakes as the thumb nears it and lights when it latches
    const approach = Math.round(clamp((sh.raw - 1) / (TUNING.boostEnter - 1), 0, 1) * 20) / 20;
    if (approach !== last.approach) { last.approach = approach; root.style.setProperty('--mf-approach', String(approach)); }
    setData('boost', pointer.boost ? '1' : '0');
    setData('reach', !pointer.boost && sh.raw >= 1 ? '1' : '0');
    setData('brake', braking ? '1' : '0');
    setData('side', labelSide);

    if (nose != null && Number.isFinite(nose)) {
      if (Math.abs(nose - last.head) > 0.4 || !Number.isFinite(last.head)) {
        last.head = nose; heading.setAttribute('transform', `rotate(${nose.toFixed(1)})`);
      }
      heading.removeAttribute('data-off');
    } else heading.setAttribute('data-off', '1');

    let word, caption;
    if (pointer.boost) { word = 'BOOST'; caption = 'burning'; }
    else if (braking) { word = 'BRAKE'; caption = 'holding'; }
    else { word = String(Math.round(sh.magnitude * 100)); caption = 'thrust'; }
    if (word !== last.text) { last.text = word; num.textContent = word; }
    if (caption !== last.unit) { last.unit = caption; unit.textContent = caption; }
    return sh;
  }

  /** Show for a fresh contact (the arrival animation is CSS, keyed on the removal of `hidden`). */
  function show(pointer, view) {
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = 0; }
    root.classList.remove('is-leaving');
    root.removeAttribute('data-flick');
    if (root.hidden) {
      // a new contact starts from a clean instrument, not the previous pose
      Object.assign(last, { d: '', tintStep: -1, approach: -1, kx: NaN, ky: NaN, head: NaN, text: '', unit: '' });
      root.hidden = false;
    }
    return update(pointer, view);
  }

  /** Let go: the instrument fades where it stood. A flick leaves a bright streak along its heading. */
  function release({ flick = false, immediate = false } = {}) {
    if (root.hidden) return;
    if (immediate) { hide(); return; }
    root.classList.add('is-leaving');
    if (flick) root.dataset.flick = '1';
    if (leaveTimer) clearTimeout(leaveTimer);
    leaveTimer = setTimeout(hide, LEAVE_MS);
  }

  function hide() {
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = 0; }
    root.classList.remove('is-leaving');
    root.removeAttribute('data-flick');
    root.hidden = true;
  }

  return { root, show, update, release, hide, get leaving() { return root.classList.contains('is-leaving'); } };
}
