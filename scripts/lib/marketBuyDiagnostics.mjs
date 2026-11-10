// Browser-serialized read-only evidence for the existing Market BUY gate.
// No timers, trades, retries, layout queries or changes to acceptance conditions.
export function installMarketBuyObservation() {
  const startedAtMs = performance.now();
  const initialState = window.SF?.state;
  const events = [], longTasks = [], disposers = [], observers = [];
  let dropped = 0, finished = false;
  const text = element => String(element?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 256);
  const elapsed = () => performance.now() - startedAtMs;
  function read() {
    const state = window.SF?.state;
    const market = document.querySelector('[data-screen="station"] .sx-mkt');
    const selected = market?.querySelector('.sx-mkt-row.is-active[data-cmdty]')?.getAttribute('data-cmdty') || null;
    const mode = market?.querySelector('.sx-seg__btn.is-on')?.getAttribute('data-mode') || null;
    const rawQuantity = market?.querySelector('.sx-qty__in')?.value ?? null;
    const button = market?.querySelector('.sx-trade__go[data-go]');
    const stationId = state?.ui?.dockedStationId || null;
    const cargo = state?.player?.cargo;
    return {
      elapsedMs: elapsed(), tick: state?.tick ?? null, simTime: state?.simTime ?? null,
      sameStateObject: state === initialState, visibility: document.visibilityState || null,
      stationId, selectedCommodity: selected, mode, rawQuantity,
      quantity: rawQuantity != null && String(rawQuantity).trim() !== '' && Number.isFinite(Number(rawQuantity))
        ? Number(rawQuantity) : null,
      buttonPresent: !!button, buttonDisabled: button ? !!button.disabled : null,
      buttonText: text(button), note: text(market?.querySelector('.sx-trade__note')),
      credits: state?.player?.credits ?? null,
      visibleCredits: text(document.querySelector('[data-screen="station"] .sxb-purse__value')),
      cargoCapacity: cargo?.capVolume ?? null, cargoUsed: cargo?.usedVolume ?? null,
      selectedCargo: selected ? cargo?.items?.[selected] ?? null : null,
      stock: selected ? state?.economy?.markets?.[stationId]?.[selected]?.stock ?? null : null,
      toasts: [...document.querySelectorAll('#toasts .sf-toast__text')].slice(0, 8).map(text),
    };
  }
  const before = read();
  function remember(event, payload = null) {
    // Retain scalars only, never mutable or arbitrarily large bus payloads.
    try {
      if (finished) return;
      if (events.length >= 32) { dropped++; return; }
      const fields = {};
      if (payload && typeof payload === 'object') {
        for (const key of ['stationId', 'commodityId', 'mode', 'side', 'quantity', 'qty', 'total', 'reason', 'text', 'kind']) {
          const value = payload[key];
          if (typeof value === 'string') fields[key] = value.slice(0, 256);
          else if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) fields[key] = value;
        }
      } else if (typeof payload === 'string') fields.text = payload.slice(0, 256);
      events.push({ event, elapsedMs: elapsed(), tick: window.SF?.state?.tick ?? null,
        credits: window.SF?.state?.player?.credits ?? null,
        visibleCredits: text(document.querySelector('[data-screen="station"] .sxb-purse__value')),
        sameStateObject: window.SF?.state === initialState, payload: fields });
    } catch (_) { /* Evidence must not throw into production listeners. */ }
  }
  function dispose() {
    for (const off of disposers.splice(0)) { try { off(); } catch (_) {} }
    for (const observer of observers.splice(0)) { try { observer.disconnect(); } catch (_) {} }
  }
  try {
    for (const name of ['ui:buy', 'economy:tradeFailed', 'economy:tradeCompleted', 'toast']) {
      const off = window.SF?.bus?.on?.(name, payload => remember(name, payload));
      if (typeof off === 'function') disposers.push(off);
    }
    if (typeof MutationObserver === 'function') {
      for (const [selector, name] of [['[data-screen="station"] .sxb-purse', 'credits:dom'], ['#toasts', 'toast:dom']]) {
        const root = document.querySelector(selector);
        if (!root) continue;
        const observer = new MutationObserver(() => remember(name, text(root)));
        observers.push(observer);
        observer.observe(root, { childList: true, subtree: true, characterData: true });
      }
    }
    if (typeof PerformanceObserver === 'function') {
      try {
        const observer = new PerformanceObserver(list => {
          if (finished) return;
          for (const entry of list.getEntries()) {
            if (longTasks.length >= 16) break;
            if (Number.isFinite(entry.startTime) && Number.isFinite(entry.duration)) {
              longTasks.push({ elapsedStartMs: entry.startTime - startedAtMs, durationMs: entry.duration });
            }
          }
        });
        observers.push(observer);
        observer.observe({ type: 'longtask', buffered: false });
      } catch (_) { /* Unsupported timing observation is not a gate failure. */ }
    }
  } catch (error) { dispose(); throw error; }
  return {
    finish(hostTiming = null) {
      if (finished) return null;
      try {
        return { before, after: read(), events, dropped, longTasks, hostTiming,
          clockNote: 'Browser elapsed values share observer start; host elapsed values use an independent Node clock. DOM text is not proof of paint.' };
      } finally { finished = true; dispose(); }
    },
  };
}
