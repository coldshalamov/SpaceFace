// DIAG (worktree-only): flight-root template key churn across public F5/F9 cycles.
// The release-soak census showed flightRootTemplates pinned at its 32-entry cap while
// unique keys kept growing — identical restored ships must hit the cache or every
// F9 mints ~8 undisposed template clone geometries. This script names the key field
// that differs between restores of the same world.
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { flightReadyInPage } from './lib/alphaLiveBaselineRoute.mjs';

const CYCLES = Math.max(1, Number(process.env.DIAG_CYCLES || 3));

const server = await acquireVisualProbeServer({ root: process.cwd() });
if (!server.ownsServer) throw new Error('expected an owned in-process server');
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (msg) => {
  const text = msg.text();
  if (msg.type() === 'error' || /\[template/i.test(text)) console.log(`[page:${msg.type()}] ${text.slice(0, 300)}`);
});
try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 60_000 });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 10_000 });
  }
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 60_000 });
  await page.waitForFunction(flightReadyInPage, null, { timeout: 300_000 });
  console.log('flight ready');

  const sample = () => page.evaluate(async () => {
    const plib = await import('/src/render/partsLibrary.js');
    const diag = plib.getFlightRootTemplateCacheDiagnostics();
    const report = window.SF?.state?.render?.renderer?.info?.memory;
    return {
      keys: diag ? [...diag.keys] : [],
      size: diag ? diag.size : -1,
      geometries: report ? report.geometries : null,
      programs: report ? report.programs : null,
    };
  });

  let prev = await sample();
  console.log(`boot: cache=${prev.size} geo=${prev.geometries} prog=${prev.programs}`);
  const allKeys = new Map();
  for (const k of prev.keys) allKeys.set(k, 'boot');

  for (let i = 0; i < CYCLES; i += 1) {
    await page.keyboard.press('F5');
    await page.waitForTimeout(1500);
    await page.keyboard.press('F9');
    await page.waitForFunction(() => window.SF?.state?.mode === 'flight', null, { timeout: 180_000 });
    await page.waitForTimeout(4000);
    const next = await sample();
    const prevSet = new Set(prev.keys);
    const fresh = next.keys.filter((k) => !prevSet.has(k));
    for (const k of next.keys) if (!allKeys.has(k)) allKeys.set(k, `cycle${i}`);
    console.log(`cycle ${i}: cache=${next.size} fresh=${fresh.length} geo=${next.geometries} prog=${next.programs}`);
    for (const k of fresh.slice(0, 4)) console.log(`  FRESH ${k}`);
    prev = next;
  }

  // Field-level diff: parse the JSON-ish token and report which fields vary across keys
  // that share the same defId — the churn field is the one that differs.
  const parsed = [...allKeys.keys()].map((k) => {
    try { return { raw: k, obj: JSON.parse(k), when: allKeys.get(k) }; } catch { return null; }
  }).filter(Boolean);
  const byDef = new Map();
  for (const entry of parsed) {
    const def = entry.obj && entry.obj.defId;
    const list = byDef.get(def) || [];
    list.push(entry);
    byDef.set(def, list);
  }
  for (const [def, list] of byDef) {
    if (list.length < 2) continue;
    const fields = Object.keys(list[0].obj);
    const varying = fields.filter((f) => {
      const first = JSON.stringify(list[0].obj[f]);
      return list.some((e) => JSON.stringify(e.obj[f]) !== first);
    });
    console.log(`defId=${def} keys=${list.length} varyingFields=${JSON.stringify(varying)}`);
    for (const f of varying) {
      const vals = list.map((e) => `${e.when}:${JSON.stringify(e.obj[f]).slice(0, 200)}`);
      vals.slice(0, 4).forEach((v) => console.log(`    ${f} = ${v}`));
    }
  }
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
