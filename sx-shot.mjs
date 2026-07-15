// Temp capture harness — headless screenshot of the station lab to a PNG.
// Usage: node sx-shot.mjs <url> <outPath> [width] [height]
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:8123/station-lab.html';
const out = process.argv[3] || 'sx.png';
const w = Number(process.argv[4]) || 1460;
const h = Number(process.argv[5]) || 900;

const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
try {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(() => (document.fonts && document.fonts.ready) ? document.fonts.ready : true);
  await page.waitForTimeout(1400); // let dial needle + enter animation settle
  const clickSel = process.argv[6];
  if (clickSel) { try { await page.click(clickSel, { timeout: 4000 }); await page.waitForTimeout(550); } catch (e) { console.log('click failed: ' + e.message); } }
  await page.screenshot({ path: out });
  console.log('OK title=' + JSON.stringify(await page.title()) + ' out=' + out + (errors.length ? ' ERRORS:\n' + errors.join('\n') : ' (no page errors)'));
} finally {
  await browser.close();
}
