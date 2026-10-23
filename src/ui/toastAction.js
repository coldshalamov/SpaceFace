// src/ui/toastAction.js — the optional button on a receipt (toasts.js).
//
// A receipt may carry one action: `{ id, label, ariaLabel? }` on the `toast` payload. The payload is
// plain data because the bus forwards `toast` across the sim lane; the id resolves here, at press
// time, to a handler the owning module registered (main.js registers the slow-frame offer's Switch).
// A missing or throwing handler leaves the card dismissed and the game running.

const handlers = new Map();

/** Bind `handler` to `id`. Returns a disposer that removes it only if it is still the bound one. */
export function registerToastAction(id, handler) {
  if (typeof id !== 'string' || !id || typeof handler !== 'function') return () => {};
  handlers.set(id, handler);
  return () => { if (handlers.get(id) === handler) handlers.delete(id); };
}

/** A well-formed action `{ id, label, ariaLabel }`, or null for anything else. */
export function normalizeToastAction(action) {
  if (!action || typeof action !== 'object') return null;
  const id = typeof action.id === 'string' ? action.id : '';
  const label = typeof action.label === 'string' ? action.label.trim().slice(0, 24) : '';
  if (!id || !label) return null;
  const ariaLabel = typeof action.ariaLabel === 'string' && action.ariaLabel.trim() ? action.ariaLabel.trim() : label;
  return { id, label, ariaLabel };
}

/** Run the handler registered for `act.id`; never throws. */
export function runToastAction(act) {
  const handler = act && handlers.get(act.id);
  if (!handler) return;
  try { handler(); } catch (err) { console.warn('[toasts] action failed:', act.id, err); }
}

/**
 * The card's button. A card that carries one is a plain group (a <button> inside a role=button card
 * is presentational to assistive tech), so this is its only control. The click and the keydown stop
 * here: the card's own click would dismiss before `onPress` ran, and Enter must reach the native
 * button activation untouched.
 */
export function createToastActionButton(act, onPress) {
  const button = document.createElement('button');
  button.setAttribute('type', 'button');
  button.className = 'sf-toast__action';
  button.textContent = act.label;
  button.setAttribute('aria-label', act.ariaLabel);
  button.addEventListener('click', (ev) => {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
    onPress();
  });
  button.addEventListener('keydown', (ev) => {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
  });
  return button;
}

/**
 * Which live receipt goes when the lane is over its cap. `live` is newest first. The oldest line
 * goes, except one that offers a button, which two quick pickups would otherwise evict before
 * anyone could read it; the newest line (index 0) is never the victim unless nothing else exists.
 */
export function pickEvictionVictim(live) {
  for (let i = live.length - 1; i > 0; i--) {
    if (!live[i].action) return live[i];
  }
  return live[live.length - 1];
}
