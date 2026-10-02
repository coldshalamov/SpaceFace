// One-off diagnostic: why does check-crucible-route's scripted projectile:hit not kill?
// Boots the real dev server + page, walks menu → crucible → launch swarm (same path as the
// check), then emits ONE lethal hit on a live cohort body and dumps every intermediate fact:
// the routeDamage result via the exposed kernel helper, target flags/team/type, bus errors.
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
page.on('console', (m) => { if (m.type() === 'error') console.log('  [page-err]', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('  [pageerror]', String(e && e.message || e).slice(0, 200)));

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.querySelector('[data-screen="mainMenu"]');
  return el && getComputedStyle(el).display !== 'none';
}, null, { timeout: 60000 });

// menu → crucible
await page.waitForFunction(() => {
  const b = [...document.querySelectorAll('#screens button')]
    .find((x) => x.textContent.replace(/\s+/g, ' ').trim() === 'Crucible');
  return !!b && !b.disabled;
}, null, { timeout: 30000 });
await page.evaluate(() => {
  const b = [...document.querySelectorAll('#screens button')]
    .find((x) => x.textContent.replace(/\s+/g, ' ').trim() === 'Crucible');
  b.click();
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
  const b = [...document.querySelectorAll('#screens button')]
    .find((x) => x.textContent.replace(/\s+/g, ' ').trim().includes('Open armory'));
  b.click();
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
  const b = [...document.querySelectorAll('#screens button')]
    .find((x) => x.textContent.replace(/\s+/g, ' ').trim().includes('Launch round 1'));
  b.click();
});
await page.waitForFunction(
  () => window.SF.state.run && window.SF.state.run.phase === 'active'
    && window.SF.state.entityList.some((e) => e.alive && e.data && e.data.runCohort === 'survival'),
  null, { timeout: 90000 },
);

const diag = await page.evaluate(() => {
  const st = window.SF.state;
  const combatSys = window.SF.registry && window.SF.registry.get('combat');
  const verdicts = [];
  if (combatSys) {
    const orig = combatSys.onHit.bind(combatSys);
    combatSys.onHit = (req) => {
      const res = orig(req);
      verdicts.push({
        targetId: req && req.targetId,
        payloadDamage: req && req.damage,
        ok: res && res.ok, reason: res && res.reason,
        applied: res && res.totalApplied,
      });
      return res;
    };
  }
  window.__verdicts = verdicts;
  window.__killed = 0;
  window.SF.bus.on('entity:killed', () => { window.__killed += 1; });
  return { hooked: !!combatSys, cohort: st.entityList.filter((e) => e.alive && e.data && e.data.runCohort === 'survival').length };
});
console.log('hook:', JSON.stringify(diag));

// Replicate the check's CLEAR loop exactly.
let scripted = 0;
for (let guard = 0; guard < 120; guard++) {
  const phase = await page.evaluate(() => window.SF.state.run.phase);
  if (phase === 'draft' || phase === 'ended') break;
  if (phase === 'active') {
    scripted += await page.evaluate((want) => {
      const st = window.SF.state;
      const targets = st.entityList
        .filter((e) => e.alive && e.data && e.data.runCohort === 'survival')
        .slice(0, want);
      for (const target of targets) {
        const lethal = (target.hull || 0) + (target.shield || 0) + (target.armorHp || 0) + 9999;
        window.SF.bus.emit('projectile:hit', {
          targetId: target.id, ownerId: st.playerId, damage: lethal, damageType: 'kinetic',
          pos: { x: target.pos.x, z: target.pos.z },
          approach: { x: 1, z: 0 }, normal: { x: -1, z: 0 },
          weaponId: 'wpn_concussion_cannon_m',
        });
      }
      return targets.length;
    }, 3);
  }
  await page.waitForTimeout(250);
}
const post = await page.evaluate(() => {
  const st = window.SF.state;
  const reasons = {};
  for (const v of (window.__verdicts || [])) {
    const key = v.ok ? 'ok' : (v.reason || 'null');
    reasons[key] = (reasons[key] || 0) + 1;
  }
  return {
    phase: st.run && st.run.phase,
    alive: st.entityList.filter((e) => e.alive && e.data && e.data.runCohort === 'survival').length,
    killed: window.__killed,
    verdictCounts: reasons,
    sampleVerdicts: (window.__verdicts || []).slice(0, 12),
  };
});
console.log('scripted emits:', scripted);
console.log('post:', JSON.stringify(post, null, 1));
await browser.close();
server.kill();
