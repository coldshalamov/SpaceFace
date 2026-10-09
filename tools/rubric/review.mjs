/** Browser proof for RUBRIC using the production system and real Rapier through the bench page.
 * Starts its own static server (no python needed) and a headless Chromium with software WebGL.
 *   node tools/rubric/review.mjs [outDir]       RUBRIC_CHROME may point at a Chrome/Chromium binary.
 * Walks the real first encounter (scan, seek, line on the filing, brake it to rest, mark takes),
 * then the review aids (each pose, each skin). Writes numbered PNGs and browser-report.json and
 * exits non-zero on any page error or if the encounter does not complete. */
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const { chromium } = await import('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.resolve(process.argv[2] || process.env.RUBRIC_REVIEW_OUT || path.join(os.tmpdir(), 'rubric-review'));
await fs.mkdir(out, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };
const server = http.createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, rel.endsWith('/') ? `${rel}index.html` : rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await fs.readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
let browser; const errors = [], report = { scope: 'Isolated production encounter, not a full-world or packaged Electron playtest', checks: [] };
const shot = async (page, name) => { await page.evaluate(() => window.__rubricLab.render()); await page.screenshot({ path: path.join(out, name) }); report.checks.push(name); };
/** Advance the sim: `until` runs in the page and returns true to stop; `brake` flies to a hull and puts a line on it. */
const advance = (page, spec) => page.evaluate(({ seconds, until, brake }) => {
  const l = window.__rubricLab, f = l.fixture;
  const stop = until ? new Function('f', `return (${until})`) : () => false;
  for (let i = 0; i < seconds * 60 && !stop(f); i++) {
    if (brake) {
      const t = f.system._hullRef && f.system._hull();
      if (t && !window.__lined) {
        const dx = t.pos.x - f.player.pos.x, dz = t.pos.z - f.player.pos.z, d = Math.hypot(dx, dz);
        if (d > 40) f.thrust(dx, dz); else f.brake();
        if (d < 45) { f.grip(t); window.__lined = true; }
      } else f.brake();
    }
    f.step();
  }
  l.render();
  return { t: f.state.simTime, mode: f.system._mode, paintT: f.system._paintT, f41: f.state.rubric.f41, marks: f.state.rubric.marks.length };
}, spec);
try {
  browser = await chromium.launch({ executablePath: process.env.RUBRIC_CHROME || undefined, headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
  page.on('requestfailed', r => errors.push(`${r.url()}: ${r.failure()?.errorText}`));
  await page.goto(`${base}/tools/rubric/bench.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__rubricReady === true, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await shot(page, '01-encounter.png');
  // The real first encounter.
  await page.evaluate(() => { window.__rubricLab.fixture.scan(); });
  await advance(page, { seconds: 22 });
  await page.evaluate(() => window.__rubricLab.setStudy(true));
  report.encounter = [];
  report.encounter.push(await advance(page, { seconds: 1 }));
  await shot(page, '02-seek-and-wait.png');
  report.encounter.push(await advance(page, { seconds: 14, brake: true, until: 'f.system._paintT > 2.5' }));
  await shot(page, '03-marking-study.png');
  await page.evaluate(() => { window.__rubricLab.fixture.cut(); });
  report.encounter.push(await advance(page, { seconds: 10, until: 'f.state.rubric.f41' }));
  await shot(page, '04-corrected-study.png');
  report.encounterCompleted = report.encounter.at(-1).f41 === true;
  await page.evaluate(() => window.__rubricLab.setStudy(false)); await shot(page, '05-corrected-gameplay-camera.png');
  // Review aids: each pose, each skin.
  await page.evaluate(() => window.__rubricLab.setStudy(true));
  for (const mode of ['flee', 'offer', 'dark']) {
    await page.evaluate(m => { const l = window.__rubricLab; l.force(m); for (let i = 0; i < 90; i++) l.fixture.step(); l.render(); }, mode);
    await shot(page, `06-pose-${mode}.png`);
  }
  await page.evaluate(() => window.__rubricLab.force('idle'));
  for (const skin of ['primer', 'witness', 'scarred', 'memorial']) {
    await page.evaluate(s => { const l = window.__rubricLab; l.setSkin(s); for (let i = 0; i < 20; i++) l.fixture.step(); l.render(); }, skin);
    await shot(page, `07-skin-${skin}.png`);
  }
  report.stats = await page.evaluate(() => window.__rubricLab.stats());
  report.errors = errors; if (errors.length) throw Error(errors.join('\n'));
  if (!report.encounterCompleted) throw Error('The first encounter did not complete in the browser');
  report.passed = true;
} catch (e) { report.passed = false; report.error = String(e.stack || e); process.exitCode = 1; }
finally { await fs.writeFile(path.join(out, 'browser-report.json'), JSON.stringify(report, null, 2)); await browser?.close(); server.close(); console.log(JSON.stringify(report, null, 2)); console.log(`screenshots: ${out}`); }
