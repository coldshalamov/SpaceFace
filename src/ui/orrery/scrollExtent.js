// src/ui/orrery/scrollExtent.js — the Ladder's light cursor (design/frontend/ORRERY.md §4 #9): a
// scrolling list shows where its viewport sits on its own rail — a short bright segment on the rail
// whose length is the visible fraction and whose position is the scroll. It only appears when the
// list overflows; a list that fits carries nothing, and no fade is laid over a fitted list either
// (`data-overflow="0"` lets a sheet drop its fold mask).
//
// `syncScrollExtent(el)` is idempotent: call it after every render of the scroll container. It puts a
// zero-height sticky marker first in the container and sizes the marker's segment from the scroll.

const MARK = 'orr-extent';
const bound = new WeakMap();

function paint(el) {
  const mark = el.querySelector(`:scope > .${MARK}`);
  if (!mark) return;
  const sh = el.scrollHeight || 0;
  const ch = el.clientHeight || 0;
    // a fold and a thumb only over a real overflow: a few pixels of padding are not a list to scroll
  const over = sh - ch > 6;
  el.setAttribute('data-overflow', over ? '1' : '0');
  if (!over) { mark.style.setProperty('--orr-ext-top', '0px'); mark.style.setProperty('--orr-ext-h', '0px'); return; }
  const frac = Math.max(0.06, Math.min(1, ch / sh));
  const pos = sh - ch > 0 ? Math.max(0, Math.min(1, el.scrollTop / (sh - ch))) : 0;
  const h = Math.round(ch * frac);
  const top = Math.round((ch - h) * pos);
  mark.style.setProperty('--orr-ext-top', `${top}px`);
  mark.style.setProperty('--orr-ext-h', `${h}px`);
}

/** @param {HTMLElement} el the scroll container (overflow auto), whose rail runs down its left edge */
export function syncScrollExtent(el) {
  if (!el || typeof el.querySelector !== 'function') return;
  let mark = el.querySelector(`:scope > .${MARK}`);
  if (!mark) {
    mark = el.ownerDocument.createElement('i');
    mark.className = MARK;
    mark.setAttribute('aria-hidden', 'true');
    el.insertBefore(mark, el.firstChild);
  }
  if (!bound.has(el)) {
    const onScroll = () => paint(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    let ro = null;
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => paint(el)); ro.observe(el); }
    bound.set(el, { onScroll, ro });
  }
  paint(el);
  const raf = globalThis.requestAnimationFrame;
  if (typeof raf === 'function') raf(() => paint(el));
}

export const SCROLL_EXTENT_CSS = `
.orr-extent { position:sticky; top:0; display:block; height:0; z-index:3; pointer-events:none; }
.orr-extent::before { content:""; position:absolute; left:7px; width:2px; top:var(--orr-ext-top, 0px); height:var(--orr-ext-h, 0px);
  background:rgb(248 244 234 / .9); box-shadow:0 0 6px rgb(248 244 234 / .45); border-radius:1px; transition:top .12s linear, height .12s linear; }
[data-overflow="0"] > .orr-extent::before { display:none; }
html.sf-reduce-motion .orr-extent::before { transition:none; }
`;
