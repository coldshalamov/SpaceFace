/**
 * render_svg_sheets — rasterise the SVG families to the sheets the conventions require.
 *
 * 03_CONVENTIONS.md §3 asks every vector family to ship a rendered sheet at its optical sizes
 * on the ground colour, and again in pure black on white — that second render IS the
 * forced-colours check (§7.4), because an icon that survives `currentColor` survives forced
 * colours and one that relies on a CSS background image does not.
 *
 * Headless Chromium is the rasteriser rather than a Python SVG library: it is the same engine
 * the game's prototypes run in, so what the sheet shows is what the screen will show.
 *
 *   node assets/ui/kit/tools/render_svg_sheets.mjs [icons|marks|all]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const KIT = path.resolve(HERE, '..');
const GROUND = '#0C0A08';
const BONE = '#EAE6DF';
const ACCENT = '#FFB347';

function readDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.svg') && !f.startsWith('_'))
    .sort()
    .map((f) => ({ name: f.replace(/^(icon|crest|mark|insignia)-/, '').replace(/\.svg$/, ''),
                   svg: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

function page({ items, size, bg, fg, accent, cols, label }) {
  const cells = items
    .map(
      (it) => `<figure style="width:${size + 44}px">
        <div class="g" style="width:${size}px;height:${size}px">${it.svg}</div>
        <figcaption>${it.name}</figcaption></figure>`,
    )
    .join('');
  return `<!doctype html><meta charset="utf-8"><style>
    @font-face{font-family:Archivo;src:url("${url.pathToFileURL(
      path.join(KIT, 'kit', 'fonts', 'archivo-var-latin-standard-normal.woff2'),
    ).href}") format("woff2");font-weight:100 900;font-stretch:62% 125%;}
    body{margin:0;background:${bg};color:${fg};font-family:Archivo,sans-serif;
         font-variation-settings:"wght" 600,"wdth" 62;}
    h1{font-size:22px;letter-spacing:.06em;text-transform:uppercase;padding:22px 26px 4px;
       font-variation-settings:"wght" 900,"wdth" 125;margin:0}
    .wrap{display:grid;grid-template-columns:repeat(${cols},max-content);gap:10px 6px;
          padding:16px 26px 28px}
    figure{margin:0;text-align:center}
    .g{display:grid;place-items:center;color:${fg}}
    /* the marks carry width="240" of their own; without this they blow past their cell */
    .g svg{display:block;width:100%;height:100%}
    .g .accent{fill:${accent}}
    figcaption{font-size:10px;opacity:.62;margin-top:5px;letter-spacing:.04em;
               word-break:break-all;line-height:1.15}
  </style><h1>${label}</h1><div class="wrap">${cells}</div>`;
}

async function shoot(browser, html, out) {
  const p = await browser.newPage({ viewport: { width: 1400, height: 900 },
                                    deviceScaleFactor: 2 });
  await p.setContent(html, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await p.screenshot({ path: out, fullPage: true });
  await p.close();
  console.log(`  ${out}`);
}

async function iconSheets(browser) {
  const blocks = [];
  for (const size of [24, 32, 48]) {
    const items = readDir(path.join(KIT, 'icons', String(size)));
    if (!items.length) continue;
    blocks.push({ items, size, cols: size === 48 ? 12 : 16, label: `icon family · ${size} px` });
  }
  if (!blocks.length) return;
  const html = blocks
    .map((b) => page({ ...b, bg: GROUND, fg: BONE, accent: ACCENT }))
    .join('');
  await shoot(browser, html, path.join(KIT, 'icons', '_sheet.png'));

  // forced-colours: pure black on white, accent folded into the same ink
  const bw = page({ ...blocks[0], bg: '#FFFFFF', fg: '#000000', accent: '#000000',
                    label: 'icon family · 24 px · forced colours (black on white)' });
  await shoot(browser, bw, path.join(KIT, 'icons', '_sheet-forced-colours.png'));
}

async function markSheets(browser) {
  const groups = ['logotype', 'crests', 'modes', 'arenas', 'insignia', 'system'];
  const blocks = [];
  for (const g of groups) {
    const items = readDir(path.join(KIT, 'marks', g));
    if (!items.length) continue;
    blocks.push({ items, size: g === 'logotype' ? 240 : 96,
                  cols: g === 'logotype' ? 3 : 8, label: `marks · ${g}` });
  }
  if (!blocks.length) return;
  await shoot(
    browser,
    blocks.map((b) => page({ ...b, bg: GROUND, fg: BONE, accent: ACCENT })).join(''),
    path.join(KIT, 'marks', '_sheet.png'),
  );
  const small = blocks
    .filter((b) => b.label !== 'marks · logotype')
    .map((b) => page({ ...b, size: 24, cols: 16, bg: '#FFFFFF', fg: '#000000',
                       accent: '#000000', label: `${b.label} · 24 px · forced colours` }))
    .join('');
  await shoot(browser, small, path.join(KIT, 'marks', '_sheet-forced-colours.png'));
}

const what = process.argv[2] || 'all';
const browser = await chromium.launch();
if (what === 'icons' || what === 'all') await iconSheets(browser);
if (what === 'marks' || what === 'all') await markSheets(browser);
await browser.close();
