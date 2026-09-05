// whyReveal.js — the tier-2 "why" reveal, generalised from causeLedger.js (INSTRUMENT_GRAMMAR §7).
//
// THE LADDER SLOT. Tier 2 is hover / focus, NO CLICK: the reason a value reads the way it does,
// one non-diegetic line of text, never a drawer and never a second layer. Tier 3 (DRAWER) and
// tier 1 (always-visible) are other people's jobs; this module must not grow either.
//
// ONE MECHANISM, NOT TWO. `causeLedger.js` already shipped this exact shape for market rows: one
// delegated capture listener pair on `document`, one lazily-created `role="tooltip"` element with
// inline styles, `pointer-events:none`, never speaks. That module now delegates its display to
// THIS one (`showWhyTip` / `hideWhyTip`), so there is a single tooltip element, a single
// positioning routine, and a single visual identity in the codebase. The generalisation adds the
// two things the market hover could not do:
//   • `[data-why]` is read on ANY surface (station workspace and modal screens alike) — the
//     capture-phase listeners sit on `document`, which fires before the screenManager pointer
//     shield can stopPropagation (uiRoot.js documents that a document-level BUBBLE delegate never
//     fires; capture is the only seat in the house).
//   • keyboard focus reveals the same text (`focusin` / `focusout`), anchored to the element rect
//     because a keyboard player has no cursor. A hover-only affordance does not exist for a
//     keyboard player, so every carrier must be focusable (button, or tabindex="0").
//
// ENUMERATED PHRASES ONLY, NEVER INVENTED TEXT (§7). This module renders the literal
// `[data-why]` string and NOTHING else — it never composes, formats, or falls back. The bank
// discipline lives at the write sites (causePhrases for prices, CONTRACT_CLAUSES/missionConditions
// for contract terms, REP_REASON_LABELS for standings). An empty or whitespace attribute renders
// nothing at all: if a cause has no phrase, the honest UI is no tooltip, never a guess.
//
// Accessibility contract: while shown, the carrier gets `aria-describedby` pointing at the tip, so
// the same enumerated phrase reaches screen readers. No animation exists to reduce (the reveal is
// display:none → block, readable under reduced-motion by construction), and under forced-colors
// the UA substitutes system canvas colors while the border and text remain.
//
// Headless-safe: importing this module in Node (no `document`) touches no DOM; every access is
// call-time guarded, matching the causeLedger import-before-DOM proof.

const TIP_ID = 'sf-why-tip';
const TIP_STYLE = [
  'position:fixed',
  // At a normal viewport this is exactly causeLedger's 42ch; the min() only bites on inspector-
  // narrow columns (~287px), where a fixed 42ch tip would overhang the edge or force one-character
  // wrapping. Content still wraps at word boundaries (white-space:pre-line).
  'max-width:min(42ch, calc(100vw - 24px))',
  'box-sizing:border-box',
  'padding:8px 12px',
  'white-space:pre-line',
  'background:rgba(8,14,26,0.92)',
  'border:1px solid rgba(110,150,210,0.4)',
  'border-radius:5px',
  'box-shadow:0 8px 24px rgba(0,0,0,0.65), 0 2px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
  'backdrop-filter:blur(8px)',
  'letter-spacing:0.01em',
  'color:#cfe2ff',
  'font:12px/1.45 system-ui,sans-serif',
  'pointer-events:none',
  // DOM layering (src/ui/AGENTS.md): screens sit at z100, alerts at z1100. A tier-2 reveal is
  // raised BY screen content, so it must clear the screen layer; it never blocks input.
  'z-index:1100',
].join(';');

/** The enumerated reason an element carries, or '' when it carries none (render NOTHING then). */
export function whyTextFor(el) {
  if (!el || typeof el.getAttribute !== 'function') return '';
  const raw = el.getAttribute('data-why');
  return typeof raw === 'string' ? raw.trim() : '';
}

function tipElement() {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById(TIP_ID);
  if (!el || !el.isConnected) {
    el = document.createElement('div');
    el.id = TIP_ID;
    el.setAttribute('role', 'tooltip');
    el.style.cssText = TIP_STYLE;
    el.style.display = 'none';
    (document.body || document.documentElement).appendChild(el);
  }
  return el;
}

let describedCarrier = null;
let tipOwner = null;

function describe(carrier) {
  if (describedCarrier && describedCarrier !== carrier && typeof describedCarrier.removeAttribute === 'function') {
    describedCarrier.removeAttribute('aria-describedby');
  }
  describedCarrier = carrier || null;
  if (carrier && typeof carrier.setAttribute === 'function') carrier.setAttribute('aria-describedby', TIP_ID);
}

function place(el, x, y, preferAbove) {
  const pad = 14;
  const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280;
  const vh = (typeof window !== 'undefined' && window.innerHeight) || 720;
  const w = el.offsetWidth || 280;
  const h = el.offsetHeight || 40;
  let left = Math.max(8, Math.min(x + pad, vw - w - 8));
  let top = preferAbove ? y - pad - h : y + pad;
  if (top + h > vh - 8) top = Math.max(8, y - pad - h);
  el.style.left = Math.round(left) + 'px';
  el.style.top = Math.round(top) + 'px';
}

function show(text, x, y, owner, anchorEl) {
  const el = tipElement();
  if (!el) return;
  el.textContent = String(text);
  el.style.display = 'block';
  if (anchorEl) {
    const rect = typeof anchorEl.getBoundingClientRect === 'function'
      ? anchorEl.getBoundingClientRect()
      : { left: 0, top: 0, bottom: 0 };
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 720;
    place(el, rect.left, rect.bottom, rect.bottom + 60 > vh);
  } else {
    place(el, x, y, false);
  }
  tipOwner = owner;
}

/**
 * Show the shared tip with EXACTLY `text` (enumerated prose; never composed here).
 * `(x, y)` is the pointer seat; the tip seats beside it, clamped to the viewport.
 * `owner` names the showing mechanism ('data-why' for the reveal itself, 'causeLedger' for the
 * market hover) so a sibling consumer's stale hide calls cannot erase another's live tip: ONE
 * element, many sanctioned writers, each able to retract only what it showed.
 */
export function showWhyTip(text, x, y, owner = 'shared') {
  show(text, x, y, owner, null);
}

/** Anchor the shared tip to an element rect — the keyboard-focus seat (no cursor exists). */
export function showWhyTipForElement(text, el, owner = 'shared') {
  show(text, 0, 0, owner, el);
}

/**
 * Hide the shared tip and drop the live aria-describedby link. With `requestedOwner`, hides ONLY
 * if that mechanism is the current owner — the ownership guard that stops a legacy mouseover
 * sweep (causeLedger hides on every non-market row it sees) from erasing a [data-why] reveal the
 * pointer is still resting on. No argument hides unconditionally (teardown).
 */
export function hideWhyTip(requestedOwner) {
  if (requestedOwner !== undefined && tipOwner !== null && requestedOwner !== tipOwner) return;
  tipOwner = null;
  describe(null);
  if (typeof document === 'undefined') return;
  const el = document.getElementById(TIP_ID);
  if (el) el.style.display = 'none';
}

function carrierFrom(ev) {
  const target = ev && ev.target;
  if (!target || typeof target.closest !== 'function') return null;
  const carrier = target.closest('[data-why]');
  return carrier && whyTextFor(carrier) ? carrier : null;
}

/**
 * mountWhyReveal() — install the ONE delegated reveal for `[data-why]`.
 * Returns { destroy } (idempotent). Safe headless: a no-op with no document.
 */
export function mountWhyReveal() {
  if (typeof document === 'undefined') return { destroy() {} };

  const onPointerOver = (ev) => {
    const carrier = carrierFrom(ev);
    if (!carrier) { hideWhyTip('data-why'); return; }
    showWhyTip(whyTextFor(carrier), ev.clientX, ev.clientY, 'data-why');
    describe(carrier);
  };
  const onPointerOut = (ev) => {
    const target = ev && ev.target;
    if (!target || typeof target.closest !== 'function') return;
    const carrier = target.closest('[data-why]');
    if (!carrier) return;
    const next = ev.relatedTarget;
    if (next && typeof carrier.contains === 'function' && carrier.contains(next)) return;
    hideWhyTip('data-why');
  };
  const onFocusIn = (ev) => {
    const carrier = carrierFrom(ev);
    if (!carrier) { hideWhyTip('data-why'); return; }
    showWhyTipForElement(whyTextFor(carrier), carrier, 'data-why');
    describe(carrier);
  };
  const onFocusOut = (ev) => {
    const target = ev && ev.target;
    if (!target || typeof target.closest !== 'function') return;
    const carrier = target.closest('[data-why]');
    if (!carrier) return;
    const next = ev.relatedTarget;
    if (next && typeof carrier.contains === 'function' && carrier.contains(next)) return;
    hideWhyTip('data-why');
  };

  // CAPTURE on document: the seat that fires before any inner stopPropagation (see header).
  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('pointerout', onPointerOut, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);

  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      hideWhyTip();
      const el = document.getElementById(TIP_ID);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    },
  };
}

export default mountWhyReveal;
