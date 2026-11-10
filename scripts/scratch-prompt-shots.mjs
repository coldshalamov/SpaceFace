// Scratch: stills of the flight prompt deck (encounter, parley, inspection, recovery, receipts,
// confirm) after the deck consolidation. Reuses the real bus events — the adapters do the rest.
// Output: .devshots/prompt-cards/*.png
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = `${ROOT}.devshots/prompt-cards`;
mkdirSync(OUT, { recursive: true });
const { chromium } = await loadPlaywright();

const isPortFree = (port) => new Promise((resolve) => {
  const s = createNetServer();
  s.once('error', () => resolve(false));
  s.once('listening', () => s.close(() => resolve(true)));
  s.listen(port, '127.0.0.1');
});
const findFreePort = async (start) => { for (let p = start; p < start + 80; p++) if (await isPortFree(p)) return p; throw new Error('no port'); };

const port = await findFreePort(8300);
const child = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' },
});
const url = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 80; i++) { try { const r = await fetch(url); if (r.ok) break; } catch (_) {} await new Promise((r) => setTimeout(r, 250)); }

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
installCspSafePlaywrightPolling(page);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 30000 });
await page.waitForFunction(() => !!document.querySelector('[data-screen="mainMenu"]'), null, { timeout: 60000 });
await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => (x.textContent || '').toLowerCase().includes('new game')).click());
await page.waitForFunction(() => !!document.querySelector('[data-screen="newGame"] .sf-ng-route'), null, { timeout: 10000 });
await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Launch').click());
await page.waitForFunction(() => {
  const st = window.SF.state;
  const p = st && st.entities && st.entities.get(st.playerId);
  return !!(st && st.mode === 'flight' && p && p.alive && p.hull > 0);
}, null, { timeout: 90000 });
await page.waitForTimeout(800);

const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const simTime = () => page.evaluate(() => window.SF.state.simTime);
const emit = (event, payload) => page.evaluate(([ev, pl]) => window.SF.bus.emit(ev, pl), [event, payload]);

// Leave Helios (parley refuses to surface there) and give the hold cargo for the toll.
await page.evaluate(() => {
  const st = window.SF.state;
  st.world.currentSectorId = 'sector_tethys_junction';
  if (!st.player.cargo) st.player.cargo = {};
  st.player.cargo.items = { cmdty_refined_metals: 12 };
});

// 01 — one decision on the deck (encounter)
await emit('encounter:choiceOffered', {
  encounterId: 'e1', title: 'DISTRESS BEACON — HAULER ADRIFT', kind: 'distress',
  options: [
    { id: 'respond', label: 'Respond — burn for the beacon', available: true },
    { id: 'log', label: 'Log it and hold course', available: true },
    { id: 'scan', label: 'Deep scan the wreck', available: false },
  ],
});
await page.waitForTimeout(400);
await shot('01-encounter-deck');

// 02 — a second, more urgent decision stacks above it. The sim owns world.currentSectorId and
// re-writes it every tick, so the parley EVENT would be correctly refused in Helios (its gate is
// contract-tested headless); for the visual we offer the parley-shaped spec directly to the deck.
await page.evaluate(async () => {
  const st = window.SF.state;
  const mod = await import('/src/ui/promptDeck.js');
  const deck = mod.getPromptDeck();
  deck.offerDecision({
    id: 'pirateParley',
    kind: 'danger',
    sender: 'CUTLASS-7 · CRIMSON REACH',
    statusFlag: 'TOLL HAIL',
    headline: 'TRANSFER 2,500 CREDITS',
    detail: 'Cargo toll. Profit motive; weapons held during response.',
    deadlineAt: st.simTime + 20,
    choices: [
      { id: 'comply', label: 'COMPLY' },
      { id: 'refuse', label: 'REFUSE', danger: true, cancel: true },
      { id: 'run', label: 'RUN 1.2 KM' },
    ],
  });
});
await page.waitForTimeout(400);
await shot('02-two-decisions-ladder');

// 03 — a third decision collapses the encounter to a chip (lawful inspection)
await emit('lawfulInspection:offered', { id: 'insp1', deadlineAt: (await simTime()) + 15, patrolWorldRecordId: 'pwr-1' });
await page.waitForTimeout(400);
await shot('03-chip-collapse');

// 04 — receipt line (inspection result) — thin lane line, not a card
await emit('lawfulInspection:resolved', { id: 'insp1', outcome: 'cleared', resolvedAt: (await simTime()) });
await page.waitForTimeout(400);
await shot('04-receipt-lane');

// 05 — signal receipt + recovery status frame
await emit('signal:tracked', { id: 'sig1', classification: 'anomalous drift' });
await emit('recovery:started', {
  recoveryId: 'rec1', recoveryKind: 'surrendered', deadlineAt: (await simTime()) + 90,
  secureReel_wu: 60, remainingQty: 12, credits: 450, phase: 'awaiting_tether',
});
await page.waitForTimeout(500);
await shot('05-recovery-status');

// 06 — the confirm dialog now has a real glass plate
await page.evaluate(async () => {
  const mod = await import('/src/ui/confirm.js');
  mod.confirm({ title: 'Sell ship?', body: 'Refund: 12,500 CR (50%). The hanger bay will feel empty.', confirmLabel: 'Sell', danger: true });
});
await page.waitForTimeout(400);
await shot('06-confirm-plate');
await page.evaluate(() => { const r = document.getElementById('sf-confirm-root'); if (r) r.innerHTML = ''; document.body.classList.remove('ui-modal-open'); });

// 07 — resolve everything, then receipts only
await page.evaluate(async () => {
  const mod = await import('/src/ui/promptDeck.js');
  mod.getPromptDeck().resolveDecision('pirateParley');
});
await emit('recovery:completed', { recoveryId: 'rec1', outcome: 'blackbox', credits: 450, repDelta: 2 });
await page.waitForTimeout(600);
await shot('07-resolved-receipts');

if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
else console.log('no page errors');

await browser.close();
child.kill();
console.log('done ->', OUT);
