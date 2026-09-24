// Deckplate — the attention lamp.
//
// design/frontend/ONE_PHOTOGRAPH.md §5 P2. Focus is not a ring drawn around one item; it is a light
// source above it that lights its NEIGHBOURHOOD with falloff. The rows either side warm slightly;
// everything beyond recedes. That is the Bungie principle, and it replaces every focus ring, hover
// fill and selected-row tint in the game.
//
// This module is the two lines of JS the CSS cannot do: read where the focused child is, and write
// that position onto the container as two registered <length> properties. Because they are
// registered, the browser interpolates them, so moving focus makes the lamp TRAVEL rather than
// teleport — which is the whole effect.
//
// COST, stated plainly because the direction makes me: this is a style recalc and a paint of the
// container's children for the length of the settle. Registering a custom property makes it
// interpolable, NOT off-thread. So:
//   - it attaches to ONE container, never to a page;
//   - it measures with getBoundingClientRect on a focus event, never on a frame;
//   - it is not used in flight, where the sim owns the frame budget.

const ATTACHED = new WeakMap();

function reduced(doc) {
  return doc?.documentElement?.classList?.contains('sf-reduce-motion') === true
    || doc?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

/**
 * Light `container` from whichever of its children currently has attention.
 *
 * The lamp follows focus, and follows the pointer only while the pointer is inside the container —
 * a menu should not stay lit at the last place a mouse happened to cross on its way elsewhere.
 *
 * @param {HTMLElement|null} container the element carrying `.dp-attend`
 * @param {{ selector?: string }} [opts] which children may hold the lamp
 * @returns {() => void} detach
 */
export function attachAttentionLamp(container, { selector = 'a,button,[role="option"],[role="tab"],[tabindex]' } = {}) {
  if (!container || !container.addEventListener) return () => {};
  const existing = ATTACHED.get(container);
  if (existing) return existing;

  const doc = container.ownerDocument || globalThis.document;
  let lastTarget = null;

  const place = (target) => {
    if (!target || !container.contains(target)) return;
    lastTarget = target;
    // Container-relative, because the lamp is a background position on the container. Using the
    // viewport here would make the lamp jump whenever the page scrolled under it.
    const box = container.getBoundingClientRect();
    const hit = target.getBoundingClientRect();
    const x = hit.left - box.left + hit.width * 0.28;
    const y = hit.top - box.top + hit.height * 0.5;
    const style = container.style;
    style.setProperty('--dp-focus-x', `${Math.round(x)}px`);
    style.setProperty('--dp-focus-y', `${Math.round(y)}px`);
    style.setProperty('--dp-focus-power', '1');
    // The bracket is the second channel and must not depend on :focus-visible alone — a pointer
    // hover gives the lamp but no focus ring, and the reader still needs to know what is lit.
    for (const el of container.querySelectorAll('[data-dp-focus]')) {
      if (el !== target) el.removeAttribute('data-dp-focus');
    }
    target.setAttribute('data-dp-focus', '');
  };

  const clear = () => {
    lastTarget = null;
    container.style.setProperty('--dp-focus-power', '0');
    for (const el of container.querySelectorAll('[data-dp-focus]')) el.removeAttribute('data-dp-focus');
  };

  const fromEvent = (event) => {
    const target = event.target && event.target.closest ? event.target.closest(selector) : null;
    if (target) place(target);
  };

  const onFocusIn = fromEvent;
  const onPointerMove = (event) => { if (!reduced(doc)) fromEvent(event); };
  const onPointerLeave = () => {
    // Focus outranks the pointer: leaving with something focused returns the lamp to it.
    const focused = doc.activeElement && container.contains(doc.activeElement)
      ? doc.activeElement.closest(selector) : null;
    if (focused) place(focused); else clear();
  };
  const onFocusOut = (event) => {
    if (event.relatedTarget && container.contains(event.relatedTarget)) return;
    if (container.matches(':hover')) return;
    clear();
  };
  // A list that reflows (a filter, a resize) leaves the lamp at a stale coordinate.
  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => { if (lastTarget) place(lastTarget); })
    : null;

  container.addEventListener('focusin', onFocusIn);
  container.addEventListener('focusout', onFocusOut);
  container.addEventListener('pointermove', onPointerMove, { passive: true });
  container.addEventListener('pointerleave', onPointerLeave);
  observer?.observe(container);

  // Arrive lit on whatever is already current, so a screen does not open dark and then wake.
  const current = container.querySelector('[aria-current="true"],[aria-selected="true"]')
    || container.querySelector(selector);
  if (current) place(current);

  const detach = () => {
    container.removeEventListener('focusin', onFocusIn);
    container.removeEventListener('focusout', onFocusOut);
    container.removeEventListener('pointermove', onPointerMove);
    container.removeEventListener('pointerleave', onPointerLeave);
    observer?.disconnect();
    ATTACHED.delete(container);
  };
  ATTACHED.set(container, detach);
  return detach;
}
