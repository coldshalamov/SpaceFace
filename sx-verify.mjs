// Real-game verify: boot → new game → dock → every station screen renders, buy + undock work.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1460, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto('http://localhost:8123/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await p.waitForFunction(() => window.SF && window.SF.bus && window.SF.state, { timeout: 30000 });
await p.evaluate(() => window.SF.bus.emit('game:new', { name: 'V', shipId: 'ship_kestrel', difficulty: 'normal' }));
await p.waitForTimeout(2500);
for (let i = 0; i < 4; i++) { await p.mouse.click(730, 450).catch(() => {}); await p.keyboard.press('Enter').catch(() => {}); await p.waitForTimeout(1100); }
await p.waitForTimeout(1000);
await p.evaluate(() => { const SF = window.SF; let sid = (SF.state.ui && SF.state.ui.dockedStationId) || null; if (!sid) { const e = (SF.state.entityList || []).find((x) => x && x.type === 'station' && x.data && x.data.stationId); if (e) sid = e.data.stationId; } SF.bus.emit('dock:docked', { stationId: sid }); });
await p.waitForTimeout(1700);
const screens = {};
for (const d of ['shipworks', 'factions', 'contracts', 'industry', 'bar', 'market']) {
  const before = errs.length;
  try { await p.click(`.sx-tile[data-nav="${d}"]`, { timeout: 3000 }); } catch (_) {}
  await p.waitForTimeout(d === 'shipworks' ? 2000 : 1000);
  screens[d] = { body: await p.evaluate(() => !!document.querySelector('.sx-screen__body *')), errs: errs.length - before };
}
const c0 = await p.evaluate(() => window.SF.state.player.credits);
await p.click('.sx-mkt-row', { timeout: 3000 }).catch(() => {});
await p.waitForTimeout(250);
await p.click('.sx-trade__go[data-go]', { timeout: 3000 }).catch(() => {});
await p.waitForTimeout(800);
const c1 = await p.evaluate(() => window.SF.state.player.credits);
await p.click('.sx-tile[data-act="undock"]', { timeout: 3000 }).catch(() => {});
await p.waitForTimeout(1900);
const un = await p.evaluate(() => ({ docked: window.SF.state.ui.docked, modalOpen: document.body.classList.contains('ui-modal-open') }));
console.log('SCREENS ' + JSON.stringify(screens));
console.log('BUY ' + c0 + ' -> ' + c1 + ' changed=' + (c0 !== c1));
console.log('UNDOCK ' + JSON.stringify(un) + ' (want docked=false)');
console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 10).join('\n') : '(no errors)');
await b.close();
