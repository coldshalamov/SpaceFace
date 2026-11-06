// runUiBenchBatch supplies a fresh browser context per cell. Each control must also start
// with a fresh document: BENCH.goto intentionally keeps state for in-screen navigation.
// Reuse the context (viewport, phone/touch and media preferences) and the exact fixture URL.
export async function createBenchArrival(page, url, { timeoutMs }) {
  const { origin, pathname } = new URL(url);
  // A walk can persist settings or records. Clear the cell's private web storage before each
  // bench document seeds itself, including the first arrival. Never run this on another page.
  await page.addInitScript(({ origin, pathname }) => {
    if (window !== window.top || location.origin !== origin || location.pathname !== pathname) return;
    localStorage.clear();
    sessionStorage.clear();
  }, { origin, pathname });
  return async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForFunction(() => window.__BENCH_READY === true, null, { timeout: timeoutMs });
  };
}
