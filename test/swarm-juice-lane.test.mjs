// G16-01 review: the Swarm arcade layer's centre callouts live in ONE flow column and only one
// big beat shows at a time (BOSS DOWN > round slam > boss card > clear tally > scoreboard).
// A beat that loses the lane waits and starts its clock when it first shows. Headless fake DOM.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

class El {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.parentNode = null; this.className = '';
    this.hidden = false; this.dataset = {}; this.style = {}; this.textContent = ''; this.isConnected = true;
  }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this);
    this.parentNode = null;
  }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; }
  setAttribute() {}
}
function install() {
  const body = new El('body');
  globalThis.document = {
    body, head: new El('head'),
    createElement: (t) => new El(t),
    getElementById: () => null,
  };
  return body;
}

const { swarmJuiceHud } = await import('../src/ui/swarmJuiceHud.js');
const { IRON_MAW } = await import('../src/data/encounters/capital-boss/iron-maw.js');

function boot() {
  install();
  const handlers = new Map();
  const bus = { on: (e, fn) => { handlers.set(e, fn); return () => handlers.delete(e); } };
  const state = {
    simTime: 10, mode: 'flight', settings: {}, ui: {},
    run: { kind: 'survival', phase: 'active', ruleset: 'swarm', wave: 3 },
  };
  swarmJuiceHud.init({ state, bus, helpers: {} });
  const emit = (e, p) => handlers.get(e)(p);
  const tick = (dt = 0.1) => { state.simTime += dt; swarmJuiceHud.update(dt, state); };
  tick(0);
  const dom = swarmJuiceHud._dom;
  const shown = () => ['slam', 'tally', 'card', 'bossDown'].filter((k) => !dom[k].hidden);
  return { state, emit, tick, dom, shown };
}

test('every centre piece is a child of the one column; none is its own layer', () => {
  const h = boot();
  const col = h.dom.root.children.find((c) => c.className === 'sf-sj__col');
  assert.ok(col, 'the column exists');
  for (const k of ['hero', 'calls', 'shatter', 'slam', 'tally', 'card', 'boss', 'bossDown']) {
    assert.equal(h.dom[k].parentNode, col, `${k} rides the column`);
  }
  swarmJuiceHud.destroy();
});

test('Iron Maw’s live opening clears incidental callouts and does not replay them', (t) => {
  const h = boot();
  t.after(() => swarmJuiceHud.destroy());
  const bossId = 10;
  h.state.run.wave = 5;
  h.state.entities = new Map([[bossId, { id: bossId, alive: true, pos: { x: 50, z: 0 },
    radius: 40, data: { lootTableId: 'dreadnought_boss' } }]]);
  const fight = { encounterId: IRON_MAW.id, bossId, phase: 'windup', clock: 100 };
  h.state.capitalBossEncounters = { fights: { 'swarm:w5': fight } };
  h.emit('swarm:bossHp', { name: 'Iron Maw', hp: 90, maxHp: 100 });
  h.emit('swarm:announce', { kind: 'collateral', text: 'COLLATERAL' });
  h.tick();
  assert.equal(h.dom.calls.hidden, false);

  fight.phase = 'recovery';
  fight.recovery = { beatId: 'port_battery', startedAt: fight.clock };
  h.tick();
  assert.equal(h.dom.boss.hidden, false, 'boss health remains available');
  assert.equal(h.dom.calls.hidden, true, 'a lingering callout yields to the opening');
  h.emit('swarm:announce', { kind: 'collateral', text: 'COLLATERAL ×2' });
  h.tick();
  assert.equal(h.dom.calls.children.length, 0, 'new incidental callouts never queue during the opening');

  fight.recovery.mawFed = true;
  h.tick();
  assert.equal(h.dom.calls.hidden, true, 'stale callouts do not return after the opening');
  h.emit('swarm:announce', { kind: 'collateral', text: 'COLLATERAL ×3' });
  h.tick();
  // HUD-2 item 9: the sim's internal word prints in plain words on the glass.
  assert.deepEqual(h.dom.calls.children.map((c) => c.textContent), ['CROSSFIRE ×3']);
});

test('the CSS gives no centre piece a private vh offset', () => {
  const src = readFileSync(new URL('../src/ui/swarmJuiceHud.js', import.meta.url), 'utf8');
  for (const cls of ['hero', 'calls', 'shatter', 'slam', 'tally', 'card', 'boss', 'bossdown']) {
    const rule = (src.match(new RegExp(`\\.sf-sj__${cls}\\s*\\{[^}]*\\}`)) || [''])[0];
    assert.ok(rule, `${cls} has a rule`);
    assert.doesNotMatch(rule, /position:absolute|top:\d+(\.\d+)?vh/, `${cls} must be a flow child`);
  }
});

test('round slam, boss card, clear tally, scoreboard and boss-down never show together', () => {
  const h = boot();
  h.emit('swarm:roundSlam', { wave: 3 });
  h.emit('swarm:bossIntro', { name: 'Iron Maw', line: 'It eats ships.' });
  h.emit('swarm:roundClear', { wave: 2, tally: [{ label: 'KILLS', value: '9' }] });
  h.emit('swarm:scoreboardToggle');
  h.tick();
  assert.deepEqual(h.shown(), ['slam'], 'the slam owns the lane');
  h.emit('swarm:bossDown', { name: 'Iron Maw' });
  h.tick();
  assert.deepEqual(h.shown(), ['bossDown'], 'BOSS DOWN outranks the slam');
  h.tick(3);
  // HUD-2 item 9: a headline lives at most ~1.5 s; a round slam that waited behind BOSS DOWN is
  // stale news by then and is dropped — the waiting boss card (never yet shown) takes the lane.
  assert.deepEqual(h.shown(), ['card'], 'the stale slam is dropped; the waiting card takes the lane');
  swarmJuiceHud.destroy();
});

test('a waiting boss card starts its clock when it first shows, then ends', () => {
  const h = boot();
  h.emit('swarm:roundSlam', { wave: 5 });
  h.emit('swarm:bossIntro', { name: 'Iron Maw', line: '' });
  h.tick();
  h.emit('run:waveStarted', {});
  h.tick(0.1);
  assert.deepEqual(h.shown(), ['slam'], 'FIGHT lingers first');
  h.tick(1.2);
  assert.deepEqual(h.shown(), ['card'], 'the card shows once the slam clears');
  h.tick(1.2);
  assert.deepEqual(h.shown(), ['card'], 'still inside its own ~1.5 s (HUD-2 item 9: one short headline)');
  h.tick(0.6);
  assert.deepEqual(h.shown(), [], 'then it ends');
  swarmJuiceHud.destroy();
});

test('a clear tally held behind BOSS DOWN is not spent while it waits', () => {
  const h = boot();
  h.emit('swarm:bossDown', { name: 'Iron Maw' });
  h.emit('swarm:roundClear', { wave: 5, tally: [{ label: 'KILLS', value: '9' }, { label: 'TIME', value: '1:00' }] });
  h.tick();
  assert.deepEqual(h.shown(), ['bossDown']);
  h.tick(2.3);
  assert.deepEqual(h.shown(), ['tally'], 'the tally appears after BOSS DOWN, whole');
  assert.equal(h.dom.tallyTitle.textContent, 'ROUND 5 CLEAR');
  h.tick(1);
  assert.equal(h.dom.tally.hidden, false, 'its hold began when it first showed');
  swarmJuiceHud.destroy();
});

test('the announcer speaks one line: higher priority replaces, lower is dropped, repeats update in place', () => {
  // HUD-2 item 9: a crossfire kill (the room's work, not the pilot's) is the lowest word; the
  // pilot's own pile-up outranks it.
  const h = boot();
  h.emit('swarm:announce', { kind: 'pileup', text: 'PILE-UP ×4' });
  h.emit('swarm:announce', { kind: 'collateral', text: 'COLLATERAL' });      // lower: dropped
  h.tick();
  assert.deepEqual(h.dom.calls.children.map((c) => c.textContent), ['PILE-UP ×4']);
  h.emit('swarm:announce', { kind: 'pileup', text: 'PILE-UP ×5' });          // same kind: in place
  h.emit('swarm:announce', { kind: 'bossdown', text: 'BOSS DOWN' });          // higher: replaces
  h.tick();
  assert.deepEqual(h.dom.calls.children.map((c) => c.textContent), ['BOSS DOWN']);
  swarmJuiceHud.destroy();
});
