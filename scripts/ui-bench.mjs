#!/usr/bin/env node
// ui-bench.mjs — photograph a real screen over a frozen still. No game boot.
//
//   node scripts/ui-bench.mjs --list
//   node scripts/ui-bench.mjs --shot=pause
//   node scripts/ui-bench.mjs --shot=pause,settings
//   node scripts/ui-bench.mjs --shot=station-market --walk
//   node scripts/ui-bench.mjs --shot=ship --probe=".sx-sw__stage"   # where is it, and what decided that
//   node scripts/ui-bench.mjs                          # serve; prints URLs
//
// Output: .devshots/ui-bench/<id>.png
// --walk tries every visible control from the arrival state, prints what each one did, and
// writes another PNG only when the picture changed. Open those PNGs. The procedure is
// docs/UI_VISUAL_ITERATION.md.

import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startBenchServer } from './lib/benchServer.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { listShotIds, resolveShot } from './lib/uiBenchCatalog.mjs';

try { os.setPriority(os.constants.priority.PRIORITY_LOW); } catch { /* yield to the game */ }

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = parseArgs(process.argv.slice(2));

process.env.SPACEFACE_PLAYER_STORE_DIR = '';

if (args.list) {
  console.log('ui-bench screens (real DOM over a still — no game boot):\n');
  const groups = new Map();
  for (const id of listShotIds()) {
    const shot = resolveShot(id);
    const key = [shot.screen, shot.tab || '', shot.overlay || '', shot.focus || ''].join('|');
    if (!groups.has(key)) groups.set(key, { shot, ids: [] });
    groups.get(key).ids.push(id);
  }
  for (const { shot, ids } of groups.values()) {
    const extra = [shot.tab && `tab ${shot.tab}`, shot.overlay && shot.overlay, shot.focus && `focus ${shot.focus}`].filter(Boolean).join(', ');
    console.log(`  ${ids.join(', ')}${extra ? `  (${extra})` : ''}`);
  }
  console.log('\n  node scripts/ui-bench.mjs --shot=<id>');
  console.log('  node scripts/ui-bench.mjs --shot=<id> --walk');
  process.exit(0);
}

const server = await startBenchServer();
const base = `${server.baseUrl}tools/ui-bench.html`;
let exitCode = 0;

if (!args.shots.length) {
  console.log('ui-bench is serving. Open a screen directly:');
  for (const id of ['pause', 'settings', 'flight', 'station-market', 'title', 'chart']) {
    console.log(`  ${base}?screen=${id}&chrome=0`);
  }
  console.log('\nIds: node scripts/ui-bench.mjs --list');
  console.log('Ctrl+C stops the server.');
  process.on('SIGINT', async () => { await server.close(); process.exit(0); });
} else {
  const unknown = args.shots.filter((id) => !resolveShot(id));
  if (unknown.length) {
    console.error(`ui-bench: unknown screen ${unknown.join(', ')}`);
    console.error('Ids: node scripts/ui-bench.mjs --list');
    await server.close();
    process.exit(1);
  }
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: !args.headed });
  const outDir = path.resolve(ROOT, args.out || '.devshots/ui-bench');
  mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage({ viewport: args.viewport });
  page.on('pageerror', (error) => {
    console.error(`  pageerror: ${error && error.message ? error.message : error}`);
    const where = error && error.stack ? String(error.stack).split(`
`).slice(1, 4).map((l) => l.trim()).join(` <- `) : '';
    if (where) console.error(`    at ${where}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`  console: ${msg.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const url = response.url();
    if (url.includes('spaceface-release-build.json') || url.endsWith('favicon.ico')) return;
    console.log(`    ${response.status()} ${url.replace(server.baseUrl, '/')}`);
  });
  for (const id of args.shots) {
    const ok = await shoot(page, id, outDir);
    if (!ok) exitCode = 1;
  }
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  try { browser.process()?.kill(); } catch { /* already gone */ }
  await server.close();
  process.exit(exitCode);
}

async function shoot(page, id, outDir) {
  const started = Date.now();
  const bg = args.bg ? `&bg=${encodeURIComponent(bgUrl(args.bg))}` : '';
  const url = `${base}?screen=${encodeURIComponent(id)}&chrome=0${bg}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const opened = await page.waitForFunction(() => window.__BENCH_READY === true, null, { timeout: 45_000 })
    .then(() => true)
    .catch(() => false);
  if (!opened) {
    console.error(`  ${id}  NOT MOUNTED in 45s — the bench page did not finish`);
    return false;
  }
  await settleAnimations(page);
  const file = path.join(outDir, `${safeName(id)}.png`);
  await page.screenshot({ path: file });
  const report = await page.evaluate(() => window.BENCH.report());
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n${id}  ${path.relative(ROOT, file)}  ${seconds}s`);
  if (report.broken) {
    console.log(`  NOT MOUNTABLE  ${report.broken}`);
    console.log('  This screen did not mount on the bench. Live route: node scripts/ui-look.mjs --only=' + id);
    return false;
  }
  if (report.overlay) console.log(`  overlay: ${report.overlay}`);
  printFindings(report);
  console.log('  Open this PNG and look at it.');
  if (args.probe) await probe(page, args.probe);
  if (args.walk) await walk(page, id, outDir);
  return true;
}

// Screens arrive with a staggered entrance (kit `settle`). Photographing before it lands gave two
// different pictures of the same title screen minutes apart — eight menu items in a slow run, two
// in a fast one — which makes every reading a lottery and every comparison worthless. Finish every
// running animation, then let one frame paint at the settled state.
async function settleAnimations(page) {
  await page.evaluate(async () => {
    for (let pass = 0; pass < 3; pass += 1) {
      const running = document.getAnimations().filter((a) => a.playState === 'running');
      // An infinite idle loop (a breathing lamp) never finishes; seek it to a stable phase instead.
      for (const animation of running) {
        const iterations = animation.effect?.getTiming?.().iterations;
        if (iterations === Infinity) animation.pause();
        else { try { animation.finish(); } catch { /* an unresolved effect cannot be finished */ } }
      }
      if (!running.length) break;
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }).catch(() => {});
}

// `--probe=<css selector>` prints where the matching elements actually are and what decided it.
// A layout question ("why is this panel 245px tall when I set a 340px floor?") is answered by
// measuring, and measuring belongs in the instrument rather than in a throwaway script beside it.
async function probe(page, selector) {
  const rows = await page.evaluate((sel) => {
    const out = [];
    let nodes;
    // `text:<substring>` finds the element that directly prints that text. A finding names the
    // words, not the class, so this is how you get from a finding to the element that made it.
    if (sel.startsWith('text:')) {
      const needle = sel.slice(5).toLowerCase();
      nodes = [...document.querySelectorAll('body *')].filter((el) => [...el.childNodes]
        .some((n) => n.nodeType === 3 && n.nodeValue && n.nodeValue.toLowerCase().includes(needle)));
    } else {
      try { nodes = document.querySelectorAll(sel); } catch { return [{ error: 'bad selector' }]; }
    }
    for (const el of [...nodes].slice(0, 12)) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70),
        box: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`,
        display: s.display, position: s.position, overflow: s.overflow,
        flex: s.flex, minHeight: s.minHeight, height: s.height,
        gridArea: s.gridArea === 'auto / auto / auto / auto' ? '' : s.gridArea,
        parent: el.parentElement
          ? `${el.parentElement.tagName.toLowerCase()}.${String(el.parentElement.className || '').split(/[ 	]+/)[0]} ${getComputedStyle(el.parentElement).display} ${Math.round(el.parentElement.getBoundingClientRect().height)}h`
          : '',
      });
    }
    return out;
  }, selector).catch((error) => [{ error: error.message }]);
  console.log(`  probe ${selector}: ${rows.length} match${rows.length === 1 ? '' : 'es'}`);
  for (const row of rows) {
    if (row.error) { console.log(`    ${row.error}`); continue; }
    console.log(`    ${row.tag}.${row.cls}`);
    console.log(`      box ${row.box}  display:${row.display} position:${row.position} overflow:${row.overflow}`);
    console.log(`      flex:${row.flex} min-height:${row.minHeight} height:${row.height}${row.gridArea ? ` grid-area:${row.gridArea}` : ''}`);
    console.log(`      in ${row.parent}`);
  }
}

async function walk(page, id, outDir) {
  const controls = await page.evaluate(() => window.BENCH.controls());
  const limit = Math.min(controls.length, args.max);
  console.log(`  controls: ${controls.length}${controls.length > limit ? ` (trying ${limit}; --max= raises it)` : ''}`);
  for (let index = 0; index < limit; index += 1) {
    try {
      if (index > 0) await page.evaluate((shotId) => window.BENCH.goto(shotId), id);
      const arrival = await page.evaluate(() => window.BENCH.signature());
      const label = await page.evaluate((i) => window.BENCH.hover(i), index);
      await page.waitForTimeout(80);
      const hovered = await page.evaluate(() => window.BENCH.signature());
      const hoverEffect = describe(arrival, hovered);
      const name = (label || '(unlabeled)').slice(0, 36).padEnd(36);
      if (hoverEffect !== 'no visible change' && hoverEffect !== 'disabled') {
        const hoverFile = path.join(outDir, `${safeName(id)}--hover-${slug(label || String(index))}.png`);
        await page.screenshot({ path: hoverFile });
        console.log(`  ${name} hover  ${hoverEffect}  ${path.relative(ROOT, hoverFile)}`);
        await page.evaluate((shotId) => window.BENCH.goto(shotId), id);
      }
      const beforeClick = await page.evaluate(() => window.BENCH.signature());
      await page.evaluate((i) => window.BENCH.click(i), index);
      await page.waitForTimeout(160);
      const clicked = await page.evaluate(() => window.BENCH.signature());
      const clickEffect = describe(beforeClick, clicked);
      if (hoverEffect === 'no visible change' && (clickEffect === 'no visible change' || clickEffect === 'disabled')) {
        console.log(`  ${name} ${clickEffect}`);
        continue;
      }
      if (clickEffect === 'no visible change' || clickEffect === 'disabled') {
        if (hoverEffect === 'disabled') console.log(`  ${name} disabled`);
        continue;
      }
      const clickFile = path.join(outDir, `${safeName(id)}--${String(index + 1).padStart(2, '0')}-${slug(label || 'control')}.png`);
      await page.screenshot({ path: clickFile });
      console.log(`  ${name} click  ${clickEffect}  ${path.relative(ROOT, clickFile)}`);
    } catch (error) {
      console.log(`  control ${index + 1}  probe failed: ${error.message.split('\n')[0]}`);
    }
  }
  console.log('  Open every PNG this walk printed. Each line is one control, tried from the arrival screen.');
}

function describe(before, after) {
  if (after.disabled) return 'disabled';
  const notes = [];
  if (before.screen !== after.screen) notes.push(`opened ${after.screen}`);
  if (before.text !== after.text) notes.push('picture changed');
  if (before.popup !== after.popup) notes.push(after.popup > before.popup ? 'opened a layer' : 'closed a layer');
  if (before.log !== after.log && !notes.length) notes.push('asked for something; the picture stayed');
  return notes.length ? notes.join('; ') : 'no visible change';
}

// The control audit and the picture audit, in the order a reviewer cares about them: type that
// cannot be read comes before a control in the wrong place.
function printFindings(report) {
  // Declared here, not at module scope: printFindings is hoisted and runs before a module-level
  // const is initialised.
  const rows = [
    ['tangled', 'ON TOP OF'],
    ['buried', 'BURIED'],
    ['severed', 'CUT OFF'],
    ['overlaps', 'OVERLAP'],
    ['clipped', 'CLIPPED'],
    ['offscreen', 'OFF FRAME'],
    ['dead', 'EMPTY BOX'],
  ];
  let total = 0;
  for (const [key, tag] of rows) {
    for (const row of report[key] || []) {
      console.log(`  ${tag}  ${row}`);
      total += 1;
    }
  }
  if (!total) console.log('  measured: no tangled, buried, cut-off or offscreen type, and no empty boxes');
  return total;
}

function bgUrl(value) {
  if (/^https?:\/\//.test(value) || value.startsWith('/') || value.startsWith('../')) return value;
  return `../${value.replace(/^\.\//, '')}`;
}

function safeName(id) {
  return String(id).replace(/[^a-z0-9_-]+/gi, '-');
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'control';
}

function parseArgs(argv) {
  const parsed = {
    shots: [],
    bg: null,
    out: null,
    headed: false,
    list: false,
    walk: false,
    probe: null,
    max: 24,
    viewport: { width: 1920, height: 1080 },
  };
  for (const arg of argv) {
    if (arg === '--list') parsed.list = true;
    if (arg === '--walk') parsed.walk = true;
    if (arg === '--headed') parsed.headed = true;
    if (arg.startsWith('--shot=')) parsed.shots.push(...splitIds(arg.slice('--shot='.length)));
    if (arg.startsWith('--bg=')) parsed.bg = arg.slice('--bg='.length);
    if (arg.startsWith('--probe=')) parsed.probe = arg.slice('--probe='.length);
    if (arg.startsWith('--out=')) parsed.out = arg.slice('--out='.length);
    if (arg.startsWith('--max=')) parsed.max = Number(arg.slice('--max='.length)) || parsed.max;
    if (arg.startsWith('--viewport=')) {
      const match = /^(\d+)x(\d+)$/.exec(arg.slice('--viewport='.length));
      if (match) parsed.viewport = { width: Number(match[1]), height: Number(match[2]) };
    }
    if (!arg.startsWith('--')) parsed.shots.push(...splitIds(arg));
  }
  parsed.shots = [...new Set(parsed.shots)];
  return parsed;
}

function splitIds(value) {
  return String(value).split(',').map((part) => part.trim()).filter(Boolean);
}
