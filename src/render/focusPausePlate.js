// Ruling (owner, 2026-11-21): the world is never held silently. When the focus-loss
// hold stops the clock, a plain plate says so — a frozen world with effects still
// animating and no pause screen reads as a hang. The plate hides the instant the
// hold releases; the scale-0 hold itself resumes with no catch-up jump by
// construction (no wall debt accrues while the clock is held).
let plate = null;

export function focusPausePlateVisible() {
  return plate !== null;
}

export function setFocusPausePlate(visible) {
  if (typeof document === 'undefined') return;
  if (!visible) {
    if (plate) {
      plate.remove();
      plate = null;
    }
    return;
  }
  if (plate) return;
  plate = document.createElement('div');
  plate.id = 'sf-focus-pause';
  Object.assign(plate.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '9000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    background: 'rgba(5, 9, 16, 0.93)',
    fontFamily: 'inherit',
    color: '#dfe8f2',
    textAlign: 'center',
    userSelect: 'none',
    cursor: 'default',
  });
  const title = document.createElement('div');
  title.textContent = 'Paused';
  Object.assign(title.style, {
    fontSize: '34px',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    fontWeight: '600',
  });
  const hint = document.createElement('div');
  hint.textContent = 'The window lost focus — click or press any key to continue.';
  Object.assign(hint.style, {
    fontSize: '15px',
    opacity: '0.75',
    letterSpacing: '0.04em',
    padding: '0 24px',
  });
  plate.append(title, hint);
  // Clicking the window re-focuses it, which releases the hold and hides this
  // plate; the click itself must not also reach the game underneath.
  plate.addEventListener('pointerdown', (event) => event.preventDefault(), { capture: true });
  (document.body || document.documentElement).appendChild(plate);
}

// Ruling (coordinator, 2026-11-21): any moment the simulation cannot step for more than a tenth of
// a second must be covered by a state the player understands. When the worker stops advancing
// during flight with nothing else on screen (a run boot inside the worker, a long save, a heavy
// one-off step), this plate dims the frozen world and says so; it lifts the moment steps resume.
let holdPlate = null;
let holdShownAt = 0;
let holdHideTimer = null;
const HOLD_MIN_VISIBLE_MS = 400; // ruling: once shown it stays at least this long (no flicker)
const HOLD_FADE_MS = 160;
const holdNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
export function worldHoldPlateVisible() { return holdPlate !== null; }
export function setWorldHoldPlate(visible) {
  if (typeof document === 'undefined') return;
  if (!visible) {
    if (!holdPlate || holdHideTimer) return;
    const wait = Math.max(0, HOLD_MIN_VISIBLE_MS - (holdNow() - holdShownAt));
    const plate = holdPlate;
    holdHideTimer = setTimeout(() => {
      holdHideTimer = null;
      if (holdPlate !== plate) return;
      plate.style.opacity = '0';
      setTimeout(() => plate.remove(), HOLD_FADE_MS);
      holdPlate = null;
    }, wait);
    return;
  }
  if (holdHideTimer) { clearTimeout(holdHideTimer); holdHideTimer = null; }
  if (holdPlate) return;
  holdShownAt = holdNow();
  holdPlate = document.createElement('div');
  holdPlate.id = 'sf-world-hold';
  Object.assign(holdPlate.style, {
    position: 'fixed', inset: '0', zIndex: '8900', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: 'rgba(5, 9, 16, 0.55)', color: '#dfe8f2',
    fontFamily: 'inherit', fontSize: '15px', letterSpacing: '0.18em', textTransform: 'uppercase',
    pointerEvents: 'none', userSelect: 'none', opacity: '0', transition: 'opacity ' + HOLD_FADE_MS + 'ms ease',
  });
  holdPlate.textContent = 'Loading…';
  (document.body || document.documentElement).appendChild(holdPlate);
  const shown = holdPlate;
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
  raf(() => { if (holdPlate === shown) shown.style.opacity = '1'; });
}
