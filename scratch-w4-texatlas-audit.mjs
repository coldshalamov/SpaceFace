// W4 texatlas lane: per-frame texture-bind + program-switch attribution.
// Boots the real route headless, waits for flight, installs GL wrappers tallying
// bindTexture by (unit, texture identity) and useProgram by program identity.
// Labels resolve at dump time: scene material texture slots, light shadow maps,
// and program shaderName via renderer.properties.
//   node scratch-w4-texatlas-audit.mjs [--seconds=25]
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './scripts/lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const SECONDS = Number((process.argv.find((a) => a.startsWith('--seconds=')) || '').split('=')[1]) || 25;
const { chromium } = await loadPlaywright();

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`game server did not answer at ${url}`);
}

const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT,
  stdio: 'ignore',
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
});
let browser = null;
try {
  const baseUrl = `http://127.0.0.1:${port}/`;
  await waitForServer(baseUrl);
  browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1600,900',
      '--js-flags=--expose-gc',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    window.__SPACEFACE_PERF_COUNTERS__ = true;
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 300_000 });
  await page.bringToFront();
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'BindAudit' }));
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    return state && state.mode === 'flight'
      && Number.isFinite(state.render && state.render.firstPlayableFrameAt);
  }, null, { timeout: 600_000 });
  console.log('flight reached; installing bind audit wrappers');

  await page.evaluate(() => {
    const render = window.SF.state.render;
    const renderer = render.renderer;
    const gl = renderer.getContext();
    if (gl.__sfBindAudit) return;
    const texIds = new WeakMap();
    const progIds = new WeakMap();
    let nextTex = 1;
    let nextProg = 1;
    const stats = window.__sfBindAuditStats = {
      binds: 0,
      bindsByUnit: {},
      texBindCount: new Map(),
      switchPairs: new Map(),
      programSwitches: 0,
      progBindCount: new Map(),
      transitions: new Map(),
      texObjects: new Map(),   // id -> WebGLTexture (resolve labels at dump)
      progObjects: new Map(),  // id -> WebGLProgram
      texTargets: new Map(),   // id -> target constant seen most
    };
    let activeUnit = 0;
    const lastPerUnit = new Map();
    const oActive = gl.activeTexture.bind(gl);
    gl.activeTexture = (unit) => { activeUnit = unit - gl.TEXTURE0; oActive(unit); };
    const oBind = gl.bindTexture.bind(gl);
    gl.bindTexture = (target, texture) => {
      oBind(target, texture);
      if (texture == null) return;
      stats.binds++;
      stats.bindsByUnit[activeUnit] = (stats.bindsByUnit[activeUnit] || 0) + 1;
      let id = texIds.get(texture);
      if (id == null) {
        id = nextTex++;
        texIds.set(texture, id);
        stats.texObjects.set(id, texture);
        stats.texTargets.set(id, target);
      }
      let row = stats.texBindCount.get(id);
      if (!row) { row = { label: `#${id}`, count: 0, units: new Set() }; stats.texBindCount.set(id, row); }
      row.count++;
      row.units.add(activeUnit);
      const prev = lastPerUnit.get(activeUnit);
      if (prev !== undefined && prev !== id) {
        const key = `${prev}->${id}@u${activeUnit}`;
        stats.switchPairs.set(key, (stats.switchPairs.get(key) || 0) + 1);
      }
      lastPerUnit.set(activeUnit, id);
    };
    const oUse = gl.useProgram.bind(gl);
    let lastProg = null;
    gl.useProgram = (prog) => {
      oUse(prog);
      if (prog === lastProg) return;
      stats.programSwitches++;
      let id = progIds.get(prog);
      if (id == null) { id = nextProg++; progIds.set(prog, id); if (prog) stats.progObjects.set(id, prog); }
      let row = stats.progBindCount.get(id);
      if (!row) { row = { label: `#${id}`, count: 0 }; stats.progBindCount.set(id, row); }
      row.count++;
      if (lastProg != null && prog != null) {
        const key = `${lastProg}->${id}`;
        stats.transitions.set(key, (stats.transitions.get(key) || 0) + 1);
      }
      lastProg = id;
    };
    gl.__sfBindAudit = true;
  });

  await page.waitForTimeout(SECONDS * 1000);

  const report = await page.evaluate(() => {
    const render = window.SF.state.render;
    const renderer = render.renderer;
    const gl = renderer.getContext();
    const stats = window.__sfBindAuditStats;

    // Resolve labels now, at dump time: walk scene materials' texture slots and
    // compare renderer.properties.get(tex).__webglTexture against seen GL objects.
    const texLabel = new Map();  // id -> label
    const progLabel = new Map();
    const seenMat = new Set();
    const labelTex = (tex, label) => {
      try {
        const props = renderer.properties.get(tex);
        const glTex = props && props.__webglTexture;
        if (!glTex) return;
        for (const [id, obj] of stats.texObjects) {
          if (obj === glTex && !texLabel.has(id)) texLabel.set(id, label);
        }
      } catch (_) {}
    };
    const scanMaterials = (root) => {
      root.traverse((o) => {
        const mats = o && o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
          if (!m || seenMat.has(m)) continue;
          seenMat.add(m);
          for (const [key, value] of Object.entries(m)) {
            if (value && value.isTexture) labelTex(value, `${m.name || m.type}.${key}`);
          }
          try {
            const mp = renderer.properties.get(m);
            const prog = mp && mp.currentProgram;
            if (prog && prog.program) {
              for (const [id, obj] of stats.progObjects) {
                if (obj === prog.program && !progLabel.has(id)) {
                  progLabel.set(id, `${m.name || m.type}::${prog.name || 'prog'}`);
                }
              }
            }
          } catch (_) {}
        }
        if (o && o.isLight && o.shadow && o.shadow.map && o.shadow.map.texture) {
          labelTex(o.shadow.map.texture, `${o.name || 'light'}.shadowMap`);
        }
      });
    };
    if (render.scene) scanMaterials(render.scene);
    // Render targets in use (post chain): find WebGLRenderTarget fields anywhere under render.
    const seenRt = new Set();
    const scanTargets = (obj, depth) => {
      if (!obj || depth > 4 || seenRt.has(obj)) return;
      if (typeof obj !== 'object') return;
      seenRt.add(obj);
      if (obj.isWebGLRenderTarget && obj.texture) labelTex(obj.texture, `RT:${obj.texture.name || obj.name || 'target'}`);
      if (obj.isTexture) labelTex(obj, `tex:${obj.name || obj.type}`);
      for (const v of Object.values(obj)) {
        if (v && typeof v === 'object' && (v.isWebGLRenderTarget || v.isTexture)) {
          if (v.isWebGLRenderTarget) { try { labelTex(v.texture, `RT:${v.texture.name || v.name || 'target'}`); } catch (_) {} }
          else if (v.isTexture) labelTex(v, `tex:${v.name || v.type}`);
        }
      }
    };
    try { scanTargets(render, 0); } catch (_) {}
    // Texture size for still-unlabeled GL objects: bind once to a scratch unit and read
    // TEXTURE_WIDTH/HEIGHT. Only for the top binders — cheap enough at ~40 calls.
    const bindOnce = (id) => {
      const tex = stats.texObjects.get(id);
      const target = stats.texTargets.get(id);
      if (!tex || target == null) return null;
      try {
        const prevActive = gl.getParameter(gl.ACTIVE_TEXTURE);
        gl.activeTexture(gl.TEXTURE15);
        gl.bindTexture(target, tex);
        const w = gl.getTexParameter(target, gl.TEXTURE_WIDTH);
        const h = gl.getTexParameter(target, gl.TEXTURE_HEIGHT);
        const fmt = gl.getTexParameter(target, gl.TEXTURE_INTERNAL_FORMAT);
        gl.activeTexture(prevActive);
        return `${w}x${h}:0x${(fmt || 0).toString(16)}`;
      } catch (_) { return null; }
    };

    const sortedTex = [...stats.texBindCount.entries()]
      .map(([id, r]) => ({ id, count: r.count, units: [...r.units] }))
      .sort((a, b) => b.count - a.count);
    for (const row of sortedTex.slice(0, 50)) {
      row.label = texLabel.get(row.id) || `gl:${bindOnce(row.id) || '?'}`;
      delete row.id;
    }
    const sortedProg = [...stats.progBindCount.entries()]
      .map(([id, r]) => ({ id, count: r.count }))
      .sort((a, b) => b.count - a.count);
    for (const row of sortedProg) {
      row.label = progLabel.get(row.id) || `prog#${row.id}`;
      delete row.id;
    }
    const perf = window.__SPACEFACE_PERF__ && window.__SPACEFACE_PERF__.getCounterSnapshot
      ? window.__SPACEFACE_PERF__.getCounterSnapshot() : null;
    return {
      binds: stats.binds,
      programSwitches: stats.programSwitches,
      bindsByUnit: stats.bindsByUnit,
      distinctTextures: stats.texObjects.size,
      distinctPrograms: stats.progObjects.size,
      texBindTop: sortedTex.slice(0, 45),
      progUseTop: sortedProg.slice(0, 60),
      switchPairs: [...stats.switchPairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30),
      progTransitions: [...stats.transitions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 45),
      counters: perf && perf.totals ? {
        textureBinds: perf.totals.textureBinds,
        programSwitches: perf.totals.programSwitches,
        drawCalls: perf.totals.drawCalls,
        drawInstancedCalls: perf.totals.drawInstancedCalls,
        textureUploads: perf.totals.textureUploads,
        textureSubUploads: perf.totals.textureSubUploads,
        framesObserved: perf.framesObserved,
      } : null,
    };
  });
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill();
}
