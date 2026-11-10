import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.mjs';
import { normalizePlayerDamage, readTensionSensors, tensionSuspensionReason,
  createTensionDirectorSystem } from '../../src/systems/tensionDirector.js';
import { readTensionPolicy } from '../../src/ai/tensionPolicy.js';

const snap = (v) => JSON.stringify(v);
test('normalizes applied damage, preserves zero, and ignores NPC-versus-NPC events', () => {
  const { state } = boot();
  assert.equal(normalizePlayerDamage(state, { targetId: 1, applied: 0, amount: 100 }), null);
  assert.equal(normalizePlayerDamage(state, { targetId: 1, applied: NaN, amount: 100 }), null);
  assert.equal(normalizePlayerDamage(state, { targetId: 3, attackerId: 2, applied: 20 }), null);
  assert.deepEqual(normalizePlayerDamage(state, { targetId: 1, attackerId: 2, applied: 20 }), { kind: 'incoming', amount: .1 });
  assert.deepEqual(normalizePlayerDamage(state, { targetId: 3, attackerId: 1, applied: 20 }), { kind: 'combat' });
  assert.deepEqual(normalizePlayerDamage(state, { targetId: 1, amount: 20 }), { kind: 'incoming', amount: .1 });
});

test('sensor reads XZ distance, not render height, and ignores distant stale combat', () => {
  const { state } = boot();
  state.entities.set(2, { id: 2, alive: true, pos: { x: 100, y: 1e9, z: 100 } });
  state.entities.set(3, { id: 3, alive: true, pos: { x: 20000, y: 0, z: 0 } });
  state.encounterDirector.live = {
    near: { deck: 'combat', phase: 'active', ids: [2], sectorId: 'sector_test' },
    far: { deck: 'combat', phase: 'active', ids: [3], sectorId: 'sector_test' },
    elsewhere: { deck: 'combat', phase: 'active', ids: [2], sectorId: 'elsewhere' },
  };
  const s = readTensionSensors(state); assert.equal(s.nearbyCombat, 1); assert.equal(s.liveCombat, 2);
  state.encounterDirector.live.far.lastPlayerExchangeAt = 0;
  assert.equal(readTensionSensors(state).nearbyCombat, 2);
});

test('bounded sensor scan conservatively closes admission on truncation', () => {
  const { state, step } = boot();
  state.encounterDirector.live = Object.fromEntries(Array.from({ length: 10000 }, (_, i) => [`l${i}`, { deck: 'combat', ids: [] }]));
  state.encounterDirector.pending = Array.from({ length: 10000 }, () => ({ deck: 'combat' }));
  const s = readTensionSensors(state); assert.equal(s.liveCombat, 16); assert.equal(s.pendingCombat, 64);
  assert.equal(s.scanTruncated, true);
  for (let t = 0; t < 200; t++) step(t);
  assert.equal(state.tensionDirector.policy.allowCombat, false);
});

test('bus adapter only attributes damage, kills, mining, and tethers to this player', () => {
  const { bus, state, step } = boot();
  bus.emit('combat:damage', { targetId: 2, attackerId: 3, applied: 100 });
  bus.emit('mining:yield', { minerId: 2, qty: 5 });
  bus.emit('tether:attached', { ownerId: 2 });
  bus.emit('entity:killed', { id: 4, killerId: 2 });
  assert.equal(state.tensionDirector.factCount, 0);
  bus.emit('mining:yield', { minerId: 1, qty: 5 });
  bus.emit('tether:attached', { ownerId: 1 });
  bus.emit('entity:killed', { id: 4, killerId: 1 });
  step(0); assert.equal(state.tensionDirector.factCount, 3);
  assert.equal(state.tensionDirector.metrics.distinctVerbs5m, 3);
});

test('telegraphs and actual spawns are separate evidence; duplicate or empty spawns do not count', () => {
  const { bus, state, step } = boot();
  bus.emit('encounter:telegraph', { encounterId: 'a', kind: 'patrol', sectorId: 'sector_test' });
  bus.emit('encounter:spawned', { encounterId: 'a', kind: 'patrol', count: 0, sectorId: 'sector_test' });
  step(0); assert.equal(state.tensionDirector.metrics.offers30m, 1); assert.equal(state.tensionDirector.metrics.spawns30m, 0);
  bus.emit('encounter:spawned', { encounterId: 'a', kind: 'patrol', count: 2, sectorId: 'sector_test' });
  bus.emit('encounter:spawned', { encounterId: 'a', kind: 'patrol', count: 2, sectorId: 'sector_test' });
  bus.emit('encounter:spawned', { encounterId: 'b', kind: 'patrol', count: 2, sectorId: 'elsewhere' });
  step(1); assert.equal(state.tensionDirector.metrics.spawns30m, 1);
});

test('sector-boundary flapping does not reset tension or manufacture exploration variety', () => {
  const { bus, state, step } = boot();
  for (let t = 0; t < 250; t++) {
    step(t); bus.emit('sector:enter', { sectorId: 'sector_test' });
  }
  assert.equal(state.tensionDirector.activeS, 249);
  assert.equal(state.tensionDirector.factCount, 1);
  assert.equal(state.tensionDirector.phase, 'build');
});

test('all protected modes disable the policy and freeze active pacing', () => {
  const modifiers = [
    s => { s.mode = 'menu'; }, s => { s.paused = true; },
    s => { s.player.flags.docked = true; }, s => { s.ui = { docked: true }; },
    s => { s.onboarding = { active: true, finished: false }; },
    s => { s.run = { kind: 'survival', phase: 'active' }; },
    s => { s.settings.gameplay.tensionDirector = false; },
    s => { s.entities.get(1).alive = false; },
  ];
  for (const change of modifiers) {
    const { state, step } = boot(); step(0); const active = state.tensionDirector.activeS;
    change(state);
    for (let t = 1; t < 200; t++) step(t);
    assert.equal(state.tensionDirector.activeS, active);
    assert.equal(readTensionPolicy(state), null); assert(tensionSuspensionReason(state));
  }
});

test('a docking recovery window cannot be bypassed by resuming in an old build phase', () => {
  const { state, step } = boot(); for (let t = 0; t < 200; t++) step(t);
  assert.equal(state.tensionDirector.policy.allowCombat, true);
  state.player.flags.docked = true; step(200);
  state.player.flags.docked = false; step(201);
  assert.equal(state.tensionDirector.policy.allowCombat, false);
  for (let t = 202; t <= 219; t++) { step(t); assert.equal(state.tensionDirector.policy.allowCombat, false); }
  step(220); assert.equal(state.tensionDirector.policy.allowCombat, true);
});

test('save lifecycle restores exact own state and rejects stale outgoing state', () => {
  const h = boot(); for (let t = 0; t < 300; t++) h.step(t);
  const saved = h.helpers.tensionDirector.serialize();
  h.bus.emit('save:restoring'); h.bus.emit('combat:damage', { targetId: 1, applied: 100 });
  h.state.simTime = 299;
  h.bus.emit('save:loaded', { tensionDirector: saved });
  assert.deepEqual(h.helpers.tensionDirector.serialize(), saved);
  h.bus.emit('save:restoring'); h.state.simTime = 0; h.bus.emit('save:loaded', {});
  assert.equal(h.state.tensionDirector.sequence, 0); assert.equal(h.state.tensionDirector.phase, 'quiet');
});

test('save error resumes the outgoing controller without losing its history', () => {
  const h = boot(); h.step(0); h.bus.emit('mining:yield', { minerId: 1, qty: 1 });
  h.bus.emit('save:restoring'); h.step(1); h.bus.emit('save:error'); h.step(2);
  assert.equal(h.state.tensionDirector.factCount, 1); assert(h.state.tensionDirector.policy.enabled);
});

test('new game resets all history and listener teardown is complete and repeatable', () => {
  const h = boot(); const initialListeners = [...h.bus._listeners.values()].reduce((n, s) => n + s.size, 0);
  h.step(0); h.bus.emit('mining:yield', { minerId: 1, qty: 1 }); h.bus.emit('game:new');
  assert.equal(h.state.tensionDirector.factCount, 0);
  for (let i = 0; i < 10; i++) {
    h.system.destroy(); assert.equal(h.bus._listeners.size, 0); assert.equal(h.helpers.tensionDirector, undefined);
    h.system.init({ state: h.state, bus: h.bus, helpers: h.helpers });
    assert.equal([...h.bus._listeners.values()].reduce((n, s) => n + s.size, 0), initialListeners);
  }
});

test('optional successful transaction port records an actual dockside trade but not a credit guess', () => {
  const h = boot(); h.state.player.flags.docked = true; h.step(0);
  h.state.player.credits += 1000; h.step(1); assert.equal(h.state.tensionDirector.factCount, 0);
  h.helpers.tensionDirector.observe({ kind: 'trade', token: 'completed-sale-1' });
  assert.equal(h.state.tensionDirector.factCount, 1);
});

test('system writes neither entities, combat difficulty, economy, nor encounter state', () => {
  const h = boot(); h.state.difficulty = { pacing: { stance: 'steady', pressureMult: .8 } };
  const before = { player: snap(h.state.player), entities: snap([...h.state.entities]),
    difficulty: snap(h.state.difficulty), encounter: snap(h.state.encounterDirector) };
  for (let t = 0; t < 300; t++) h.step(t);
  assert.equal(snap(h.state.player), before.player); assert.equal(snap([...h.state.entities]), before.entities);
  assert.equal(snap(h.state.difficulty), before.difficulty); assert.equal(snap(h.state.encounterDirector), before.encounter);
});

test('policy-event subscribers receive detached immutable values', () => {
  const h = boot(); let published;
  h.bus.on('tension:policy', (p) => { published = p; }); h.step(0);
  assert.notEqual(published, h.state.tensionDirector.policy); assert(Object.isFrozen(published));
  assert(Object.isFrozen(published.recentShapes));
});

test('60 Hz repeated calls and 1 Hz calls give the same one-second policy sequence', () => {
  const a = boot(), b = boot(); const left = [], right = [];
  a.bus.on('tension:policy', p => left.push(p)); b.bus.on('tension:policy', p => right.push(p));
  for (let tick = 0; tick <= 600 * 60; tick++) a.step(tick / 60, 1 / 60);
  for (let t = 0; t <= 600; t++) b.step(t);
  assert.deepEqual(left, right); assert.equal(a.state.tensionDirector.activeS, 600);
});

test('no RNG use: the shared stream can throw and the controller still works', () => {
  const h = boot(); h.state.rng = () => { throw new Error('Director consumed shared randomness'); };
  for (let t = 0; t <= 300; t++) h.step(t);
  assert.equal(h.state.tensionDirector.sequence, 301);
});

test('two simultaneous game worlds do not share phase or fact history', () => {
  const a = boot(), b = boot();
  for (let t = 0; t < 100; t++) { a.step(t); b.step(t); }
  a.bus.emit('combat:damage', { targetId: 1, applied: 100 }); a.step(100); b.step(100);
  assert.equal(a.state.tensionDirector.phase, 'recovery'); assert.equal(b.state.tensionDirector.phase, 'opportunity');
});

test('optional dockside hook cannot launder incoming combat into a protected non-flight mode', () => {
  const h = boot(); h.state.player.flags.docked = true; h.step(0);
  assert.equal(h.helpers.tensionDirector.observe({ kind: 'incoming', amount: .9 }), false);
  assert.equal(h.helpers.tensionDirector.observe({ kind: 'kill', token: 'fake-menu-kill' }), false);
  assert.equal(h.helpers.tensionDirector.observe({ kind: 'trade', token: 'actual-sale' }), true);
  h.state.player.flags.docked = false; h.player.alive = false;
  assert.equal(h.helpers.tensionDirector.observe({ kind: 'trade', token: 'dead-sale' }), false);
  assert.equal(h.helpers.tensionDirector.observe({ kind: 'defeat', token: 'actual-death' }), true);
});
