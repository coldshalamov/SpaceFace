// Scratch: live verb check for the prompt deck — click and digit must each emit exactly one choice.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await loadPlaywright();
const isPortFree = (port) => new Promise((resolve) => { const s = createNetServer(); s.once('error', () => resolve(false)); s.once('listening', () => s.close(() => resolve(true))); s.listen(port, '127.0.0.1'); });
const findFreePort = async (start) => { for (let p = start; p < start + 80; p++) if (await isPortFree(p)) return p; throw new Error('no port'); };
const port = await findFreePort(8400);
const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore','pipe','pipe'], windowsHide: true, env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' } });
const url = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 80; i++) { try { const r = await fetch(url); if (r.ok) break; } catch (_) {} await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
installCspSafePlaywrightPolling(page);
page.on('pageerror', (e) => console.log('[pageerror]', e && e.stack ? e.stack.slice(0, 600) : String(e).slice(0, 300)));
const pending = new Map();
page.on('request', (r) => { pending.set(r.url(), Date.now()); if (pending.size % 50 === 1) console.log('[req]', pending.size, r.url().slice(0, 100)); });
page.on('requestfinished', (r) => pending.delete(r.url()));
page.on('requestfailed', (r) => { pending.delete(r.url()); console.log('[failed]', r.url().slice(0, 120)); });
await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
catch (e) { console.log('goto failed; pending requests:'); for (const [u, t] of [...pending].slice(0, 15)) console.log('  ', Date.now() - t + 'ms', u.slice(0, 110)); }
try { await page.waitForFunction(() => window.SF && window.SF.state, null, { timeout: 20000 }); } catch (_) {}
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 90000 });
await page.waitForFunction(() => !!document.querySelector('[data-screen="mainMenu"]'), null, { timeout: 60000 });
await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => (x.textContent || '').toLowerCase().includes('new game')).click());
await page.waitForFunction(() => !!document.querySelector('[data-screen="newGame"] .sf-ng-route'), null, { timeout: 10000 });
await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Launch').click());
await page.waitForFunction(() => { const st = window.SF.state; const p = st && st.entities && st.entities.get(st.playerId); return !!(st && st.mode === 'flight' && p && p.alive); }, null, { timeout: 90000 });

const out = await page.evaluate(async () => {
  const st = window.SF.state;
  const chosen = [];
  window.SF.bus.on('encounter:choose', (p) => chosen.push(p));
  window.SF.bus.emit('encounter:choiceOffered', {
    encounterId: 'verb1', title: 'VERB CHECK',
    options: [
      { id: 'alpha', label: 'Option A', available: true },
      { id: 'beta', label: 'Option B', available: true },
    ],
    deadlineAt: st.simTime + 60,
  });
  await new Promise((r) => setTimeout(r, 250));
  const btn = [...document.querySelectorAll('#sf-prompt-deck .sf-prompt__choice')].find((b) => b.dataset.choiceId === 'alpha');
  const clickOk = !!btn;
  if (btn) btn.click();
  await new Promise((r) => setTimeout(r, 150));
  const afterClick = chosen.length;
  // re-offer for the digit check
  window.SF.bus.emit('encounter:choiceOffered', {
    encounterId: 'verb2', title: 'VERB CHECK 2',
    options: [{ id: 'alpha', label: 'Option A', available: true }, { id: 'beta', label: 'Option B', available: true }],
    deadlineAt: st.simTime + 60,
  });
  await new Promise((r) => setTimeout(r, 250));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', code: 'Digit2', bubbles: true }));
  await new Promise((r) => setTimeout(r, 150));
  return { clickOk, afterClick, chosen, afterDigit: chosen.length };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
child.kill();
process.exit(0);
