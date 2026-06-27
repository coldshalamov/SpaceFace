// scripts/check-narrative-boot.mjs — headless boot test for the narrative layer.
// Boots the live game via the dev server, starts a new game, and verifies:
//   - no console/page errors during boot + new game
//   - the story system registered + state.story has narrative fields
//   - comms/graffiti/endgame/hud-meta DOM mounts exist
//   - beat advancement fires comms:popup / graffiti:show / hud:phase
//   - ambient comms populate the feed on the timer
// Exits non-zero on any console error or failed assertion.
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const base = process.env.SF_PROBE_URL || 'http://localhost:8123';

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
const pageIssues = collectPageIssues(page);
page.on('console', (m) => {
  logs.push(`[${m.type()}] ${m.text()}`);
});

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

await page.goto(base, { waitUntil: 'load', timeout: 30000 });
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(1500);
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.registry, null, { timeout: 15000 });

// 1. Boot + new game.
await page.evaluate(() => {
  window.SF.bus.emit('game:new', { name: 'Test', difficulty: 'standard' });
});
await page.waitForFunction(
  () => window.SF && window.SF.state && window.SF.state.mode === 'flight' && window.SF.state.playerId,
  null,
  { timeout: 70000 },
);
await page.waitForTimeout(500);
const boot = await page.evaluate(() => {
  const sf = window.SF;
  return {
    ok: true,
    mode: sf.state.mode,
    playerId: sf.state.playerId,
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
});
console.log('=== BOOT ==='); console.log(JSON.stringify(boot, null, 2));

if (!boot.ok) fail('boot failed');
if (boot.mode !== 'flight') fail('new game did not reach flight mode');
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

// 5. The 'L' UI intent opens the comms backlog, and Escape closes it before Pause can open.
const lkey = await page.evaluate(async () => {
  window.SF.bus.emit('ui:toggleComms');
  await new Promise((r) => setTimeout(r, 150));
  const el = document.getElementById('sf-comm-backlog');
  return el ? el.classList.contains('open') : 'NO_BACKLOG_ELEMENT';
});
console.log('=== L KEY OPENS BACKLOG ===', lkey);
if (!lkey) fail('L key did not open the comms backlog');

await page.keyboard.press('Escape');
await page.waitForTimeout(150);
const escClose = await page.evaluate(() => {
  const el = document.getElementById('sf-comm-backlog');
  const stack = window.SF && window.SF.state && window.SF.state.ui && window.SF.state.ui.screenStack;
  return {
    backlogOpen: !!(el && el.classList.contains('open')),
    topScreen: Array.isArray(stack) ? (stack[stack.length - 1] || null) : null,
  };
});
console.log('=== ESC CLOSES BACKLOG ==='); console.log(JSON.stringify(escClose, null, 2));
if (escClose.backlogOpen) fail('Escape did not close the comms backlog');
if (escClose.topScreen === 'pause') fail('Escape opened Pause instead of closing the comms backlog');

const errors = pageIssues.errorIssues();
console.log('=== CONSOLE ERRORS (' + errors.length + ') ===');
for (const e of summarizeIssues(errors)) console.log('  ERR:', JSON.stringify(e));

await browser.close();
if (errors.length > 0) { console.error('FAIL: ' + errors.length + ' console errors during boot'); process.exitCode = 1; }
if (!process.exitCode) console.log('\nALL NARRATIVE BOOT CHECKS PASSED');
