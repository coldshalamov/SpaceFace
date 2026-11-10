// Deckplate transitions — C3. Screens morph instead of cutting.
//
// Every screen change in this game has been a hard swap: one element display:none, the next
// display:block. Console interfaces do not do that. The thing you pressed becomes the thing you
// are looking at, and the parts that are common to both screens — the nameplate, the standing
// column, the foot — hold their place while the rest changes under them.
//
// The View Transitions API does exactly that natively. `startViewTransition(fn)` screenshots the
// old state, runs fn, screenshots the new state, and cross-fades them; any element carrying a
// `view-transition-name` is tweened between its old and new box instead of fading. No library, no
// animation bookkeeping, and no second clock — which matters, because Intake §0 forbids a motion
// library on anything sim-tied.
//
// THE ONE RULE: a `view-transition-name` must be unique among RENDERED elements. screenManager
// keeps mounted screens in the DOM and hides them, and a display:none element is not rendered, so
// two screens both carrying `--dp-vt-head` is fine as long as only one is visible. If that ever
// stops being true the browser aborts the transition and falls back to an instant swap, which is
// the pre-2026-09-22 behaviour: a degraded transition is never a broken screen.

/** Reduced motion is a promise, not a preference: an instant swap is the correct output. The
 * game setting (html.sf-reduce-motion) is the only source — the OS hint feeds it through the
 * System preference (accessibility.js) and is never read here as well. */
function reduced(doc) {
  return doc?.documentElement?.classList?.contains('sf-reduce-motion') === true;
}

/**
 * Run a screen change inside a view transition where the platform has one.
 *
 * The callback MUST perform the whole DOM change synchronously — the API screenshots immediately
 * after it returns. Anything async inside it lands after the snapshot and will not be tweened.
 *
 * @param {() => void} change the synchronous DOM mutation
 * @param {string} [kind] 'push' | 'pop' | 'replace', exposed to CSS as html[data-dp-vt]
 * @param {Document} [doc]
 * @returns {void}
 */
export function withScreenTransition(change, kind = 'push', doc = globalThis.document) {
  if (typeof change !== 'function') return;
  const root = doc && doc.documentElement;
  if (!doc || typeof doc.startViewTransition !== 'function' || reduced(doc) || !root) {
    change();
    return;
  }
  // The direction is a CSS input: a push slides the column in from the leading edge, a pop sends
  // it back the way it came. Without it every change reads the same and the stack loses its sense
  // of depth.
  root.dataset.dpVt = kind;
  let transition;
  try {
    transition = doc.startViewTransition(() => { change(); });
  } catch {
    // A transition already running, or an engine that changed its mind about support.
    delete root.dataset.dpVt;
    change();
    return;
  }
  const clear = () => { delete root.dataset.dpVt; };
  // `finished` rejects when a transition is skipped (a second change arrives mid-flight). That is
  // normal and must not surface as an unhandled rejection.
  transition?.finished?.then?.(clear, clear);
}

/** The CSS half. Appended to the Deckplate sheet by index.js. */
export const DECKPLATE_TRANSITION_CSS = `
/* The old and new snapshots of the whole page. Short, and never a slide: the page does not move,
   only the parts that changed do. */
/* Capped at 120ms in BOTH directions: at that length a cross-fade reads as a cut, which is the
   only reason it is allowed to survive the kill list at all. */
::view-transition-old(root) { animation: dp-vt-out 120ms var(--dp-ease-lamp) both; }
::view-transition-new(root) { animation: dp-vt-in 120ms var(--dp-ease-lamp) both; }
@keyframes dp-vt-out { to { opacity: 0; } }
@keyframes dp-vt-in { from { opacity: 0; } }

/* The named parts. A screen's head, its standing column and its foot are the same three regions on
   every screen (dp-frame), so the browser tweens each one from its old box to its new one and the
   frame reads as a machine reconfiguring rather than a page replacing. */
.dp-frame__head { view-transition-name: dp-vt-head; }
.dp-frame__body { view-transition-name: dp-vt-body; }
.dp-frame__foot { view-transition-name: dp-vt-foot; }
/* The game's mark holds its place across the whole opening sequence: title to new game to the
   first screen of a run, the wordmark is the one thing that does not move. */
.dp-logotype { view-transition-name: dp-vt-mark; }

::view-transition-group(dp-vt-head),
::view-transition-group(dp-vt-body),
::view-transition-group(dp-vt-foot),
::view-transition-group(dp-vt-mark) {
  animation-duration: var(--dp-d-settle);
  animation-timing-function: var(--dp-ease-settle);
}
/* A region that exists on one side only CUTS. It does not fade in and rise: that is the web-page
   arrival, and it is on the kill list (ONE_PHOTOGRAPH.md §4.10). Only objects that exist on BOTH
   sides travel — the nameplate, the credits lamp, the hull — and they travel because the browser
   tweens their boxes, not because anything fades. Regions cut. */
::view-transition-old(dp-vt-body), ::view-transition-new(dp-vt-body) { animation: none; }

/* No prefers-reduced-motion rule here on purpose: reduced() above is the single gate, and the
   OS hint reaches it through the System preference (accessibility.js). A media query would kill a
   transition for a player who explicitly chose Full on a reduce-OS machine. */
`;
