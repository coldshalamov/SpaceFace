// Probe the lane journal surface directly: hasRange/visitRange/writeSequence.
import { chromium } from 'playwright';
const { spawn } = await import('node:child_process');
const { get } = await import('node:http');
const PORT = 8461;
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise((resolve, reject) => {
  const deadline = Date.now() + 10000;
  const poll = () => get(`http://127.0.0.1:${PORT}/`, (res) => { res.resume(); resolve(); })
    .on('error', () => (Date.now() > deadline ? reject(new Error('server never came up')) : setTimeout(poll, 300)));
  poll();
});
try {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text().slice(0, 200)); });
  await page.goto(`http://127.0.0.1:${PORT}/?simLane=worker`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.state.mode === 'menu', { timeout: 60000 });
  const out = await page.evaluate(() => {
    const j = window.SF.ctx && window.SF.ctx.presentationJournal;
    if (!j) return { error: 'no ctx.presentationJournal' };
    const info = {
      writeSequence: j.getWriteSequence(),
      oldest: j.getOldestSequence(),
      pendingCount: j.getPendingCount(),
      needsRebuild: j.needsRebuild(),
      rebuildGen: j.getRebuildGeneration(),
      lastRebuildStart: j.getLastRebuildStart(),
      lastRebuildEnd: j.getLastRebuildEnd(),
      diag: j.getDiagnostics && j.getDiagnostics(),
    };
    const s = {};
    let n = 0;
    const kinds = {};
    try {
      n = j.visitRange(info.oldest, info.writeSequence, s, (rec) => {
        kinds[rec.kind] = (kinds[rec.kind] || 0) + 1;
        if (n === 0) info.firstRec = { kind: rec.kind, entityId: rec.entityId, entityType: rec.entityType, x: rec.x, z: rec.z };
        n++;
      });
    } catch (e) { info.visitError = String(e); }
    info.visitApplied = n;
    info.kinds = kinds;
    info.hasFull = j.hasRange(info.oldest, info.writeSequence);
    info.hasZeroToWrite = j.hasRange(0, info.writeSequence);
    return info;
  });
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
} finally { server.kill(); }
