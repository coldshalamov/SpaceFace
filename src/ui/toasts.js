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
        if (!r.badge) {
          const badge = document.createElement('span');
          badge.className = 'sf-toast__count';
          r.el.appendChild(badge);
          r.badge = badge;
        }
        r.badge.textContent = '×' + r.count;
        r.el.setAttribute('aria-label', text + ' (×' + r.count + ', dismiss)');
        return;
      }
    }
    const el = document.createElement('div');
    el.className = `sf-toast sf-toast--${kind}`;
    const icon = document.createElement('span');
    icon.className = 'sf-toast__icon';
    icon.textContent = KIND_ICON[kind] || '›';
    const body = document.createElement('span');
    body.className = 'sf-toast__text';
    body.textContent = text;
    el.append(icon, body);
    // Click-to-dismiss is advertised by the cursor:pointer styling; expose the same affordance to
    // keyboard users (Enter/Space) and to AT as a dismissible control.
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', text + ' (dismiss)');
    el.addEventListener('click', () => dismiss(rec));
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); dismiss(rec); }
    });
    // newest on top
    root.prepend(el);
    const rec = { el, born: now, ttl: normalizeTtlMs(ttl), text, kind, count: 1 };
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

function normalizeTtlMs(ttl) {
  const n = Number(ttl);
  if (!Number.isFinite(n) || n <= 0) return 4000;
  return n > 60 ? n : n * 1000;
}
