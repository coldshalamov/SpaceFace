// DIAG: dump Helios station + berth + ring-gap geometry for wedge-pose computation.
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { flightReadyInPage } from './lib/alphaLiveBaselineRoute.mjs';

const server = await acquireVisualProbeServer({ root: process.cwd() });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 60_000 });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 10_000 });
  }
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 60_000 });
  await page.waitForFunction(flightReadyInPage, null, { timeout: 300_000 });
  const geo = await page.evaluate(() => {
    const s = window.SF.state;
    const st = (s.entityList || []).find((e) => e?.type === 'station' && e?.data?.stationId === 'station_helios');
    const p = s.entities?.get?.(s.playerId);
    return {
      playerPos: p?.pos, playerVel: p?.vel, playerRadius: p?.radius, playerRot: p?.rot,
      station: st ? { id: st.id, pos: { x: st.pos.x, z: st.pos.z }, rot: st.rot, radius: st.radius, corridorBearingDeg: st.data?.corridorBearingDeg, collisionProxy: st.data?.collisionProxy, dockRadius: st.data?.dockRadius } : null,
      corridor: s.dockingCorridor || null,
      playerId: s.playerId,
    };
  });
  console.log(JSON.stringify(geo, null, 2));
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
