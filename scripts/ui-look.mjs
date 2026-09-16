#!/usr/bin/env node
// ui-look.mjs — LOOK at a screen the cheap way: open it directly, try every control, report what
// each one DID, and keep a picture whenever the surface visibly changed.
//
// Why this exists (docs/UI_VISUAL_ITERATION.md): the failure this repo keeps having is not a
// missing check, it is agents restyling a screen they never actually looked at — because looking
// meant a scripted capture boot, and "what does this button do" was never asked at all. This tool
// makes looking cheap and makes every control's effect legible in one page of output.
//
// It uses the dev direct-screen route (`src/main.js`: `?dev=screen:<id>`), so it costs one page
// load per reload rather than a walk through the menus, and it re-loads the route whenever a
// control takes the app somewhere it cannot back out of.
//
// Usage:
//   node scripts/ui-look.mjs --only=pause
//   node scripts/ui-look.mjs --only=pause --viewport=1280x720
//   node scripts/ui-look.mjs --only=settings --headed --max=30
//
// Output: .devshots/ui-look/<id>/index.md + the PNGs it judged, and a console table of every
// control with its effect (opened a screen, toggled a region, changed text, or nothing at all).

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { startFreshServer } from './capture-ui-matrix.mjs';
import { surfaceById } from './ui-grammar-surfaces.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_OUT = path.join(ROOT, '.devshots', 'ui-look');
const ROOT_TIMEOUT_MS = 120_000;
const SETTLE_MS = 400;

const args = parseArgs(process.argv.slice(2));
if (!args.only.length) {
  console.error('ui-look: --only=<surface id> is required (ids: node scripts/ui-stills.mjs --list)');
  process.exit(1);
}

const viewport = parseViewport(args.viewport || '1920x1080');
const outRoot = path.resolve(args.out || DEFAULT_OUT);

// Browser test servers must never mount the real shared save drawer (§ AGENTS.md).
process.env.SPACEFACE_PLAYER_STORE_DIR = '';

const { chromium } = await loadPlaywright();
const server = await startFreshServer();
let browser = null;
let exitCode = 0;

for (const id of args.only) {
  const surface = surfaceById(id);
  if (!surface) {
    console.error(`ui-look: unknown surface "${id}"`);
    exitCode = 1;
    continue;
  }
  const outDir = path.join(outRoot, id);
  mkdirSync(outDir, { recursive: true });
  const baseUrl = `${server.baseUrl}?dev=screen:${encodeURIComponent(id)}`;
  const result = await lookAtSurface({ surface, baseUrl, outDir });
  if (!result.ok) exitCode = 1;
}

if (browser) await browser.close().catch(() => {});
server.kill();

// ------------------------------------------------------------------ the sweep

async function lookAtSurface({ surface, baseUrl, outDir }) {
  if (!browser) browser = await chromium.launch({ headless: !args.headed });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const logs = [];
  // `__spaceface_player_store` 404s by design here: the isolated store (§ AGENTS.md) has no
  // endpoint. Noise like that must not read as a page defect.
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('__spaceface_player_store')) return;
    logs.push(text);
  });
  const finder = selectorFor(surface);

  const reload = async () => {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForSelector(finder, { state: 'visible', timeout: ROOT_TIMEOUT_MS });
        await page.waitForTimeout(SETTLE_MS);
        return;
      } catch (error) {
        lastError = error;
        await page.waitForTimeout(2000 * attempt);
      }
    }
    throw lastError;
  };

  console.log(`\nui-look — ${surface.id} (${surface.title || ''}) at ${viewport.width}x${viewport.height}`);
  console.log(`  ${baseUrl}`);
  try {
    await reload();
  } catch (error) {
    const mode = await page.evaluate(() => (globalThis.SF && globalThis.SF.state && globalThis.SF.state.mode) || 'no SF').catch(() => 'unreadable');
    console.error(`  NOT OPENED after ${Math.round(ROOT_TIMEOUT_MS / 1000)}s of waiting (${error.message.split('\n')[0]})`);
    console.error(`  session mode: ${mode}${logs.length ? `\n  last console error: ${logs.at(-1)}` : ''}`);
    console.error('  the dev route needs a running session; if the mode is stuck in "loading", the machine is slow — retry, or open the URL by hand and look.');
    await context.close();
    return { ok: false };
  }

  const note = async (name, clip) => {
    const file = path.join(outDir, name);
    await page.screenshot({ path: file, clip });
    return file;
  };

  const rootBox = await page.locator(finder).first().boundingBox();
  const clip = rootBox
    ? {
      x: Math.max(0, Math.floor(rootBox.x - 24)),
      y: Math.max(0, Math.floor(rootBox.y - 24)),
      width: Math.min(viewport.width, Math.ceil(rootBox.width + 48)),
      height: Math.min(viewport.height, Math.ceil(rootBox.height + 48)),
    }
    : undefined;

  await note('00-arrival.png');
  const arrival = await signature(page, finder, clip);

  const controls = await page.evaluate((rootSelector) => {
    const root = document.querySelector(rootSelector);
    if (!root) return [];
    const seen = [];
    for (const el of root.querySelectorAll('button, [role="button"], [data-action], .k-word, .k-row, .k-tile')) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 6 || rect.height < 6) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if (Number(style.opacity) < 0.4) continue;
      const label = (el.getAttribute('aria-label') || el.textContent || el.dataset.action || '').trim().replace(/\s+/g, ' ').slice(0, 44);
      if (!label) continue;
      seen.push({ label, action: el.dataset.action || '', tag: el.tagName.toLowerCase() });
    }
    return seen;
  }, finder);

  const rows = [];
  let looked = 0;
  for (const control of controls.slice(0, args.max)) {
    looked += 1;
    const slug = slugify(`${String(looked).padStart(2, '0')}-${control.label}`);
    let effect = 'no visible change';
    let file = '—';
    try {
      await page.evaluate(({ rootSelector, label }) => {
        const root = document.querySelector(rootSelector);
        const match = [...root.querySelectorAll('button, [role="button"], [data-action], .k-word, .k-row, .k-tile')]
          .find((el) => ((el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 44) === label));
        if (match) { match.focus(); match.click(); }
      }, { rootSelector: finder, label: control.label });
      await page.waitForTimeout(SETTLE_MS);
      const after = await signature(page, finder, clip);
      const moved = gridDistance(arrival.grid, after.grid);
      effect = describeDelta(arrival, after);
      if (after.stack !== arrival.stack || after.modal !== arrival.modal || moved >= 6) {
        file = path.relative(ROOT, await note(`${slug}.png`, clip));
      } else if (after.focus !== arrival.focus) {
        // A lit row is a state, but seventeen near-identical focus shots are context spent for
        // nothing: the index names it and the pick's real effect stays the headline.
        effect = `focus/hover state only (${after.focus || 'none'} live)`;
      }
      rows.push({ control, effect, file });
    } catch (error) {
      rows.push({ control, effect: `probe failed: ${error.message}`, file });
    }
    // Back to the surface. A pushed screen is popped through the app's own manager (instant, and
    // it keeps the session the sweep was looking at); a reload is the fallback only when the
    // manager cannot get us back.
    const open = await page.locator(finder).first().isVisible().catch(() => false);
    if (!open) {
      for (let pops = 0; pops < 4; pops += 1) {
        const popped = await page.evaluate(() => {
          const ui = globalThis.SF && globalThis.SF.registry && globalThis.SF.registry.get && globalThis.SF.registry.get('ui');
          const manager = ui && (ui.screenManager || ui.manager);
          if (!manager || typeof manager.popScreen !== 'function' || typeof manager.hasScreen !== 'function') return false;
          if (!manager.hasScreen()) return false;
          manager.popScreen();
          return true;
        }).catch(() => false);
        if (!popped) break;
        await page.waitForTimeout(250);
        if (await page.locator(finder).first().isVisible().catch(() => false)) break;
      }
    }
    if (!(await page.locator(finder).first().isVisible().catch(() => false))) await reload().catch(() => {});
    else await page.evaluate((rootSelector) => document.querySelector(rootSelector)?.scrollIntoView({ block: 'nearest' }), finder);
  }

  const index = [
    `# ui-look — ${surface.id}`,
    '',
    `- route: \`${baseUrl}\``,
    `- viewport: ${viewport.width}x${viewport.height}`,
    `- controls tried: ${looked} of ${controls.length}${controls.length > args.max ? ' (raise with --max)' : ''}`,
    '',
    '| control | what it did | picture |',
    '|---|---|---|',
    ...rows.map((row) => `| ${row.control.label} | ${row.effect} | ${row.file} |`),
    '',
  ].join('\n');
  writeFileSync(path.join(outDir, 'index.md'), index);
  writeFileSync(path.join(outDir, 'controls.json'), JSON.stringify({ surface: surface.id, route: baseUrl, rows }, null, 2));

  for (const row of rows) console.log(`  ${row.control.label.padEnd(34)} ${row.effect}`);
  if (logs.length) console.log(`  (${logs.length} console error(s); last: ${logs.at(-1)})`);
  console.log(`  index: ${path.relative(ROOT, path.join(outDir, 'index.md'))}`);
  await context.close();
  return { ok: true };
}

// ------------------------------------------------------------------ helpers

/** What the surface looks like right now: the screen stack, the mode, the modal flag, which
 *  control has focus, and a coarse luminance grid of the surface clip. The grid is deliberately
 *  small — it answers "did the picture change" without keeping a picture that did not change. */
async function signature(page, rootSelector, clip) {
  const dom = await page.evaluate((selector) => {
    const root = document.querySelector(selector);
    const stack = [...document.querySelectorAll('[data-screen]')].map((el) => el.dataset.screen);
    const active = document.activeElement;
    const focus = active ? (active.getAttribute('aria-label') || active.textContent || '').trim().slice(0, 30) : '';
    return {
      stack,
      mode: (globalThis.SF && globalThis.SF.state && globalThis.SF.state.mode) || '?',
      modal: document.body.classList.contains('ui-modal-open'),
      focus,
      text: root ? root.textContent.replace(/\s+/g, ' ').trim().length : -1,
      nodes: root ? root.querySelectorAll('*').length : -1,
    };
  }, rootSelector);
  const shot = await page.screenshot({ clip });
  return { ...dom, grid: gridOf(shot) };
}

/** How many grid cells moved by more than one step. A focus ring moves one or two; a screen
 *  change, a raised modal or a toggled region moves many. */
function gridDistance(a, b) {
  const left = a.split(','); const right = b.split(',');
  let moved = 0;
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    if (Math.abs(Number(left[i]) - Number(right[i])) > 1) moved += 1;
  }
  return moved;
}

function gridOf(pngBuffer) {
  const img = PNG.sync.read(pngBuffer);
  const cols = 24; const lines = 14;
  const cells = [];
  for (let gy = 0; gy < lines; gy += 1) {
    for (let gx = 0; gx < cols; gx += 1) {
      const x0 = Math.floor((img.width * gx) / cols);
      const x1 = Math.max(x0 + 1, Math.floor((img.width * (gx + 1)) / cols));
      const y0 = Math.floor((img.height * gy) / lines);
      const y1 = Math.max(y0 + 1, Math.floor((img.height * (gy + 1)) / lines));
      let sum = 0; let n = 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (img.width * y + x) << 2;
          sum += 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
          n += 1;
        }
      }
      cells.push(n ? Math.round((sum / n) / 8) : 0);
    }
  }
  return cells.join(',');
}

function describeDelta(before, after) {
  const notes = [];
  const opened = after.stack.filter((id) => !before.stack.includes(id));
  const closed = before.stack.filter((id) => !after.stack.includes(id));
  if (opened.length) notes.push(`opened ${opened.join(' → ')}`);
  if (closed.length) notes.push(`closed ${closed.join(', ')}`);
  if (before.modal !== after.modal) notes.push(after.modal ? 'raised a modal' : 'closed a modal');
  if (before.mode !== after.mode) notes.push(`mode ${before.mode} → ${after.mode}`);
  if (before.text !== after.text) notes.push(`surface text ${before.text} → ${after.text} chars`);
  if (before.nodes !== after.nodes) notes.push(`surface nodes ${before.nodes} → ${after.nodes}`);
  if (before.grid !== after.grid && !notes.length) notes.push('surface repainted');
  return notes.length ? notes.join('; ') : 'no visible change';
}

function selectorFor(surface) {
  const selector = (surface.root || [])[0] || `[data-screen="${surface.id}"]`;
  return selector;
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/.exec(String(value));
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 1920, height: 1080 };
}

function parseArgs(argv) {
  const parsed = { only: [], headed: false, viewport: '1920x1080', out: null, max: 24 };
  for (const arg of argv) {
    if (arg.startsWith('--only=')) parsed.only = arg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean);
    if (arg.startsWith('--viewport=')) parsed.viewport = arg.slice('--viewport='.length);
    if (arg.startsWith('--out=')) parsed.out = arg.slice('--out='.length);
    if (arg.startsWith('--max=')) parsed.max = Number(arg.slice('--max='.length)) || 24;
    if (arg === '--headed') parsed.headed = true;
  }
  return parsed;
}
