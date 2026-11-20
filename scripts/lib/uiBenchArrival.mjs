import { resolveShot } from './uiBenchCatalog.mjs';

// runUiBenchBatch supplies a fresh browser context per cell. Each control must also start
// with a fresh document: BENCH.goto intentionally keeps state for in-screen navigation.
// Reuse the context (viewport, phone/touch and media preferences) and the exact fixture URL.
export async function createBenchArrival(page, url, { timeoutMs }) {
  const { origin, pathname, searchParams } = new URL(url);
  const workedClaim = Boolean(resolveShot(searchParams.get('screen'))?.drill);
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
    if (!workedClaim) return;
    // A mounted Works shell can still be waiting on WebGL and the authored rig. Use the same
    // readiness signal that enables steering before handing the bench a board to photograph.
    const arrived = await page.waitForFunction(() => {
      const status = document.querySelector('.ast-canvas')?.__ast3d?.readiness();
      if (status?.ready || status?.failed) return status;
      if (document.getElementById('bench-broken')) return { failed: true };
      return null;
    }, null, { timeout: timeoutMs });
    const status = await arrived.jsonValue();
    await arrived.dispose();
    if (!status.ready) throw new Error(`Asteroid Works board failed to open: ${JSON.stringify(status)}`);
  };
}
