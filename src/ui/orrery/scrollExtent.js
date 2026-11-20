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
  if (!over) {
    mark.style.setProperty('--orr-ext-top', '0px');
    mark.style.setProperty('--orr-ext-h', '0px');
    el.dataset.extEnd = '0';
    return;
  }
  const frac = Math.max(0.06, Math.min(1, ch / sh));
  const pos = sh - ch > 0 ? Math.max(0, Math.min(1, el.scrollTop / (sh - ch))) : 0;
  const h = Math.round(ch * frac);
  const top = Math.round((ch - h) * pos);
  mark.style.setProperty('--orr-ext-top', `${top}px`);
  mark.style.setProperty('--orr-ext-h', `${h}px`);
  // the rim cue stands down once the player reaches the end (fresh-eyes 2026-11-15: a bare
  // dissolve read as broken clipping, so the list now says "more" and stops saying it at the end)
  el.dataset.extEnd = pos >= 0.999 ? '1' : '0';
  // the cue is viewport-fixed and seat-tracked here (paint runs on scroll and resize): a
  // host-anchored absolute cue inherited whatever transform the screen root carried and landed
  // anywhere; fixed viewport coords are deterministic and sit above the fold's fade
  const foot = el.nextElementSibling;
  if (foot && foot.classList.contains(`${MARK}--foot`)) {
    const r = el.getBoundingClientRect();
    const vw = globalThis.innerWidth || 1440;
    const vh = globalThis.innerHeight || 900;
    // Seat flush on the scroller's bottom fade rim rather than 38px up inside the last text row
    const leftSeat = r.right > vw - 240;
    const seatTop = Math.max(r.top + 8, Math.min(r.bottom - 22, vh - 98));
    foot.style.top = `${Math.max(0, Math.round(seatTop))}px`;
    foot.style.left = `${Math.max(0, Math.round(leftSeat ? r.left + 14 : Math.max(r.left + 8, r.right - 92)))}px`;
  }
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
  // the foot marker carries the MORE cue. It is a SIBLING positioned right after the scroller, not
  // a child: the fold mask fades everything the scroller paints, so a cue inside it would be
  // dimmed by the very dissolve it annotates (bench 2026-11-15). The host keeps a positioning
  // context; the cue sits at its bottom rim, unmasked.
  let foot = el.nextElementSibling;
  if (!foot || !foot.classList.contains('orr-extent--foot')) {
    foot = el.ownerDocument.createElement('i');
    foot.className = `${MARK} ${MARK}--foot`;
    foot.setAttribute('aria-hidden', 'true');
    el.insertAdjacentElement('afterend', foot);
  }
  const host = el.parentElement;
  if (host && getComputedStyle(host).position === 'static') host.style.position = 'relative';
  let binding = bound.get(el);
  if (!binding) {
    const onScroll = () => paint(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    let ro = null;
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => paint(el)); ro.observe(el); }
    binding = { onScroll, ro, paintQueued: false };
    bound.set(el, binding);
  }
  paint(el);
  const raf = globalThis.requestAnimationFrame;
  if (typeof raf === 'function' && !binding.paintQueued) {
    binding.paintQueued = true;
    raf(() => {
      binding.paintQueued = false;
      paint(el);
    });
  }
}

export const SCROLL_EXTENT_CSS = `
.orr-extent { position:sticky; top:0; display:block; height:0; z-index:3; pointer-events:none; }
.orr-extent::before { content:""; position:absolute; left:7px; width:2px; top:var(--orr-ext-top, 0px); height:var(--orr-ext-h, 0px);
  background:rgb(248 244 234 / .9); box-shadow:0 0 6px rgb(248 244 234 / .45); border-radius:1px; transition:top .12s linear, height .12s linear; }
[data-overflow="0"] > .orr-extent::before { display:none; }
/* the rim cue says what the fold only implies: the list continues below. It is viewport-fixed —
   paint() seats it at the scroller's bottom-right on every scroll/resize — and it stands down at
   scroll end (paint sets data-ext-end on the scroller; the adjacent sibling reads it). Static —
   no motion, so reduced motion needs no exception. */
.orr-extent--foot { position:fixed; z-index:4; pointer-events:none; width:max-content; height:auto; }
.orr-extent--foot::before {
  content:"MORE ▾";
  display:block;
  position:static; left:auto; top:auto; right:auto; bottom:auto; width:auto; height:auto;
  font:650 12px var(--dp-face-num, ui-monospace, monospace); letter-spacing:.18em;
  color:rgb(236 230 216 / .72); background:rgb(7 11 16 / .94);
  border:1px solid rgb(236 230 216 / .22); border-radius:2px; box-shadow:none;
  padding:2px 8px;
}
[data-overflow="0"] + .orr-extent--foot::before,
[data-ext-end="1"] + .orr-extent--foot::before { display:none; }
html.sf-reduce-motion .orr-extent::before { transition:none; }
`;
