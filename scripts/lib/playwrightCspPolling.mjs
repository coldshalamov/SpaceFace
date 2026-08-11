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
  return page;
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
