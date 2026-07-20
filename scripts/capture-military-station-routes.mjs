#!/usr/bin/env node
// capture-military-station-routes.mjs — PQ-022 place_station_military natural route capture.
//
// Boots the dev server + headless Chrome, starts a real game:new route, and frames the remastered
// place_station_military in its two natural homes:
//   - sector_helios_prime  → station_coalition (Coalition HQ)
//   - sector_tethys_junction → station_customs (Customs Gate)
// Captures default / close / far framings per sector as PNGs for independent visual review, and
// records per-station mesh/authored-state diagnostics so the capture is also a runtime receipt.
//
// This is a CAPTURE tool, not a pass/fail gate. It records evidence for grok/vision verification.
// Exit 0 means all frames were captured; it does NOT assert visual quality.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, '.devshots', 'pq022-military-station-routes');
const W = 1280, H = 720;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function findFreePort(start) {
  const { createServer } = await import('node:net');
  for (let p = start; p < start + 200; p++) {
    const ok = await new Promise((res) => {
      const s = createServer();
      s.once('error', () => res(false));
      s.listen(p, '127.0.0.1', () => s.close(() => res(true)));
    });
    if (ok) return p;
  }
  throw new Error('no free port');
}
async function waitReachable(url) {
  for (let i = 0; i < 160; i++) {
    try { const r = await fetch(url); if (r.ok || r.status === 404) return; } catch (_) {}
    await sleep(150);
  }
  throw new Error('server never reachable');
}

// Each sector's military station and a set of framing offsets (relative to station origin).
// Offsets are in world units; camera looks back at the station origin.
// `admitTicks` lets slower-admitting stations (e.g. Tethys customs) wait longer per frame.
const SECTORS = [
  {
    label: 'helios_coalition',
    sectorId: 'sector_helios_prime',
    stationId: 'station_coalition',
    admitTicks: 60,
    frames: [
      { name: 'default', dx: 90, dz: 110 },
      { name: 'close', dx: 45, dz: 60 },
      { name: 'far', dx: 220, dz: 260 },
    ],
  },
  {
    label: 'tethys_customs',
    sectorId: 'sector_tethys_junction',
    stationId: 'station_customs',
    admitTicks: 120, // Tethys admits slower in headless swiftshader; give it more time
    frames: [
      { name: 'default', dx: 90, dz: 110 },
      { name: 'close', dx: 45, dz: 60 },
      { name: 'far', dx: 220, dz: 260 },
    ],
  },
];

let serverChild, browser;
const errors = [];
try {
  const port = await findFreePort(8731);
  serverChild = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  serverChild.stdout.on('data', () => {});
  serverChild.stderr.on('data', () => {});
  await waitReachable(`http://127.0.0.1:${port}/`);

  const chromePath = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean).find((c) => { try { return existsSync(c); } catch { return false; } });
  if (!chromePath) throw new Error('chrome not found');

  const debugPort = await findFreePort(9631);
  browser = spawn(chromePath, [
    '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    `--window-size=${W},${H}`, `--remote-debugging-port=${debugPort}`, 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  browser.stdout.on('data', () => {});
  browser.stderr.on('data', () => {});

  let wsUrl = null;
  for (let i = 0; i < 80; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
      const page = tabs.find((t) => t.type === 'page');
      if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch (_) {}
    await sleep(200);
  }
  if (!wsUrl) throw new Error('no CDP target');
  const ws = new WebSocket(wsUrl);
  await new Promise((r, e) => {
    ws.addEventListener('open', r, { once: true });
    ws.addEventListener('error', e, { once: true });
  });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params?.exceptionDetails;
      errors.push(d?.text || d?.exception?.description || 'exception');
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      errors.push((msg.params.args || []).map((a) => a.value || a.description || '').join(' '));
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id); pending.delete(msg.id); resolve(msg.result || {});
    }
  });
  const cdp = (method, params = {}) => new Promise((resolve) => {
    id++; pending.set(id, { resolve }); ws.send(JSON.stringify({ id, method, params }));
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Log.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: "try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}",
  });

  mkdirSync(OUT, { recursive: true });

  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/?debug=flight` });
  // Wait for runtime ready
  for (let i = 0; i < 120; i++) {
    const ready = await new Promise((res) => {
      id++; pending.set(id, { resolve: res });
      ws.send(JSON.stringify({
        id, method: 'Runtime.evaluate',
        params: { expression: 'JSON.stringify({ ready: !!(window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.renderer) })', returnByValue: true },
      }));
    });
    try {
      if (JSON.parse(ready.result?.value || '{}').ready) break;
    } catch (_) {}
    await sleep(150);
  }

  // Start a normal game route.
  await cdp('Runtime.evaluate', {
    expression: `(() => {
      window.SF.bus.emit('game:new', { name: 'PQ-022 Military Station Route Capture', seed: 47 });
      window.SF.bus.emit('ui:closeAll', {});
    })()`,
  });
  // Wait for playable flight
  for (let i = 0; i < 200; i++) {
    const r = await cdp('Runtime.evaluate', {
      expression: 'JSON.stringify({ ok: !!(window.SF && window.SF.state && window.SF.state.mode === "flight" && window.SF.state.tick > 0) })',
      returnByValue: true,
    });
    try { if (JSON.parse(r.result?.value || '{}').ok) break; } catch (_) {}
    await sleep(200);
  }

  const diagnostics = { sectors: [], pageErrors: [] };

  for (const sector of SECTORS) {
    // Enter the sector through the world system (natural route).
    await cdp('Runtime.evaluate', {
      expression: `(() => {
        const world = window.SF && window.SF.registry && window.SF.registry.get && window.SF.registry.get('world');
        if (world && typeof world.enterSector === 'function') world.enterSector(${JSON.stringify(sector.sectorId)});
      })()`,
    });
    // Wait for sector playable.
    for (let i = 0; i < 200; i++) {
      const r = await cdp('Runtime.evaluate', {
        expression: 'JSON.stringify({ ok: !!(window.SF && window.SF.state && window.SF.state.mode === "flight" && window.SF.state.tick > 0) })',
        returnByValue: true,
      });
      try { if (JSON.parse(r.result?.value || '{}').ok) break; } catch (_) {}
      await sleep(200);
    }
    await sleep(1500); // let stations stream/admit before per-frame capture begins

    const frames = [];
    let lastDiag = {};
    // Capture ALL frames for this sector in a SINGLE long-lived browser eval. This sidesteps the
    // residency-eviction tick that fires between separate CDP roundtrips on slower-admitting
    // sectors (e.g. Tethys customs): the station admits once and stays admitted while we sweep the
    // camera through default/close/far, then return all three PNGs + diagnostics together.
    const framesJs = JSON.stringify(sector.frames.map((f) => ({ name: f.name, dx: f.dx, dz: f.dz })));
    const evalRes = await cdp('Runtime.evaluate', {
      expression: `(async () => {
        const state = window.SF && window.SF.state;
        if (!state) return JSON.stringify({ ok: false, reason: 'no state' });
        const render = state.render;
        if (!render || !render.scene || !render.renderer || !render.camera) return JSON.stringify({ ok: false, reason: 'no render' });
        const stationId = ${JSON.stringify(sector.stationId)};
        const rs = window.SF && window.SF.registry && window.SF.registry.get && window.SF.registry.get('render');
        const findMil = () => {
          const list = (state.entityList || []).filter((e) => e && e.type === 'station' && e.alive !== false);
          return list.find((s) => (s.data && s.data.stationId) === stationId) || null;
        };
        const waitAdmit = async (maxTicks) => {
          let m = null;
          for (let k = 0; k < maxTicks; k++) {
            m = findMil();
            if (m && m.mesh) {
              m.mesh.traverse((o) => { if (o) o.frustumCulled = false; });
              const req = m.mesh.userData && m.mesh.userData.requestAuthoredUpgrade;
              if (typeof req === 'function') req(render.renderer, render.scene);
              let mc = 0; m.mesh.traverse((o) => { if (o && o.isMesh && o.visible !== false) mc++; });
              if (mc > 0) return m;
            }
            if (rs && typeof rs.reconcileMeshes === 'function') rs.reconcileMeshes();
            render.renderer.render(render.scene, render.camera);
            await new Promise((r) => setTimeout(r, 250));
          }
          return (m && m.mesh) ? m : null;
        };
        let mil = await waitAdmit(${sector.admitTicks});
        if (!mil) return JSON.stringify({ ok: false, reason: 'no military station mesh after admit wait' });
        // Anchor the player near the station once so residency keeps the station alive.
        const sx0 = (mil.mesh.position && mil.mesh.position.x) || (mil.pos && mil.pos.x) || 0;
        const sz0 = (mil.mesh.position && mil.mesh.position.z) || (mil.pos && mil.pos.z) || 0;
        const player = state.entities && state.entities.get(state.playerId);
        if (player) {
          player.pos = { x: sx0 + 90, y: 0, z: sz0 + 110 };
          if (player.mesh && player.mesh.position) player.mesh.position.set(sx0 + 90, 0, sz0 + 110);
        }
        if (rs && typeof rs.reconcileMeshes === 'function') rs.reconcileMeshes();
        render.renderer.render(render.scene, render.camera);
        // Re-admit at the anchor.
        mil = await waitAdmit(${sector.admitTicks});
        if (!mil) return JSON.stringify({ ok: false, reason: 'no military station mesh after player anchor' });

        // Snapshot each frame: move only the camera, render, then expose the framing via a
        // global hook so the Node side can take a CDP screenshot (the WebGL canvas has
        // preserveDrawingBuffer off, so toDataURL readback returns blank — CDP screenshot is the
        // reliable path). The whole sector stays in one admitted session.
        const frameList = ${framesJs};
        const out = { ok: true, frames: [], diag: null };
        let meshCount = 0, visibleMeshCount = 0, partUrl = null;
        mil.mesh.traverse((o) => {
          if (o && o.isMesh) { meshCount++; if (o.visible !== false) visibleMeshCount++; }
          const urls = o && o.userData && (o.userData.spacefacePartUrls || (o.userData.spacefacePartUrl ? [o.userData.spacefacePartUrl] : []));
          if (urls && urls.length) partUrl = urls[0];
        });
        out.diag = {
          found: true,
          id: mil.id,
          archetypeGlb: mil.data && mil.data.archetypeGlb,
          authoredState: mil.mesh.userData && mil.mesh.userData.authoredAssetState,
          meshCount, visibleMeshCount, partUrl,
        };
        const sx = (mil.mesh.position && mil.mesh.position.x) || (mil.pos && mil.pos.x) || 0;
        const sz = (mil.mesh.position && mil.mesh.position.z) || (mil.pos && mil.pos.z) || 0;
        // Stash the per-frame camera setup on a global so each subsequent CDP screenshot is taken
        // from the intended framing; the screenshot itself is grabbed from the Node side.
        window.__PQ022_FRAME_QUEUE = window.__PQ022_FRAME_QUEUE || [];
        for (const fr of frameList) {
          const cx = sx + fr.dx, cz = sz + fr.dz;
          window.__PQ022_FRAME_QUEUE.push({ name: fr.name, sx, sz, cx, cz });
          out.frames.push({ name: fr.name, cam: { x: cx, z: cz }, stationRoot: { x: sx, z: sz } });
        }
        return JSON.stringify(out);
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    let posRes = {};
    const rawValue = evalRes.result?.value;
    const exDetails = evalRes.exceptionDetails;
    if (exDetails) {
      posRes = { ok: false, reason: 'eval exception: ' + (exDetails.exception?.description || exDetails.text || 'unknown').split('\n')[0].slice(0, 200) };
    } else if (rawValue) {
      try { posRes = JSON.parse(rawValue); } catch (_) { posRes = { ok: false, reason: 'parse failed: ' + String(rawValue).slice(0, 200) }; }
    } else {
      posRes = { ok: false, reason: 'no eval return (result=' + JSON.stringify(evalRes.result).slice(0, 200) + ')' };
    }
    if (posRes.diag) lastDiag = posRes.diag;
    if (posRes.ok && Array.isArray(posRes.frames)) {
      // For each queued frame: pop one framing off the global queue, apply it, render, then take a
      // CDP screenshot. Keeps the admitted session live and gets a real composited framebuffer.
      for (const fr of posRes.frames) {
        const applyRes = await cdp('Runtime.evaluate', {
          expression: `(() => {
            const state = window.SF && window.SF.state;
            const render = state && state.render;
            const rs = window.SF && window.SF.registry && window.SF.registry.get && window.SF.registry.get('render');
            const q = (window.__PQ022_FRAME_QUEUE || [])[0];
            if (!q || !render) return JSON.stringify({ ok: false, reason: 'no frame queued' });
            render.camera.position.set(q.cx, 22, q.cz);
            if (typeof render.camera.lookAt === 'function') render.camera.lookAt(q.sx, 6, q.sz);
            if (rs && typeof rs.reconcileMeshes === 'function') rs.reconcileMeshes();
            render.renderer.render(render.scene, render.camera);
            return JSON.stringify({ ok: true, cam: { x: q.cx, z: q.cz }, stationRoot: { x: q.sx, z: q.sz } });
          })()`,
          returnByValue: true,
        });
        let applyOk = false; let applyInfo = {};
        try { applyInfo = JSON.parse(applyRes.result?.value || '{}'); applyOk = !!applyInfo.ok; } catch (_) {}
        // Pop the queue regardless so the next frame advances.
        await cdp('Runtime.evaluate', {
          expression: `(() => { if (Array.isArray(window.__PQ022_FRAME_QUEUE)) window.__PQ022_FRAME_QUEUE.shift(); })()`,
        });
        await sleep(250);
        const shot = await cdp('Page.captureScreenshot', {
          format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 },
        });
        const filename = `${sector.label}_${fr.name}.png`;
        if (shot.data) {
          writeFileSync(resolve(OUT, filename), Buffer.from(shot.data, 'base64'));
          frames.push({ name: fr.name, file: filename, positioned: { ok: applyOk, reason: applyInfo.reason || '', stationRoot: applyInfo.stationRoot, cam: applyInfo.cam } });
        } else {
          frames.push({ name: fr.name, file: null, positioned: { ok: applyOk, reason: applyInfo.reason || '' }, error: 'no screenshot data' });
        }
      }
    } else {
      for (const fr of sector.frames) {
        frames.push({ name: fr.name, file: null, positioned: { ok: false, reason: posRes.reason || '' } });
      }
    }
    // Clear the queue between sectors.
    await cdp('Runtime.evaluate', { expression: 'window.__PQ022_FRAME_QUEUE = []' });
    diagnostics.sectors.push({ sector: sector.label, sectorId: sector.sectorId, stationId: sector.stationId, station: lastDiag, frames });
  }

  diagnostics.pageErrors = [...new Set(errors)].slice(0, 20);
  writeFileSync(resolve(OUT, 'capture-manifest.json'), JSON.stringify(diagnostics, null, 2));
  console.log('capture-manifest:', JSON.stringify(diagnostics, null, 2));
  if (diagnostics.pageErrors.length) {
    console.log('PAGE ERRORS:', JSON.stringify(diagnostics.pageErrors, null, 2));
  } else {
    console.log('no page errors');
  }
} finally {
  try { browser && browser.kill(); } catch (_) {}
  try { serverChild && serverChild.kill(); } catch (_) {}
}
