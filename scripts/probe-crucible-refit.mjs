// One-off diagnostic: check-crucible-route fails at REFIT — Strip clicks, Fit never appears.
// Boot → swarm round 1 → kill via real route → draft → 'Rearrange loadout' → dump the refit DOM
// before/after Strip.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await loadPlaywright();
const SEED = 4242;

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    const free = await new Promise((resolve) => {
      const s = createNetServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error('no free port');
}

const port = await findFreePort(8460);
const url = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true,
});
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(url)).ok) break; } catch (_) {}
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('  [pageerror]', String(e && e.message || e).slice(0, 300)));

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.querySelector('[data-screen="mainMenu"]');
  return el && getComputedStyle(el).display !== 'none';
}, null, { timeout: 60000 });
await page.waitForFunction(() => {
  const b = [...document.querySelectorAll('#screens button')]
    .find((x) => x.textContent.replace(/\s+/g, ' ').trim() === 'Crucible');
  return !!b && !b.disabled;
}, null, { timeout: 30000 });
await page.evaluate(() => {
  [...document.querySelectorAll('#screens button')]
    .find((x) => x.textContent.replace(/\s+/g, ' ').trim() === 'Crucible').click();
});
await page.waitForTimeout(400);
// The door is a two-step preparation: the hull cards and the launch word live on step two
// (Ship & kit), and Swarm's verb opens the armory rather than the arena.
await page.evaluate(() => {
  const b = [...document.querySelectorAll('#screens button')]
    .find((x) => x.textContent.replace(/\s+/g, ' ').trim().includes('Choose ship & kit'));
  if (b) b.click();
});
await page.evaluate((seed) => {
  const hull = [...document.querySelectorAll('#screens .sf-crd-hull')]
    .find((b) => b.textContent.includes('Ricochet Runner'))
    || document.querySelector('#screens .sf-crd-hull');
  hull.click();
  document.querySelector('#screens .sf-crd-seed input').value = String(seed);
}, SEED);
await page.evaluate(() => {
  [...document.querySelectorAll('#screens button')]
    .find((x) => x.textContent.replace(/\s+/g, ' ').trim().includes('Open armory')).click();
});
await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 90000 });
// Swarm's opening stop is the armory: the run waits in draft on "Launch round 1".
await page.waitForFunction(
  () => window.SF.state.run && window.SF.state.run.phase === 'draft'
    && window.SF.ctx.screenManager.top() === 'crucibleDraft',
  null, { timeout: 60000 },
);
await page.waitForFunction(() => {
  const b = [...document.querySelectorAll('#screens button')]
    .find((x) => x.textContent.replace(/\s+/g, ' ').trim().includes('Launch round 1'));
  return !!b && !b.disabled;
}, null, { timeout: 30000 });
await page.evaluate(() => {
  [...document.querySelectorAll('#screens button')]
    .find((x) => x.textContent.replace(/\s+/g, ' ').trim().includes('Launch round 1')).click();
});
await page.waitForFunction(
  () => window.SF.state.run && window.SF.state.run.phase === 'active'
    && window.SF.state.entityList.some((e) => e.alive && e.data && e.data.runCohort === 'survival'),
  null, { timeout: 90000 },
);

// Clear round 1 through the real damage route.
for (let guard = 0; guard < 60; guard++) {
  const phase = await page.evaluate(() => window.SF.state.run.phase);
  if (phase === 'draft' || phase === 'ended') break;
  if (phase === 'active') {
    await page.evaluate(() => {
      const st = window.SF.state;
      const targets = st.entityList.filter((e) => e.alive && e.data && e.data.runCohort === 'survival'
        && ['ship', 'drone', 'mine', 'station', 'massSeed', 'payload'].includes(e.type));
      for (const t of targets) {
        window.SF.bus.emit('projectile:hit', {
          targetId: t.id, ownerId: st.playerId,
          damage: (t.hull || 0) + (t.shield || 0) + (t.armorHp || 0) + 9999, damageType: 'kinetic',
          pos: { x: t.pos.x, z: t.pos.z }, approach: { x: 1, z: 0 }, normal: { x: -1, z: 0 },
          weaponId: 'wpn_concussion_cannon_m',
        });
      }
    });
  }
  await page.waitForTimeout(250);
}
console.log('phase:', await page.evaluate(() => window.SF.state.run.phase));

// Buy one offer so the run wallet/ft it state resembles the real walk (optional but cheap).
await page.evaluate(() => {
  const owner = window.SF.registry.get('survivalDraft');
  const c = (owner.currentOffers() || []).find((o) => o.available !== false);
  const el = c && document.querySelector(`[data-offer-id="${c.id}"]`);
  if (el) el.click();
});
await page.waitForTimeout(200);

// Open refit.
await page.evaluate(() => {
  const b = [...document.querySelectorAll('#screens button')]
    .find((x) => x.textContent.replace(/\s+/g, ' ').trim() === 'Rearrange loadout');
  if (b) b.click();
});
await page.waitForFunction(() => window.SF.ctx.screenManager.top() === 'crucibleRefit', null, { timeout: 10000 });
await page.waitForTimeout(300);

const before = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.sf-crucible-refit .sf-cru-row')];
  return {
    phase: window.SF.state.run.phase,
    inventory: (window.SF.state.player.moduleInventory || []).map((i) => `${i.defId}#${i.instanceId}`),
    rows: rows.map((r) => ({
      cls: r.className,
      buttons: [...r.querySelectorAll('button')].map((b) => `${b.textContent.trim()}${b.disabled ? '(disabled)' : ''}${b.hidden ? '(hidden)' : ''}`),
    })),
  };
});
console.log('BEFORE:', JSON.stringify(before, null, 1));

// RESULTS: kill the player through the real route and read the defeat plate.
await page.evaluate(() => {
  const st = window.SF.state;
  const killer = st.entityList.find((e) => e.alive && e.data && e.data.runCohort === 'survival'
    && ['ship', 'drone', 'mine', 'station', 'massSeed', 'payload'].includes(e.type));
  const player = st.entities.get(st.playerId);
  window.SF.bus.emit('projectile:hit', {
    targetId: st.playerId,
    ownerId: killer ? killer.id : null,
    damage: (player.hull || 100) + (player.shield || 0) + (player.armorHp || 0) + 9999,
    damageType: 'kinetic',
    pos: { x: player.pos.x, z: player.pos.z },
    approach: { x: 1, z: 0 }, normal: { x: -1, z: 0 },
    weaponId: 'wpn_autocannon_m',
  });
});
await page.waitForFunction(
  () => window.SF.ctx.screenManager.top() === 'crucibleResults',
  null, { timeout: 30000 },
);
const plate = await page.evaluate(() => {
  const root = document.querySelector('#screens .sf-crucible-results');
  const under = [];
  for (const n of root.querySelectorAll('*')) {
    const px = parseFloat(getComputedStyle(n).fontSize) || 99;
    if (px < 12) under.push(`${px}px <${n.tagName.toLowerCase()} class="${String(n.className).slice(0, 50)}"> ${String(n.textContent).replace(/\s+/g, ' ').trim().slice(0, 60)}`);
  }
  return {
    text: root.textContent.replace(/\s+/g, ' ').trim(),
    under12: under.slice(0, 15),
    lastResult: window.SF.registry.get('survivalResults')
      && window.SF.registry.get('survivalResults').lastResult
      ? window.SF.registry.get('survivalResults').lastResult() : null,
  };
});
console.log('PLATE TEXT:', plate.text);
console.log('UNDER12:', JSON.stringify(plate.under12, null, 1));
console.log('LASTRESULT:', JSON.stringify(plate.lastResult, null, 1).slice(0, 2000));
await browser.close();
server.kill();
