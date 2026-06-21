// scripts/check-narrative-boot.mjs — headless boot test for the narrative layer.
// Boots the live game via the dev server, starts a new game, and verifies:
//   - no console/page errors during boot + new game
//   - the story system registered + state.story has narrative fields
//   - comms/graffiti/endgame/hud-meta DOM mounts exist
//   - beat advancement fires comms:popup / graffiti:show / hud:phase
//   - ambient comms populate the feed on the timer
// Exits non-zero on any console error or failed assertion.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const base = process.env.SF_PROBE_URL || 'http://localhost:8123';

async function loadPlaywright() {
  try { return await import('playwright'); }
  catch (err) {
    const bundled = join(process.env.USERPROFILE || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules');
    const require = createRequire(join(bundled, '.pnpm', 'playwright@1.60.0', 'node_modules', 'playwright', 'index.js'));
    return require('playwright');
  }
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const logs = [];
page.on('console', (m) => {
  const t = m.type(); const txt = m.text();
  logs.push(`[${t}] ${txt}`);
  if (t === 'error') errors.push(txt);
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

await page.goto(base, { waitUntil: 'load', timeout: 30000 });
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(1500);

// 1. Boot + new game.
const boot = await page.evaluate(async () => {
  try {
    const sf = window.SF;
    if (!sf) return { ok: false, reason: 'NO_SF_HANDLE' };
    sf.bus.emit('game:new', { name: 'Test', difficulty: 'standard' });
    await new Promise((r) => setTimeout(r, 900));
    return {
      ok: true,
      mode: sf.state.mode,
      hasStorySys: !!sf.registry.get('story'),
      systems: sf.registry.systems.map((s) => s.name),
      storyKeys: Object.keys(sf.state.story || {}).sort(),
      storyPhase: sf.state.story && sf.state.story.phase,
      dom: {
        comms: !!document.getElementById('sf-comms'),
        bulkhead: !!document.getElementById('sf-bulkhead'),
        stableLoad: !!document.getElementById('sf-stableload'),
        tagFlicker: !!document.getElementById('sf-tagflicker'),
        hudphase: !!document.getElementById('sf-hudphase'),
        endgame: !!document.getElementById('sf-endgame'),
        backlogBtn: !!document.getElementById('sf-comm-backlog-btn'),
      },
    };
  } catch (e) { return { ok: false, reason: 'EVAL_ERR: ' + e.message }; }
});
console.log('=== BOOT ==='); console.log(JSON.stringify(boot, null, 2));

if (!boot.ok) fail('boot failed: ' + boot.reason);
if (boot.hasStorySys === false) fail('story system not registered');
// assertion keys use the ACTUAL camelCase state.story field names
const wantStoryKeys = ['ambientQueue','ambientTimerS','endgameChoice','endgameOffered','graffitiShown','phase','seenComms'];
for (const k of wantStoryKeys) {
  if (!(boot.storyKeys || []).includes(k)) fail('state.story missing narrative field: ' + k);
}
for (const [name, present] of Object.entries(boot.dom || {})) {
  if (!present) fail('DOM mount missing: ' + name);
}

// 2. Beat advancement fires the three narrative event families.
const beat = await page.evaluate(async () => {
  try {
    const sf = window.SF; const bus = sf.bus;
    const seen = { comms: 0, graffiti: 0, phase: 0 };
    bus.on('comms:popup', () => seen.comms++);
    bus.on('graffiti:show', () => seen.graffiti++);
    bus.on('hud:phase', () => seen.phase++);
    // The missions system emits story:beatAdvanced on advance. Simulate B0->B1.
    bus.emit('story:beatAdvanced', { fromIndex: 0, toIndex: 1, branch: null });
    await new Promise((r) => setTimeout(r, 400));
    return { seen, beatIndex: sf.state.story.beatIndex, phase: sf.state.story.phase };
  } catch (e) { return { err: e.message }; }
});
console.log('=== BEAT FIRE ==='); console.log(JSON.stringify(beat, null, 2));
if (beat.err) fail('beat test errored: ' + beat.err);
if (!(beat.seen.comms > 0)) fail('beat advance did not fire comms:popup');
if (!(beat.seen.graffiti > 0)) fail('beat advance did not fire graffiti:show');
if (!(beat.seen.phase > 0)) fail('beat advance did not fire hud:phase');

// 3. Ambient comms populate the feed on the timer (wait for at least one).
const gotAmbient = await page.evaluate(async () => {
  const sf = window.SF;
  // force the ambient timer to elapse immediately so we don't wait 45s
  sf.state.story.ambientTimerS = 0.01;
  await new Promise((r) => setTimeout(r, 300));
  return document.querySelectorAll('#sf-comms .sf-comm').length;
});
console.log('=== AMBIENT FEED COUNT ===', gotAmbient);
if (!(gotAmbient > 0)) fail('ambient comms did not populate the feed');

// 4. Endgame choice modal opens on endgame:offer.
const endgame = await page.evaluate(async () => {
  try {
    const sf = window.SF; const bus = sf.bus;
    bus.emit('endgame:offer', { choices: [
      { id: 'A', key: 'clean_uniform', title: 'THE CLEAN UNIFORM', boardText: 'TEST BOARD', summary: 's', hiddenCost: 'c', requires: () => true },
    ] });
    await new Promise((r) => setTimeout(r, 200));
    return { open: document.getElementById('sf-endgame').classList.contains('open'),
             cards: document.querySelectorAll('#sf-endgame .sf-endgame__choice').length };
  } catch (e) { return { err: e.message }; }
});
console.log('=== ENDGAME MODAL ==='); console.log(JSON.stringify(endgame, null, 2));
if (endgame.err) fail('endgame test errored: ' + endgame.err);
if (!endgame.open) fail('endgame modal did not open');
if (!(endgame.cards > 0)) fail('endgame modal rendered no choice cards');

// 5. The 'L' key opens the comms backlog.
const lkey = await page.evaluate(async () => {
  window.SF.bus.emit('ui:toggleComms');
  await new Promise((r) => setTimeout(r, 150));
  const el = document.getElementById('sf-comm-backlog');
  return el ? el.classList.contains('open') : 'NO_BACKLOG_ELEMENT';
});
console.log('=== L KEY OPENS BACKLOG ===', lkey);
if (!lkey) fail('L key did not open the comms backlog');

console.log('=== CONSOLE ERRORS (' + errors.length + ') ===');
for (const e of errors.slice(0, 25)) console.log('  ERR:', e);

await browser.close();
if (errors.length > 0) { console.error('FAIL: ' + errors.length + ' console errors during boot'); process.exitCode = 1; }
if (!process.exitCode) console.log('\nALL NARRATIVE BOOT CHECKS PASSED');
