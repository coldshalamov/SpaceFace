// Probe: boot to flight with HDR energy materials + bloom ENABLED, then confirm the vfx energy
// layer (thruster plume + massline ribbon meshes) initializes and the renderer reports no errors.
// Mirrors the boot-flow / hud-readouts CDP pattern. The energy layer is gated on video.energyMaterials
// && video.bloom, so this proves the shaders compile and the meshes render in the live pipeline.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const ROOT = process.cwd();
const WIDTH = 1280, HEIGHT = 800;
const SHOT = '.devshots/perf/energy-materials.jpg';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function findFreePort(start) {
  const { createServer } = await import('node:net');
  for (let p = start; p < start + 200; p++) {
    const ok = await new Promise((res) => {
      const s = createServer(); s.once('error', () => res(false));
      s.listen(p, '127.0.0.1', () => { s.close(() => res(true)); });
    });
    if (ok) return p;
  }
  throw new Error('no free port');
}
async function waitReachable(url) {
  for (let i = 0; i < 120; i++) { try { const r = await fetch(url); if (r.ok) return; } catch (_) {} await sleep(150); }
  throw new Error('server never reachable');
}

let serverChild, browser;
const issues = [];
try {
  const port = await findFreePort(8171);
  serverChild = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  serverChild.stdout.on('data', () => {}); serverChild.stderr.on('data', () => {});
  await waitReachable(`http://127.0.0.1:${port}/`);

  const fs = await import('node:fs');
  const chrome = await (async () => {
    const candidates = [
      process.env.CHROME_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ].filter(Boolean);
    for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch (_) {} }
    throw new Error('chrome not found');
  })();

  const debugPort = await findFreePort(9402);
  browser = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    `--window-size=${WIDTH},${HEIGHT}`, `--remote-debugging-port=${debugPort}`, 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  browser.stdout.on('data', () => {}); browser.stderr.on('data', () => {});

  // Enable the energy materials + bloom via a pre-flight script (localStorage settings override),
  // same mechanism the settings screen would write.
  await (async () => {
    let wsUrl = null;
    for (let i = 0; i < 60; i++) {
      try {
        const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
        const page = tabs.find((t) => t.type === 'page');
        if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
      } catch (_) {}
      await sleep(200);
    }
    assert(wsUrl, 'no CDP target');
    const ws = new WebSocket(wsUrl);
    await new Promise((r, e) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', e, { once: true }); });
    let id = 0; const pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.method === 'Runtime.exceptionThrown') issues.push({ level: 'error', text: msg.params?.exceptionDetails?.text || 'exception' });
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') issues.push({ level: 'error', text: (msg.params.args || []).map((a) => a.value || a.description || '').join(' ') });
      if (msg.id && pending.has(msg.id)) { const { resolve } = pending.get(msg.id); pending.delete(msg.id); resolve(msg.result || {}); }
    });
    const cdp = { send(method, params = {}) { return new Promise((resolve) => { id++; pending.set(id, { resolve }); ws.send(JSON.stringify({ id, method, params })); }); } };
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
    // Pre-seed settings so energy materials + bloom are on when the game boots.
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}` });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/?settings=energy` });
    const evalJson = async (expr) => JSON.parse((await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value || '{}');

    // Force the energy+bloom settings on the live state once SF is up.
    const ensureSettings = async () => {
      await evalJson(`JSON.stringify((() => {
        const sf = window.SF; if (!sf || !sf.state || !sf.state.settings) return { ready: false };
        sf.state.settings.video.bloom = true;
        sf.state.settings.video.energyMaterials = true;
        return { ready: true, bloom: sf.state.settings.video.bloom, energy: sf.state.settings.video.energyMaterials };
      })())`);
    };

    const snapExpr = `JSON.stringify((() => {
      const sf = window.SF || null; const state = sf && sf.state || null;
      const player = state && state.entities && state.entities.get(state.playerId) || null;
      const classText = document.querySelector('[data-k="role"]')?.textContent || '';
      const hudPlayable = classText.trim() && !/^[-—]$/.test(classText.trim());
      return { sfReady: !!state, mainMenuVisible: !!document.querySelector('[data-screen="mainMenu"]'),
        flightPlayable: !!(state && state.mode === 'flight' && player && player.alive && player.hull > 0) || hudPlayable };
    })())`;
    const wait = async (pred, timeout, label) => {
      const start = Date.now(); let last = null;
      while (Date.now() - start < timeout) { last = await evalJson(snapExpr); if (pred(last)) return last; await sleep(200); }
      throw new Error('timeout: ' + label + ' last=' + JSON.stringify(last));
    };
    // Wait for the menu to be usable (SF ready + menu visible), then boot to flight. Settings are
    // enabled AFTER flight starts so the energy layer initializes on a live scene.
    await wait((s) => s.sfReady && (s.mainMenuVisible || s.flightPlayable), 15000, 'menu');
    let snap = await evalJson(snapExpr);
    if (snap.mainMenuVisible && !snap.flightPlayable) {
      const click = async (label) => {
        // Retry the click a few times: the menu can take a moment to bind handlers after render.
        for (let attempt = 0; attempt < 8; attempt++) {
          const res = await evalJson(`JSON.stringify((() => {
            const b = [...document.querySelectorAll('button')].find((x) => (x.textContent||'').trim() === ${JSON.stringify(label)});
            if (!b) return { ok: false };
            b.click(); return { ok: true };
          })())`);
          if (res && res.ok) return true;
          await sleep(250);
        }
        return false;
      };
      const newGameExpr = `JSON.stringify({ visible: !!document.querySelector('[data-screen="newGame"]') })`;
      await sleep(400); // let the menu settle into an interactive state
      const clicked = await click('New Game');
      // wait for new-game screen (or direct flight)
      let ngSeen = false;
      for (let i = 0; i < 60; i++) {
        const ng = JSON.parse((await cdp.send('Runtime.evaluate', { expression: newGameExpr, returnByValue: true })).result?.value || '{}');
        snap = await evalJson(snapExpr);
        if (snap.flightPlayable) { ngSeen = true; break; }
        if (ng.visible) { ngSeen = true; break; }
        await sleep(200);
      }
      if (!ngSeen) throw new Error('New Game screen never appeared (click ok=' + clicked + ')');
      snap = await evalJson(snapExpr);
      if (!snap.flightPlayable) {
        await click('Launch');
        await wait((s) => s.flightPlayable, 15000, 'flight');
      }
    }
    await ensureSettings();
    // Hold throttle so the plume activates, then let the energy layer render for ~1.5s.
    await evalJson(`JSON.stringify((() => { const s = window.SF.state; if (s.input) s.input.moveZ = 1; return true; })())`);
    await sleep(1500);
    await evalJson(`JSON.stringify((() => { const s = window.SF.state; if (s.input) s.input.moveZ = 0; return true; })())`);
    await sleep(300);

    // Inspect the vfx energy layer + confirm settings stuck + no errors.
    const report = await evalJson(`JSON.stringify((() => {
      const sf = window.SF;
      const vfx = sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('vfx') : null;
      const energy = vfx && vfx._energy;
      return {
        bloom: sf.state.settings.video.bloom,
        energyMaterials: sf.state.settings.video.energyMaterials,
        energyLayerActive: !!(energy && energy.plume && energy.ribbon),
        plumeInScene: !!(energy && energy.plume && energy.plume.parent),
        ribbonInScene: !!(energy && energy.ribbon && energy.ribbon.parent),
      };
    })())`);
    console.log('Energy materials report:', JSON.stringify(report, null, 2));

    const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    mkdirSync(dirname(SHOT), { recursive: true });
    writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
    console.log('Screenshot:', SHOT);

    assert.equal(report.bloom, true, 'bloom must be enabled for energy materials');
    assert.equal(report.energyMaterials, true, 'energy materials setting must be on');
    assert.equal(report.energyLayerActive, true, 'vfx energy layer must initialize when enabled: ' + JSON.stringify(report));
    assert.equal(report.plumeInScene, true, 'thruster plume energy mesh must be in the scene');
    assert.equal(report.ribbonInScene, true, 'massline ribbon energy mesh must be in the scene');
    const errors = issues.filter((i) => i.level === 'error');
    assert.equal(errors.length, 0, 'energy materials must not produce page errors: ' + JSON.stringify(errors.slice(0, 5)));
    console.log('PASS: HDR energy materials initialize and render in the live pipeline with no errors.');
  })();
} finally {
  try { browser && browser.kill && browser.kill(); } catch (_) {}
  if (serverChild) { try { serverChild.kill(); } catch (_) {} }
}
