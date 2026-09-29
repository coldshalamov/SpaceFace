// Named-state, interruptible cut/settle. No timer survives replacement or disposal.
const DIRECTIONS = new Set(['left', 'right', 'top', 'bottom', 'stamp']);
const CLASS_NAMES = ['k-in', 'k-in--go', ...[...DIRECTIONS].map(name => `k-in--${name}`)];
const active = new WeakMap();
export const SETTLE_MS = 140;

export function reducedMotion() {
  return globalThis.document?.documentElement?.classList.contains('sf-reduce-motion') === true
    || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

function stateName(state) {
  if (typeof state !== 'string' || !state.trim()) throw new TypeError('kit motion requires a named state');
  return state;
}

function clear(element) {
  const pending = active.get(element);
  if (pending) {
    cancelAnimationFrame(pending.frame);
    clearTimeout(pending.timer);
    element.removeEventListener('transitionend', pending.onEnd);
    active.delete(element);
  }
  element.classList.remove(...CLASS_NAMES);
  element.style.removeProperty('--k-in-delay');
}

/** Returns a cancellation function which leaves the element visible and settled. */
export function settle(element, { from = 'left', delay = 0, state } = {}) {
  stateName(state);
  if (!element?.classList || !element?.style) throw new TypeError('kit.settle requires an element');
  if (!DIRECTIONS.has(from)) throw new RangeError(`Unknown kit settle edge: ${from}`);
  if (!Number.isFinite(delay) || delay < 0 || delay > 1000) throw new RangeError('Kit settle delay must be 0..1000ms');
  clear(element);
  element.dataset.kMotionState = state;
  if (reducedMotion() || element.hidden) return () => {};
  const pending = { frame: 0, timer: 0, onEnd: null };
  const finish = () => { if (active.get(element) === pending) clear(element); };
  pending.onEnd = event => { if (event.target === element && event.propertyName === 'transform') finish(); };
  active.set(element, pending);
  element.addEventListener('transitionend', pending.onEnd);
  element.classList.add('k-in', `k-in--${from}`);
  element.style.setProperty('--k-in-delay', `${delay}ms`);
  pending.frame = requestAnimationFrame(() => {
    if (active.get(element) !== pending) return;
    pending.frame = requestAnimationFrame(() => {
      if (active.get(element) !== pending) return;
      if (reducedMotion() || element.hidden || !element.isConnected) { finish(); return; }
      element.classList.add('k-in--go');
      pending.timer = setTimeout(finish, delay + SETTLE_MS + 34);
    });
  });
  return finish;
}

/** Each word settles in 140ms. The finite sequence is bounded to one second of delay. */
export function stamp(elements, { gap = 60, state } = {}) {
  stateName(state);
  if (!Number.isFinite(gap) || gap < 0) throw new RangeError('Kit stamp gap must be non-negative');
  const list = Array.from(elements || []);
  if (Math.max(0, list.length - 1) * gap > 1000) throw new RangeError('Kit stamp sequence exceeds the delay budget');
  const cancellations = list.map((element, index) => settle(element, { from: 'stamp', delay: index * gap, state }));
  return () => cancellations.forEach(cancel => cancel());
}

/**
 * Demo-prep polish seam (headless-testable): arrival stagger plan for a row of controls.
 * Pure helper — assigns each item a delay in [0, budgetMs] so screens can cascade
 * without hand-rolled timing. Empty input yields an empty plan; never throws on junk.
 */
export function planArrivalStagger(count, { gap = 60, budget = 1000 } = {}) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const step = Math.max(0, Number(gap) || 0);
  const cap = Math.max(0, Number(budget) || 0);
  const delays = [];
  for (let i = 0; i < n; i += 1) delays.push(Math.min(cap, i * step));
  return delays;
}

/**
 * Demo-prep polish seam (headless-testable): confirm-dialog copy plan.
 * Pure helper — a danger dialog names the irreversible verb once in the title
 * and keeps the body to the consequence, so a stray Elsewhere click never
 * reads a wall of text. Empty input yields a safe default, never blank chrome.
 */
export function planConfirmCopy({ title = '', body = '', confirmLabel = 'Confirm' } = {}) {
  const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const safeTitle = clean(title) || 'Confirm';
  const safeBody = clean(body);
  const safeConfirm = clean(confirmLabel) || 'Confirm';
  return { title: safeTitle, body: safeBody, confirmLabel: safeConfirm };
}

/** Synchronous visibility change; a later settle is optional, never an exit fade. */
export function cut(hideElement, showElement, { state } = {}) {
  stateName(state);
  for (const element of new Set([hideElement, showElement])) {
    if (element) { clear(element); element.dataset.kMotionState = state; }
  }
  if (hideElement && hideElement !== showElement) hideElement.hidden = true;
  if (showElement) showElement.hidden = false;
}
