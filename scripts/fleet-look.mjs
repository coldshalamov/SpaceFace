// Fleet look: render authored ships through the live renderer and material path.
//   node scripts/fleet-look.mjs --file=wholeships/hornet_production_v1.glb --views=chase,close,inspect
//   node scripts/fleet-look.mjs --def=ship_kestrel --views=close,inspect
//   node scripts/fleet-look.mjs --fleet            # every live wholeship, contact sheet per view
// Output: .devshots/fleet-look/<name>_<view>.png (+ report.json). Crops chase/close to the ship.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const OUT = ROOT + (args.out || '.devshots/fleet-look') + '/';
const views = String(args.views || 'chase,close,inspect').split(',');

export const LIVE_FLEET = [
  ['kestrel', { defId: 'ship_kestrel' }],
  ['wasp', { file: 'wholeships/wasp_production_v1.glb' }],
  ['pelican', { file: 'wholeships/pelican_production_v1.glb' }],
  ['mule', { file: 'wholeships/mule_production_v1.glb' }],
  ['drifter', { file: 'wholeships/drifter_production_v1.glb' }],
  ['hornet', { file: 'wholeships/hornet_production_v1.glb' }],
  ['ranger', { file: 'wholeships/ranger_production_v1.glb' }],
  ['ironback', { file: 'wholeships/ironback_production_v1.glb' }],
  ['bastion', { file: 'wholeships/bastion_production_v1.glb' }],
  ['atlas', { file: 'wholeships/atlas_production_v1.glb' }],
  ['warden', { file: 'wholeships/warden_production_v1.glb' }],
  ['colossus', { file: 'wholeships/colossus_production_v1.glb' }],
  ['leviathan', { file: 'wholeships/leviathan_production_v1.glb' }],
  ['ashline_dart', { file: 'wholeships/ashline_dart.glb' }],
  ['ashline_lode', { file: 'wholeships/ashline_lode.glb' }],
  ['ashline_rig', { file: 'wholeships/ashline_rig.glb' }],
  ['corsair_blade', { file: 'wholeships/ashline_rig_corsair_blade.glb' }],
  ['helios_lark', { file: 'wholeships/helios_lark.glb' }],
  ['helios_cradle', { file: 'wholeships/helios_cradle.glb' }],
  ['helios_span', { file: 'wholeships/helios_span.glb' }],
  ['ore_barge', { file: 'wholeships/ore_barge.glb' }],
  ['repair_tender', { file: 'wholeships/repair_tender.glb' }],
  ['salvage_cutter', { file: 'wholeships/salvage_cutter.glb' }],
  ['survey_pin', { file: 'wholeships/survey_pin.glb' }],
  ['yard_tug', { file: 'wholeships/yard_tug.glb' }],
  ['massline_liner', { file: 'wholeships/massline_express_liner_v1.glb' }],
];

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

async function startServer() {
  const port = await findFreePort(8420);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' },
  });
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(url); if (r.ok) return { url, kill: () => child.kill() }; } catch (_) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error('server unreachable');
}

function cropBox(buf, PNG, pad = 24) {
  const img = PNG.sync.read(buf);
  const { width, height, data } = img;
  // background = the corner pixel luminance; find pixels meaningfully brighter / different
  let minX = width, minY = height, maxX = -1, maxY = -1;
  const bg = [data[0], data[1], data[2]];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const d = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
    if (d > 60) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  return { width, height, minX, minY, maxX, maxY };
}

const CROPS = { chase: [480, 300], close: [1000, 620] };
const sharp = (await import('sharp')).default;

async function contactSheet(view, entries) {
  const tiles = entries.filter((e) => e.view === view && e.file);
  if (!tiles.length) return;
  const meta = await sharp(tiles[0].file).metadata();
  const tw = Math.min(meta.width, 640), th = Math.round(meta.height * tw / meta.width);
  const cols = Math.min(4, tiles.length), rows = Math.ceil(tiles.length / cols);
  const composites = [];
  for (let i = 0; i < tiles.length; i++) {
    const x = (i % cols) * tw, y = Math.floor(i / cols) * th;
    composites.push({ input: await sharp(tiles[i].file).resize(tw, th).png().toBuffer(), left: x, top: y });
    const svg = `<svg width="${tw}" height="28"><rect width="100%" height="28" fill="black" fill-opacity="0.55"/><text x="8" y="20" font-family="sans-serif" font-size="18" fill="white">${tiles[i].name}</text></svg>`;
    composites.push({ input: Buffer.from(svg), left: x, top: y });
  }
  await sharp({ create: { width: cols * tw, height: rows * th, channels: 3, background: '#000' } })
    .composite(composites).png().toFile(`${OUT}_sheet_${view}.png`);
}

const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.SF_CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const report = [];
try {
  mkdirSync(OUT, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 300)));
  if (args.illustrated === '0') await page.addInitScript(() => { globalThis.__SF_FORGE_ILLUSTRATED__ = false; });
  await page.goto(server.url + '?dev=fleetlook', { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.SF_fleetLookReady === true, null, { timeout: 240000 });
  // let env map bake
  await page.waitForTimeout(3000);

  let targets;
  if (args.fleet) targets = LIVE_FLEET.filter(([n]) => !args.only || String(args.only).split(',').includes(n));
  else if (args.file) targets = [[args.name || String(args.file).split('/').pop().replace('.glb', ''), { file: args.file }]];
  else if (args.def) targets = [[args.name || String(args.def).replace('ship_', ''), { defId: args.def }]];
  else throw new Error('pass --file, --def or --fleet');

  for (const [name, spec] of targets) {
    for (const view of views) {
      const t0 = Date.now();
      let res;
      try {
        res = await page.evaluate(async (o) => {
          const r = await window.SF_fleetLook.shoot(o);
          return r;
        }, { ...spec, view, heading: Number(args.heading || 0), yaw: Number(args.yaw || 0) });
      } catch (err) {
        report.push({ name, view, error: String(err).slice(0, 400) });
        console.log('FAIL', name, view, String(err).slice(0, 200));
        continue;
      }
      const buf = Buffer.from(res.url.split(',')[1], 'base64');
      const file = `${OUT}${name}_${view}.png`;
      const crop = CROPS[view];
      if (crop) {
        const left = Math.round((1600 - crop[0]) / 2), top = Math.round((1000 - crop[1]) / 2);
        await sharp(buf).extract({ left, top, width: crop[0], height: crop[1] }).png().toFile(file);
      } else writeFileSync(file, buf);
      report.push({ name, view, file, ok: res.ok, size: res.size, radius: res.radius, materials: view === views[0] ? res.materials : undefined, ms: Date.now() - t0 });
      console.log('shot', name, view, `${Date.now() - t0}ms`, res.ok ? '' : '(authored swap not confirmed)');
    }
  }
  if (targets.length > 1) for (const v of views) await contactSheet(v, report);
  writeFileSync(OUT + 'report.json', JSON.stringify({ report, logs: logs.slice(0, 80) }, null, 2));
} finally {
  await browser.close();
  server.kill();
}
