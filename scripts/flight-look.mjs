// Flight look: boot the real game, New Game -> Launch, and screenshot the live flight picture
// (full post pipeline, HUD optional) at the default chase zoom and the close zoom.
//   node scripts/flight-look.mjs [--wait=20] [--zooms=144,58] [--hud] [--out=.devshots/flight-look]
import { mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const OUT = ROOT + (args.out || '.devshots/flight-look') + '/';
const zooms = String(args.zooms || '144,58').split(',').map(Number);
mkdirSync(OUT, { recursive: true });

const server = createGameServer({ root: ROOT });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.SF_CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling'],
});

async function clickButton(page, label) {
  return page.evaluate((wanted) => {
    const buttons = [...document.querySelectorAll('button')].filter((b) => b.getClientRects().length && !b.disabled);
    const match = buttons.find((b) => b.textContent.trim() === wanted) || buttons.find((b) => b.textContent.includes(wanted));
    if (!match) return false;
    match.click();
    return true;
  }, label);
}

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const consoleLines = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleLines.push(m.text().slice(0, 400)); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'commit', timeout: 180000 });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 240000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('New Game')), null, { timeout: 120000 });
  await clickButton(page, 'New Game');
  await page.waitForTimeout(600);
  await clickButton(page, 'Launch');
  await page.waitForFunction(() => {
    const s = window.SF?.state;
    return s?.mode === 'flight' && !!s.entities?.get(s.playerId) && !document.body.classList.contains('ui-modal-open');
  }, null, { timeout: 300000 });
  // SwiftShader never completes the post-opening GPU admission that releases the authored upgrade
  // queue, so every non-opening body would stay a resolving marker. Release it for the capture.
  await page.evaluate(async () => {
    const lib = await import('/src/render/partsLibrary.js');
    lib.resumeAuthoredUpgradeQueueAfterOpening(window.SF.state.render.scene);
  });
  if (args.ship) {
    const swapped = await page.evaluate((defId) => {
      const ships = window.SF.registry?.get?.('ships');
      if (!ships) return 'no ships system';
      const ok = ships.buyShip({ defId, grant: true, setActive: true });
      const s = window.SF.state; const p = s.entities.get(s.playerId);
      return `buy=${ok} active=${p?.data?.defId}`;
    }, String(args.ship));
    console.log('ship swap', swapped);
  }
  if (args.sector) {
    // Jump to a non-opening sector through the same entry point a gate/drive jump uses, so the
    // sector materializes at full presence before we aim.
    const jumped = await page.evaluate((sectorId) => {
      const world = window.SF.registry?.get?.('world');
      if (!world?.enterSector) return 'no world.enterSector';
      world.enterSector(sectorId, { fromJump: true, via: 'drive', fromSectorId: window.SF.state.world?.currentSectorId });
      return `sector=${window.SF.state.world?.currentSectorId}`;
    }, String(args.sector));
    console.log('sector', jumped);
    await page.waitForTimeout(4000);
  }
  if (args.aim) {
    // The chase camera follows player position only — park the player `aimDist` WU +Z of the
    // named station so the place sits on screen.
    const report = await page.evaluate(({ token, dist }) => {
      const s = window.SF.state;
      const matches = (e) => {
        const d = e.data || {};
        return d.stationId === token || d.archetypeGlb === token || d.poiId === token
          || d.landmarkGlb === token || d.placeId === token || e.id === token;
      };
      let target = null;
      for (const e of s.entities.values()) if (matches(e)) { target = e; break; }
      // POI lane marks and most dressing are presentation rows, not live entities.
      if (!target) {
        for (const row of s.world?.dressing?.rows || []) {
          if (row && row.alive !== false && matches(row)) { target = row; break; }
        }
      }
      if (!target) return 'no station match';
      // Same-sector teleports must go through relocatePlayerInSector: a raw pos+prevPos write
      // emits no transform record, so the presented hull stays parked at the old spot and the
      // chase camera (which follows the presented pose) frames empty space.
      const world = window.SF.registry?.get?.('world');
      const moved = world && world.relocatePlayerInSector
        ? world.relocatePlayerInSector({ x: target.pos.x, z: target.pos.z + dist }, { reason: 'flight-look:aim' })
        : false;
      if (!moved) {
        const p = s.entities.get(s.playerId);
        p.pos.x = target.pos.x;
        p.pos.z = target.pos.z + dist;
        if (p.vel) { p.vel.x = 0; p.vel.z = 0; }
        if (p.prevPos) { p.prevPos.x = p.pos.x; p.prevPos.z = p.pos.z; }
      }
      return `${target.id} at (${target.pos.x.toFixed(0)},${target.pos.z.toFixed(0)}) relocated=${moved}`;
    }, { token: String(args.aim), dist: Number(args.aimDist || 260) });
    console.log('aim', report);
    // Stations hide their procedural fallback while 'awaiting-authored-admission', so a shot
    // taken before the boundary admits shows floating overlay over empty space. Gate the
    // capture on the aimed entity reaching an authored state.
    const authoredWait = Number(args.aimAuthoredWait || 180);
    if (authoredWait > 0) {
      try {
        await page.waitForFunction(({ token }) => {
          const s = window.SF.state;
          const matches = (e) => {
            const d = e.data || {};
            return d.stationId === token || d.archetypeGlb === token || d.poiId === token
              || d.landmarkGlb === token || d.placeId === token || e.id === token;
          };
          // Dressing rows never get row.mesh — the renderer's mesh map holds their boundary.
          const renderMeshes = window.SF.registry?.get?.('render')?._meshes;
          const rows = [...s.entities.values(), ...(s.world?.dressing?.rows || [])];
          for (const e of rows) {
            if (!matches(e)) continue;
            const root = e.mesh || (renderMeshes && renderMeshes.get(e.id));
            const st = root && root.userData && root.userData.authoredAssetState;
            return typeof st === 'string' && st.startsWith('authored');
          }
          return false;
        }, { token: String(args.aim) }, { timeout: authoredWait * 1000, polling: 1000 });
        console.log('aim-authored ok');
      } catch {
        console.log('aim-authored TIMEOUT — capture proceeds with whatever is admitted');
      }
    }
  }
  // 'authored' marks the boundary's decision; the render package then compiles behind every
  // other queued admission. Under software GL that queue drains slowly, so a shot taken right
  // after admission can still catch procedural-hidden space. Wait the queue out.
  const queueWait = Number(args.queueWait ?? 240);
  if (queueWait > 0) {
    try {
      await page.waitForFunction(async () => {
        const lib = await import('/src/render/partsLibrary.js');
        const q = lib.describeAuthoredUpgradeQueue(window.SF.state.render.scene);
        if (!q || q.present === false) return true;
        return (q.pending | 0) === 0 && (q.inFlight | 0) === 0 && !(q.jobs && q.jobs.length);
      }, null, { timeout: queueWait * 1000, polling: 2000 });
      console.log('queue drained');
    } catch {
      console.log('queue drain TIMEOUT — capture proceeds');
    }
  }
  await page.waitForTimeout(Number(args.wait || 20) * 1000);
  // SwiftShader trips the software-renderer emergency profile (third-resolution, bloom off). A
  // look capture wants the hardware picture: full resolution and the shipping bloom/ink post.
  const hq = await page.evaluate(() => {
    const r = window.SF.registry?.get?.('render');
    if (!r) return 'no render system';
    try { r._adaptive?.setEnabled(false); } catch (_) {}
    window.SF.state.render.dynResScale = 1;
    try { r._applySize(); } catch (e) { return 'applySize ' + e.message; }
    try { r.bloom?.setOptions({ bloom: true }); } catch (_) {}
    return 'ok';
  });
  console.log('hq', hq);
  if (!args.hud) await page.addStyleTag({ content: '#hud, .hud, [class*="hud"], #ui-root > *:not(canvas) { visibility: hidden !important; }' });
  for (const zoom of zooms) {
    await page.evaluate((z) => { const c = window.SF.state.camera; c.zoom = z; c.targetZoom = z; c.zoomTarget = z; }, zoom);
    await page.waitForTimeout(Number(args.settle || 6) * 1000);
    await page.screenshot({ path: `${OUT}flight_z${zoom}.png`, timeout: 180000 });
    console.log('shot zoom', zoom);
  }
  const info = await page.evaluate(async () => {
    const THREE = await import('three');
    const s = window.SF.state; const p = s.entities.get(s.playerId);
    const root = p.mesh; const out = [];
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      for (let n = o; n && n !== root; n = n.parent) if (!n.visible) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      out.push({ name: o.name, geo: o.geometry.type, mat: o.material?.name, count: o.count, min: b.min.toArray().map((v) => +v.toFixed(2)), max: b.max.toArray().map((v) => +v.toFixed(2)) });
    });
    let queue = null;
    try { queue = (await import('/src/render/partsLibrary.js')).describeAuthoredUpgradeQueue(window.SF.state.render.scene); } catch (e) { queue = String(e); }
    const ud = root.userData || {};
    return { defId: p.data?.defId, rot: p.rot, state: ud.authoredAssetState, phase: ud.authoredPreparePhase, requested: ud.authoredUpgradeRequestedAt, err: String(ud.authoredAssetError || ud.authoredFailure || ''), queue, meshes: out };
  });
  (await import('node:fs')).writeFileSync(OUT + 'player-meshes.json', JSON.stringify(info, null, 1));
  console.log(JSON.stringify(info).slice(0, 4000));
  if (errors.length) console.log('pageErrors', errors.slice(0, 5));
  (await import('node:fs')).writeFileSync(OUT + 'console.txt', consoleLines.join('\n'));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
