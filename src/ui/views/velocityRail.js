// Velocity rail: the flight HUD's speed instrument. Presentation only; no sim writes, observers,
// simulation subscriptions, layout reads or animation loops. One focus adapter retains the host tooltip owner. See velocity-rail.test.mjs for the contract.
import { mountVelocityRailStyles } from './velocityRailStyles.js';

// Original continuous display figures, drawn on a 40 x 64 grid. These are authored SVG paths,
// not seven-segment digits or a font dependency. Five reusable slots bound the live DOM cost.
export const SPEED_FIGURES = Object.freeze({
  "0": "M13 0H27Q40 0 40 14V50Q40 64 27 64H13Q0 64 0 50V14Q0 0 13 0ZM14 11Q11 11 11 15V49Q11 53 14 53H26Q29 53 29 49V15Q29 11 26 11Z",
  "1": "M7 13L20 0H30V64H18V17L7 28Z",
  "2": "M0 14Q0 0 14 0H26Q40 0 40 14V23Q40 30 33 35L12 50V53H40V64H0V50Q0 44 7 39L26 25Q29 23 29 20V15Q29 11 25 11H15Q11 11 11 15V21H0Z",
  "3": "M0 0H26Q40 0 40 14V24Q40 29 35 32Q40 35 40 41V50Q40 64 26 64H0V53H25Q29 53 29 49V42Q29 38 25 38H9V27H25Q29 27 29 23V15Q29 11 25 11H0Z",
  "4": "M21 0H34V39H40V50H34V64H23V50H0V37ZM23 16L10 39H23Z",
  "5": "M0 0H40V11H11V25H26Q40 25 40 39V50Q40 64 26 64H0V53H25Q29 53 29 49V40Q29 36 25 36H0Z",
  "6": "M16 0H37V11H17Q11 11 11 17V25H26Q40 25 40 39V50Q40 64 26 64H14Q0 64 0 50V17Q0 0 16 0ZM15 36Q11 36 11 40V49Q11 53 15 53H25Q29 53 29 49V40Q29 36 25 36Z",
  "7": "M0 0H40V11L18 64H5L27 11H0Z",
  "8": "M14 0H26Q40 0 40 14V24Q40 29 35 32Q40 35 40 41V50Q40 64 26 64H14Q0 64 0 50V41Q0 35 5 32Q0 29 0 24V14Q0 0 14 0ZM15 11Q11 11 11 15V23Q11 27 15 27H25Q29 27 29 23V15Q29 11 25 11ZM15 38Q11 38 11 42V49Q11 53 15 53H25Q29 53 29 49V42Q29 38 25 38Z",
  "9": "M14 0H26Q40 0 40 14V47Q40 64 24 64H3V53H23Q29 53 29 47V39H14Q0 39 0 25V14Q0 0 14 0ZM15 11Q11 11 11 15V24Q11 28 15 28H25Q29 28 29 24V15Q29 11 25 11Z",
  ".": "M0 53H11V64H0Z",
  "k": "M0 0H11V35L27 19H40L21 39L40 64H26L11 44V64H0Z",
  "M": "M0 64V0H10L20 24L30 0H40V64H29V26L20 45L11 26V64Z",
  "G": "M10 0H40V11H14L11 14V50L14 53H29V39H21V28H40V64H10L0 54V10Z",
  "\u2014": "M0 27H40V38H0Z",
  "+": "M14 12H26V26H40V38H26V52H14V38H0V26H14Z"
});
const CACHE = new WeakMap();
const RESOLUTION = 512;
const COMPACT_UNITS = Object.freeze([['k', 1e3], ['M', 1e6], ['G', 1e9]]);
let tooltipSerial = 0;

export function formatSpeedFigure(value) {
  if (!Number.isFinite(value)) return '—';
  const n = Math.max(0, Math.round(value));
  if (n < 10000) return String(n);
  for (const [unit, scale] of COMPACT_UNITS) {
    if (n < scale * 999.5) {
      const v = n / scale;
      // Select precision after rounding carry: 99.95k must not become six glyphs (100.0k).
      return (v < 99.95 ? v.toFixed(1) : String(Math.round(v))) + unit;
    }
  }
  return '999G+';
}

/** Pure model for consumers/tests. The frame writer below uses scalar caches, not this allocation. */
export function velocityRailModel(value, reference) {
  const available = Number.isFinite(value);
  const speed = available ? Math.max(0, value) : 0;
  const hasReference = Number.isFinite(reference) && reference > 0;
  const fraction = hasReference ? Math.min(1, speed / reference) : 0;
  return {
    available, speed, hasReference,
    fraction: Math.round(fraction * RESOLUTION) / RESOLUTION,
    aboveReference: available && hasReference && Math.round(speed) > Math.round(reference),
  };
}

export function speedGaugeMarkup() {
  mountVelocityRailStyles();
  const tipId = `sf-speed-tip-${++tooltipSerial}`;
  return '<div class="sf-kit-gauge sf-speed sf-stat--info" role="meter" tabindex="0" aria-label="Speed" ' +
    `aria-describedby="${tipId}" ` +
    'aria-valuemin="0" aria-valuemax="1" aria-valuenow="0" aria-valuetext="0 world units per second; reference unavailable" ' +
    'data-available="true" data-over-reference="false" data-has-reference="false">' +
    '<span class="sf-speed__label" aria-hidden="true">SPEED</span>' +
    '<span class="sf-speed__reference" aria-hidden="true">REF <b>—</b></span>' +
    '<span class="sf-speed__source" data-k="speed" aria-hidden="true">0</span>' +
    '<svg class="sf-speed__digits" viewBox="0 0 196 64" aria-hidden="true" focusable="false" preserveAspectRatio="xMinYMid meet">' +
      Array.from({ length: 5 }, (_, i) => '<path fill-rule="evenodd" ' +
        (i ? 'display="none"' : 'd="' + SPEED_FIGURES['0'] + '"') + '/>').join('') +
    '</svg>' +
    '<span class="sf-speed__unit" aria-hidden="true">WU/S</span>' +
    '<div class="sf-speed__track" aria-hidden="true">' +
      '<span class="sf-speed__bed"></span><span class="sf-speed__fill"></span>' +
      '<svg class="sf-speed__ticks" viewBox="0 0 256 5" preserveAspectRatio="none" focusable="false"><path d="M64 0V5M128 0V5M192 0V5" stroke="currentColor" stroke-width="2"/></svg>' +
      '<span class="sf-speed__cursor"><svg viewBox="0 0 8 16" focusable="false"><path d="M0 0H8L4 5ZM3 7H5V16H3Z"/></svg></span>' +
      '<svg class="sf-speed__runout" viewBox="0 0 8 11" focusable="false"><path d="M1 1L6 5.5L1 10" fill="none" stroke="currentColor" stroke-width="2"/></svg>' +
    '</div>' +
    '<span class="sf-speed__zero" aria-hidden="true">0</span>' +
    '<span class="sf-speed__extent" aria-hidden="true">NO REFERENCE</span>' +
    `<div class="sf-tip" id="${tipId}" data-tip="speed">Speed in world units per second. REF is the hull reference, not a speed limit.</div>` +
  '</div>';
}

// The legacy host lazily calculates braking detail on mouseenter. Route focus to that existing
// owner rather than copying its physics/formatting or adding another telemetry writer. This local,
// non-bubbling notification does not simulate pointer movement or steal any game input.
function refreshTooltipOnFocus(event) {
  const root = event.currentTarget;
  const MouseEvent = root.ownerDocument?.defaultView?.MouseEvent;
  if (MouseEvent) root.dispatchEvent(new MouseEvent('mouseenter'));
}

function parts(el) {
  let p = CACHE.get(el);
  if (p) return p;
  p = {
    source: el.querySelector('[data-k="speed"]'),
    digits: el.querySelector('.sf-speed__digits'),
    glyphs: el.querySelectorAll('.sf-speed__digits path'),
    reference: el.querySelector('.sf-speed__reference b'),
    extent: el.querySelector('.sf-speed__extent'),
    fill: el.querySelector('.sf-speed__fill'),
    cursor: el.querySelector('.sf-speed__cursor'),
    value: undefined, referenceValue: undefined, sourceText: undefined,
    reading: undefined, hasReference: undefined,
  };
  el.addEventListener?.('focus', refreshTooltipOnFocus);
  CACHE.set(el, p);
  return p;
}
function attr(el, key, value) {
  const next = String(value);
  if (el.getAttribute(key) !== next) el.setAttribute(key, next);
}
function text(el, value) { if (el && el.textContent !== value) el.textContent = value; }
function figures(p, value) {
  const label = formatSpeedFigure(value);
  if (p.label === label) return;
  p.label = label;
  let x = 0;
  for (let i = 0; i < p.glyphs.length; i++) {
    const glyph = p.glyphs[i], char = label[i];
    if (!char) { attr(glyph, 'display', 'none'); continue; }
    attr(glyph, 'd', SPEED_FIGURES[char] || SPEED_FIGURES['—']);
    attr(glyph, 'display', 'inline');
    attr(glyph, 'transform', `translate(${x} 0)`);
    x += char === '.' ? 17 : 46;
  }
  // One through four digits retain their physical size; only long compact notation scales down.
  attr(p.digits, 'viewBox', `0 0 ${Math.max(196, x - 6)} 64`);
}

/**
 * Existing HUD seam: the rail follows frame telemetry; the figures follow the HUD-owned 10 Hz
 * [data-k=speed] text on the next frame. Never write that source or add a second clock/observer.
 * REF is a hull reference, not a clamp. Travel, tethers and impulses may legitimately exceed it.
 * Unchanged samples do no writes or queries. Changing analog-only frames touch two transforms;
 * number formatting, SVG paths and accessibility are gated to a changed sampled reading/reference.
 */
export function setKitGauge(el, value, reference) {
  if (!el) return;
  const p = parts(el);
  const sourceText = p.source?.textContent ?? String(value);
  const referenceChanged = !Object.is(p.referenceValue, reference);
  if (Object.is(p.value, value) && !referenceChanged && p.sourceText === sourceText) return;
  p.value = value; p.referenceValue = reference; p.sourceText = sourceText;

  const finite = Number.isFinite(value);
  const hasReference = Number.isFinite(reference) && reference > 0;
  const speed = finite ? Math.max(0, value) : 0;
  const fraction = hasReference ? Math.round(Math.min(1, speed / reference) * RESOLUTION) / RESOLUTION : 0;
  if (p.fraction !== fraction) {
    p.fraction = fraction;
    if (p.fill) p.fill.style.transform = `scaleX(${fraction})`;
    if (p.cursor) p.cursor.style.transform = `translateX(${(fraction * 100).toFixed(3)}%)`;
  }

  const sampled = sourceText.trim() === '' ? NaN : Number(sourceText);
  const reading = finite && Number.isFinite(sampled) ? Math.max(0, Math.round(sampled)) : NaN;
  if (Object.is(p.reading, reading) && !referenceChanged && p.hasReference === hasReference) return;
  p.reading = reading; p.hasReference = hasReference;
  const available = Number.isFinite(reading);
  const referenceReading = hasReference ? Math.round(reference) : 0;
  const aboveReference = available && hasReference && reading > referenceReading;
  figures(p, reading);
  if (referenceChanged) text(p.reference, hasReference ? formatSpeedFigure(reference) : '—');
  text(p.extent, !available ? 'NO SIGNAL' : aboveReference ? 'ABOVE REF' : hasReference ? 'REFERENCE' : 'NO REFERENCE');
  attr(el, 'data-available', available);
  attr(el, 'data-over-reference', aboveReference);
  attr(el, 'data-has-reference', hasReference);
  // A physical speed may exceed REF. Keep meter bounds valid and the exact (unabbreviated) value
  // available to assistive technology. No live region: this is a reading, not an alert stream.
  if (available) {
    attr(el, 'role', 'meter'); attr(el, 'aria-label', 'Speed'); attr(el, 'aria-valuemin', 0);
    attr(el, 'aria-valuenow', reading);
    attr(el, 'aria-valuemax', Math.max(1, reading, referenceReading));
    attr(el, 'aria-valuetext', `${reading} world units per second; ` + (hasReference
      ? `reference ${Math.round(reference)}${aboveReference ? '; above reference, not a speed limit' : ''}`
      : 'reference unavailable'));
  } else {
    attr(el, 'role', 'group'); attr(el, 'aria-label', 'Speed unavailable');
    for (const key of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext']) {
      if (el.hasAttribute(key)) el.removeAttribute(key);
    }
  }
}
