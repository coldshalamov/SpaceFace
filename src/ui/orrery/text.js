// ORRERY text effects: telemetry that resolves, counters that roll (design/frontend/ORRERY.md §4).
import { reducedMotion, onFrame } from './motion.js';

const NOISE = '▚▞▖▗▘▝▙▟#%&*+=<>/\\0123456789';

// One live decrypt per element: a replaced call retires the previous driver before it can
// keep writing scramble over the new word.
const activeDecrypts = new WeakMap();

/**
 * Decrypt Text: the word arrives as glyph noise and resolves left to right. Cosmetic randomness
 * only (Math.random is fine here; the sim's rng is never touched by presentation). The final
 * string is guaranteed at the scheduled end: a starved or backgrounded tab stops rAF entirely,
 * so a plain timer backstop lands the target even when no late frame ever arrives.
 */
export function decrypt(element, text, { duration = 260, delay = 0 } = {}) {
  if (!element) return () => {};
  const target = String(text ?? '');
  // Retire any live driver on this element first — the early returns below must not be
  // stamped over by a previous decrypt resolving afterwards.
  const previous = activeDecrypts.get(element);
  if (typeof previous === 'function') previous();
  if (reducedMotion() || typeof requestAnimationFrame !== 'function' || !target) {
    element.textContent = target;
    return () => {};
  }
  let start = null;
  let stopped = false;
  let off = () => {};
  let backstop = 0;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (backstop) clearTimeout(backstop);
    off();
    if (activeDecrypts.get(element) === stop) activeDecrypts.delete(element);
    element.textContent = target;
  };
  off = onFrame((now) => {
    if (stopped) return false;
    if (start == null) start = now + delay;
    const t = (now - start) / duration;
    if (t < 0) { element.textContent = ''; return true; }
    if (t >= 1) { stop(); return false; }
    const settled = Math.floor(target.length * t);
    let out = target.slice(0, settled);
    for (let i = settled; i < target.length; i += 1) {
      const ch = target[i];
      out += ch === ' ' ? ' ' : NOISE[(Math.random() * NOISE.length) | 0];
    }
    element.textContent = out;
    return true;
  });
  backstop = setTimeout(stop, Math.max(0, delay) + Math.max(0, duration) + 64);
  activeDecrypts.set(element, stop);
  return stop;
}

/**
 * Typewriter: a spoken line arrives a character at a time at `cps` characters per second, with a
 * short rest at sentence ends. Returns a stop function; `onDone` fires when the line is complete
 * (immediately under reduced motion). Cosmetic only, like decrypt.
 */
export function typewriter(element, text, { cps = 48, delay = 0, onDone = null } = {}) {
  if (!element) return () => {};
  const target = String(text ?? '');
  const done = () => { if (typeof onDone === 'function') onDone(); };
  if (reducedMotion() || typeof requestAnimationFrame !== 'function' || !target) {
    element.textContent = target;
    done();
    return () => {};
  }
  let start = null;
  let stopped = false;
  let shown = 0;
  let rest = 0;
  const off = onFrame((now) => {
    if (stopped) return false;
    if (start == null) start = now + delay;
    const due = Math.floor(((now - start) / 1000) * cps) - rest;
    if (due < 0) { element.textContent = ''; return true; }
    while (shown < Math.min(target.length, due)) {
      const ch = target[shown];
      shown += 1;
      if (/[.!?]/.test(ch) && shown < target.length) rest += Math.round(cps * 0.28);
    }
    element.textContent = target.slice(0, shown);
    if (shown >= target.length) { done(); return false; }
    return true;
  });
  return () => { stopped = true; off(); element.textContent = target; };
}

/**
 * Counter: every digit is a column of 0-9 that rolls (with a slight mechanical overshoot) to its
 * value. Non-digits (separators, units) are static glyphs. `set(value)` rebuilds only when the
 * digit count or separator layout changes.
 */
export function createCounter(element, { format = (n) => Math.round(n).toLocaleString('en-US') } = {}) {
  let layout = '';
  let columns = [];

  function build(str) {
    element.textContent = '';
    element.classList.add('orr-counter');
    columns = [];
    for (const ch of str) {
      if (/\d/.test(ch)) {
        const cell = globalThis.document.createElement('span');
        cell.className = 'orr-counter__digit';
        const strip = globalThis.document.createElement('span');
        for (let d = 0; d <= 9; d += 1) {
          const i = globalThis.document.createElement('i');
          i.textContent = String(d);
          strip.appendChild(i);
        }
        cell.appendChild(strip);
        element.appendChild(cell);
        columns.push(strip);
      } else {
        const sep = globalThis.document.createElement('span');
        sep.className = 'orr-counter__sep';
        sep.textContent = ch;
        element.appendChild(sep);
      }
    }
    element.setAttribute('aria-label', str);
  }

  return {
    set(value) {
      const str = format(value);
      const shape = str.replace(/\d/g, '0');
      if (shape !== layout) { layout = shape; build(str); }
      element.setAttribute('aria-label', str);
      let c = 0;
      for (const ch of str) {
        if (!/\d/.test(ch)) continue;
        const strip = columns[c++];
        if (strip) strip.style.transform = `translateY(${-Number(ch)}em)`;
      }
    },
  };
}

/**
 * Roll a headline numeral to `value`. The element keeps one counter; the first show rolls up from
 * zero, later calls roll from the previous figure. `sign` is kept outside the digit columns (a true
 * minus or a plus). Non-numeric values are written as plain text. Reduced motion sets it instantly.
 * @param {HTMLElement} element
 * @param {number|string} value
 */
export function rollTo(element, value) {
  if (!element) return;
  const raw = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.\-\u2212]/g, '').replace('\u2212', '-'));
  if (!Number.isFinite(raw) || (typeof value === 'string' && !/\d/.test(value))) {
    element.__orrCounter = null;
    element.classList.remove('orr-counter');
    element.textContent = String(value == null ? '' : value);
    return;
  }
  // the sign rides the value each call (a string with a leading sign keeps a plus; a negative always shows a true minus)
  element.__orrSigned = typeof value === 'string' && /^[+\u2212-]/.test(value.trim());
  const format = (n) => {
    const r = Math.round(Math.abs(n)).toLocaleString('en-US');
    if (n < 0) return `\u2212${r}`;
    return element.__orrSigned && n > 0 ? `+${r}` : r;
  };
  let counter = element.__orrCounter;
  const first = !counter;
  if (!counter) { counter = createCounter(element, { format: (n) => element.__orrFormat(n) }); element.__orrCounter = counter; }
  element.__orrFormat = format;
  const target = Math.abs(raw);
  const raf = globalThis.requestAnimationFrame;
  const still = typeof document !== 'undefined' && document.documentElement && document.documentElement.classList.contains('sf-reduce-motion');
  if (first && raf && !still) { counter.set(raw < 0 ? -0.4 : 0); raf(() => raf(() => counter.set(raw < 0 ? -target : target))); }
  else counter.set(raw < 0 ? -target : target);
}
