#!/usr/bin/env node
// Photograph the game's REAL screen modules over stills. Never boot the game to photograph a menu.
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listShotIds, resolveShot } from './lib/uiBenchCatalog.mjs';
import { parseBenchArgs, runUiBenchBatch } from './lib/uiBenchBatch.mjs';

try { os.setPriority(os.constants.priority.PRIORITY_LOW); } catch { /* yield to the game */ }
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = parseBenchArgs(process.argv.slice(2));
process.env.SPACEFACE_PLAYER_STORE_DIR = '';

if (args.list) {
  console.log('ui-bench screens (real DOM over a still — no game boot):\n');
  const groups = new Map();
  for (const id of listShotIds()) {
    const shot = resolveShot(id), key = [shot.screen, shot.tab || '', shot.overlay || '', shot.focus || ''].join('|');
    if (!groups.has(key)) groups.set(key, { shot, ids: [] });
    groups.get(key).ids.push(id);
  }
  for (const { shot, ids } of groups.values()) {
    const extra = [shot.tab && `tab ${shot.tab}`, shot.overlay, shot.focus && `focus ${shot.focus}`].filter(Boolean).join(', ');
    console.log(`  ${ids.join(', ')}${extra ? `  (${extra})` : ''}`);
  }
  console.log('\n  node scripts/ui-bench.mjs --shot=pause,settings --viewports=960x540,1920x1080 --walk');
} else {
  const unknown = args.shots.filter(id => !resolveShot(id));
  if (unknown.length) throw new Error(`Unknown screen ${unknown.join(', ')}; use --list`);
  const { startBenchServer } = await import('./lib/benchServer.mjs');
  const sourceOverlay = args['baseline-source'] ? path.resolve(ROOT, args['baseline-source']) : null;
  if (sourceOverlay && !path.relative(ROOT, sourceOverlay).replaceAll('\\', '/').startsWith('.devshots/')) {
    throw new Error('--baseline-source must name an ignored manifest under .devshots/');
  }
  const startSelectedServer = () => startBenchServer({ sourceOverlay });
  if (!args.shots.length) {
    const server = await startSelectedServer();
    const base = `${server.baseUrl}tools/ui-bench.html`;
    console.log('ui-bench is serving. Open a screen directly:');
    for (const id of ['pause', 'settings', 'flight', 'station-market', 'title', 'chart']) console.log(`  ${base}?screen=${id}&chrome=0`);
    console.log('\nIds: node scripts/ui-bench.mjs --list\nCtrl+C stops the server.');
    const stop = async () => { await server.close(); process.exitCode = 0; };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  } else {
    const { loadPlaywright } = await import('./lib/load-playwright.mjs');
    args.executablePath = process.env.SF_CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
    const summary = await runUiBenchBatch({ args, root: ROOT, loadPlaywright, startServer: startSelectedServer, shoot });
    for (const cell of summary.cells) for (const error of cell.errors) console.error(`  ${cell.id}: ${error.kind}: ${error.message || error.url}`);
    for (const error of summary.errors) console.error(`ui-bench: ${error}`);
    console.log(`\nBatch report: ${path.join(args.out || '.devshots/ui-bench', 'report.json')}`);
    process.exitCode = summary.ok ? 0 : 1;
  }
}

async function shoot(page, id, outDir, base) {
  const started = Date.now();
  const bg = args.bg ? `&bg=${encodeURIComponent(bgUrl(args.bg))}` : '';
  const demo = args.demo ? '&demo=1' : '', phone = args.phone ? '&phone=1' : '';
  const extra = args.query ? `&${args.query}` : '';
  const url = `${base}?screen=${encodeURIComponent(id)}&chrome=0${demo}${phone}${extra}${bg}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: args.timeoutMs });
  await page.waitForFunction(() => window.__BENCH_READY === true, null, { timeout: args.timeoutMs });
  await settleAnimations(page);
  const file = path.join(outDir, `${safeName(id)}.png`);
  await page.screenshot({ path: file, timeout: args.timeoutMs });
  const report = await page.evaluate(() => window.BENCH.report());
  console.log(`\n${id}  ${path.relative(ROOT, file)}  ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (report.broken) {
    console.log(`  NOT MOUNTABLE  ${report.broken}\n  Live route: node scripts/ui-look.mjs --only=${id}`);
    return { ok: false, report, file: path.relative(ROOT, file) };
  }
  if (report.overlay) console.log(`  overlay: ${report.overlay}`);
  const findingCount = printFindings(report);
  console.log('  Open this PNG and look at it.');
  if (args.probe) await probe(page, args.probe);
  const walked = args.walk ? await walk(page, id, outDir) : null;
  return { ok: !walked || walked.complete, report, findingCount, file: path.relative(ROOT, file), walk: walked,
    visualReview: 'required; empty geometry findings do not prove a good picture' };
}

async function settleAnimations(page) {
  await page.evaluate(async () => {
    for (let pass = 0; pass < 3; pass++) {
      const running = document.getAnimations().filter(a => a.playState === 'running');
      for (const animation of running) {
        if (animation.effect?.getTiming?.().iterations === Infinity) animation.pause();
        else { try { animation.finish(); } catch { /* unresolved effect */ } }
      }
      if (!running.length) break;
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function probe(page, selector) {
  const rows = await page.evaluate(async sel => {
    const out = []; let nodes;
    if (sel.startsWith('js:')) {
      try {
        // Existing developer-only diagnostic escape hatch; never player-truth evidence.
        // eslint-disable-next-line no-eval
        const value = await eval(sel.slice(3));
        return [{ note: typeof value === 'string' ? value : JSON.stringify(value) }];
      } catch (error) { return [{ error: error.message }]; }
    }
    if (sel.startsWith('text:')) {
      const needle = sel.slice(5).toLowerCase();
      nodes = [...document.querySelectorAll('body *')].filter(el => [...el.childNodes]
        .some(n => n.nodeType === 3 && n.nodeValue && n.nodeValue.toLowerCase().includes(needle)));
    } else { try { nodes = document.querySelectorAll(sel); } catch { return [{ error: 'bad selector' }]; } }
    for (const el of [...nodes].slice(0, 12)) {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      out.push({ tag: el.tagName.toLowerCase(), cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70),
        box: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`,
        display: s.display, position: s.position, overflow: s.overflow, bg: (s.backgroundImage || '').slice(0, 64),
        flex: s.flex, minHeight: s.minHeight, height: s.height, gridArea: s.gridArea === 'auto / auto / auto / auto' ? '' : s.gridArea,
        parent: el.parentElement ? `${el.parentElement.tagName.toLowerCase()}.${String(el.parentElement.className || '').split(/[ \t]+/)[0]} ${getComputedStyle(el.parentElement).display} ${Math.round(el.parentElement.getBoundingClientRect().height)}h` : '' });
    }
    return out;
  }, selector).catch(error => [{ error: error.message }]);
  console.log(`  probe ${selector}: ${rows.length} match${rows.length === 1 ? '' : 'es'}`);
  for (const row of rows) {
    if (row.error) { console.log(`    ${row.error}`); continue; }
    if (row.note !== undefined) { console.log(`    ${row.note}`); continue; }
    console.log(`    ${row.tag}.${row.cls}\n      box ${row.box}  display:${row.display} position:${row.position} overflow:${row.overflow}`);
    if (row.bg && row.bg !== 'none') console.log(`      background-image ${row.bg}`);
    console.log(`      flex:${row.flex} min-height:${row.minHeight} height:${row.height}${row.gridArea ? ` grid-area:${row.gridArea}` : ''}\n      in ${row.parent}`);
  }
}

async function walk(page, id, outDir) {
  const controls = await page.evaluate(() => window.BENCH.controls());
  const limit = Math.min(controls.length, args.max), actions = [], errors = [];
  console.log(`  controls: ${controls.length}${controls.length > limit ? ` (trying ${limit}; --max= raises it)` : ''}`);
  for (let index = 0; index < limit; index++) {
    try {
      // Always reset arrival, including the first control, then settle entrance animations.
      await page.evaluate(shotId => window.BENCH.goto(shotId), id);
      await settleAnimations(page);
      const arrival = await page.evaluate(() => window.BENCH.signature());
      const label = await page.evaluate(i => window.BENCH.hover(i), index);
      await page.waitForTimeout(80);
      const hovered = await page.evaluate(() => window.BENCH.signature());
      const hoverEffect = describe(arrival, hovered), name = (label || '(unlabeled)').slice(0, 36).padEnd(36);
      const row = { index, label, hover: hoverEffect }; actions.push(row);
      if (hoverEffect !== 'no visible change' && hoverEffect !== 'disabled') {
        const hoverFile = path.join(outDir, `${safeName(id)}--hover-${String(index + 1).padStart(2, '0')}-${slug(label || String(index))}.png`);
        await page.screenshot({ path: hoverFile, timeout: args.timeoutMs });
        row.hoverFile = path.relative(ROOT, hoverFile);
        console.log(`  ${name} hover  ${hoverEffect}  ${row.hoverFile}`);
        await page.evaluate(shotId => window.BENCH.goto(shotId), id);
        await settleAnimations(page);
      }
      const beforeClick = await page.evaluate(() => window.BENCH.signature());
      await page.evaluate(i => window.BENCH.click(i), index);
      await page.waitForTimeout(160);
      await settleAnimations(page);
      const clicked = await page.evaluate(() => window.BENCH.signature()), clickEffect = describe(beforeClick, clicked);
      row.click = clickEffect;
      if (clickEffect === 'no visible change' || clickEffect === 'disabled') { console.log(`  ${name} ${clickEffect}`); continue; }
      const clickFile = path.join(outDir, `${safeName(id)}--${String(index + 1).padStart(2, '0')}-${slug(label || 'control')}.png`);
      await page.screenshot({ path: clickFile, timeout: args.timeoutMs }); row.clickFile = path.relative(ROOT, clickFile);
      console.log(`  ${name} click  ${clickEffect}  ${row.clickFile}`);
    } catch (error) { errors.push({ index, message: error.message }); console.log(`  control ${index + 1} probe failed: ${error.message.split('\n')[0]}`); }
  }
  console.log('  Open every PNG this walk printed. Each line is one control, tried from the arrival screen.');
  return { complete: limit === controls.length && errors.length === 0, total: controls.length, attempted: limit,
    untried: controls.length - limit, actions, errors };
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
function printFindings(report) {
  const rows = [['tangled', 'ON TOP OF'], ['buried', 'BURIED'], ['severed', 'CUT OFF'], ['overlaps', 'OVERLAP'],
    ['clipped', 'CLIPPED'], ['offscreen', 'OFF FRAME'], ['dead', 'EMPTY BOX']];
  let total = 0;
  for (const [key, tag] of rows) for (const row of report[key] || []) { console.log(`  ${tag}  ${row}`); total++; }
  if (!total) console.log('  measured: no tangled, buried, cut-off or offscreen type, and no empty boxes');
  return total;
}
function bgUrl(value) {
  if (/^https?:\/\//.test(value) || value.startsWith('/') || value.startsWith('../')) return value;
  return `../${value.replace(/^\.\//, '')}`;
}
function safeName(id) { return String(id).replace(/[^a-z0-9_-]+/gi, '-'); }
function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'control'; }
