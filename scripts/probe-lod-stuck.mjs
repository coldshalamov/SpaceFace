// One-off diagnostic for DRAW-COST-1: boots Swarm, zooms out, then dumps the live transition
// state of every ship whose desired LOD tier differs from its presented tier.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const { loadPlaywright } = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/load-playwright.mjs')).href);
const freePort = () => new Promise((res, rej) => { const p = createNetServer(); p.once('error', rej); p.listen(0, '127.0.0.1', () => { const { port } = p.address(); p.close(() => res(port)); }); });
const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' } });
const { chromium } = await loadPlaywright();
let browser;
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 150)); }
  browser = await chromium.launch({ headless: false, args: ['--disable-renderer-backgrounding', '--window-size=1600,900'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const lines = [];
  page.on('console', (m) => { const t = m.text(); if (/lod|demot|whole-ship|residen|admission/i.test(t)) lines.push(`${m.type()}: ${t.slice(0, 400)}`); });
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch {} });
  await page.goto(`http://127.0.0.1:${port}/?swarmRound=18`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150000 });
  const t0 = Date.now();
  while (true) {
    const ok = await page.evaluate(() => { const s = window.SF.state; return s.mode === 'flight' && Number.isFinite(s.render && s.render.firstPlayableFrameAt); });
    if (ok) break;
    if (Date.now() - t0 > 560000) throw new Error('no flight');
    await new Promise((r) => setTimeout(r, 1000));
  }
  await page.evaluate(() => window.SF.bus.emit('camera:zoom', { level: 330 }));
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.SF.bus.emit('camera:zoom', { level: 330 }));

  for (let round = 0; round < 6; round++) {
    await page.waitForTimeout(5000);
    const dump = await page.evaluate(() => {
      const S = window.SF.state;
      const out = [];
      const cam = S.camera && S.camera.obj;
      for (const [id, mesh] of S.render.meshes) {
        const e = S.entities.get(id);
        if (!e || e.type !== 'ship' || e.isPlayer || e.alive === false) continue;
        let b = mesh;
        mesh.traverse && mesh.traverse((o) => { if (b === mesh && o.userData && o.userData.wholeShipLodFamilyInstalled) b = o; });
        const ud = (b && b.userData) || {};
        const desired = ud.wholeShipLodDesiredLevel;
        const active = ud.wholeShipLodActiveLevel;
        if (!desired || desired === active) continue;
        const sample = ud.initialShipLodSample;
        const view = cam && cam.matrixWorldInverse && cam.matrixWorldInverse.elements;
        const proj = cam && cam.projectionMatrix && cam.projectionMatrix.elements;
        const eq16 = (a, b2) => !!a && !!b2 && a.length === 16 && b2.length === 16 && a.every((v, i) => v === b2[i]);
        out.push({
          id, desired, active,
          promise: !!ud.wholeShipLodTransitionPromise,
          retryAfterIn: Number.isFinite(ud.wholeShipLodRetryAfter) ? Math.round(ud.wholeShipLodRetryAfter - performance.now()) : null,
          epoch: ud.admissionEpoch,
          authoredState: ud.authoredAssetState,
          roots: ud.wholeShipLodRoots ? Object.keys(ud.wholeShipLodRoots) : null,
          applied: ud._appliedLodLevel,
          lastAbort: ud.wholeShipLodLastAbort
            ? { at: Math.round(performance.now() - ud.wholeShipLodLastAbort.at) + 'ms-ago', req: ud.wholeShipLodLastAbort.requestedLevel, aborts: ud.wholeShipLodLastAbort.aborts }
            : null,
          boundaryVisible: b.visible, parentChain: !!b.parent,
          sample: sample ? {
            age: Math.round(performance.now() - sample.at),
            px: Math.round(sample.px),
            sameEntity: sample.entity === e,
            protectedBody: sample.protectedBody,
            viewEq: eq16(sample.view, view),
            projEq: eq16(sample.projection, proj),
          } : null,
        });
      }
      return out;
    });
    console.log(`--- dump ${round} (${dump.length} stuck)`);
    for (const d of dump.slice(0, 12)) console.log(JSON.stringify(d));
  }
  console.log('--- console lines ---');
  for (const l of lines.slice(0, 60)) console.log(l);
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
process.exit(0);
