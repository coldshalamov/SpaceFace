#!/usr/bin/env node
// ui-stills.mjs — fast visual preview of the game's screens, for a human or an agent to LOOK at.
//
// Why this exists: reviewing the frontend used to mean booting the whole matrix (4 media modes x 3
// viewports x every surface, hours) or starting the game by hand. This captures a named set of
// screens in ONE boot, at one viewport, default media, in about two minutes — the images an agent
// can read back directly and a person can open. It is a PREVIEW, not a check: it never writes the
// committed reference frames and never replaces `check:ui:layout` / `capture:ui-matrix`.
//
// It is a thin wrapper over `capture-ui-matrix.mjs`, on purpose: that file already owns the honest
// orchestration (the manifest's own routes, the pinned seed 47, the neutral ground, the verified
// open/close between surfaces, element crops for overlays) and this tool must not grow a second
// copy of it. What this adds is friendly defaults, plain file names, a markdown index, and an
// optional labeled contact sheet.
//
// Usage:
//   node scripts/ui-stills.mjs                      menus + HUD (the default)
//   node scripts/ui-stills.mjs --set=menus,hud,station
//   node scripts/ui-stills.mjs --only=title,pause   exact surface ids
//   node scripts/ui-stills.mjs --all                every automatable surface
//   node scripts/ui-stills.mjs --list               print sets and surface ids, then exit
//   node scripts/ui-stills.mjs --world --headed     capture over the LIVE 3D picture, visible window
//   node scripts/ui-stills.mjs --viewport=1280x720 --out=.devshots/ui-stills-small --no-sheet
//
// Output: .devshots/ui-stills/<surface>.png, index.md, contact-sheet.png (the sheet holds every
// capture, labeled, scaled into 600px cells; the full-size PNGs are the ones to judge detail on).

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { captureUiMatrix } from './capture-ui-matrix.mjs';
import { orderForOneBoot, SURFACES } from './ui-grammar-surfaces.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_OUT = path.join(ROOT, '.devshots', 'ui-stills');

/**
 * Named groups a reviewer actually asks for. `menus,hud` is the default because that is the
 * complaint that keeps coming back — the title, the pause column and the in-flight HUD.
 */
const SETS = Object.freeze({
  menus: ['title', 'new-game', 'pause', 'settings', 'save-load', 'help', 'credits', 'codex', 'mission-log'],
  hud: ['flight', 'power-rail', 'comms-radial', 'wingman-radial'],
  instruments: ['ship', 'footprint', 'range', 'chart', 'chart-galaxy', 'tech-tree'],
  station: [
    'station-dock', 'station-market', 'station-shipworks', 'station-industry',
    'station-contracts', 'station-factions', 'station-bar', 'station-ledger',
  ],
  crucible: ['crucible-door', 'crucible-draft', 'crucible-refit', 'crucible-results'],
  works: ['automation', 'base', 'asteroid-works'],
  deaths: ['game-over'],
});
const DEFAULT_SETS = ['menus', 'hud'];

const SURFACE_BY_ID = new Map(SURFACES.map((surface) => [surface.id, surface]));
const IMPLEMENTED_KINDS = new Set(['default', 'key', 'nested', 'fixture', 'boot', 'boot-nested']);

const args = parseArgs(process.argv.slice(2));

if (args.list) {
  printCatalog();
  process.exit(0);
}

const selected = resolveSelection(args);
if (!selected.length) {
  console.error('no surfaces selected — run with --list to see the ids and sets');
  process.exit(1);
}

const outDir = path.resolve(args.out || DEFAULT_OUT);
const stagingDir = path.join(outDir, '.harness');
const viewport = parseViewport(args.viewport || '1920x1080');

mkdirSync(outDir, { recursive: true });
mkdirSync(stagingDir, { recursive: true });

const surfaceIds = selected.map((surface) => surface.id);
console.log(`ui-stills — ${selected.length} surface(s) in one boot, ${viewport.width}x${viewport.height}, `
  + `${args.world ? 'live world' : 'neutral ground'}, ${args.headed ? 'headed' : 'headless'}`);
console.log(`  surfaces: ${surfaceIds.join(', ')}`);
console.log('  (first boot includes the title flow and a deterministic New Game — this takes a minute)\n');

const startedAt = Date.now();
let result = null;
let failure = null;
try {
  result = await captureUiMatrix({
    outputDir: stagingDir,
    headed: args.headed,
    world: args.world,
    quiet: false,
    printTable: false,
    filter: {
      surfaces: surfaceIds,
      modes: ['default'],
      viewports: [String(viewport.width)],
    },
  });
} catch (error) {
  failure = error;
}

const produced = new Map();
if (result) {
  for (const capture of result.captures) {
    const surfaceId = capture.plan ? capture.plan.surface : null;
    if (!surfaceId) continue;
    if (!produced.has(surfaceId) || capture.name.endsWith('-default-')) produced.set(surfaceId, capture);
  }
  for (const [surfaceId, capture] of produced) {
    copyFileSync(capture.path, path.join(outDir, `${surfaceId}.png`));
  }
}

const misses = surfaceIds.filter((id) => !produced.has(id));
const failureReasons = new Map();
if (result) {
  for (const item of result.failures || []) {
    if (!failureReasons.has(item.surface)) failureReasons.set(item.surface, item.reason);
  }
}

console.log(`\ncaptured ${produced.size}/${surfaceIds.length} still(s) in ${Math.round((Date.now() - startedAt) / 1000)}s`);
for (const [surfaceId, capture] of produced) {
  const kb = Math.round(statSync(path.join(outDir, `${surfaceId}.png`)).size / 1024);
  console.log(`  ${surfaceId.padEnd(20)} ${String(kb).padStart(5)} KB  ${path.join(path.relative(ROOT, outDir), `${surfaceId}.png`)}`);
}
if (misses.length) {
  console.warn(`\nmissing ${misses.length} surface(s):`);
  for (const id of misses) {
    const reason = failureReasons.get(id) || failure?.message || 'no capture produced';
    console.warn(`  ${id.padEnd(20)} ${reason}`);
  }
}

if (produced.size) {
  writeIndex({ outDir, selected, produced, viewport, args });
  if (!args.noSheet) {
    try {
      await writeContactSheet({
        outDir,
        entries: [...produced.keys()].map((id) => ({
          id,
          title: (SURFACE_BY_ID.get(id) || {}).title || id,
          file: path.join(outDir, `${id}.png`),
        })),
        headed: args.headed,
      });
    } catch (error) {
      console.warn(`contact sheet skipped: ${error.message}`);
    }
  }
  console.log(`\nindex: ${path.relative(ROOT, path.join(outDir, 'index.md'))}`);
  if (!args.noSheet) console.log(`sheet: ${path.relative(ROOT, path.join(outDir, 'contact-sheet.png'))}`);
}

// The staged harness frames are an implementation detail; the plain-named copies are the tool's
// output. Remove them so the folder is exactly what a reviewer opened.
try { rmSync(stagingDir, { recursive: true, force: true }); } catch (_) {}

if (!produced.size) {
  console.error(failure ? `\ncapture run failed: ${failure.message}` : '\nno stills were produced');
  process.exit(1);
}
process.exit(misses.length ? 1 : 0);

// ------------------------------------------------------------------ args and catalog

function parseArgs(argv) {
  const list = (prefix) => {
    const found = argv.filter((value) => value.startsWith(prefix));
    if (!found.length) return null;
    return found.flatMap((value) => value.slice(prefix.length).split(',')).map((v) => v.trim()).filter(Boolean);
  };
  return {
    sets: list('--set='),
    only: list('--only='),
    all: argv.includes('--all'),
    list: argv.includes('--list'),
    headed: argv.includes('--headed'),
    world: argv.includes('--world'),
    noSheet: argv.includes('--no-sheet'),
    out: (argv.find((value) => value.startsWith('--out=')) || '').slice('--out='.length) || null,
    viewport: (argv.find((value) => value.startsWith('--viewport=')) || '').slice('--viewport='.length) || null,
  };
}

function resolveSelection({ sets, only, all }) {
  if (all) {
    return orderForOneBoot(SURFACES.filter((surface) => IMPLEMENTED_KINDS.has(surface.entry.kind)
      && surface.ownerFile
      && surface.scope !== 'dev'));
  }
  const ids = [];
  // `--only` and `--set` are alternatives to the default, not additions: asking for `--only=title`
  // must not also boot the whole menu set. Only combine them when both were named explicitly.
  const namedSets = sets || (only ? [] : DEFAULT_SETS);
  for (const name of namedSets) {
    const group = SETS[name];
    if (!group) {
      console.error(`unknown set "${name}" — known sets: ${Object.keys(SETS).join(', ')}`);
      process.exit(1);
    }
    ids.push(...group);
  }
  if (only) ids.push(...only);
  const unique = [...new Set(ids)];
  const unknown = unique.filter((id) => !SURFACE_BY_ID.has(id));
  if (unknown.length) {
    console.error(`unknown surface id(s): ${unknown.join(', ')} — run with --list to see the ids`);
    process.exit(1);
  }
  return orderForOneBoot(unique.map((id) => SURFACE_BY_ID.get(id)));
}

function printCatalog() {
  console.log('sets:');
  for (const [name, ids] of Object.entries(SETS)) {
    console.log(`  ${name.padEnd(12)} ${ids.join(', ')}`);
  }
  console.log('\nall automatable surfaces:');
  for (const surface of SURFACES) {
    if (!IMPLEMENTED_KINDS.has(surface.entry.kind) || !surface.ownerFile || surface.scope === 'dev') continue;
    console.log(`  ${surface.id.padEnd(20)} ${surface.archetype.padEnd(11)} ${surface.title}`);
  }
}

function parseViewport(text) {
  const match = /^(\d+)x(\d+)$/.exec(text);
  if (!match) {
    console.error(`--viewport must look like 1920x1080, got "${text}"`);
    process.exit(1);
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

// ------------------------------------------------------------------ index and contact sheet

function writeIndex({ outDir, selected, produced, viewport, args }) {
  const lines = [
    '# UI stills',
    '',
    `Captured ${new Date().toISOString()} with \`node scripts/ui-stills.mjs\` — `
      + `${viewport.width}x${viewport.height}, default media, seed 47, `
      + (args.world ? 'live 3D picture' : 'neutral ground').replace(/\.$/, '') + '.',
    '',
    'A preview for looking, not a check: `npm run check:ui:layout` measures geometry, '
      + '`npm run capture:ui-matrix` owns the committed reference frames.',
    '',
    '| surface | what | how it was opened | still |',
    '|---|---|---|---|',
  ];
  for (const surface of selected) {
    if (!produced.has(surface.id)) continue;
    const route = surface.entry && surface.entry.detail ? surface.entry.detail : surface.entry.kind;
    lines.push(`| ${surface.id} | ${surface.title} | ${route} | [${surface.id}.png](./${surface.id}.png) |`);
  }
  const missing = selected.filter((surface) => !produced.has(surface.id));
  if (missing.length) {
    lines.push('', `Missing: ${missing.map((surface) => surface.id).join(', ')}`, '');
  }
  writeFileSync(path.join(outDir, 'index.md'), `${lines.join('\n')}\n`);
}

/**
 * The sheet is composed in a throwaway Chromium page because a browser is already a dependency
 * here and drawing text with a real font beats any bitmap-font table this file could carry. Each
 * still is letterboxed into a fixed cell so the grid stays aligned whatever the capture aspect is.
 */
async function writeContactSheet({ outDir, entries, headed }) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: !headed });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const items = entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      dataUrl: `data:image/png;base64,${readFileSync(entry.file).toString('base64')}`,
    }));
    const sheetDataUrl = await page.evaluate(async ({ items: shots, cols, cellW, cellH, captionH, gap, pad }) => {
      const images = await Promise.all(shots.map((shot) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`could not decode ${shot.id}.png`));
        image.src = shot.dataUrl;
      })));
      const rows = Math.ceil(images.length / cols);
      const canvas = document.createElement('canvas');
      canvas.width = pad * 2 + cols * cellW + (cols - 1) * gap;
      canvas.height = pad * 2 + rows * (cellH + captionH) + (rows - 1) * gap;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#12151a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      images.forEach((image, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = pad + col * (cellW + gap);
        const y = pad + row * (cellH + captionH + gap);
        const scale = Math.min(cellW / image.width, cellH / image.height);
        const w = image.width * scale;
        const h = image.height * scale;
        ctx.drawImage(image, x + (cellW - w) / 2, y + (cellH - h) / 2, w, h);
        ctx.fillStyle = '#eae6df';
        ctx.font = '600 22px system-ui, sans-serif';
        ctx.fillText(shots[index].id, x, y + cellH + 26);
        ctx.fillStyle = 'rgb(234 230 223 / 0.55)';
        ctx.font = '400 18px system-ui, sans-serif';
        const shown = shots[index].title.length > 46 ? `${shots[index].title.slice(0, 44)}…` : shots[index].title;
        ctx.fillText(shown, x, y + cellH + 52);
      });
      return canvas.toDataURL('image/png');
    }, { items, cols: 3, cellW: 600, cellH: 338, captionH: 64, gap: 24, pad: 24 });
    writeFileSync(path.join(outDir, 'contact-sheet.png'), Buffer.from(sheetDataUrl.split(',')[1], 'base64'));
    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }
}
