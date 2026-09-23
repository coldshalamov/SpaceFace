// ORRERY text effects: telemetry that resolves, counters that roll (design/frontend/ORRERY.md §4).
import { reducedMotion, onFrame } from './motion.js';

const NOISE = '▚▞▖▗▘▝▙▟#%&*+=<>/\\0123456789';

/**
 * Decrypt Text: the word arrives as glyph noise and resolves left to right. Cosmetic randomness
 * only (Math.random is fine here; the sim's rng is never touched by presentation).
 */
export function decrypt(element, text, { duration = 260, delay = 0 } = {}) {
  if (!element) return () => {};
  const target = String(text ?? '');
  if (reducedMotion() || typeof requestAnimationFrame !== 'function' || !target) {
    element.textContent = target;
    return () => {};
  }
  let start = null;
  let stopped = false;
  const off = onFrame((now) => {
    if (stopped) return false;
    if (start == null) start = now + delay;
    const t = (now - start) / duration;
    if (t < 0) { element.textContent = ''; return true; }
    if (t >= 1) { element.textContent = target; return false; }
    const settled = Math.floor(target.length * t);
    let out = target.slice(0, settled);
    for (let i = settled; i < target.length; i += 1) {
      const ch = target[i];
      out += ch === ' ' ? ' ' : NOISE[(Math.random() * NOISE.length) | 0];
    }
    element.textContent = out;
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
