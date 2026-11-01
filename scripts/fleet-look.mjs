// Fleet look: render authored ships through the live renderer and material path.
//   node scripts/fleet-look.mjs --file=wholeships/hornet_production_v1.glb --views=chase,close,inspect
//   node scripts/fleet-look.mjs --def=ship_kestrel --views=close,inspect
//   node scripts/fleet-look.mjs --fleet            # every live wholeship, contact sheet per view
//   node scripts/fleet-look.mjs --fleet --sector=sector_vesta_forge   # under that sector's light rig
// Output: .devshots/fleet-look/<name>_<view>.png (+ report.json). Crops chase/close to the ship.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const OUT = ROOT + (args.out || '.devshots/fleet-look') + '/';
const views = String(args.views || 'chase,close,inspect').split(',');

// Every forge body (tools/blender/forge/fleet.json), from its live release file.
const FORGE_FLEET = JSON.parse((await import('node:fs')).readFileSync(new URL('../tools/blender/forge/fleet.json', import.meta.url), 'utf8')).ships;
// Places release under their own parts directory (publish.mjs uses the same rule).
export const forgeReleaseFile = (entry) => `${entry.layout === 'place' ? (entry.parts_dir || 'places') : 'wholeships'}/${entry.file}.glb`;
export const LIVE_FLEET = Object.entries(FORGE_FLEET).map(([name, entry]) => [name, { file: forgeReleaseFile(entry) }]);

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
  const port = await findFreePort(8420 + Math.floor(Math.random() * 600));
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
  const cols = Math.min(args.specialists ? 3 : 4, tiles.length), rows = Math.ceil(tiles.length / cols);
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
  // SF_GL=d3d11 shoots on the machine's real GPU (seconds per frame, the shipping driver path);
  // the default stays the software rasterizer so captures work on a GPU-less host.
  args: process.env.SF_GL === 'd3d11'
    ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-background-timer-throttling']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling'],
});
const report = [];
const logs = [];
let page;
try {
  mkdirSync(OUT, { recursive: true });
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  if (args.assetlog) page.on('response', response => {
    if (response.status() === 404) appendFileSync(String(args.assetlog), new URL(response.url()).pathname + '\n');
  });
  page.on('console', async (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const values = await Promise.all(m.args().map(arg => arg.jsonValue().catch(() => null)));
    const detail = values.length ? JSON.stringify(values) : m.text();
    logs.push(detail.slice(0, 3000));
    if (args.consolelog) appendFileSync(String(args.consolelog), detail + '\n');
  });
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 300)));
  if (args.illustrated === '0') await page.addInitScript(() => { globalThis.__SF_FORGE_ILLUSTRATED__ = false; });
  if (args.init) await page.addInitScript(String(args.init));
  // 'commit' not 'load': the game's asset preload can hold the load event for minutes under
  // SwiftShader; scripts run fine once navigation commits (same workaround as flight-look).
  await page.goto(server.url + '?dev=fleetlook', { waitUntil: 'commit', timeout: 180000 });
  await page.waitForFunction(() => window.SF_fleetLookReady === true, null, { timeout: Number(args.timeout || 600) * 1000 });
  // --sector=<id> applies that sector's authored light rig (sectorVisualProfiles) to the live
  // lights so bodies can be judged under e.g. Vesta's hot key or Pallas's cold one.
  if (args.sector) {
    const ok = await page.evaluate((id) => window.SF_fleetLook.setSector(id), String(args.sector));
    console.log('sector', args.sector, ok ? 'rig applied' : 'UNKNOWN SECTOR — Helios rig kept');
  }
  // let env map bake
  await page.waitForTimeout(3000);
  // Look bench switches. They apply on the first shot's isolate(), so prime one frame first.
  //   --mood=<id>            snap to a mood from src/data/lookMoods.js
  //   --tune='{"surface":{"coat":1.4},"post":{"ink":0}}'   overwrite single Look values
  //   --post='{"bloomStrength":0.8}'  --lights='{"key":3.0}'   raw composite / rig intensities
  const lookSwitches = async () => {
    if (args.mood) await page.evaluate((id) => window.SF_fleetLook.setMood(id), String(args.mood));
    if (args.tune) await page.evaluate((p) => window.SF_fleetLook.tune(p), JSON.parse(String(args.tune)));
    if (args.post) await page.evaluate((p) => window.SF_fleetLook.post(p), JSON.parse(String(args.post)));
    if (args.lights) await page.evaluate((p) => window.SF_fleetLook.lights(p), JSON.parse(String(args.lights)));
  };

  let targets;
  if (args.specialists) targets = ['warden', 'jackal', 'anchor'].flatMap(kind =>
    String(args.phases || 'windup,active,recovery').split(',').map(phase => [kind + '_' + phase, {
      defId: kind === 'jackal' ? 'ship_drifter' : 'ship_bastion', specialist: kind + ':' + phase,
      ...(args.overview ? { radius: { warden: 80, jackal: 130, anchor: 260 }[kind] } : {}),
    }]));
  else if (args.fleet) targets = LIVE_FLEET.filter(([n]) => !args.only || String(args.only).split(',').includes(n));
  else if (args.files) targets = String(args.files).split(',').map((f) => [f.split('/').pop().replace('.glb', ''), { file: f }]);
  else if (args.file) targets = [[args.name || String(args.file).split('/').pop().replace('.glb', ''), { file: args.file }]];
  else if (args.def) targets = [[args.name || String(args.def).replace('ship_', ''), { defId: args.def }]];
  else throw new Error('pass --file, --def or --fleet');
  if (args.specialists && args['with-overviews']) targets.push(...['warden', 'jackal', 'anchor'].map(kind =>
    [kind + '_active_overview', { defId: kind === 'jackal' ? 'ship_drifter' : 'ship_bastion',
      specialist: kind + ':active', views: ['inspect'], radius: { warden: 80, jackal: 130, anchor: 260 }[kind] }]));
  if (args.specialists && args.only) targets = targets.filter(([name]) => String(args.only).split(',').includes(name));
  if (!targets.length) throw new Error('no fleet-look targets selected');

  for (const [name, spec] of targets) {
    for (const view of spec.views || views) {
      const t0 = Date.now();
      let res;
      try {
        for (let attempt = 0; attempt < 4; attempt++) {
          const shotSpec = { ...spec, view, heading: Number(args.heading || 0), yaw: Number(args.yaw || 0), ...(args.ab ? { ab: JSON.parse(String(args.ab)) } : {}),
            // --appearance='{"decalId":"concord"}' poses the hull with that paint record;
            // --factionId=<id> poses it as that faction's NPC (palette + default stencils).
            ...(args.appearance ? { appearance: JSON.parse(String(args.appearance)) } : {}),
            ...(args.factionId ? { factionId: String(args.factionId) } : {}),
            ...(args.specialist ? { specialist: String(args.specialist) } : {}),
            ...(args.radius ? { radius: Number(args.radius) } : {}) };
          if (args.mood || args.tune || args.post || args.lights) {
            // isolate() re-applies the sector rig and mood on the first shot; shoot once to settle
            // it, apply the switches over the settled state, then take the real frame.
            if (!lookSwitches.primed) {
              await page.evaluate((o) => window.SF_fleetLook.shoot(o), shotSpec);
              lookSwitches.primed = true;
            }
            await lookSwitches();
          }
          res = await page.evaluate(async (o) => {
            const r = await window.SF_fleetLook.shoot(o);
            return r;
          }, shotSpec);
          // Under a busy CPU the first frames can present before shaders finish linking: a blank
          // frame has almost no bright pixels. Re-shoot instead of reporting an empty ship.
          // Measure the region the file actually keeps — chase/close crop the center, and a
          // starfield passes any full-frame threshold, which is how the first cold body of a
          // fleet run once shipped an empty chase frame (hornet, 2026-10-24: zero warm pixels).
          let frame = sharp(Buffer.from(res.url.split(',')[1], 'base64'));
          if (CROPS[view]) {
            const [cw, ch] = CROPS[view];
            frame = frame.extract({ left: Math.round((1600 - cw) / 2), top: Math.round((1000 - ch) / 2), width: cw, height: ch });
          }
          const stats = await frame.stats();
          const lit = stats.channels.slice(0, 3).reduce((a, c) => a + c.max, 0);
          const spread = stats.channels.slice(0, 3).reduce((a, c) => a + c.stdev, 0);
          // A specialist's bright tell can arrive before its cold authored hull on SwiftShader.
          // Evidence must contain the centered hull as well as the link/wake/ring. Scale
          // the region with camera distance so a full 220 WU field still tests its small hull.
          let centeredHull = true;
          if (shotSpec.specialist && ['close', 'inspect'].includes(view)) {
            const hullScale = view === 'close' ? 1 : 58 / (res.radius * 2.6);
            const width = Math.max(8, Math.round(300 * hullScale));
            const height = Math.max(8, Math.round(200 * hullScale));
            const region = { left: Math.round((1600 - width) / 2), top: Math.round((1000 - height) / 2), width, height };
            const { data, info } = await sharp(Buffer.from(res.url.split(',')[1], 'base64'))
              .extract(region)
              .removeAlpha().raw().toBuffer({ resolveWithObject: true });
            let hullPixels = 0;
            for (let i = 0; i < data.length; i += info.channels) {
              if (data[i] + data[i + 1] + data[i + 2] > 90) hullPixels++;
            }
            const centerHullCoverage = hullPixels / (info.width * info.height);
            res.capturePixelChecks = { region, centerHullCoverage, minimumCenterHullCoverage: .2 };
            centeredHull = centerHullCoverage >= .2;
          }
          if (lit > 300 && spread > 6 && centeredHull) break;
          if (attempt === 3) {
            writeFileSync(`${OUT}${name}_${view}_rejected.json`, JSON.stringify({ ...res, url: undefined }, null, 2));
            throw new Error(`blank or hull-incomplete capture after strict admission: ${name}/${view}`);
          }
          console.log('  blank frame, re-shooting', name, view);
          await page.waitForTimeout(4000);
        }
      } catch (err) {
        report.push({ name, view, error: String(err).slice(0, 400) });
        console.log('FAIL', name, view, String(err).slice(0, 200));
        if (args.specialists) throw err;
        continue;
      }
      const buf = Buffer.from(res.url.split(',')[1], 'base64');
      const file = `${OUT}${name}_${view}.png`;
      const crop = CROPS[view];
      if (crop) {
        const left = Math.round((1600 - crop[0]) / 2), top = Math.round((1000 - crop[1]) / 2);
        await sharp(buf).extract({ left, top, width: crop[0], height: crop[1] }).png().toFile(file);
      } else writeFileSync(file, buf);
      report.push({ name, view, file, ok: res.ok, size: res.size, radius: res.radius,
        authoredAssetState: res.authoredAssetState, specialist: res.specialist,
        captureDiagnostics: res.captureDiagnostics,
        capturePixelChecks: res.capturePixelChecks,
        materials: view === views[0] ? res.materials : undefined, ms: Date.now() - t0 });
      console.log('shot', name, view, `${Date.now() - t0}ms`, res.ok ? '' : '(authored swap not confirmed)');
    }
  }
  if (targets.length > 1) for (const v of new Set(report.map(shot => shot.view))) await contactSheet(v, report);
  writeFileSync(OUT + 'report.json', JSON.stringify({ report, logs: logs.slice(0, 80) }, null, 2));
  if (report.some(shot => shot.error)) process.exitCode = 1;
} catch (error) {
  writeFileSync(OUT + 'failure.json', JSON.stringify({ error: String(error), report, logs }, null, 2));
  throw error;
} finally {
  await browser.close();
  server.kill();
}
