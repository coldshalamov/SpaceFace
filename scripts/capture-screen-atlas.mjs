// scripts/capture-screen-atlas.mjs — one headless boot, every frontend surface captured.
//
// The visual-polish pipeline's eyes: boots the REAL game once, then walks menus, charts, docked
// station tabs, prompts, and flight instruments, screenshotting each state into
// .devshots/atlas/<name>.png with a manifest.json recording ok/miss per frame.
//
//   node scripts/capture-screen-atlas.mjs [--out subdir] [--width 1920] [--height 1080]
//
// A screen that fails to open records a miss and keeps walking — the atlas must complete so a
// single stuck surface cannot hide the other forty.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = process.argv.slice(2);
const argOf = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const WIDTH = Number(argOf('--width', 1920));
const HEIGHT = Number(argOf('--height', 1080));
const OUTDIR = argOf('--out', 'atlas');
const OUT = fileURLToPath(new URL(`../.devshots/${OUTDIR}/`, import.meta.url));
mkdirSync(OUT, { recursive: true });
const manifest = { frames: {}, failures: [] };
const shot = async (page, name) => {
  try {
    await page.screenshot({ path: `${OUT}${name}.png` });
    manifest.frames[name] = 'ok';
    console.log('shot', name);
  } catch (e) {
    manifest.frames[name] = 'error: ' + String(e.message || e).slice(0, 120);
    manifest.failures.push(name);
  }
};

// --gallery <dir>: (re)build the index.html contact sheet for a captured folder and exit.
const galleryDirIdx = argv.indexOf('--gallery');
if (galleryDirIdx >= 0 && argv[galleryDirIdx + 1]) {
  const { readdirSync } = await import('node:fs');
  const dir = fileURLToPath(new URL(`../.devshots/${argv[galleryDirIdx + 1]}/`, import.meta.url));
  writeGallery(dir, readdirSync(dir).filter((f) => f.endsWith('.png')).sort());
  console.log('gallery written ->', dir);
  process.exit(0);
}

function writeGallery(dir, names = null) {
  const NL = String.fromCharCode(10);
  const fs = names ? null : readdirSync(dir);
  const files = fs ? fs.filter((f) => f.endsWith('.png') && !f.startsWith('_')).sort() : names;
  const cards = files.map((f) =>
    `<a class="card" href="${f}"><img loading="lazy" src="${f}"><figcaption>${f.replace('.png', '')}</figcaption></a>`).join(NL);
  writeFileSync(`${dir}index.html`, `<!doctype html><meta charset="utf-8">
<title>UI atlas</title>
<style>
  body{margin:0;background:#0a0c10;color:#dfe3e8;font:14px "IBM Plex Sans",Segoe UI,sans-serif}
  h1{font-size:16px;padding:14px 18px;border-bottom:1px solid #2c343f}
  main{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:14px;padding:16px}
  .card{display:block;color:inherit;text-decoration:none;background:#151a21;border:1px solid #2c343f;border-radius:6px;overflow:hidden}
  .card img{width:100%;display:block}
  figcaption{padding:7px 10px;color:#9aa4b0;font-family:"IBM Plex Mono",Consolas,monospace;font-size:12px}
</style>
<h1>SpaceFace UI atlas — click a frame to open it full size</h1>
<main>${cards}</main>`);
  console.log('gallery ->', `${dir}index.html`);
}

async function findFreePort(start) {
  for (let port = start; port < start + 120; port++) {
    const free = await new Promise((resolve) => {
      const s = createNetServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error('no free port');
}
const port = await findFreePort(8520);
const url = `http://127.0.0.1:${port}/`;
const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: 'ignore', windowsHide: true });
let up = false;
for (let i = 0; i < 160 && !up; i++) {
  try { if ((await fetch(url)).ok) up = true; } catch (_) {}
  if (!up) await new Promise((r) => setTimeout(r, 250));
}
if (!up) { console.error('server never became reachable'); process.exit(1); }
await new Promise((r) => setTimeout(r, 800));

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
page.on('pageerror', (e) => console.log('PAGE ERROR:', String(e.message || e).slice(0, 160)));

for (let attempt = 0; attempt < 3; attempt++) {
  try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); break; }
  catch (e) { if (attempt === 2) throw e; await new Promise((r) => setTimeout(r, 1500)); }
}
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 180000 });
await page.waitForFunction(() => {
  const el = document.querySelector('[data-screen="mainMenu"]');
  return el && getComputedStyle(el).display !== 'none';
}, null, { timeout: 180000 });
await page.waitForTimeout(1200);
await shot(page, 'menu-main');

async function clickButton(label) {
  return page.evaluate((wanted) => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const all = [...document.querySelectorAll('button')];
    const b = all.find((x) => norm(x.textContent) === norm(wanted)) || all.find((x) => norm(x.textContent).includes(norm(wanted)));
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }, label);
}

// New game → launch (retry loop: the footer's launch button enables late).
await clickButton('New Game');
await page.waitForSelector('[data-screen="newGame"]', { timeout: 60000 });
await page.waitForTimeout(900);
await shot(page, 'menu-new-game');
let launched = false;
for (let i = 0; i < 240 && !launched; i += 1) {
  launched = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[data-screen="newGame"] .sf-ng-footer button')];
    const launch = buttons[buttons.length - 1];
    if (!launch || launch.disabled) return false;
    launch.click();
    return true;
  });
  if (!launched) await page.waitForTimeout(250);
}
if (!launched) throw new Error('launch button missing or disabled');
await page.waitForFunction(() => {
  const st = window.SF && window.SF.state;
  const p = st && st.entities && st.entities.get(st.playerId);
  return !!(st && st.mode === 'flight' && p && p.alive);
}, null, { timeout: 240000 });
await page.waitForFunction(() => !document.body.classList.contains('ui-live-screen'), null, { timeout: 40000 }).catch(() => {});
await page.waitForTimeout(2500);
await shot(page, 'flight-default');

async function closeAll() {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  await page.evaluate(() => { try { window.SF.bus.emit('ui:closeAll', {}); } catch (_) {} });
  await page.waitForTimeout(250);
}
const screenVisible = (id) => page.evaluate((sid) => {
  const el = document.querySelector(`[data-screen="${sid}"]`);
  return !!(el && el.hidden !== true && getComputedStyle(el).display !== 'none');
}, id);

// --- Flight instruments -------------------------------------------------------
const staged = await page.evaluate(() => {
  const st = window.SF.state;
  const p = st.entities.get(st.playerId);
  let best = null, bestD = Infinity;
  for (const e of st.entities.values()) {
    if (!e || !e.alive || e.id === p.id || (e.type !== 'ship' && e.type !== 'drone')) continue;
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
    if (d < bestD) { bestD = d; best = e; }
  }
  if (!best) return null;
  st.player.targetId = best.id;
  return best.id;
});
// Keep the player parked beside the target so ranged states stay stable during capture.
await page.evaluate((tid) => {
  clearInterval(window.__sfAtlasHold);
  window.__sfAtlasHold = setInterval(() => {
    const st = window.SF && window.SF.state;
    if (!st) return;
    const p = st.entities.get(st.playerId);
    const t = st.entities.get(tid);
    if (!p || !t || !t.alive) return;
    p.pos.x = t.pos.x + 70;
    p.pos.z = t.pos.z + 14;
  }, 60);
}, staged);
await page.waitForTimeout(1200);

// Hail deck (tactical drawer) — deterministic via bus.
await page.evaluate((tid) => { try { window.SF.bus.emit('contactHail:deck:open', { targetId: tid }); } catch (_) {} }, staged);
await page.waitForTimeout(900);
await shot(page, 'flight-haildeck');
await closeAll();

// Comms fan — hold Alt with a hailable target staged.
let fanOpened = false;
for (const cand of [staged]) {
  await page.keyboard.down('Alt');
  await page.waitForTimeout(1400);
  fanOpened = await page.evaluate(() => !!(window.SF.state.ui && window.SF.state.ui.commsRadialOpen));
  if (fanOpened) break;
  await page.keyboard.up('Alt');
  await page.waitForTimeout(300);
}
await shot(page, fanOpened ? 'flight-commsfan' : 'flight-commsfan-miss');
await page.keyboard.up('Alt').catch(() => {});
await page.waitForTimeout(400);

// Band readout (Shift+O) and the comms backlog (L).
await page.keyboard.press('Shift+O');
await page.waitForTimeout(500);
await shot(page, 'flight-band');
await page.keyboard.press('KeyO');
await page.waitForTimeout(300);
await page.keyboard.press('KeyL');
await page.waitForTimeout(600);
await shot(page, 'flight-commslog');
await page.keyboard.press('KeyL');
await page.waitForTimeout(300);

// --- Full-screen instruments --------------------------------------------------
const INSTRUMENTS = [
  ['ship', 'F2', 'ship'],
  ['footprint', 'F3', 'footprint'],
  ['range', 'F4', 'range'],
  ['localmap', 'KeyM', 'localmap'],
  ['starmap', 'KeyN', 'starmap'],
  ['missionLog', 'KeyJ', 'missionLog'],
  ['codex', 'KeyK', 'codex'],
  ['techTree', 'KeyT', 'techTree'],
  ['help', 'F1', 'help'],
];
for (const [id, key, name] of INSTRUMENTS) {
  try {
    await page.keyboard.press(key);
    await page.waitForTimeout(1600);
    const ok = await screenVisible(id);
    await shot(page, (ok ? '' : 'miss-') + name);
    await closeAll();
  } catch (e) {
    manifest.failures.push(name + ': ' + String(e.message || e).slice(0, 100));
  }
}
// Drill (asteroid works) needs a claimable rock context; capture best-effort.
try {
  await page.keyboard.press('KeyB');
  await page.waitForTimeout(1600);
  const ok = await screenVisible('drill');
  await shot(page, (ok ? '' : 'miss-') + 'drill');
  await closeAll();
} catch (e) { manifest.failures.push('drill: ' + String(e.message || e).slice(0, 100)); }

// Pause menu.
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
await shot(page, 'menu-pause');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// --- Docked station + every destination ---------------------------------------
const docked = await page.evaluate(() => {
  const st = window.SF.state;
  const station = (st.entityList || []).find((e) => e && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
  if (!station) return null;
  try { window.SF.bus.emit('dock:docked', { stationId: station.data.stationId }); } catch (_) { return null; }
  return station.data.stationId;
});
if (docked) {
  await page.waitForSelector('[data-screen="station"]', { timeout: 20000 });
  await page.waitForTimeout(800);
  await shot(page, 'station-berth');
  const TABS = ['market', 'shipworks', 'industry', 'contracts', 'missions', 'factions', 'bar', 'ledger'];
  for (const tab of TABS) {
    const ok = await page.evaluate((id) => {
      const root = document.querySelector('[data-screen="station"]');
      if (!root) return false;
      const dest = root.querySelector(`[data-nav="${id}"]`) || root.querySelector(`[data-tab="${id}"]`);
      if (dest) { dest.click(); return true; }
      const re = new RegExp('^\\s*' + id + '\\b', 'i');
      const t = [...root.querySelectorAll('[role="tab"], button, [data-tab], [data-nav]')]
        .find((el) => re.test((el.textContent || '').trim()));
      if (t) { t.click(); return true; }
      return false;
    }, tab);
    await page.waitForTimeout(1400);
    await shot(page, (ok ? 'station-' : 'miss-station-') + tab);
    if (ok && tab === 'shipworks') {
      // Module chooser open state — the deepest station surface.
      try {
        await page.waitForSelector('[data-spatial-slot]', { timeout: 8000 });
        await page.locator('[data-spatial-slot]').first().focus();
        await page.keyboard.press('Enter');
        await page.waitForSelector('.sx-sw__chooser.is-open', { timeout: 5000 });
        await page.waitForTimeout(400);
        await shot(page, 'station-shipworks-chooser');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } catch (_) { manifest.failures.push('station-shipworks-chooser'); }
    }
  }
  // Undock via the fascia launch control.
  await page.evaluate(() => {
    const root = document.querySelector('[data-screen="station"]');
    const btn = root && [...root.querySelectorAll('button')].find((b) => /undock|launch/i.test(b.textContent || ''));
    if (btn) btn.click();
  });
  await page.waitForTimeout(1500);
} else {
  manifest.failures.push('dock: no station found');
}

// Save/load via pause (reachable both docked and in flight).
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
await clickButton('Save');
await page.waitForTimeout(900);
await shot(page, 'menu-saveload');
await page.keyboard.press('Escape');

clearInterval(await page.evaluate(() => { clearInterval(window.__sfAtlasHold); return 0; }).catch(() => 0));
writeFileSync(`${OUT}manifest.json`, JSON.stringify(manifest, null, 2));
writeGallery(OUT);
await browser.close();
child.kill();
console.log('atlas complete:', Object.keys(manifest.frames).length, 'frames,', manifest.failures.length, 'failures ->', OUT);
