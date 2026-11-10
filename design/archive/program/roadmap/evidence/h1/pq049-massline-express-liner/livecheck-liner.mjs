// Focused live-route check for PQ-049.04/.05 acceptance.
// Boots the real game in headless Chrome against a throwaway server rooted at the
// checked-out candidate (run from the worktree), starts a seeded flight, finds the
// natural Helios express liner (ship_mule + trafficRole 'express'), moves the player
// within streaming reach, and asserts the entity presents as the authored
// massline_express_liner_v1 release asset with no loader failures.
// Self-contained: node builtins only. Everything here is read-only on game state
// except the sanctioned pose resync write (same as probe-authored-assets-live.mjs).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SEED = 47;
const APPROACH_STANDOFF_WU = 90;
const BOOT_TIMEOUT_MS = Number(process.env.LIVECHECK_BOOT_MS) || 240000;
const PLAYABLE_TIMEOUT_MS = 120000;
const ADMIT_TIMEOUT_MS = 180000;
const OUT_JSON = join(ROOT, 'livecheck-liner-report.json');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function findFreePort(preferred) {
  return await new Promise((resolve) => {
    const srv = createNetServer();
    srv.once('error', () => { srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); }); });
    srv.listen(preferred, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}

async function waitReachable(url, timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (r.ok) return true; } catch (_) {}
    await sleep(300);
  }
  return false;
}

function findChrome() {
  for (const c of [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ]) if (existsSync(c)) return c;
  throw new Error('no Chrome/Edge found');
}

async function connectCdp(port) {
  let wsUrl = null;
  for (let i = 0; i < 300; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = tabs.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch (_) {}
    await sleep(150);
  }
  if (!wsUrl) throw new Error('no CDP page target');
  const socket = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    socket.addEventListener('open', res, { once: true });
    socket.addEventListener('error', rej, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const fail = (err) => { for (const p of pending.values()) p.reject(err); pending.clear(); };
  socket.addEventListener('close', () => fail(new Error('cdp socket closed')));
  socket.addEventListener('error', () => fail(new Error('cdp socket error')));
  socket.addEventListener('message', (ev) => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message || JSON.stringify(m.error))) : resolve(m.result || {});
    }
  });
  return {
    socket,
    send(method, params = {}, timeoutMs = 60000) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const to = setTimeout(() => { pending.delete(id); reject(new Error(`cdp send timeout: ${method}`)); }, timeoutMs);
        pending.set(id, {
          resolve: (v) => { clearTimeout(to); resolve(v); },
          reject: (e) => { clearTimeout(to); reject(e); },
        });
        try { socket.send(JSON.stringify({ id, method, params })); }
        catch (e) { pending.delete(id); clearTimeout(to); reject(e); }
      });
    },
  };
}

async function evalJson(cdp, expr, timeoutMs = 60000) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: `Promise.resolve((${expr})).then((v)=>JSON.stringify(v))`,
    returnByValue: true, awaitPromise: true,
  }, timeoutMs);
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 500));
  return JSON.parse(r.result && r.result.value || 'null');
}

async function evalVoid(cdp, expr, timeoutMs = 60000) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true }, timeoutMs);
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 500));
  return r;
}

const FORCE_RENDER = `(async () => {
  const sf = window.SF || null;
  const state = sf && sf.state || null;
  const render = state && state.render || null;
  if (!state || !render || !render.scene || !render.renderer || !render.camera) return;
  for (const entity of state.entityList || []) {
    if (!entity || entity.type !== 'ship' || !entity.mesh) continue;
    entity.mesh.traverse((o) => { if (o) o.frustumCulled = false; });
  }
  try {
    const pl = await import('./src/render/partsLibrary.js');
    if (pl && typeof pl.syncAuthoredInstancePools === 'function') pl.syncAuthoredInstancePools(render.scene);
  } catch (_) {}
  if (typeof render.warmPostProcess === 'function') await render.warmPostProcess();
})()`;

const SHIP_INSPECT = `(async () => {
  const s = window.SF && window.SF.state;
  if (!s) return { ok: false, reason: 'no state' };
  const ships = (s.entityList || []).filter((e) => e && e.type === 'ship');
  const inspect = (e) => {
    const root = e.mesh || (e.view && e.view.root) || null;
    const ud = (root && root.userData) || {};
    let presented = false;
    const partUrls = new Set();
    if (root) root.traverse((o) => {
      if (!o) return;
      const urls = o.userData && Array.isArray(o.userData.spacefacePartUrls)
        ? o.userData.spacefacePartUrls
        : (o.userData && o.userData.spacefacePartUrl ? [o.userData.spacefacePartUrl] : []);
      for (const u of urls) partUrls.add(u);
      if (!presented && (o.isMesh || o.isLine || o.isPoints || o.isSprite) && o.geometry && o.material) {
        let c = o, vis = true;
        while (c && c !== root) { if (c.visible === false) { vis = false; break; } c = c.parent; }
        if (vis && root.visible !== false) presented = true;
      }
    });
    return {
      id: e.id, defId: e.data && e.data.defId || null, role: e.data && e.data.trafficRole || null,
      label: e.data && (e.data.scanLabel || e.data.trafficLabel) || null,
      hitchable: e.data && e.data.hitchable === true,
      itinerary: e.data && e.data.itinerary || null,
      manifest: (e.data && e.data.cargoManifest) || null,
      freightActive: !!(e.data && e.data.cargoManifest && (e.data.cargoManifest.active === true || e.data.cargoManifest.lotId || e.data.cargoManifest.custody)),
      state: ud.authoredAssetState || 'missing-mesh', mode: ud.authoredAssetMode || null,
      visualRoot: ud.authoredVisualRoot || null, payloadAssetId: ud.authoredPayloadAssetId || null,
      slots: ud.authoredSlots || null, partUrls: [...partUrls], presented,
      pos: e.pos ? [Math.round(e.pos.x), Math.round(e.pos.z)] : null,
    };
  };
  const express = ships.filter((e) => e.data && e.data.trafficRole === 'express').map(inspect);
  const player = s.entities && s.playerId != null ? inspect(s.entities.get(s.playerId)) : null;
  const presentedCount = ships.filter((e) => inspect(e).presented).length;
  return { ok: true, mode: s.mode, tick: s.tick, shipCount: ships.length, presentedCount, express, player: player && { state: player.state, mode: player.mode, presented: player.presented, pos: player.pos } };
})()`;

async function main() {
  const port = await findFreePort(8521);
  const server = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  server.stdout.resume(); server.stderr.resume();
  const debugPort = await findFreePort(9801);
  const profileDir = mkdtempSync(join(tmpdir(), 'sf-livecheck-liner-'));
  const chrome = spawn(findChrome(), [
    '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update',
    '--disable-crash-reporter', '--disable-breakpad', '--disable-gpu-shader-disk-cache',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    `--user-data-dir=${profileDir}`, '--window-size=1600,900',
    `--remote-debugging-port=${debugPort}`, 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  chrome.stdout.resume(); chrome.stderr.resume();

  const report = { seed: SEED, route: null, steps: [] };
  const step = (name, detail) => { report.steps.push({ name, detail, at: Date.now() }); console.log(`[livecheck] ${name}${detail ? ' ' + JSON.stringify(detail).slice(0, 400) : ''}`); };
  try {
    assert.ok(await waitReachable(`http://127.0.0.1:${port}/`), 'server unreachable');
    step('server', { port });
    const cdp = await connectCdp(debugPort);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const route = `http://127.0.0.1:${port}/?debug=flight`;
    report.route = route;
    await cdp.send('Page.navigate', { url: route });
    // boot readiness: SF + bus + renderer
    const t0 = Date.now();
    let ready = null;
    while (Date.now() - t0 < BOOT_TIMEOUT_MS) {
      ready = await evalJson(cdp, `(() => { const sf = window.SF || null; const s = sf && sf.state || null; const r = s && s.render || null; return { hasSF: !!sf, hasState: !!s, hasBus: !!(sf && sf.bus), hasRenderer: !!(r && r.renderer) }; })()`).catch(() => null);
      if (ready && ready.hasSF && ready.hasState && ready.hasBus && ready.hasRenderer) break;
      await sleep(500);
    }
    assert.ok(ready && ready.hasRenderer, `boot never ready: ${JSON.stringify(ready)}`);
    step('boot', ready);

    await evalVoid(cdp, `(() => { window.SF.bus.emit('game:new', { name: 'PQ-049 Express Liner Livecheck', seed: ${SEED} }); window.SF.bus.emit('ui:closeAll', {}); })()`);
    const tp = Date.now();
    let snap = null;
    while (Date.now() - tp < PLAYABLE_TIMEOUT_MS) {
      snap = await evalJson(cdp, SHIP_INSPECT).catch((e) => ({ ok: false, reason: e.message }));
      if (snap && snap.ok && snap.mode === 'flight' && snap.tick > 0 && snap.player && snap.player.state === 'authored') break;
      await sleep(500);
    }
    assert.ok(snap && snap.ok && snap.mode === 'flight', `never playable: ${JSON.stringify(snap).slice(0, 500)}`);
    step('playable', { tick: snap.tick, ships: snap.shipCount, presented: snap.presentedCount, player: snap.player });

    // natural-route express liner must exist
    let express = (snap.express || [])[0] || null;
    const te = Date.now();
    while (!express && Date.now() - te < 60000) {
      await sleep(1000);
      snap = await evalJson(cdp, SHIP_INSPECT);
      express = (snap.express || [])[0] || null;
    }
    assert.ok(express, 'no express liner on the natural Helios route');
    step('express-found', express);

    // The express is a fast sector-hopper (~247 WU/s under boost intent): a single teleport goes
    // stale in seconds. Re-place the player beside its live position on every poll instead.
    const expressWrid = express.itinerary && express.itinerary.worldRecordId || null;
    const FOLLOW = `(() => {
      const s = window.SF && window.SF.state;
      const p = s.entities.get(s.playerId);
      const t = (s.entityList || []).find((e) => e && e.data && e.data.trafficRole === 'express'
        && (${JSON.stringify(expressWrid)} ? e.data.itinerary && e.data.itinerary.worldRecordId === ${JSON.stringify(expressWrid)} : e.id === ${express.id}));
      if (!p || !p.pos || !t || !t.pos) return { moved: false, present: !!t };
      const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z;
      const range = Math.hypot(dx, dz) || 1;
      p.pos.x = t.pos.x - (dx / range) * ${APPROACH_STANDOFF_WU};
      p.pos.z = t.pos.z - (dz / range) * ${APPROACH_STANDOFF_WU};
      if (p.vel) { p.vel.x = 0; p.vel.z = 0; }
      return { moved: true, rangeWu: Math.round(range), speedWuS: t.vel ? Math.round(Math.hypot(t.vel.x, t.vel.z)) : null };
    })()`;
    const moved = await evalJson(cdp, FOLLOW);
    assert.equal(moved.moved, true, 'could not place player near the express liner');
    step('approach', moved);

    // wait for the liner's authored admission while staying inside its streaming reach
    const ta = Date.now();
    let final = null;
    const followLog = [];
    while (Date.now() - ta < ADMIT_TIMEOUT_MS) {
      const f = await evalJson(cdp, FOLLOW).catch(() => null);
      if (f && f.moved) followLog.push({ rangeWu: f.rangeWu, speedWuS: f.speedWuS });
      if (f && f.moved === false && f.present === false) { step('express-despawned', {}); break; }
      await evalVoid(cdp, FORCE_RENDER, 90000).catch(() => {});
      final = await evalJson(cdp, SHIP_INSPECT);
      const cur = (final.express || []).find((e) => (expressWrid
        ? e.itinerary && e.itinerary.worldRecordId === expressWrid
        : e.id === express.id)) || (final.express || [])[0];
      if (cur && cur.presented && cur.state === 'authored') { express = cur; break; }
      express = cur || express;
      await sleep(800);
    }
    report.follow = followLog.slice(-12);
    assert.ok(express && express.presented, `express liner never presented: ${JSON.stringify(express).slice(0, 500)}`);
    assert.equal(express.state, 'authored', `express liner not authored: ${JSON.stringify(express).slice(0, 500)}`);
    step('express-admitted', express);

    // contract assertions on the live entity
    assert.equal(express.mode, 'release', 'express liner must admit in release mode');
    assert.equal(express.hitchable, true, 'express liner must remain hitchable');
    assert.ok(express.itinerary && express.itinerary.kind === 'express_hitch_route', `expected express_hitch_route itinerary: ${JSON.stringify(express.itinerary).slice(0, 300)}`);
    assert.ok(!express.freightActive, `express liner must not carry an invented freight manifest: ${JSON.stringify(express.manifest).slice(0, 300)}`);
    const slotUrls = Object.values(express.slots || {}).flat();
    const linerUrls = [...(express.partUrls || []), ...slotUrls].filter((u) => /massline_express_liner_v1/.test(String(u)));
    assert.ok(linerUrls.length > 0, `no massline_express_liner_v1 part URL on the live liner: ${JSON.stringify({ slots: express.slots, partUrls: express.partUrls }).slice(0, 600)}`);
    assert.ok(linerUrls.every((u) => String(u).startsWith('assets/ships/release/parts/')), `liner must resolve from release root: ${JSON.stringify(linerUrls)}`);
    const muleLike = slotUrls.filter((u) => /mule_production/.test(String(u)));
    assert.equal(muleLike.length, 0, `liner presented a Mule body URL: ${JSON.stringify(muleLike)}`);
    step('contract', { linerUrls: [...new Set(linerUrls)], hitchable: express.hitchable, itinerary: express.itinerary && express.itinerary.kind });

    // loader diagnostics: runtime decoders/paths sane, the liner's own URL has no failure record,
    // and no presented ship on the live route sits in a failed/non-authored state.
    const diag = await evalJson(cdp, `(async () => {
      const s = window.SF && window.SF.state;
      const renderer = s && s.render && s.render.renderer || null;
      if (!renderer) return { available: false };
      const al = await import('./src/render/assetLoader.js');
      const info = await al.getAuthoredAssetRuntimeInfo(renderer);
      const linerError = await al.getAuthoredAssetDiagnostic(renderer, 'assets/ships/release/parts/wholeships/massline_express_liner_v1.glb', 'hull').catch(() => null);
      const ships = (s.entityList || []).filter((e) => e && e.type === 'ship');
      const presented = ships.filter((e) => {
        const r = e.mesh || (e.view && e.view.root) || null;
        if (!r) return false; let p = false;
        r.traverse((o) => { if (!p && o && (o.isMesh || o.isLine || o.isPoints || o.isSprite) && o.geometry && o.material && o.visible !== false) p = true; });
        return p;
      });
      const bad = presented.filter((e) => {
        const r = e.mesh || (e.view && e.view.root);
        const st = r.userData.authoredAssetState;
        return st !== 'authored' && st !== 'loading';
      }).map((e) => ({ defId: e.data && e.data.defId, role: e.data && e.data.trafficRole, state: (e.mesh || e.view.root).userData.authoredAssetState, reason: (e.mesh || e.view.root).userData.authoredFailureReason || null }));
      return { available: true, source: info && info.source, decoders: info && info.decoders, linerError: linerError && (linerError.message || linerError.name) || null, presentedCount: presented.length, badPresented: bad };
    })()`, 90000);
    step('loaderDiagnostics', diag);
    assert.ok(diag && diag.available === true, 'authored asset runtime info unavailable');
    assert.equal(diag.linerError, null, `liner release URL has a loader diagnostic: ${JSON.stringify(diag.linerError)}`);
    assert.deepEqual(diag.badPresented, [], `presented ships in a non-authored state: ${JSON.stringify(diag.badPresented).slice(0, 800)}`);

    report.result = 'PASS';
    report.final = { tick: final.tick, express, linerUrls: [...new Set(linerUrls)] };
    writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
    console.log('LIVECHECK PASS');
  } catch (error) {
    report.result = 'FAIL';
    report.error = String(error && error.stack || error).slice(0, 4000);
    try { writeFileSync(OUT_JSON, JSON.stringify(report, null, 2)); } catch (_) {}
    console.error('LIVECHECK FAIL:', error && error.message || error);
    process.exitCode = 1;
  } finally {
    try { chrome.kill('SIGKILL'); } catch (_) {}
    try { server.kill('SIGKILL'); } catch (_) {}
    if (process.platform === 'win32') {
      try { spawn('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) {}
      try { spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) {}
    }
    await sleep(500);
  }
}

await main();
