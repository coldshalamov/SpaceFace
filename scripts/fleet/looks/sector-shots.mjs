// Lead look tool (G17-02): capture one in-flight picture per sector and build a 2-row contact sheet.
// Run under the lock:
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/sector-shots.mjs [sector-ids...]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 8168;
const OUT_DIR = '.devshots/fleet/looks/sectors';
mkdirSync(OUT_DIR, { recursive: true });

const DEFAULT_SECTOR_IDS = [
  'helios_core',
  'sector_ceres_belt',
  'sector_vesta_forge',
  'sector_pallas_drift',
  'tethys',
  'sector_io_reach',
  'sector_sker_haven',
  'sector_veil_nebula',
];

const cliArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const sectorIds = cliArgs.length > 0 ? cliArgs : DEFAULT_SECTOR_IDS;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = spawn(process.execPath, ['server.js', String(PORT)], {
  cwd: process.cwd(),
  stdio: 'ignore',
});

let browser = null;

try {
  await sleep(2500);

  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  });

  for (const sectorId of sectorIds) {
    console.log(`[sector-shots] capturing sector: ${sectorId}`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 200)));

    await page.addInitScript(() => {
      try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    });

    const url = `http://127.0.0.1:${PORT}/?sector=${encodeURIComponent(sectorId)}&shot=1`;
    await page.goto(url, { waitUntil: 'commit', timeout: 120_000 });

    const splash = page.locator('#cinematic-splash');
    if (await splash.count().catch(() => 0)) {
      await splash.click({ timeout: 4000 }).catch(() => {});
      await page.waitForSelector('#cinematic-splash', { state: 'detached', timeout: 6000 }).catch(() => {});
    }

    const confirmBtn = page.locator('.sf-confirm__ok, .sf-confirm__cancel');
    if (await confirmBtn.count().catch(() => 0)) {
      await confirmBtn.first().click().catch(() => {});
      await page.waitForSelector('.sf-confirm', { state: 'detached', timeout: 4000 }).catch(() => {});
    }

    await page.waitForFunction(() => window.__sfShotReady === true, null, { timeout: 180_000 });

    const confirmOverlay = page.locator('.sf-confirm, #sf-confirm-root');
    if (await confirmOverlay.count().catch(() => 0)) {
      await page.evaluate(() => {
        const root = document.getElementById('sf-confirm-root');
        if (root) root.remove();
      }).catch(() => {});
    }

    const shotPath = join(OUT_DIR, `${sectorId}.png`);
    await page.screenshot({ path: shotPath });
    console.log(`[sector-shots] saved ${shotPath}`);

    await page.close();
  }

  // Build the 2-row contact sheet
  console.log('[sector-shots] creating contact sheet...');
  const sheetPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const items = sectorIds.map((id) => ({
    id,
    dataUrl: `data:image/png;base64,${readFileSync(join(OUT_DIR, `${id}.png`)).toString('base64')}`,
  }));

  const sheetDataUrl = await sheetPage.evaluate(async ({ items: shots, rows, cellW, cellH, captionH, gap, pad }) => {
    const images = await Promise.all(shots.map((shot) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`could not decode image for ${shot.id}`));
      img.src = shot.dataUrl;
    })));

    const cols = Math.ceil(images.length / rows);
    const canvas = document.createElement('canvas');
    canvas.width = pad * 2 + cols * cellW + (cols - 1) * gap;
    canvas.height = pad * 2 + rows * (cellH + captionH) + (rows - 1) * gap;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    images.forEach((image, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = pad + col * (cellW + gap);
      const y = pad + row * (cellH + captionH + gap);

      ctx.drawImage(image, x, y, cellW, cellH);

      ctx.fillStyle = '#f1f5f9';
      ctx.font = '600 20px monospace, sans-serif';
      ctx.fillText(shots[index].id, x + 4, y + cellH + 24);
    });

    return canvas.toDataURL('image/png');
  }, { items, rows: 2, cellW: 640, cellH: 360, captionH: 34, gap: 16, pad: 20 });

  const sheetPath = join(OUT_DIR, 'sheet.png');
  writeFileSync(sheetPath, Buffer.from(sheetDataUrl.split(',')[1], 'base64'));
  console.log(`[sector-shots] saved contact sheet: ${sheetPath}`);

  await sheetPage.close();
} finally {
  if (browser) {
    await browser.close().catch(() => {});
  }
  server.kill();
}
