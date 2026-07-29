// Toasts (ARCHITECTURE §5, spec "Toasts") — transient bottom-right notifications.
// Driven by the `toast` event {text,kind,ttl}. Max 5 rendered, slide-in, auto-dismiss,
// click to dismiss. Purely cosmetic → uses performance.now() / DOM only (no sim state).
//
// A11y: visual toast cards are interactive dismiss controls (role=button). Status text is
// announced once through a dedicated polite live region (#toast-live) so assistive tech
// hears the message without focus steal and without re-speaking the "dismiss" control name.
// Danger/assertive interruptions belong to alerts.js — this channel stays polite always.
//
// One-voice (ONEVOICE-ALERT-DEDUPE / spec2/06):
//   • Arbiter-origin mirrors (`_fromVoice`) never render — the floor is top-center only.
//   • Short alert semantics owned by alerts.announce (cargo full / shields down / …) never
//     render here either, even when a parallel emitter (floatingText) fires a plain toast.
//   • Transaction ACKs, rep deltas, buy/sell, and other mechanical action toasts pass through.
//
// Focus lifecycle (dismiss only): arrival never steals focus. If a focused toast is keyboard-
// dismissed or expires, focus moves to the nearest remaining toast, else a valid previous
// control / active-screen fallback — never silently to body when a restorable target exists.

import { isVoiceOwnedAlertToast } from './alerts.js';

const MAX = 5;
const KIND_ICON = { success: '✓', good: '✓', error: '✕', danger: '✕', warn: '!', info: '›', credits: '¢', rep: '◈' };

export function createToasts(ctx) {
  const { bus } = ctx;
  const root = document.getElementById('toasts');
  const liveRegion = document.getElementById('toast-live');
  const live = []; // { el, born, ttl }
  let nextWakeAt = Infinity;
  let lastAnnounced = '';
  // Last focus outside the toast feed — restored when the final focused toast leaves.
  let lastExternalFocus = null;

  function announceStatus(text, count = 1) {
    if (!liveRegion || !text) return;
    // Status text only — never "dismiss" / control chrome (that lives on the focusable card).
    const msg = count > 1 ? text + ' (×' + count + ')' : text;
    // Same-string re-announce: clear first so polite regions fire again after grouping bumps
    // that collapse to an identical message, or after a later identical toast.
    if (msg === lastAnnounced) {
      liveRegion.textContent = '';
    }
    liveRegion.textContent = msg;
    lastAnnounced = msg;
  }

  function isRestorableTarget(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (!el.isConnected || typeof el.focus !== 'function') return false;
    if (el.disabled) return false;
    if (el.hidden) return false;
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
    if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) return false;
    let p = el.parentNode;
    while (p && p !== document && p !== document.documentElement && p !== document.body) {
      if (p.hidden) return false;
      if (p.getAttribute && p.getAttribute('aria-hidden') === 'true') return false;
      if (p.style && (p.style.display === 'none' || p.style.visibility === 'hidden')) return false;
      p = p.parentNode;
    }
    return true;
  }

  // Dismiss-path only — never call from push/group (no focus steal on toast arrival).
  function tryFocus(el) {
    if (!isRestorableTarget(el)) return false;
    try {
      el.focus({ preventScroll: true });
    } catch (e) {
      try { el.focus(); } catch (_) { return false; }
    }
    return document.activeElement === el;
  }

  function tryFocusActiveScreen() {
    const screens = document.getElementById('screens');
    if (!screens || screens.style.display === 'none') return false;
    const kids = screens.children || [];
    for (let i = 0; i < kids.length; i++) {
      const screenEl = kids[i];
      if (!screenEl || screenEl.style.display === 'none') continue;
      const items = screenEl.querySelectorAll
        ? screenEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        : [];
      for (let j = 0; j < items.length; j++) {
        if (tryFocus(items[j])) return true;
      }
    }
    return false;
  }

  function nearestRemainingToast(removedIndex) {
    // Prefer the toast that shifted into the removed slot (older neighbor), then the newer one.
    if (live[removedIndex]) return live[removedIndex];
    if (removedIndex > 0 && live[removedIndex - 1]) return live[removedIndex - 1];
    return live[0] || null;
  }

  function restoreFocusAfterDismiss(removedIndex) {
    const nearest = nearestRemainingToast(removedIndex);
    if (nearest && tryFocus(nearest.el)) return;
    if (tryFocus(lastExternalFocus)) return;
    if (tryFocusActiveScreen()) return;
    // No restorable control — leave focus where the browser places it after removal; do not
    // invent a body focus target. Callers that still hold focus on the exiting card blur it.
    const active = document.activeElement;
    if (active && active !== document.body && typeof active.blur === 'function') {
      const stillToast = live.some((r) => r.el === active || (r.el && r.el.contains && r.el.contains(active)));
      if (!stillToast && root && root.contains(active)) {
        try { active.blur(); } catch (e) {}
      }
    }
  }

  function elementHoldsFocus(el) {
    const active = document.activeElement;
    if (!el || !active) return false;
    return active === el || !!(el.contains && el.contains(active));
  }

  if (root) {
    // Capture the pre-toast control when keyboard/AT moves into the feed (not on arrival).
    root.addEventListener('focusin', (ev) => {
      const from = ev.relatedTarget;
      if (from && (!root.contains(from)) && isRestorableTarget(from)) {
        lastExternalFocus = from;
      }
    });
  }

  function push({ text = '', kind = 'info', ttl = 4, _fromVoice = false } = {}) {
    if (!root || !text) return;
    // One-voice (spec2/06): the voiceArbiter re-emits its surfaced floor as a _fromVoice toast for
    // telemetry/golden parity, but that floor is presented top-center by alerts.js (voice:surface).
    // Rendering it here too would double the voice, so drop it. Mechanical action toasts (no
    // _fromVoice — buy/sell/errors/pickups) are unaffected: they are an allowed separate channel.
    if (_fromVoice) return;
    // Parallel short-status mirrors of arbiter-owned alert keys (CARGO FULL, SHIELDS DOWN, …).
    // floatingText and legacy bridges may still emit these; the floor already speaks them once.
    // Long tutorial lines and transaction ACKs are not in the owned set and still render.
    if (isVoiceOwnedAlertToast(text)) return;
    // Grouping: if an identical toast (same text + kind) is already live and recent (within 2.5s of
    // its birth), collapse into it — bump a count badge and refresh its TTL instead of stacking N
    // copies ("Platinum x1" five times becomes "Platinum x1 ×5"). Keeps the feed readable under
    // burst events (mining yields, repeated rep changes, cargo-full spam).
    const GROUP_WINDOW = 2500;
    const now = performance.now();
    for (let i = 0; i < live.length; i++) {
      const r = live[i];
      if (r.text === text && r.kind === kind && (now - r.born) < GROUP_WINDOW) {
        r.count = (r.count || 1) + 1;
        r.born = now;                       // refresh so the grouped toast gets a fresh TTL window
        r.ttl = normalizeTtlMs(ttl);
        r.el.style.opacity = '';
        if (!r.badge) {
          const badge = document.createElement('span');
          badge.className = 'sf-toast__count';
          r.el.appendChild(badge);
          r.badge = badge;
        }
        r.badge.textContent = '×' + r.count;
        r.el.setAttribute('aria-label', text + ' (×' + r.count + ', dismiss)');
        announceStatus(text, r.count);
        recomputeNextWake();
        return;
      }
    }
    const el = document.createElement('div');
    el.className = `sf-toast sf-toast--${kind}`;
    const icon = document.createElement('span');
    icon.className = 'sf-toast__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = KIND_ICON[kind] || '›';
    const body = document.createElement('span');
    body.className = 'sf-toast__text';
    body.textContent = text;
    el.append(icon, body);
    // Click-to-dismiss is advertised by the cursor:pointer styling; expose the same affordance to
    // keyboard users (Enter/Space) and to AT as a dismissible control.
    // Do NOT put aria-live on the card — announcement is via #toast-live (status once).
    // Do NOT call focus() — status must not steal keyboard focus from flight/UI.
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', text + ' (dismiss)');
    el.addEventListener('click', () => dismiss(rec));
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); dismiss(rec); }
    });
    // newest on top; #toast-live is sr-only and rides to the end of the flex stack via prepend
    root.prepend(el);
    const rec = { el, born: now, ttl: normalizeTtlMs(ttl), text, kind, count: 1 };
    live.unshift(rec);
    announceStatus(text, 1);
    recomputeNextWake();
    // animate in next frame
    requestAnimationFrame(() => el.classList.add('sf-toast--in'));
    while (live.length > MAX) dismiss(live[live.length - 1]);
  }

  function dismiss(rec) {
    if (!rec) return;
    const i = live.indexOf(rec);
    if (i < 0 && !rec.el) return;
    const hadFocus = elementHoldsFocus(rec.el);
    if (i >= 0) live.splice(i, 1);
    rec.el.classList.remove('sf-toast--in');
    rec.el.classList.add('sf-toast--out');
    if (hadFocus) restoreFocusAfterDismiss(i >= 0 ? i : 0);
    setTimeout(() => {
      const stillFocused = elementHoldsFocus(rec.el);
      if (rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
      // If restore could not run earlier (or focus re-landed on the exiting card), re-home once.
      if (stillFocused) restoreFocusAfterDismiss(0);
    }, 180);
    recomputeNextWake();
  }

  // Called from hud's frame(), but sleeps until a toast can fade or expire.
  function tick() {
    if (!live.length) return;
    const now = performance.now();
    if (now < nextWakeAt) return;
    let next = Infinity;
    for (let i = live.length - 1; i >= 0; i--) {
      const rec = live[i];
      const age = now - rec.born;
      if (age > rec.ttl) { dismiss(rec); continue; }
      const left = rec.ttl - age;
      if (left < 300) {
        const nextOpacity = String(Math.max(0, left / 300));
        if (rec._sfOpacity !== nextOpacity) {
          rec._sfOpacity = nextOpacity;
          rec.el.style.opacity = nextOpacity;
        }
        next = Math.min(next, now);
      } else {
        next = Math.min(next, rec.born + Math.max(0, rec.ttl - 300));
      }
    }
    nextWakeAt = live.length ? next : Infinity;
  }

  function recomputeNextWake() {
    nextWakeAt = Infinity;
    for (let i = 0; i < live.length; i++) {
      nextWakeAt = Math.min(nextWakeAt, fadeWakeAt(live[i], 300));
    }
  }

  bus.on('toast', push);

  return { push, tick };
}

function normalizeTtlMs(ttl) {
  const n = Number(ttl);
  if (!Number.isFinite(n) || n <= 0) return 4000;
  return n > 60 ? n : n * 1000;
}

function fadeWakeAt(rec, fadeMs) {
  return rec.born + Math.max(0, rec.ttl - fadeMs);
}
