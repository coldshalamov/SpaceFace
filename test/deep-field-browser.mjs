// Usage: node test/deep-field-browser.mjs [output-directory]
// Component GPU validation; does not masquerade as canonical browser/Electron game acceptance.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(process.argv[2] || '.devshots/deep-field-component');
await mkdir(output, { recursive: true });
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.html': 'text/html', '.png': 'image/png', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const name = decodeURIComponent(url.pathname);
    const file = path.resolve(root, '.' + name);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (_) { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const errors = [];
try {
  browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(String(e.stack || e)));
  page.on('console', msg => {
    if (msg.type() === 'error' && /shader|WebGL|program/i.test(msg.text())) errors.push(msg.text());
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/test/fixtures/deep-field-background.html`);
  await page.waitForFunction(() => window.deepFieldReady, null, { timeout: 60000 });
  const captures = [];
  for (const id of ['sector_helios_prime', 'sector_ceres_belt', 'sector_pallas_drift', 'sector_veil_nebula']) {
    const result = await page.evaluate(id => window.deepFieldProbe.region(id), id);
    assert.equal(result.skyCarrierTriangles, 1);
    assert.equal(result.voidTextureBytes, 5460);
    assert.ok(result.stars >= 1);
    assert.ok(result.calls < 32, `unexpected background submission growth: ${result.calls}`);
    const file = `${id}.png`;
    await page.screenshot({ path: path.join(output, file) });
    captures.push({ id, file, ...result });
  }
  const motion = await page.evaluate(() => window.deepFieldProbe.motion());
  assert.deepEqual(motion.after, motion.before, 'movement must not upload instance matrices');
  for (const [width, height] of [[2560, 1080], [900, 1200]]) {
    await page.setViewportSize({ width, height });
    const result = await page.evaluate(([w, h]) => window.deepFieldProbe.resize(w, h), [width, height]);
    assert.equal(result.skyCarrierTriangles, 1);
    await page.screenshot({ path: path.join(output, `zoom330-${width}x${height}.png`) });
  }
  assert.equal(await page.evaluate(() => window.deepFieldProbe.error()), 0);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'report.json'), JSON.stringify({
    scope: 'Real Three.js background components; canonical camera; neutral fixture lighting; not full game/Electron',
    captures, motion, errors,
  }, null, 2));
  await page.evaluate(() => window.deepFieldProbe.dispose());
  console.log(`Deep-field GPU component probe passed; evidence: ${output}`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (errors.length) await writeFile(path.join(output, 'errors.json'), JSON.stringify(errors, null, 2));
}
