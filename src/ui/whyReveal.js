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

import { getStage } from './stage.js';

const TIP_ID = 'sf-why-tip';

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
    el.style.display = 'none';
    // G16-02: the tip mounts inside the Stage's banner slot — the lane (position:fixed,
    // z-index 1100 to clear the screens) and the look both live in styles/kit.css. A page
    // without the slot host keeps the body mount.
    const stage = getStage();
    const slot = stage && typeof stage.slotEl === 'function' ? stage.slotEl('banner') : null;
    (slot || document.body || document.documentElement).appendChild(el);
  }
  return el;
}

let describedCarrier = null;
let tipOwner = null;

function describe(carrier) {
  if (describedCarrier === carrier) return;
  if (describedCarrier) {
    const others = (describedCarrier.getAttribute('aria-describedby') || '').split(/\s+/)
      .filter(id => id && id !== TIP_ID);
    if (others.length) describedCarrier.setAttribute('aria-describedby', others.join(' '));
    else describedCarrier.removeAttribute('aria-describedby');
  }
  describedCarrier = carrier || null;
  if (carrier) {
    const ids = (carrier.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (!ids.includes(TIP_ID)) ids.push(TIP_ID);
    carrier.setAttribute('aria-describedby', ids.join(' '));
  }
}

function place(el, x, y, preferAbove) {
  const pad = 14;
  const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280;
  const vh = (typeof window !== 'undefined' && window.innerHeight) || 720;
  const w = el.offsetWidth || 280;
  const h = el.offsetHeight || 40;
  const left = Math.max(8, Math.min(x + pad, vw - w - 8));
  let top = preferAbove ? y - pad - h : y + pad;
  if (top + h > vh - 8) top = Math.max(8, y - pad - h);
  el.style.left = Math.round(left) + 'px';
  el.style.top = Math.round(Math.max(8, Math.min(top, vh - h - 8))) + 'px';
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
