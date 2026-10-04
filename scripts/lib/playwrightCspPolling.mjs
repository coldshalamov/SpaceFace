const CSP_POLLING_INSTALLED = Symbol('spaceface.playwrightCspPollingInstalled');

export function installCspSafePlaywrightPolling(page, { pollingMs = 50 } = {}) {
  if (!page || typeof page.evaluate !== 'function' || typeof page.waitForTimeout !== 'function') {
    throw new TypeError('CSP-safe Playwright polling requires a live Page');
  }
  if (!Number.isInteger(pollingMs) || pollingMs < 1) {
    throw new TypeError('CSP-safe Playwright polling requires a positive polling interval');
  }
  if (page[CSP_POLLING_INSTALLED]) return page;
  Object.defineProperty(page, CSP_POLLING_INSTALLED, { value: true });
  Object.defineProperty(page, 'waitForFunction', {
    configurable: true,
    value: (predicate, argument = null, options = {}) => waitForPageCondition(
      page,
      predicate,
      argument,
      { ...options, pollingMs },
    ),
  });
  // The game's docked/menu surfaces are event-rendered: the page may produce zero
  // requestAnimationFrame callbacks for minutes at a time. Playwright's native
  // waitForSelector polls on that rAF, so elements already in the DOM still time out.
  // Route selector waits through the same timer-driven evaluate polling instead.
  Object.defineProperty(page, 'waitForSelector', {
    configurable: true,
    value: (selector, options = {}) => waitForSelectorCondition(
      page,
      selector,
      { ...options, pollingMs },
    ),
  });
  return page;
}

/**
 * Force a minimal real frame cadence on event-rendered (frameless) pages.
 *
 * The game's docked/menu surfaces stop requesting frames once idle. In headless Chromium the
 * compositor then stops issuing BeginFrames entirely — page rAF starves, Playwright's native
 * waits/actionability polls (which ride requestAnimationFrame) never tick, and the game's own
 * keepalive path (registry.keepalive only runs inside a produced frame) goes quiet too.
 * A pinned 1px compositor animation keeps real frames flowing — the same D33 fix
 * check-station-ui-temporal-stability.mjs uses inline — so native waits, clicks, and the
 * docked keepalive all run. Call before navigation; injects into every document.
 */
export async function installFrameKeepalive(page) {
  if (!page || typeof page.addInitScript !== 'function') {
    throw new TypeError('frame keepalive requires a live Page');
  }
  const installScript = () => {
    const install = () => {
      if (!document.body || document.getElementById('sf-probe-keepalive-frames')) return;
      const sheet = document.createElement('style');
      sheet.textContent = '@keyframes sfProbeFrames{from{transform:translateX(0)}to{transform:translateX(1px)}}';
      document.head.appendChild(sheet);
      const keep = document.createElement('div');
      keep.id = 'sf-probe-keepalive-frames';
      keep.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;'
        + 'pointer-events:none;opacity:0.01;animation:sfProbeFrames 1s linear infinite;';
      document.body.appendChild(keep);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
  };
  await page.addInitScript(installScript);
  // firstWindow() can return an already-loaded document (Electron): cover it directly too.
  if (typeof page.evaluate === 'function') await page.evaluate(installScript).catch(() => {});
  return page;
}

/** Timer-polled replacement for Page.waitForSelector on frameless (event-rendered) pages. */
async function waitForSelectorCondition(page, selector, { state = 'visible', timeout = 30_000, pollingMs = 50 } = {}) {
  const deadline = Date.now() + timeout;
  const query = ([sel, wanted]) => {
    const el = document.querySelector(sel);
    const attached = !!el;
    const rect = attached ? el.getBoundingClientRect() : null;
    const visible = attached && rect.width > 0 && rect.height > 0
      && getComputedStyle(el).visibility !== 'hidden';
    if (wanted === 'attached') return attached;
    if (wanted === 'visible') return visible;
    if (wanted === 'hidden') return !visible;
    return !attached; // 'detached'
  };
  for (;;) {
    let matched = false;
    try {
      matched = await page.evaluate(query, [selector, state]);
    } catch (_) { /* navigation mid-wait: keep polling until the deadline */ }
    if (matched) {
      if (state === 'hidden' || state === 'detached') return null;
      const handle = await page.evaluateHandle((sel) => document.querySelector(sel), selector);
      return handle && handle.asElement ? handle.asElement() : handle;
    }
    if (Date.now() >= deadline) break;
    await page.waitForTimeout(Math.min(pollingMs, Math.max(1, deadline - Date.now())));
  }
  const error = new Error(`page.waitForSelector: Timeout ${timeout}ms exceeded.\nwaiting for selector "${selector}" to be ${state}`);
  error.name = 'TimeoutError';
  throw error;
}

export async function consumePageConditionValue(valueOrHandle) {
  if (!valueOrHandle || typeof valueOrHandle.jsonValue !== 'function') return valueOrHandle;
  try {
    return await valueOrHandle.jsonValue();
  } finally {
    try {
      await valueOrHandle.dispose?.();
    } catch (_) { /* best-effort parity with Playwright handle cleanup */ }
  }
}

export async function waitForPageCondition(
  page,
  predicate,
  argument = null,
  { timeout = 30_000, pollingMs = 50 } = {},
) {
  if (typeof predicate !== 'function') throw new TypeError('page condition must be a function');
  if (!Number.isFinite(timeout) || timeout < 0) throw new TypeError('page condition timeout must be non-negative');
  const deadline = Date.now() + timeout;
  let lastError = null;
  do {
    try {
      const value = await page.evaluate(predicate, argument);
      if (value) return value;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() >= deadline) break;
    await page.waitForTimeout(Math.min(pollingMs, Math.max(1, deadline - Date.now())));
  } while (true);

  const detail = lastError?.message ? `; last evaluation failed: ${lastError.message}` : '';
  const error = new Error(`CSP-safe page condition timed out after ${timeout}ms${detail}`);
  error.name = 'TimeoutError';
  throw error;
}
