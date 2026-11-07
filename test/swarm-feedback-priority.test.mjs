import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createStuntCallout, calloutTextFor } from '../src/ui/stuntCallout.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';
import { acquireVisualProbeServer } from '../scripts/lib/visualProbeServer.mjs';

function element() {
  const node = { children: [], parentNode: null, textContent: '', hidden: false,
    className: '', attributes: {}, style: { setProperty() {}, removeProperty() {} } };
  const classes = new Set();
  node.classList = { add: (...names) => names.forEach(n => classes.add(n)),
    remove: (...names) => names.forEach(n => classes.delete(n)),
    contains: n => classes.has(n), toggle(n, on) { if (on ?? !classes.has(n)) classes.add(n); else classes.delete(n); } };
  node.setAttribute = (k, v) => { node.attributes[k] = String(v); };
  node.removeAttribute = k => { delete node.attributes[k]; };
  node.appendChild = child => { child.parentNode = node; node.children.push(child); return child; };
  node.removeChild = child => { node.children = node.children.filter(c => c !== child); child.parentNode = null; return child; };
  return node;
}

function mount(run) {
  const doc = { head: element(), body: element(), documentElement: element(),
    getElementById: () => null, createElement: () => element() };
  const state = { run, mode: 'flight', ui: { screenStack: [] }, playerId: 1, tick: 670,
    stunts: {}, settings: { video: { motionReduce: true } } };
  const bus = createBus();
  const owner = createStuntCallout({ state, bus, doc });
  return { bus, owner };
}

test('Swarm keeps one physical cause while accounting events do not crowd it', () => {
  const { bus, owner } = mount({ kind: 'survival', phase: 'active', ruleset: 'swarm' });
  const kill = { cause: 'terrain', word: 'PRESSED', pos: { x: 0, z: 0 } };
  bus.emit('aftermathWreck:recorded', {});
  bus.emit('lossLedger:recorded', {});
  bus.emit('swarm:killPopup', kill);
  bus.emit('swarm:killPopup', kill);
  owner.update(0);
  const text = calloutTextFor(owner.root);
  assert.match(text, /ARENA: PRESSED\s*×2/);
  assert.equal((text.match(/PRESSED/g) || []).length, 1);
  assert.doesNotMatch(text, /WRECK RECORDED|LOSS RECORDED/);
  bus.emit('combat:statusApplied', { targetId: 1, statusId: 'status_burning', stacks: 1, expiresTick: 800 });
  owner.update(0);
  assert.match(calloutTextFor(owner.root), /PRESSED/);
  assert.match(calloutTextFor(owner.root), /BURNING/);
  owner.destroy();
});

test('world accounting receipts stay in the details register, not the Adventure flight glass', () => {
  for (const run of [null, { kind: 'survival', phase: 'active', ruleset: 'classic' }]) {
    const { bus, owner } = mount(run);
    bus.emit('aftermathWreck:recorded', run ? {} : { source: 'player:death', playerWreck: true });
    bus.emit('lossLedger:recorded', run ? {} : { source: 'player:death', assetId: 1 });
    owner.update(0);
    // X3 Adventure glass: the declarative register is details/backlog copy, not a flight
    // callout. The owner still records the receipt; it simply does not draw over the action.
    assert.equal(calloutTextFor(owner.root), '', 'world accounting does not draw over Adventure flight');
    owner.destroy();
  }
});

test('Swarm presenters separate the combat chain from world receipts and danger wins the voice', { timeout: 45000 }, async t => {
  const chrome = process.platform === 'win32'
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/chromium';
  if (!existsSync(chrome)) { t.skip('System Chromium unavailable'); return; }
  const server = await acquireVisualProbeServer({ root: fileURLToPath(new URL('../', import.meta.url)) });
  let browser;
  try {
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ executablePath: chrome, headless: true,
      args: ['--disable-gpu', '--no-first-run', '--disable-extensions'] });
    const page = await browser.newPage({ viewport: { width: 1460, height: 900 } });
    await page.goto(`${server.baseUrl}/test/recovery-encounter-prompt-fixture.html`);
    await page.addStyleTag({ url: `${server.baseUrl}/styles/ui.css` });
    await page.addStyleTag({ url: `${server.baseUrl}/styles/hud-flight.generated.css` });
    const outcome = await page.evaluate(async () => {
      const { bus, state } = window.sfRecoveryFixture;
      Object.assign(state, { simTime: 100, playerId: 1, run: { kind: 'survival', phase: 'active', ruleset: 'swarm' } });
      state.ui.screenStack = [];
      document.body.classList.add('sf-swarm-flight');
      const root = document.getElementById('ui-root');
      root.insertAdjacentHTML('beforeend', '<div id="hud"><div id="toasts"></div></div><div id="alerts"></div>');
      const [{ createToasts }, { createAlerts }, { bindCommsLogToasts }, { swarmJuiceHud }, { voiceArbiter }] = await Promise.all([
        import('/src/ui/toasts.js'), import('/src/ui/alerts.js'), import('/src/ui/floatingText.js'),
        import('/src/ui/swarmJuiceHud.js'), import('/src/ui/voiceArbiter.js'),
      ]);
      const helpers = {};
      createToasts({ state, bus });
      createAlerts({ state, bus });
      bindCommsLogToasts(bus);
      voiceArbiter.init({ state, bus, helpers });
      swarmJuiceHud.init({ state, bus, helpers });
      swarmJuiceHud.update(0, state);
      // The existing HUD's receipt placement in the captured frame; its inline geometry
      // must not override the Swarm-specific reserved space.
      Object.assign(document.getElementById('toasts').style,
        { position: 'fixed', left: '50%', top: '55px', width: '320px', transform: 'none' });
      bus.emit('swarm:chain', { chain: 25, best: 25, at: 100 });
      bus.emit('swarm:announce', { kind: 'collateral', text: 'COLLATERAL' });
      bus.emit('comms:log', { from: 'Starboard Stabilizer Break', kind: 'cargo', text: 'Starboard Stabilizer Break — bounty after the spill.' });
      bus.emit('toast', { text: 'Yardmaster, Belt Outpost: Cold chain broken — Provisions spoiling.', kind: 'warn', ttl: 6 });
      bus.emit('voice:say', { channel: 'bark', kind: 'cargoSpill', text: 'Salvage Wreck posted a bounty. That cargo had a name.', ttl: 6, id: 'bounty' });
      voiceArbiter.update(0, state);
      swarmJuiceHud.update(0, state);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
      const before = { hero: rect('.sf-sj__hero'), calls: rect('.sf-sj__calls'),
        toasts: rect('#toasts'), alert: rect('.sf-alert--floor'), text: document.getElementById('toasts').innerText };
      bus.emit('voice:say', { channel: 'alert', kind: 'danger', priority: 110, text: 'TAKING FIRE', ttl: 3, id: 'danger' });
      voiceArbiter.update(0, state);
      const danger = document.querySelector('.sf-alert--floor').innerText;
      return { before, danger, dangerRect: rect('.sf-alert--floor') };
    });
    if (process.env.SWARM_FEEDBACK_SCREENSHOT) await page.screenshot({ path: process.env.SWARM_FEEDBACK_SCREENSHOT });
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    assert.match(outcome.before.text, /Starboard Stabilizer Break/);
    assert.match(outcome.before.text, /Cold chain broken/);
    assert.equal(overlaps(outcome.before.hero, outcome.before.toasts), false, 'world receipts clear the chain');
    assert.equal(overlaps(outcome.before.calls, outcome.before.toasts), false, 'world receipts clear the announcer');
    assert.equal(overlaps(outcome.before.hero, outcome.before.alert), false, 'voice clears the chain');
    assert.equal(overlaps(outcome.before.toasts, outcome.before.alert), false, 'voice clears the receipts');
    assert.match(outcome.danger, /TAKING FIRE/);
    assert.equal(overlaps(outcome.before.hero, outcome.dangerRect), false, 'danger remains readable beside the chain');
    const relevant = await page.evaluate(() => {
      const { bus } = window.sfRecoveryFixture;
      bus.emit('toast', { text: 'Recovery available', kind: 'info', action: { id: 'recover', label: 'Open' } });
      bus.emit('toast', { text: 'Yardmaster, Belt Outpost: Cold chain broken — Provisions spoiling.', kind: 'warn' });
      bus.emit('toast', { text: 'Your freighter was lost', kind: 'error' });
      return { text: document.getElementById('toasts').innerText,
        action: document.querySelector('#toasts .sf-toast__action')?.textContent };
    });
    assert.match(relevant.text, /Your freighter was lost/);
    assert.equal(relevant.action, 'Open', 'routine arrivals do not evict an actionable receipt');
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
});
