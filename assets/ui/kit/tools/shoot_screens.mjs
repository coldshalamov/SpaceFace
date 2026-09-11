/**
 * shoot_screens — open every prototype from `file://` and capture it.
 *
 * The capture is the proof of two separate acceptance clauses at once: that the prototypes
 * open without a server (classic scripts, relative paths, no fetch), and that what they draw
 * can be laid beside the frame. Console errors are collected and reported, because a prototype
 * that renders but throws is not "opens from file://".
 *
 *   node assets/ui/kit/tools/shoot_screens.mjs [name ...] [--width 1920]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const KIT = path.resolve(HERE, '..');
const REPO = path.resolve(KIT, '..', '..', '..');
const OUT = path.join(REPO, '.devshots', 'delegate-20260910', 'scratch', 'pq-194', 'build',
                      'screens');

const TARGETS = {
  title: { file: 'screens/title.html', full: false },
  'title-v1': { file: 'screens/title.html?v=1', full: false },
  'title-v3': { file: 'screens/title.html?v=3', full: false },
  'crucible-door': { file: 'screens/crucible-door.html', full: false },
  hud: { file: 'screens/hud.html', full: false },
  'hud-wanted': { file: 'screens/hud.html?state=wanted', full: false },
  kit: { file: 'kit/index.html', full: true },
  'demo-motion': { file: 'kit/demo-motion.html', full: true },
  'demo-sound': { file: 'kit/demo-sound.html', full: true },
  compare: { file: 'screens/_compare.html', full: false },
};

const args = process.argv.slice(2);
const widthArg = args.indexOf('--width');
const width = widthArg >= 0 ? parseInt(args[widthArg + 1], 10) : 1920;
const names = args.filter((a) => !a.startsWith('--') && TARGETS[a]);
const todo = names.length ? names : Object.keys(TARGETS);

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let failed = 0;

for (const name of todo) {
  const t = TARGETS[name];
  const abs = path.join(KIT, t.file.split('?')[0]);
  if (!fs.existsSync(abs)) {
    console.log(`  SKIP ${name} (${t.file} not built yet)`);
    continue;
  }
  const q = t.file.includes('?') ? '?' + t.file.split('?')[1] : '';
  const page = await browser.newPage({
    viewport: { width, height: Math.round((width * 9) / 16) },
    deviceScaleFactor: 1,
  });
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => problems.push('404/blocked: ' + r.url().split('/').pop()));

  await page.goto(url.pathToFileURL(abs).href + q, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);          // let the reveal land before the shot
  const out = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: out, fullPage: !!t.full });
  await page.close();

  if (problems.length) {
    failed++;
    console.log(`! ${name}`);
    [...new Set(problems)].slice(0, 8).forEach((p) => console.log(`    ${p}`));
  } else {
    console.log(`  ${name} -> ${out}`);
  }
}
await browser.close();
console.log(`\n${todo.length} target(s), ${failed} with console errors`);
process.exit(failed ? 1 : 0);
