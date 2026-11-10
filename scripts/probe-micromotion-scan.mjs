import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
function findBrowser() {
  return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].find((c) => existsSync(c)) || null;
}
const s = createNetServer();
const port = await new Promise((res) => {
  s.once('listening', () => { const p = s.address().port; s.close(() => res(p)); });
  s.listen(0, '127.0.0.1');
});
const child = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' },
});
let serverOut = '';
child.stdout.on('data', (c) => { serverOut = (serverOut + c).slice(-3000); });
child.stderr.on('data', (c) => { serverOut = (serverOut + c).slice(-3000); });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true, executablePath: findBrowser() || undefined,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--disable-background-timer-throttling'] });
try {
  for (let i = 0; i < 60; i++) {
    if (await fetch(`http://127.0.0.1:${port}/`).then((r) => r.ok).catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  const url = new URL(`http://127.0.0.1:${port}/`); url.searchParams.set('debug', 'flight');
  await page.goto(String(url), { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 120000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'MM Probe' }));
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(p && (p.mesh || (p.view && p.view.root)));
  }, null, { timeout: 150000 });
  // Wait for the authored payload to actually land before inspecting the tree.
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    const root = p && (p.mesh || (p.view && p.view.root));
    return !!(root && root.userData && root.userData.authoredAssetState === 'authored');
  }, null, { timeout: 120000 }).catch(() => console.log('authored wait timed out'));
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const sf = window.SF;
    const player = sf.state.entities.get(sf.state.playerId);
    const mesh = player.mesh || (player.view && player.view.root);
    const hull = mesh && mesh.userData && mesh.userData.hull;
    const socket = mesh && mesh.getObjectByName('SOCKET_Retro_Port');
    const pivot = mesh && mesh.getObjectByName('Retro_Thruster_Port');
    const assembly = mesh && mesh.getObjectByName('Retro_Bow_Assembly');
    const chainFrom = (node) => {
      const names = [];
      for (let o = node; o; o = o.parent) names.push(o.name || o.type);
      return names;
    };
    const inside = (root, node) => { for (let o = node; o; o = o.parent) if (o === root) return true; return false; };
    // Where do sockets actually live? Search every reachable root.
    const roots = [mesh, player.view && player.view.root, player.mesh];
    const find = {};
    for (const r of roots) {
      if (!r) continue;
      find[r.name] = {
        hasRetroSocket: !!r.getObjectByName('SOCKET_Retro_Port'),
        hasPivot: !!r.getObjectByName('Retro_Thruster_Port'),
        hasAssembly: !!r.getObjectByName('Retro_Bow_Assembly'),
        children: r.children ? r.children.map((c) => c.name || c.type) : [],
      };
    }
    const bellNames = [];
    const socketNames = [];
    mesh && mesh.traverse((o) => {
      const l = (o.name || '').toLowerCase();
      if (o.name && o.name.startsWith('SOCKET_')) socketNames.push(o.name);
      else if (o.name && /nozzle|bell|drive|engine|plume|thruster|exhaust/.test(l)) bellNames.push(o.name);
    });
    // Reproduce scanMountPivots exactly: roots [hull, mesh], stack LIFO, shared cap 64 / 8 bells.
    const BELL_RE = /nozzle|bell|drive|engine|plume|thruster|exhaust/;
    const sim = { scanned: 0, bellOrder: [], pivotHit: null, capHitBeforePivot: false };
    for (const root of [hull, mesh].filter(Boolean)) {
      const stack = [root];
      while (stack.length && sim.scanned < 64) {
        const n = stack.pop(); sim.scanned++;
        const name = n.name || '';
        const lower = name.toLowerCase();
        const isSocket = name.startsWith('SOCKET_');
        const isBell = BELL_RE.test(lower);
        const isGimbalSocket = isSocket && (lower.includes('engine') || lower.includes('trail'));
        if (((isBell && !isSocket) || isGimbalSocket) && n.rotation) {
          sim.bellOrder.push(name);
          if (name === 'Retro_Thruster_Port') sim.pivotHit = { scanned: sim.scanned, bellIndex: sim.bellOrder.length - 1 };
        }
        const ch = n.children || [];
        for (let i = 0; i < ch.length; i++) stack.push(ch[i]);
      }
    }
    if (sim.scanned >= 64 && !sim.pivotHit) sim.capHitBeforePivot = true;
    return {
      meshName: mesh && mesh.name,
      hullName: hull && hull.name,
      socketChain: chainFrom(socket),
      pivotInHull: !!(hull && pivot && inside(hull, pivot)),
      pivotInMesh: !!(mesh && pivot && inside(mesh, pivot)),
      assemblyParent: assembly && assembly.parent && assembly.parent.name,
      find,
      bellNames: bellNames.slice(0, 30),
      bellCount: bellNames.length,
      socketNames,
      authoredState: mesh && mesh.userData && mesh.userData.authoredAssetState,
      scanSim: sim,
      totalNodes: (() => { let n = 0; mesh && mesh.traverse(() => n++); return n; })(),
      pivotChain: chainFrom(pivot || socket),
      hullOfPivot: (() => {
        // Walk up: which ancestor chain ends at mesh.userData.hull?
        if (!pivot) return null;
        const names = [];
        for (let o = pivot.parent; o && o !== mesh; o = o.parent) names.push(o.name || o.type);
        return names;
      })(),
      playerMeshIsViewRoot: player.mesh === (player.view && player.view.root),
    };
  });
  console.log(JSON.stringify(info, null, 1));
} finally {
  await browser.close();
  child.kill();
}
