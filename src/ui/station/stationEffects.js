// Orbital presentation has no independent render loop and never writes GameState.
// Pointer work is coalesced to one requested frame. Observers exist only while shown.
// Web Animations are bounded, interruptible, and cancelled on hide/dispose.
const SVG = 'http://www.w3.org/2000/svg';
const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function stationMotionAllowed(state = {}, mediaReduce = false) {
  const settings = state.settings || {};
  return !mediaReduce && !settings.video?.motionReduce && !settings.accessibility?.flashReduce
    && !globalThis.document?.documentElement?.classList.contains('sf-reduce-motion')
    && !globalThis.document?.documentElement?.classList.contains('sf-reduce-flash');
}

export function createStationEffects({ root, app, body, dock, credits, getState }) {
  const media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const stop = new AbortController();
  const animations = new Set();
  const perElement = new WeakMap();
  const chartData = new WeakMap();
  let visible = true, disposed = false, frame = 0, pointer = null, light = null;
  let creditValue = null;
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(enhance) : { observe() {}, disconnect() {} };
  const rail = dock.querySelector('[role=tablist]');
  const indicator = document.createElement('span');
  indicator.className = 'so-dock-indicator'; indicator.setAttribute('aria-hidden', 'true');
  dock.append(indicator);
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(updateIndicator) : { observe() {}, disconnect() {} };
  const on = (node, event, fn, options = {}) => node.addEventListener(event, fn, { ...options, signal: stop.signal });
  const allowed = () => visible && !disposed && !document.hidden && stationMotionAllowed(getState(), !!media?.matches);

  function syncPolicy() {
    const enabled = allowed();
    root.dataset.soMotion = enabled ? 'on' : 'off';
    root.dataset.soActive = visible && !document.hidden ? 'true' : 'false';
    if (!enabled) cancelWork();
    return enabled;
  }
  function cancelWork() {
    if (frame) cancelAnimationFrame(frame); frame = 0; pointer = null;
    for (const animation of animations) animation.cancel();
    animations.clear();
    if (light) light.removeAttribute('data-so-lit'); light = null;
  }
  function animate(element, frames, options) {
    if (!element || !allowed() || !element.animate) return;
    perElement.get(element)?.cancel();
    const animation = element.animate(frames, { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)', ...options });
    perElement.set(element, animation); animations.add(animation);
    const cleanup = () => { animations.delete(animation); if (perElement.get(element) === animation) perElement.delete(element); };
    animation.addEventListener('finish', cleanup, { once: true });
    animation.addEventListener('cancel', cleanup, { once: true });
  }
  function updateIndicator() {
    if (!visible || disposed) return;
    const active = dock.querySelector('[role=tab][aria-selected=true]');
    if (!active) return;
    const a = active.getBoundingClientRect(), b = dock.getBoundingClientRect();
    // Fixed-size targets; only a decorative underlay translates. Read all geometry before writes.
    indicator.style.width = `${a.width}px`;
    indicator.style.height = `${a.height}px`;
    indicator.style.transform = `translate(${a.left - b.left + dock.scrollLeft}px,${a.top - b.top + dock.scrollTop}px)`;
  }
  function enhance() {
    if (!visible || disposed) return;
    for (const chart of body.querySelectorAll('svg[data-history-mids]:not([data-so-chart])')) {
      const mids = (chart.dataset.historyMids || '').split(',').map(Number);
      const path = chart.querySelector('[data-history-line]')?.getAttribute('d') || '';
      const coords = [...path.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(m => ({ x: +m[1], y: +m[2] }));
      if (!coords.length || coords.length !== mids.length || mids.some(v => !Number.isFinite(v))) continue;
      chart.dataset.soChart = 'true';
      chart.setAttribute('preserveAspectRatio', 'none');
      chart.setAttribute('tabindex', '0');
      const originalLabel = chart.getAttribute('aria-label') || 'Price history';
      chart.setAttribute('aria-label', `${originalLabel} Use Left and Right to inspect recorded samples.`);
      const probe = document.createElementNS(SVG, 'g');
      probe.setAttribute('class', 'so-chart-probe'); probe.setAttribute('aria-hidden', 'true');
      probe.innerHTML = '<line/><circle r="3.5"/><rect rx="3" width="76" height="20"/><text/>';
      chart.append(probe);
      const data = { coords, mids, index: coords.length - 1, probe, originalLabel };
      chartData.set(chart, data);
    }
    // A diagram accompanies real empty-state copy; it contains no invented cargo or preview hull.
    for (const state of body.querySelectorAll('.sf-state--empty:not([data-so-empty])')) {
      state.dataset.soEmpty = 'true';
      if (!state.querySelector('img,canvas')) state.classList.add('so-empty-illustrated');
    }
  }
  function probeAt(chart, index, keyboard = false) {
    const data = chartData.get(chart); if (!data) return;
    index = Math.max(0, Math.min(data.coords.length - 1, index)); data.index = index;
    const { x, y } = data.coords[index];
    const box = chart.viewBox.baseVal, width = box.width, height = box.height;
    const [line, circle, rect, text] = data.probe.children;
    const tx = Math.min(width - 80, Math.max(4, x - 38));
    const ty = y < 35 ? Math.min(height - 24, y + 10) : y - 28;
    for (const [k, v] of Object.entries({ x1: x, x2: x, y1: 4, y2: height - 4 })) line.setAttribute(k, v);
    circle.setAttribute('cx', x); circle.setAttribute('cy', y);
    rect.setAttribute('x', tx); rect.setAttribute('y', ty);
    text.setAttribute('x', tx + 38); text.setAttribute('y', ty + 14);
    text.textContent = `${fmt.format(data.mids[index])} cr`;
    chart.classList.add('is-probed');
    if (keyboard) chart.setAttribute('aria-label', `${data.originalLabel} Sample ${index + 1} of ${data.coords.length}: ${fmt.format(data.mids[index])} credits.`);
  }
  function pointerFlush() {
    frame = 0;
    if (!pointer || !visible || disposed) return;
    const { target, x, y } = pointer; pointer = null;
    const chart = target.closest?.('svg[data-so-chart]');
    if (chart) {
      const data = chartData.get(chart), rect = chart.getBoundingClientRect();
      // SVG preserveAspectRatio meet can letterbox; use its screen matrix, not a stretched ratio.
      const matrix = chart.getScreenCTM();
      if (data && matrix && rect.width) {
        const px = new DOMPoint(x, y).matrixTransform(matrix.inverse()).x;
        let best = 0; for (let i = 1; i < data.coords.length; i++) if (Math.abs(data.coords[i].x - px) < Math.abs(data.coords[best].x - px)) best = i;
        probeAt(chart, best);
      }
    }
    if (!allowed()) return;
    const host = target.closest?.('[data-so-light]');
    if (light && light !== host) light.removeAttribute('data-so-lit');
    light = host;
    if (!host) return;
    const r = host.getBoundingClientRect();
    host.style.setProperty('--so-pointer-x', `${Math.round(x - r.left)}px`);
    host.style.setProperty('--so-pointer-y', `${Math.round(y - r.top)}px`);
    host.setAttribute('data-so-lit', 'true');
  }
  on(root, 'pointermove', e => {
    if (!visible || e.pointerType === 'touch') return;
    pointer = { target: e.target, x: e.clientX, y: e.clientY };
    if (!frame) frame = requestAnimationFrame(pointerFlush);
  }, { passive: true });
  on(root, 'pointerleave', () => { if (light) light.removeAttribute('data-so-lit'); light = null; });
  on(body, 'pointerout', e => {
    const chart = e.target.closest?.('svg[data-so-chart]');
    if (chart && !chart.contains(e.relatedTarget) && document.activeElement !== chart) chart.classList.remove('is-probed');
  });
  on(body, 'focusin', e => { if (chartData.has(e.target)) probeAt(e.target, chartData.get(e.target).index); });
  on(body, 'focusout', e => { if (chartData.has(e.target)) e.target.classList.remove('is-probed'); });
  on(body, 'keydown', e => {
    const data = chartData.get(e.target); if (!data) return;
    const moves = { ArrowLeft: data.index - 1, ArrowRight: data.index + 1, Home: 0, End: data.coords.length - 1 };
    if (!(e.key in moves)) return;
    e.preventDefault(); e.stopPropagation(); probeAt(e.target, moves[e.key], true);
  });
  on(document, 'visibilitychange', syncPolicy);
  media?.addEventListener?.('change', syncPolicy);
  on(dock, 'scroll', updateIndicator, { passive: true });
  observer.observe(body, { childList: true, subtree: true });
  resize.observe(dock); if (rail) resize.observe(rail);
  syncPolicy(); enhance();
  return {
    allowed, syncPolicy,
    navigate() {
      syncPolicy(); updateIndicator(); enhance();
      animate(body.firstElementChild, [{ opacity: .25, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 260 });
      const beam = body.querySelector('.sx-mkt-line');
      if (beam && allowed() && typeof beam.getTotalLength === 'function') { const n = beam.getTotalLength(); animate(beam, [{ strokeDasharray: `${n}`, strokeDashoffset: n }, { strokeDasharray: `${n}`, strokeDashoffset: 0 }], { duration: 650 }); }
    },
    arrive() { syncPolicy(); animate(app, [{ opacity: .3, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 360 }); updateIndicator(); },
    credits(value) {
      const next = Math.max(0, Math.round(Number(value) || 0));
      if (creditValue === next) return;
      const previous = creditValue; creditValue = next;
      // Canonical amount settles immediately. Animation never impersonates a transaction value.
      credits.textContent = next.toLocaleString('en-US');
      if (previous !== null) {
        animate(credits, [{ transform: 'translateY(7px)', opacity: .35 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 350 });
        const delta = app.querySelector('.so-credit-delta');
        delta.textContent = `${next > previous ? '+' : '−'}${Math.abs(next - previous).toLocaleString('en-US')}`;
        animate(delta, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .75 }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 1600 });
      }
    },
    receipt() { animate(app.querySelector('.so-transfer path'), [{ strokeDasharray: '1', strokeDashoffset: 1 }, { strokeDasharray: '1', strokeDashoffset: 0 }], { duration: 550 }); },
    show() { visible = true; syncPolicy(); observer.observe(body, { childList: true, subtree: true }); resize.observe(dock); if (rail) resize.observe(rail); enhance(); updateIndicator(); },
    hide() { visible = false; syncPolicy(); observer.disconnect(); resize.disconnect(); cancelWork(); },
    dispose() { disposed = true; visible = false; observer.disconnect(); resize.disconnect(); cancelWork(); stop.abort(); media?.removeEventListener?.('change', syncPolicy); indicator.remove(); },
  };
}
