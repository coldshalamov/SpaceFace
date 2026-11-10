// The presentation-only route for a notice that must reach the player but must never reach the
// simulation. The event bus is shared: every `toast` is heard by sim listeners too (an encounter
// may sample world state when one lands), so a notice raised by the wall clock or the host - the
// retail error line, the "this looks slow" offer - would make sim state depend on how fast the
// machine is. Those notices go through here instead: one registered presenter (the receipt lane
// in src/ui/toasts.js) and no bus emit. Pure of the DOM so core and render modules can use it.

let presenter = null;

/**
 * Register the function that shows a receipt `{ text, kind, ttl, action? }`; it returns false when
 * it has nowhere to draw. Returns a disposer.
 */
export function setReceiptPresenter(fn) {
  const next = typeof fn === 'function' ? fn : null;
  presenter = next;
  return () => { if (next && presenter === next) presenter = null; };
}

/**
 * Show a receipt without touching the bus. Returns false when nothing could show it (no presenter
 * yet, or it threw), so a once-per-session offer can wait instead of being spent unseen.
 */
export function presentReceipt(spec) {
  if (!presenter || !spec || typeof spec !== 'object') return false;
  try {
    return presenter(spec) !== false;
  } catch (_) {
    return false;
  }
}
