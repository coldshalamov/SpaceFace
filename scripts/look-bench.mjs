// Look bench: judge the Look (src/data/lookMoods.js) by the live renderer's picture.
//
// Boots the fleet-look fixture once, then shoots a grid: one row per body, one column per
// variation. A variation is a mood, a sector, and/or a patch over single Look values, so a
// number can be compared against its neighbours in one sheet instead of from memory.
//
//   node scripts/look-bench.mjs                              # every mood x the reference hull set
//   node scripts/look-bench.mjs --moods=arcade,neon_noir --bodies=kestrel,hornet --view=inspect
//   node scripts/look-bench.mjs --vary=scratch/coat.json     # [{ "name": "coat 0.6", "mood": "arcade",
//                                                            #    "tune": { "surface": { "coat": 0.6 } },
//                                                            #    "post": { "bloomStrength": 0.8 },
//                                                            #    "lights": { "key": 3.0 }, "sector": "sector_sker_haven" }]
//   node scripts/look-bench.mjs --cost ...                   # also print GPU ms/frame per cell
//   SF_GL=swiftshader node scripts/look-bench.mjs            # software rasterizer (no GPU host)
//
// Output: .devshots/look-bench/<name>.png  (+ per-cell PNGs with --cells). Runs on the real GPU
// by default: a full mood sheet is about a minute.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { LOOK_MOODS, LOOK_MOOD_BY_PROFILE } from '../src/data/lookMoods.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const OUT = ROOT + (args.out || '.devshots/look-bench') + '/';
const NAME = String(args.name || 'sheet');
const VIEW = String(args.view || 'close');
const FLEET = JSON.parse(readFileSync(new URL('../tools/blender/forge/fleet.json', import.meta.url), 'utf8')).ships;
// Light paint, dark paint, saturated paint, bare metal, a station-scale body: the materials a
// look change has to hold across.
const DEFAULT_BODIES = 'kestrel,hornet,helios_span,ashline_dart,warden';
const bodies = String(args.bodies || DEFAULT_BODIES).split(',').map((s) => s.trim()).filter(Boolean);

// A sector that wears each mood, so a mood column also gets that sector's rig intensities and post.
const SECTOR_BY_PROFILE = {
  helios_core: 'sector_helios_prime', tethys: 'sector_tethys_junction', ceres_belt: 'sector_ceres_belt',
  vesta_forge: 'sector_vesta_forge', fringe: 'sector_frontier_east_ridge', pallas_drift: 'sector_pallas_drift',
  sker_haven: 'sector_sker_haven', anomaly: 'sector_anomaly_well',
};
function sectorForMood(moodId) {
  for (const [profile, mood] of Object.entries(LOOK_MOOD_BY_PROFILE)) {
    if (mood === moodId && SECTOR_BY_PROFILE[profile]) return SECTOR_BY_PROFILE[profile];
  }
  return 'sector_helios_prime';
}

let variations;
if (args.vary) variations = JSON.parse(readFileSync(String(args.vary), 'utf8'));
else {
  const moods = args.moods ? String(args.moods).split(',') : Object.keys(LOOK_MOODS);
  variations = moods.map((mood) => ({ name: mood, mood, sector: sectorForMood(mood) }));
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
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

const port = await findFreePort(9120 + Math.floor(Math.random() * 400));
const url = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' },
});
for (let i = 0; i < 120; i++) {
  try { const r = await fetch(url); if (r.ok) break; } catch (_) {}
  await new Promise((r) => setTimeout(r, 250));
}

const sharp = (await import('sharp')).default;
const { chromium } = await loadPlaywright();
const software = process.env.SF_GL === 'swiftshader';
const browser = await chromium.launch({
  headless: true,
  args: software
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling']
    : ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-background-timer-throttling'],
});
const CROP = { chase: [480, 300], close: [1000, 620], inspect: [960, 600] }[VIEW] || [1600, 1000];
const cells = [];
try {
  mkdirSync(OUT, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 300)));
  await page.goto(url + '?dev=fleetlook', { waitUntil: 'commit', timeout: 180000 });
  await page.waitForFunction(() => window.SF_fleetLookReady === true, null, { timeout: 600000 });
  await page.waitForTimeout(3000);

  for (const variation of variations) {
    for (const body of bodies) {
      const entry = FLEET[body];
      if (!entry) { console.log('unknown body', body); continue; }
      const dir = entry.layout === 'place' ? (entry.parts_dir || 'places') : 'wholeships';
      const spec = { file: `${dir}/${entry.file}.glb`, view: VIEW, heading: Number(args.heading || 0), yaw: Number(args.yaw || 0) };
      // Sector first (its isolate() re-applies rig + mood on the next shot), one settle frame, then
      // the mood and single-value patches over the settled state, then the real frame.
      await page.evaluate((id) => window.SF_fleetLook.setSector(id), variation.sector || 'sector_helios_prime');
      await page.evaluate((o) => window.SF_fleetLook.shoot(o), spec);
      await page.evaluate((v) => {
        // Always snap: it rewrites every Look value, clearing the previous column's patch.
        window.SF_fleetLook.setMood(v.mood || window.SF_fleetLook.mood());
        if (v.tune) window.SF_fleetLook.tune(v.tune);
        if (v.post) window.SF_fleetLook.post(v.post);
        if (v.lights) window.SF_fleetLook.lights(v.lights);
      }, variation);
      const res = await page.evaluate((o) => window.SF_fleetLook.shoot(o), spec);
      if (args.cost) {
        const c = await page.evaluate(() => window.SF_fleetLook.cost({ frames: 60 }));
        console.log(`cost ${variation.name} | ${body}: median ${c.medianMs} ms  p90 ${c.p90Ms} ms  (${c.calls} draws)`);
      }
      const left = Math.round((1600 - CROP[0]) / 2), top = Math.round((1000 - CROP[1]) / 2);
      const png = await sharp(Buffer.from(res.url.split(',')[1], 'base64'))
        .extract({ left, top, width: CROP[0], height: CROP[1] }).png().toBuffer();
      cells.push({ body, variation: variation.name, png });
      if (args.cells) writeFileSync(`${OUT}${NAME}_${variation.name.replace(/[^\w.-]+/g, '_')}_${body}.png`, png);
      console.log('shot', variation.name, body);
    }
  }
  if (logs.length) console.log('page errors:\n' + logs.slice(0, 12).join('\n'));
} finally {
  await browser.close();
  server.kill();
}

// Grid: rows = bodies, columns = variations. Cell width keeps a 5-column sheet readable.
const cols = variations.length;
const tw = Math.round(Math.min(CROP[0], Math.max(420, 2600 / cols)));
const th = Math.round(CROP[1] * tw / CROP[0]);
const composites = [];
for (const cell of cells) {
  const x = variations.findIndex((v) => v.name === cell.variation) * tw;
  const y = bodies.indexOf(cell.body) * th;
  composites.push({ input: await sharp(cell.png).resize(tw, th).png().toBuffer(), left: x, top: y });
}
for (let c = 0; c < cols; c++) {
  const label = String(variations[c].name).replace(/[<&>]/g, '');
  const svg = `<svg width="${tw}" height="26"><rect width="100%" height="26" fill="black" fill-opacity="0.6"/><text x="8" y="19" font-family="sans-serif" font-size="17" fill="white">${label}</text></svg>`;
  composites.push({ input: Buffer.from(svg), left: c * tw, top: 0 });
}
const file = `${OUT}${NAME}.png`;
await sharp({ create: { width: cols * tw, height: bodies.length * th, channels: 3, background: '#000' } })
  .composite(composites).png().toFile(file);
console.log('sheet', file);
