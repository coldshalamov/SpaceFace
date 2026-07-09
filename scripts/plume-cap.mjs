// Plume shader look-dev capture. Boots the dev server, drives headless Chrome to _plumelab.html
// for a grid of {profile, drive, boost, angle} states, and screenshots each to .devshots/plume/.
// Usage: node scripts/plume-cap.mjs [spec]  where spec defaults to a small representative grid.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = process.cwd();
const W = 920, H = 680;
const OUT = '.devshots/plume';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function findFreePort(start) {
  const { createServer } = await import('node:net');
  for (let p = start; p < start + 200; p++) {
    const ok = await new Promise((res) => { const s = createServer(); s.once('error', () => res(false)); s.listen(p, '127.0.0.1', () => s.close(() => res(true))); });
    if (ok) return p;
  }
  throw new Error('no free port');
}
async function waitReachable(url) {
  for (let i = 0; i < 120; i++) { try { const r = await fetch(url); if (r.ok || r.status === 404) return; } catch (_) {} await sleep(150); }
  throw new Error('server never reachable');
}

// capture grid
const GRID = [
  { name: 'ion_idle',       prof: 'engine_ion_small',   drive: 0.15, boost: 0 },
  { name: 'ion_cruise',     prof: 'engine_ion_small',   drive: 0.6,  boost: 0 },
  { name: 'ion_boost',      prof: 'engine_ion_small',   drive: 1.0,  boost: 1 },
  { name: 'vector_boost',   prof: 'engine_vector',      drive: 1.0,  boost: 1 },
  { name: 'plasma_boost',   prof: 'engine_plasma_ring', drive: 1.0,  boost: 1 },
  { name: 'resonator_cruise', prof: 'engine_resonator', drive: 0.7,  boost: 0 },
  { name: 'industrial_cruise', prof: 'engine_industrial', drive: 0.7, boost: 0 },
];

let serverChild, browser;
try {
  const port = await findFreePort(8231);
  serverChild = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  serverChild.stdout.on('data', () => {}); serverChild.stderr.on('data', () => {});
  await waitReachable(`http://127.0.0.1:${port}/`);

  const chrome = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean).find((c) => { try { return existsSync(c); } catch { return false; } });
  if (!chrome) throw new Error('chrome not found');

  const debugPort = await findFreePort(9520);
  browser = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    `--window-size=${W},${H}`, `--remote-debugging-port=${debugPort}`, 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  browser.stdout.on('data', () => {}); browser.stderr.on('data', () => {});

  let wsUrl = null;
  for (let i = 0; i < 60; i++) {
    try { const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json(); const page = tabs.find((t) => t.type === 'page'); if (page) { wsUrl = page.webSocketDebuggerUrl; break; } } catch (_) {}
    await sleep(200);
  }
  if (!wsUrl) throw new Error('no CDP target');
  const ws = new WebSocket(wsUrl);
  await new Promise((r, e) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', e, { once: true }); });
  let id = 0; const pending = new Map(); const errors = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params?.exceptionDetails?.text || 'exception');
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') errors.push((msg.params.args || []).map((a) => a.value || a.description || '').join(' '));
    if (msg.id && pending.has(msg.id)) { const { resolve } = pending.get(msg.id); pending.delete(msg.id); resolve(msg.result || {}); }
  });
  const cdp = (method, params = {}) => new Promise((resolve) => { id++; pending.set(id, { resolve }); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Log.enable');

  mkdirSync(OUT, { recursive: true });
  for (const g of GRID) {
    const extra = process.env.PLUME_Q || 'r=13&exp=0.62&bloom=0.35';
    const url = `http://127.0.0.1:${port}/_plumelab.html?prof=${g.prof}&drive=${g.drive}&boost=${g.boost}&az=0.85&el=0.32&${extra}`;
    await cdp('Page.navigate', { url });
    await sleep(1600); // load modules + warm the animation
    const shot = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: 900, height: 640, scale: 1 } });
    if (shot.data) { writeFileSync(`${OUT}/${g.name}.jpg`, Buffer.from(shot.data, 'base64')); console.log('shot', g.name); }
    else console.log('NO DATA', g.name);
  }
  if (errors.length) console.log('PAGE ERRORS:', JSON.stringify([...new Set(errors)].slice(0, 8), null, 2));
  else console.log('no page errors');
} finally {
  try { browser && browser.kill(); } catch (_) {}
  try { serverChild && serverChild.kill(); } catch (_) {}
}
