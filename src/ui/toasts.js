// Toasts (ARCHITECTURE §5, spec "Toasts") — transient bottom-right notifications.
// Driven by the `toast` event {text,kind,ttl}. Max 5 rendered, slide-in, auto-dismiss,
// click to dismiss. Purely cosmetic → uses performance.now() / DOM only (no sim state).

const MAX = 5;
const KIND_ICON = { success: '✓', good: '✓', error: '✕', danger: '✕', warn: '!', info: '›', credits: '¢', rep: '◈' };

export function createToasts(ctx) {
  const { bus } = ctx;
  const root = document.getElementById('toasts');
  const live = []; // { el, born, ttl }

  function push({ text = '', kind = 'info', ttl = 4 } = {}) {
    if (!root || !text) return;
    const el = document.createElement('div');
    el.className = `sf-toast sf-toast--${kind}`;
    const icon = document.createElement('span');
    icon.className = 'sf-toast__icon';
    icon.textContent = KIND_ICON[kind] || '›';
    const body = document.createElement('span');
    body.className = 'sf-toast__text';
    body.textContent = text;
    el.append(icon, body);
    el.addEventListener('click', () => dismiss(rec));
    // newest on top
    root.prepend(el);
    const rec = { el, born: performance.now(), ttl: ttl * 1000 };
    live.unshift(rec);
    // animate in next frame
    requestAnimationFrame(() => el.classList.add('sf-toast--in'));
    while (live.length > MAX) dismiss(live[live.length - 1]);
  }

  function dismiss(rec) {
    if (!rec) return;
    const i = live.indexOf(rec);
    if (i >= 0) live.splice(i, 1);
    rec.el.classList.remove('sf-toast--in');
    rec.el.classList.add('sf-toast--out');
    setTimeout(() => { if (rec.el.parentNode) rec.el.parentNode.removeChild(rec.el); }, 180);
  }

  // called each frame from hud's frame() (cheap; only touches opacity near expiry)
  function tick() {
    if (!live.length) return;
    const now = performance.now();
    for (let i = live.length - 1; i >= 0; i--) {
      const rec = live[i];
      const age = now - rec.born;
      if (age > rec.ttl) { dismiss(rec); continue; }
      const left = rec.ttl - age;
      if (left < 300) rec.el.style.opacity = String(Math.max(0, left / 300));
    }
  }

  bus.on('toast', push);

  return { push, tick };
}
