// Probe: load the real game page, verify the boot video element plays while
// the overlay is up, and screenshot the result.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const browser = await chromium.connectOverCDP('http://localhost:29229');
const page = await browser.contexts()[0].newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[pg]', m.text().slice(0, 160)); });

await page.goto('http://localhost:8123/index.html');
// Boot overlay should be up early; poll the video element.
const t0 = Date.now();
let report = null;
while (Date.now() - t0 < 25000) {
  report = await page.evaluate(() => {
    const v = document.getElementById('boot-intro-video');
    const ov = document.getElementById('boot-overlay');
    if (!v || !ov) return { v: !!v, ov: !!ov };
    return {
      overlayHidden: ov.classList.contains('hidden'),
      overlayDisplay: getComputedStyle(ov).display,
      videoLive: ov.classList.contains('boot-video-live'),
      readyState: v.readyState,
      currentTime: v.currentTime,
      paused: v.paused,
      ended: v.ended,
      error: v.error ? v.error.code : null,
      networkState: v.networkState,
      videoW: v.videoWidth, videoH: v.videoHeight,
      rect: v.getBoundingClientRect().toJSON(),
    };
  });
  if (report && report.videoLive && report.currentTime > 0.3) break;
  await new Promise((r) => setTimeout(r, 300));
}
console.log(JSON.stringify(report, null, 1));
const shot = await page.screenshot({ type: 'png' });
writeFileSync('tools/cinematic/.boot-video-check.png', shot);
await page.close();
await browser.close();
