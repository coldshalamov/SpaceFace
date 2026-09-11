/**
 * svg_png — rasterise produced SVG marks for the frame compositor.
 *
 * The frames must use the SAME logotype and marks the kit ships, not a second wordmark set in
 * a font at compose time — otherwise the frame is a target the build can never match. Headless
 * Chromium renders them so the geometry is identical to what the prototypes will show.
 *
 *   node svg_png.mjs <in.svg> <out.png> <width> [colour] [accent]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [, , inSvg, outPng, widthArg, colour = '#EAE6DF', accent = '#FFB347'] = process.argv;
if (!inSvg || !outPng || !widthArg) {
  console.error('usage: svg_png.mjs <in.svg> <out.png> <width> [colour] [accent]');
  process.exit(2);
}
const width = parseInt(widthArg, 10);
const svg = fs.readFileSync(inSvg, 'utf8');

const vb = /viewBox="([\d.\s-]+)"/.exec(svg);
const [, , vbw, vbh] = vb ? vb[1].trim().split(/\s+/).map(Number) : [0, 0, 100, 100];
const height = Math.round((width * vbh) / vbw);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: 1,
});
await page.setContent(
  `<!doctype html><meta charset="utf-8"><style>
     html,body{margin:0;background:transparent}
     .w{width:${width}px;height:${height}px;color:${colour}}
     .w svg{display:block;width:100%;height:100%}
     .w .accent{fill:${accent}}
   </style><div class="w">${svg}</div>`,
  { waitUntil: 'load' },
);
fs.mkdirSync(path.dirname(outPng), { recursive: true });
await page.screenshot({ path: outPng, omitBackground: true, clip: { x: 0, y: 0, width, height } });
await browser.close();
console.log(`${outPng}  ${width}x${height}`);
