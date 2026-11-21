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
